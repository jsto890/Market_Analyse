"""CLI: python -m argus.heartbeat <job> <status> [detail]"""
import sys

from .db import heartbeat


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: python -m argus.heartbeat <job> <status> [detail]", file=sys.stderr)
        return 2
    heartbeat(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
