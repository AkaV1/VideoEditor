import sys

if "--render-segment" in sys.argv:
    from .segment import main as _seg
    sys.exit(_seg(sys.argv[sys.argv.index("--render-segment") + 1]))

from .app import main

sys.exit(main())
