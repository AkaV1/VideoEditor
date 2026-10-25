import os
import sys

if sys.stdout is None:  # .exe sin consola
    sys.stdout = sys.stderr = open(os.devnull, "w")

if "--render-segment" in sys.argv:
    from linecut.segment import main as _seg
    sys.exit(_seg(sys.argv[sys.argv.index("--render-segment") + 1]))

from linecut.app import main

if __name__ == "__main__":
    sys.exit(main())
