"""Explicit unit conversion; pressures are absolute and temperatures are states."""

from dataclasses import dataclass

from .models import Dimension, Quantity


@dataclass(frozen=True)
class Unit:
    dimension: Dimension
    scale: float
    offset: float = 0


UNITS: dict[str, Unit] = {
    "kg/s": Unit(Dimension.MASS_FLOW, 1),
    "kg/h": Unit(Dimension.MASS_FLOW, 1 / 3600),
    "g/s": Unit(Dimension.MASS_FLOW, 0.001),
    "mol/s": Unit(Dimension.MOLAR_FLOW, 1),
    "kmol/s": Unit(Dimension.MOLAR_FLOW, 1000),
    "kmol/h": Unit(Dimension.MOLAR_FLOW, 1000 / 3600),
    "m3/s": Unit(Dimension.VOLUME_FLOW, 1),
    "m3/h": Unit(Dimension.VOLUME_FLOW, 1 / 3600),
    "L/s": Unit(Dimension.VOLUME_FLOW, 0.001),
    "K": Unit(Dimension.TEMPERATURE, 1),
    "degC": Unit(Dimension.TEMPERATURE, 1, 273.15),
    "degF": Unit(Dimension.TEMPERATURE, 5 / 9, 255.3722222222222),
    "Pa": Unit(Dimension.PRESSURE, 1),
    "kPa": Unit(Dimension.PRESSURE, 1000),
    "MPa": Unit(Dimension.PRESSURE, 1e6),
    "bar": Unit(Dimension.PRESSURE, 1e5),
    "atm": Unit(Dimension.PRESSURE, 101325),
    "W": Unit(Dimension.POWER, 1),
    "kW": Unit(Dimension.POWER, 1000),
    "MW": Unit(Dimension.POWER, 1e6),
    "1": Unit(Dimension.DIMENSIONLESS, 1),
    "%": Unit(Dimension.DIMENSIONLESS, 0.01),
}


def check_quantity(quantity: Quantity) -> None:
    unit = UNITS.get(quantity.unit)
    if unit is None:
        raise ValueError(
            f"Unsupported or ambiguous unit '{quantity.unit}'. Use an explicit supported unit."
        )
    if unit.dimension != quantity.dimension:
        raise ValueError(
            f"Unit '{quantity.unit}' measures {unit.dimension.value}, not {quantity.dimension.value}."
        )


def convert_quantity(quantity: Quantity, target_unit: str) -> Quantity:
    check_quantity(quantity)
    target = UNITS.get(target_unit)
    if target is None:
        raise ValueError(f"Unsupported or ambiguous unit '{target_unit}'.")
    if target.dimension != quantity.dimension:
        raise ValueError(
            f"Cannot convert {quantity.dimension.value} to '{target_unit}' ({target.dimension.value})."
        )
    source = UNITS[quantity.unit]
    value = (
        None
        if quantity.value is None
        else (quantity.value * source.scale + source.offset - target.offset) / target.scale
    )
    return Quantity(value=value, unit=target_unit, dimension=quantity.dimension)
