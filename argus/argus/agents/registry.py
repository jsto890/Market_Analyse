"""Registry of all agents. ~45 today; easy to add more."""
from __future__ import annotations

from typing import List
import pandas as pd

from .base import Agent, Vote
from . import strategies as S


_AGENTS: List[Agent] = [
    # Pre-filter (1)
    Agent("ADR% Filter", "prefilter", S.adr_filter),
    # Trend (8)
    Agent("EMA Alignment", "trend", S.ema_alignment),
    Agent("Golden/Death Cross", "trend", S.sma_50_200_cross),
    Agent("Price vs EMA200", "trend", S.price_vs_ema200),
    Agent("Supertrend", "trend", S.supertrend_dir),
    Agent("Parabolic SAR", "trend", S.psar_dir),
    Agent("ADX Trend Strength", "trend", S.adx_trend),
    Agent("HMA Slope", "trend", S.hma_slope),
    Agent("KAMA Slope", "trend", S.kama_slope),
    # Momentum (12)
    Agent("RSI Zone", "momentum", S.rsi_zone),
    Agent("RSI(2) Extreme", "momentum", S.rsi2_extreme),
    Agent("MACD Signal", "momentum", S.macd_signal),
    Agent("MACD Histogram", "momentum", S.macd_hist_momentum),
    Agent("Stochastic", "momentum", S.stoch_signal),
    Agent("Stochastic RSI", "momentum", S.stoch_rsi),
    Agent("Williams %R", "momentum", S.williams_r),
    Agent("CCI", "momentum", S.cci_signal),
    Agent("ROC", "momentum", S.roc_momentum),
    Agent("TSI", "momentum", S.tsi_signal),
    Agent("WaveTrend", "momentum", S.wavetrend),
    Agent("Schaff Trend Cycle", "momentum", S.schaff_trend_cycle),
    Agent("MFI", "momentum", S.mfi_signal),
    # Volatility (5)
    Agent("TTM Squeeze", "volatility", S.ttm_squeeze_break),
    Agent("Bollinger Position", "volatility", S.bollinger_position),
    Agent("Keltner Breakout", "volatility", S.keltner_breakout),
    Agent("Donchian Breakout", "volatility", S.donchian_breakout),
    Agent("ATR Expansion", "volatility", S.atr_expansion),
    # Volume (5)
    Agent("OBV Trend", "volume", S.obv_trend),
    Agent("CMF", "volume", S.cmf_signal),
    Agent("A/D Line", "volume", S.ad_line),
    Agent("VWAP Position", "volume", S.vwap_position),
    Agent("Volume Surge", "volume", S.volume_surge),
    # System (1)
    Agent("Ichimoku Cloud", "trend", S.ichimoku_cloud),
    # Elder (1)
    Agent("Elder Impulse", "momentum", S.elder_impulse),
    # Structure (5)
    Agent("Market Structure", "structure", S.market_structure),
    Agent("SMC: Break of Structure", "structure", S.smc_bos),
    Agent("SMC: Order Block", "structure", S.smc_order_block),
    Agent("Wyckoff Phase", "structure", S.wyckoff_agent),
    Agent("Elliott Wave", "structure", S.elliott_agent),
    # Institutional (1)
    Agent("Institutional Conviction Score", "institutional", S.ics_score),
    # Crosses & extras (10)
    Agent("EMA8/20 Cross", "trend", S.ema8_20_cross),
    Agent("EMA20/50 Cross", "trend", S.ema20_50_cross),
    Agent("5/20 Momentum", "momentum", S.momentum_5_20),
    Agent("Opening Gap", "structure", S.gap_pattern),
    Agent("Inside/Outside Bar", "structure", S.inside_outside_bar),
    Agent("Z-Score Mean Reversion", "momentum", S.z_score_mean_reversion),
    Agent("RSI Divergence", "momentum", S.rsi_divergence),
    Agent("Trend Quality", "trend", S.trend_quality),
    Agent("52-Week Position", "structure", S.fifty_two_week_position),
    Agent("S/R Test", "structure", S.support_resistance_test),
    Agent("Engulfing Pattern", "structure", S.candle_pattern_engulfing),
    Agent("Relative Strength vs SPY", "institutional", S.relative_strength_vs_spy),
    Agent("RS vs Sector", "institutional", S.relative_strength_vs_sector),
    Agent("VIX Regime", "institutional", S.vix_regime),
    # Trend quality (3)
    Agent("Minervini Trend Template", "trend", S.minervini_trend_template),
    Agent("Weinstein Stage", "trend", S.weinstein_stage),
    Agent("Weekly/Daily Alignment", "trend", S.weekly_daily_alignment),
    # Volatility contraction (3)
    Agent("NR7/Inside Day", "volatility", S.nr7_inside_day),
    Agent("TTM Squeeze Streak", "volatility", S.ttm_squeeze_streak),
    Agent("VCP", "volatility", S.vcp),
    # Momentum / breakout (3)
    Agent("Pocket Pivot", "volume", S.pocket_pivot),
    Agent("Buyable Gap Up", "structure", S.buyable_gap_up),
    Agent("High Tight Flag", "structure", S.high_tight_flag),
]


def all_agents() -> List[Agent]:
    return list(_AGENTS)


def run_all(df: pd.DataFrame) -> List[Vote]:
    return [a.vote(df) for a in _AGENTS]
