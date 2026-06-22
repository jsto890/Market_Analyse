"""Progress + risk readings (design spec §9). Pure functions of price/levels.
R-multiple basis is the ORIGINAL risk (avg_cost - init_stop); avg_cost moves the
reward numerator only, never the R denominator."""


def progress_r(price: float, avg_cost: float, init_stop: float) -> float:
    risk = avg_cost - init_stop
    if risk <= 0:
        return 0.0
    return round((price - avg_cost) / risk, 4)


def progress_pct(price: float, stop: float, target: float) -> float:
    denom = target - stop
    if denom <= 0:
        return 0.0
    return round(max(0.0, min(1.0, (price - stop) / denom)) * 100, 2)


def risk_state(stop: float, avg_cost: float, init_stop: float) -> str:
    if abs(stop - avg_cost) < 1e-6:
        return "breakeven"
    if stop > avg_cost:
        return "locked"
    return "at_risk"
