"""Simplified Schmidt-Appleman contrail criterion.

Two-step classification:

1. **Formation possible** if ambient temperature is below the Schmidt-Appleman
   threshold T_SAC. We approximate T_SAC with the classical formulation:

        G = EI_H2O * c_p * p / (epsilon * Q * (1 - eta))

   then T_SAC ≈ T_LM where saturation vapor pressure over water has slope G.
   For v0 we use a published lookup: at cruise levels (200-300 hPa), T_SAC
   sits around -38 to -42 °C for kerosene jet engines (η≈0.3, EI_H2O=1.25).

2. **Persistence** requires the atmosphere to be supersaturated with respect
   to ice (RH_ice >= 100%). Open-Meteo gives RH over water, so we convert
   using saturation vapor pressures from Magnus formulae.

Output bucket:
  - "none":       no formation
  - "short":      forms but evaporates quickly (RH_ice < 100%)
  - "persistent": ISSR — these are the climatically relevant contrails
"""
from __future__ import annotations

import math
from typing import Literal

ContrailRisk = Literal["none", "short", "persistent"]


def _es_water(t_c: float) -> float:
    """Saturation vapor pressure over water (hPa), Magnus."""
    return 6.1094 * math.exp(17.625 * t_c / (t_c + 243.04))


def _es_ice(t_c: float) -> float:
    """Saturation vapor pressure over ice (hPa), Magnus."""
    return 6.1121 * math.exp(22.587 * t_c / (t_c + 273.86))


def rh_water_to_rh_ice(rh_water: float, t_c: float) -> float:
    """Convert RH/water to RH/ice. rh_water in % returns rh_ice in %."""
    if t_c >= 0:
        return rh_water  # not meaningful above freezing
    return rh_water * _es_water(t_c) / _es_ice(t_c)


def t_sac_threshold(pressure_hpa: float) -> float:
    """Approximate Schmidt-Appleman threshold temperature (°C) for kerosene jets.

    Linear fit through commonly cited reference points:
      200 hPa -> -42 °C
      300 hPa -> -39 °C
      500 hPa -> -34 °C
    """
    # Clamp & linear interp
    p = max(min(pressure_hpa, 1000.0), 100.0)
    if p <= 300.0:
        # 200 -> -42, 300 -> -39
        return -42.0 + (p - 200.0) * (3.0 / 100.0)
    # 300 -> -39, 500 -> -34
    return -39.0 + (p - 300.0) * (5.0 / 200.0)


def classify(temp_c: float, rh_water_percent: float, pressure_hpa: float) -> ContrailRisk:
    t_sac = t_sac_threshold(pressure_hpa)
    if temp_c > t_sac:
        return "none"
    rh_ice = rh_water_to_rh_ice(rh_water_percent, temp_c)
    if rh_ice >= 100.0:
        return "persistent"
    return "short"
