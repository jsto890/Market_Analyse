"""Macro aggregation entrypoint — launchd (StartInterval) + run_daily.sh.
Run: python -m argus.macro.run"""
import sys

from .aggregate import run_aggregation


def main() -> int:
    summary = run_aggregation()
    print(f"macro-aggregate: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
