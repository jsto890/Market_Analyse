"""IV surface fitting via quadratic smile across strikes."""

import logging
from typing import Optional
import numpy as np
from scipy.optimize import curve_fit

logger = logging.getLogger(__name__)


class IVSurface:
    """Quadratic smile fit to IV across strikes.

    Models IV as a quadratic function of log-moneyness:
    IV(x) = a + b*x + c*x^2, where x = log(K/S)

    Used to interpolate missing IVs and detect cheap/rich strikes via residuals.
    """

    def __init__(self, strikes: list[float], ivs: list[float], spot: float, coeffs: tuple):
        """Initialize with fitted coefficients.

        Args:
            strikes: Strike levels used in fit
            ivs: Observed IVs at each strike
            spot: Current spot price
            coeffs: Tuple of (a, b, c) quadratic coefficients
        """
        self.strikes = np.array(strikes, dtype=float)
        self.observed_ivs = np.array(ivs, dtype=float)
        self.spot = float(spot)
        self.coeffs = coeffs  # (a, b, c)
        self._residuals_cache = None

    @staticmethod
    def _quadratic_smile(x, a, b, c):
        """Quadratic in log-moneyness: IV = a + b*x + c*x^2.

        Args:
            x: Log-moneyness (log(K/S))
            a, b, c: Quadratic coefficients

        Returns:
            Implied vol at log-moneyness x
        """
        return a + b * x + c * x ** 2

    @staticmethod
    def fit(
        strikes: list[float],
        ivs: list[float],
        spot: Optional[float] = None
    ) -> Optional["IVSurface"]:
        """Fit quadratic smile to strikes and IVs.

        Args:
            strikes: Strike levels
            ivs: Implied vols at each strike
            spot: Current spot (default: ATM strike if not provided)

        Returns:
            IVSurface if >=8 liquid points, else None
        """
        # Minimum 8 points for reliable smile fit
        if len(strikes) < 8 or len(ivs) < 8:
            logger.debug(
                f"Insufficient points for smile fit: {len(strikes)} strikes, "
                f"{len(ivs)} IVs (need >=8)"
            )
            return None

        # Filter out NaN or invalid IVs
        strikes_arr = np.array(strikes, dtype=float)
        ivs_arr = np.array(ivs, dtype=float)

        valid_mask = ~(np.isnan(ivs_arr) | np.isnan(strikes_arr))
        strikes_arr = strikes_arr[valid_mask]
        ivs_arr = ivs_arr[valid_mask]

        # Recheck after filtering
        if len(strikes_arr) < 8:
            logger.debug(
                f"Insufficient valid points after NaN filter: "
                f"{len(strikes_arr)} (need >=8)"
            )
            return None

        # If spot not provided, use ATM (closest strike to median)
        if spot is None:
            spot = np.median(strikes_arr)

        # Compute log-moneyness
        x = np.log(strikes_arr / spot)

        # Fit quadratic smile
        try:
            coeffs, _ = curve_fit(
                IVSurface._quadratic_smile,
                x,
                ivs_arr,
                p0=[np.mean(ivs_arr), 0.0, 0.0],
                maxfev=10000,
            )

            # Validate fit: coefficients should be finite
            if not np.all(np.isfinite(coeffs)):
                logger.warning("Fit produced non-finite coefficients")
                return None

            return IVSurface(strikes_arr, ivs_arr, spot, tuple(coeffs))

        except RuntimeError as e:
            logger.warning(f"Smile fit failed to converge: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in smile fit: {e}")
            return None

    def residuals(self) -> list[float]:
        """Observed - fitted IV at each strike.

        Returns:
            List of residuals in same order as input strikes
        """
        if self._residuals_cache is not None:
            return self._residuals_cache

        # Compute log-moneyness for each strike
        x = np.log(self.strikes / self.spot)

        # Fitted IVs from the quadratic smile
        fitted_ivs = self._quadratic_smile(x, *self.coeffs)

        # Residuals: observed - fitted
        residuals_arr = self.observed_ivs - fitted_ivs
        self._residuals_cache = residuals_arr.tolist()

        return self._residuals_cache

    def fitted_iv_at_strike(self, strike: float) -> Optional[float]:
        """Interpolated IV at strike.

        Args:
            strike: Strike price

        Returns:
            Fitted IV at strike, or None if invalid
        """
        if strike <= 0 or self.spot <= 0:
            return None

        try:
            x = np.log(strike / self.spot)
            fitted_iv = self._quadratic_smile(x, *self.coeffs)

            # Sanity check: IV should be positive
            if fitted_iv < 0:
                logger.warning(f"Fitted IV={fitted_iv} is negative at strike={strike}")
                return None

            return float(fitted_iv)

        except (ValueError, ZeroDivisionError) as e:
            logger.warning(f"Error computing fitted IV at strike {strike}: {e}")
            return None
