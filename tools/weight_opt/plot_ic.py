"""Plot rank-IC vs sentiment share, per horizon, with the permutation-null band.

Run under base conda:
    /Users/josephstorey/anaconda3/bin/python tools/weight_opt/plot_ic.py
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "weight_optimisation"


def main() -> None:
    res = pd.read_csv(OUT / "grid_search_results.csv")
    null = pd.read_csv(OUT / "permutation_null.csv").set_index("horizon_d")
    horizons = sorted(res.horizon_d.unique())

    fig, axes = plt.subplots(1, len(horizons), figsize=(5 * len(horizons), 4), sharey=True)
    if len(horizons) == 1:
        axes = [axes]
    for ax, h in zip(axes, horizons):
        sub = res[res.horizon_d == h].sort_values("alpha_sentiment")
        ax.plot(sub.alpha_sentiment, sub.mean_ic, "-o", ms=3, label="rank-IC")
        ax.axhline(null.loc[h, "null_p95"], ls="--", color="crimson",
                   label=f"null p95 ({null.loc[h,'null_p95']:+.3f})")
        ax.axhline(0, ls=":", color="grey")
        ax.axvline(0.437, ls="-.", color="green", alpha=0.6, label="production 0.437")
        ax.set_title(f"{h}d forward  (p={null.loc[h,'p_value']:.3f})")
        ax.set_xlabel("sentiment share of blend")
        ax.legend(fontsize=7)
    axes[0].set_ylabel("mean per-day rank-IC")
    fig.suptitle("Sentiment:Technical blend — rank-IC vs weight (every horizon below null p95 → no signal)")
    fig.tight_layout()
    fig.savefig(OUT / "grid_search_ic_curves.png", dpi=130)
    print(f"Wrote {OUT / 'grid_search_ic_curves.png'}")


if __name__ == "__main__":
    main()
