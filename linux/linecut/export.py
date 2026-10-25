"""Exportación a MP4 (H.264 + AAC): se renderizan los fotogramas y se envían a ffmpeg."""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
from typing import Callable

from . import audio
from .media import FrameProvider
from .model import calc_duration, project_size
from .render import render_frame
from .util import ffmpeg_path

import json
import shutil
import sys
import threading


class Cancelled(Exception):
    pass


def export_size(project: dict, res: int) -> tuple[int, int]:
    bw, bh = project_size(project)
    k = res / min(bw, bh)
    even = lambda n: max(2, int(round(n / 2)) * 2)
    return even(bw * k), even(bh * k)


def export_project(project: dict, paths: dict[str, str], out_path: str, res: int | None = None, fps: int | None = None,
                   progress: Callable[[float, str], None] | None = None, cancelled: Callable[[], bool] | None = None):
    res = res or project["res"]
    fps = fps or project["fps"]
    media = project["media"]
    duration = calc_duration(project["tracks"])
    if duration <= 0:
        raise ValueError("El proyecto está vacío")
    W, H = export_size(project, res)
    n_frames = int(math.ceil(duration * fps))
    workers = _worker_count(n_frames)
    if workers > 1:
        return _export_parallel(project, paths, out_path, W, H, fps, duration, n_frames, workers, progress, cancelled)
    tmp = tempfile.mkdtemp(prefix="linecut-")
    wav = None
    proc = None
    provider = FrameProvider(paths, media, fps)
    try:
        if progress:
            progress(0.0, "Mezclando audio…")
        if audio.has_audio_clips(project, media):
            wav = os.path.join(tmp, "mix.wav")
            audio.write_wav(wav, audio.mix(project, media, paths, duration))
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-"]
        if wav:
            cmd += ["-i", wav]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
        if wav:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-t", f"{duration:.3f}"]
        cmd += ["-movflags", "+faststart", out_path]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        for i in range(n_frames):
            if cancelled and cancelled():
                raise Cancelled()
            frame = render_frame(project, min(i / fps, duration - 1e-6), W, H, provider)
            try:
                proc.stdin.write(frame.tobytes())
            except BrokenPipeError:
                break
            if progress and i % 3 == 0:
                progress(i / n_frames, f"Renderizando fotograma {i + 1} de {n_frames}")
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        code = proc.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg falló: {err[-400:]}")
        if progress:
            progress(1.0, "Listo")
    except BaseException:
        if proc and proc.poll() is None:
            proc.kill()
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        raise
    finally:
        provider.close()
        for f in os.listdir(tmp):
            try:
                os.remove(os.path.join(tmp, f))
            except OSError:
                pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass


def _worker_count(n_frames: int) -> int:
    try:
        cores = len(os.sched_getaffinity(0))
    except AttributeError:
        cores = os.cpu_count() or 1
    env = os.environ.get("LINECUT_WORKERS")
    if env and env.isdigit():
        cores = int(env)
    if n_frames < 90:
        return 1
    return max(1, min(cores, 8, n_frames // 45))


def _self_cmd() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, "-m", "linecut"]


def _export_parallel(project, paths, out_path, W, H, fps, duration, n_frames, workers, progress, cancelled):
    """Reparte los fotogramas entre procesos, cada uno codifica su tramo; después se unen con el audio."""
    media = project["media"]
    tmp = tempfile.mkdtemp(prefix="linecut-")
    procs: list[subprocess.Popen] = []
    counts = [0] * workers
    errors: list[str] = []
    try:
        if progress:
            progress(0.0, "Mezclando audio…")
        wav = None
        if audio.has_audio_clips(project, media):
            wav = os.path.join(tmp, "mix.wav")
            audio.write_wav(wav, audio.mix(project, media, paths, duration))
        bounds = [round(n_frames * k / workers) for k in range(workers + 1)]
        segs = []
        progs: list[str] = []
        threads_each = max(1, (os.cpu_count() or 2) // workers)
        for k in range(workers):
            seg = os.path.join(tmp, f"seg{k}.mp4")
            jf = os.path.join(tmp, f"job{k}.json")
            progs.append(os.path.join(tmp, f"prog{k}.txt"))
            with open(jf, "w", encoding="utf-8") as f:
                json.dump({"project": project, "paths": paths, "W": W, "H": H, "fps": fps, "i0": bounds[k],
                           "i1": bounds[k + 1], "duration": duration, "out": seg, "threads": threads_each,
                           "progress": progs[k]}, f)
            segs.append(seg)
            procs.append(subprocess.Popen(_self_cmd() + ["--render-segment", jf], stdout=subprocess.DEVNULL,
                                          stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL))

        def poll_progress():
            for k, pf in enumerate(progs):
                try:
                    txt = open(pf, encoding="utf-8").read().strip()
                except OSError:
                    continue
                if txt.startswith("P "):
                    try:
                        counts[k] = int(txt[2:])
                    except ValueError:
                        pass
                elif txt.startswith("E "):
                    errors.append(txt[2:])

        import time
        while any(p.poll() is None for p in procs):
            if cancelled and cancelled():
                raise Cancelled()
            poll_progress()
            if progress:
                done = sum(counts)
                progress(min(0.97, done / n_frames) * 0.96, f"Renderizando fotograma {done} de {n_frames}")
            time.sleep(0.15)
        poll_progress()
        if any(p.returncode != 0 for p in procs):
            raise RuntimeError("Falló el render: " + (errors[0] if errors else "un proceso terminó con error"))
        if progress:
            progress(0.97, "Uniendo tramos…")
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w", encoding="utf-8") as f:
            for s in segs:
                f.write("file '" + s.replace("\\", "/") + "'\n")
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst]
        if wav:
            cmd += ["-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{duration:.3f}"]
        else:
            cmd += ["-c:v", "copy"]
        cmd += ["-movflags", "+faststart", out_path]
        r = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("ffmpeg falló al unir: " + r.stderr.decode("utf-8", "replace")[-300:])
        if progress:
            progress(1.0, "Listo")
    except BaseException:
        for p in procs:
            if p.poll() is None:
                p.kill()
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
