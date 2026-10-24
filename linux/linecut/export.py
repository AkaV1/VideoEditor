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
