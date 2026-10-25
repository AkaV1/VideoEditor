"""Trabajador de exportación: renderiza un tramo de fotogramas y lo codifica a un MP4 sin audio.
Se lanza como proceso aparte (`--render-segment trabajo.json`) para aprovechar todos los núcleos."""
from __future__ import annotations

import json
import subprocess
import sys

from .media import FrameProvider
from .render import render_frame
from .util import ffmpeg_path


def x264_cmd(W: int, H: int, fps: int, out: str, threads: int = 0) -> list[str]:
    cmd = [ffmpeg_path(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps),
           "-i", "-", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
    if threads:
        cmd += ["-threads", str(threads)]
    return cmd + [out]


def main(job_file: str) -> int:
    job = json.load(open(job_file, encoding="utf-8"))
    project, paths = job["project"], job["paths"]
    W, H, fps, i0, i1, duration = job["W"], job["H"], job["fps"], job["i0"], job["i1"], job["duration"]
    prog = job.get("progress")

    def report(msg: str):
        if prog:
            try:
                with open(prog, "w", encoding="utf-8") as f:
                    f.write(msg)
            except OSError:
                pass

    provider = FrameProvider(paths, project["media"], fps)
    proc = subprocess.Popen(x264_cmd(W, H, fps, job["out"], job.get("threads", 2)), stdin=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    try:
        for n, i in enumerate(range(i0, i1)):
            frame = render_frame(project, min(i / fps, duration - 1e-6), W, H, provider)
            proc.stdin.write(frame.tobytes())
            if n % 2 == 0:
                report(f"P {n + 1}")
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        if proc.wait() != 0:
            report(f"E {err[-300:]}")
            return 1
        report(f"P {i1 - i0}")
        return 0
    except BrokenPipeError:
        report("E ffmpeg cerró la entrada")
        return 1
    finally:
        provider.close()
        if proc.poll() is None:
            proc.kill()
