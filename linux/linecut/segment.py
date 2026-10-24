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
    provider = FrameProvider(paths, project["media"], fps)
    proc = subprocess.Popen(x264_cmd(W, H, fps, job["out"], job.get("threads", 2)), stdin=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    try:
        for n, i in enumerate(range(i0, i1)):
            frame = render_frame(project, min(i / fps, duration - 1e-6), W, H, provider)
            proc.stdin.write(frame.tobytes())
            if n % 2 == 0:
                print(f"P {n + 1}", flush=True)
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        if proc.wait() != 0:
            print(f"E {err[-300:]}", flush=True)
            return 1
        print(f"P {i1 - i0}", flush=True)
        return 0
    except BrokenPipeError:
        print("E ffmpeg cerró la entrada", flush=True)
        return 1
    finally:
        provider.close()
        if proc.poll() is None:
            proc.kill()
