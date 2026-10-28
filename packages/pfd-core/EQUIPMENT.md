# Equipment catalog and expansion plan

This working catalog covers common chemical-process equipment and specialist families that may be useful later. Variants share a type when their ports and document behavior are the same. Specialist industries may require further additions. Planned entries are not available in the library yet.

## Available now

The development source provides 16 types: feed (`feed`), product (`product`), pump (`pump`), heat exchanger (`heatExchanger`), separator (`separator`), tank (`tank`), mixer (`mixer`), splitter (`splitter`), column (`column`), reactor (`reactor`), valve (`valve`), check valve (`checkValve`), pressure relief valve (`pressureReliefValve`), pressure reducing regulator (`pressureRegulator`), flow restriction/orifice (`flowRestriction`), and compressor (`compressor`).

## Implementation sequence

Each unchecked entry is a separate implementation task. Finish its port contract, configuration validation, editor symbol, connection tests, working example and documentation before marking it complete. Maintain Python/TypeScript parity and regenerate contracts after each addition. Equipment symbols and entered properties do not imply a numerical solver.

### 1. Flow control and fluid transport

- [x] Inline valve: generic, globe, gate, ball, butterfly and needle configuration
- [x] Check valve
- [x] Pressure relief valve
- [x] Pressure reducing regulator
- [x] Flow restriction / orifice
- [x] Compressor: centrifugal and reciprocating variants
- [ ] Blower
- [ ] Fan
- [ ] Vacuum pump
- [ ] Ejector / eductor
- [ ] Positive displacement pump variant
- [ ] Pipe segment
- [ ] Junction / manifold
- [ ] Strainer
- [ ] Steam trap

### 2. Heat transfer and utilities

- [ ] Shell-and-tube exchanger variant
- [ ] Plate exchanger variant
- [ ] Double-pipe exchanger variant
- [ ] Air cooler
- [ ] Condenser equipment type
- [ ] Reboiler equipment type
- [ ] Fired heater / furnace
- [ ] Electric heater
- [ ] Boiler / steam generator
- [ ] Cooling tower
- [ ] Chiller / refrigeration package
- [ ] Evaporator
- [ ] Heat pump
- [ ] Utility supply and return boundaries

### 3. Phase and mass-transfer separation

- [ ] Flash drum variant
- [ ] Three-phase separator
- [ ] Decanter
- [ ] Knockout drum
- [ ] Distillation column variant
- [ ] Absorber
- [ ] Stripper
- [ ] Liquid-liquid extraction column
- [ ] Mixer-settler
- [ ] Adsorber bed
- [ ] Pressure-swing adsorption package
- [ ] Ion-exchange bed
- [ ] Membrane separator
- [ ] Reverse-osmosis package
- [ ] Crystallizer

### 4. Solids handling and mechanical separation

- [ ] Filter
- [ ] Filter press
- [ ] Rotary vacuum filter
- [ ] Cartridge / bag filter
- [ ] Centrifuge
- [ ] Cyclone
- [ ] Hydrocyclone
- [ ] Settler / clarifier
- [ ] Thickener
- [ ] Screen / sieve
- [ ] Crusher
- [ ] Grinder / mill
- [ ] Screw conveyor
- [ ] Belt conveyor
- [ ] Bucket elevator
- [ ] Hopper / silo
- [ ] Feeder
- [ ] Pneumatic conveying package

### 5. Reaction and biochemical processing

- [ ] Batch reactor variant
- [ ] Continuous stirred-tank reactor variant
- [ ] Plug-flow reactor variant
- [ ] Packed-bed catalytic reactor
- [ ] Fluidized-bed reactor
- [ ] Bubble column reactor
- [ ] Fermenter / bioreactor
- [ ] Electrolyzer
- [ ] Photoreactor
- [ ] Static mixer-reactor

### 6. Drying, storage and environmental systems

- [ ] Spray dryer
- [ ] Rotary dryer
- [ ] Fluidized-bed dryer
- [ ] Tray dryer
- [ ] Vacuum dryer
- [ ] Pressure vessel
- [ ] Gas holder
- [ ] Refrigerated storage tank
- [ ] Baghouse
- [ ] Electrostatic precipitator
- [ ] Wet scrubber
- [ ] Flare
- [ ] Thermal oxidizer / incinerator
- [ ] Aeration basin
- [ ] Dissolved-air flotation unit

### 7. Power and optional instrumentation

- [ ] Turbine / expander
- [ ] Motor / drive
- [ ] Generator
- [ ] Electrical / heat source boundary
- [ ] Flow measurement element
- [ ] Pressure measurement element
- [ ] Temperature measurement element
- [ ] Level measurement element
- [ ] Controller annotation and signal connection

Instrumentation belongs to a later optional P&ID layer; process-material ports must remain distinct from signals. This roadmap does not claim ISA/ISO compliance.

## First addition: valve

The `valve` has material ports `in` and `out`, each with capacity one. `opening` is a fraction from 0 to 1 or `None` for unknown. `valveType` records the subtype; `actuation` is manual, pneumatic or electric. The initial symbol is a generic inline valve for every subtype; subtype-specific artwork and actuator detail are not implemented. No flow coefficient, pressure-drop calculation, fail-safe function or relief sizing is implied.

```python
from pfd_core import Endpoint, add_equipment, connect, new_document, validate_document

valve_doc = new_document("Feed isolation valve")
for identity, kind, x in [
    ("supply", "feed", 0),
    ("valve", "valve", 250),
    ("outlet", "product", 500),
]:
    valve_doc = add_equipment(valve_doc, kind, id=identity, x=x)
for source, target in [("supply", "valve"), ("valve", "outlet")]:
    valve_doc = connect(
        valve_doc,
        Endpoint(equipment_id=source, port_id="out"),
        Endpoint(equipment_id=target, port_id="in"),
    )
assert validate_document(valve_doc).valid
```

This addition is in the repository development version. The already published `pfd-core==0.1.0` has ten types and does not include the built-in `valve`. Until a new package version is released, install the current source checkout with `python -m pip install ./packages/pfd-core` to run this example.

## Check valve

`checkValve` has material `in` (left) and `out` (right) ports. `construction` accepts `swing`, `lift` or `wafer`; all use the same generic nonreturn symbol. `crackingPressurePa` is a nonnegative pressure difference in Pa, or `None`. Directional ports describe the drawing; they do not simulate closure or reverse flow.

```python
from pfd_core import Endpoint, add_equipment, connect, new_document, validate_document

check_doc = add_equipment(new_document("Check valve"), "feed", id="feed")
check_doc = add_equipment(
    check_doc,
    "checkValve",
    id="nrv",
    x=250,
    config={"construction": "swing", "crackingPressurePa": None},
)
check_doc = add_equipment(check_doc, "product", id="product", x=500)
check_doc = connect(
    check_doc,
    Endpoint(equipment_id="feed", port_id="out"),
    Endpoint(equipment_id="nrv", port_id="in"),
    tag="Supply",
)
check_doc = connect(
    check_doc,
    Endpoint(equipment_id="nrv", port_id="out"),
    Endpoint(equipment_id="product", port_id="in"),
    tag="Forward path",
)
assert validate_document(check_doc).valid
print(check_doc.engineering.equipment[1].config)
```

## Pressure relief valve

`pressureReliefValve` uses material `in` on its bottom (protected side) and `out` on its right (discharge side). `mechanism` accepts `springLoaded` or `pilotOperated`. Both use a generic spring-relief schematic; pilot-system details are omitted. `setPressurePa` is an entered absolute pressure in Pa, strictly positive or `None`. No capacity, opening action, discharge-system calculation or safety adequacy is evaluated. An unknown value is appropriate for an illustrative diagram.

```python
from pfd_core import Endpoint, add_equipment, connect, new_document, validate_document

relief_doc = add_equipment(new_document("Relief schematic"), "feed", id="protected", y=250)
relief_doc = add_equipment(
    relief_doc,
    "pressureReliefValve",
    id="psv",
    x=250,
    config={"mechanism": "springLoaded", "setPressurePa": None},
)
relief_doc = add_equipment(relief_doc, "product", id="discharge", x=500)
relief_doc = connect(
    relief_doc,
    Endpoint(equipment_id="protected", port_id="out"),
    Endpoint(equipment_id="psv", port_id="in"),
    tag="Protected-side boundary",
)
relief_doc = connect(
    relief_doc,
    Endpoint(equipment_id="psv", port_id="out"),
    Endpoint(equipment_id="discharge", port_id="in"),
    tag="Discharge boundary",
)
assert validate_document(relief_doc).valid
print(relief_doc.engineering.equipment[1].config)
```

## Pressure reducing regulator

`pressureRegulator` has material `in` (upstream, left) and `out` (downstream, right). `actuation` accepts `selfActing` or `pilotOperated`; the generic diaphragm/regulator symbol represents both. `outletPressurePa` is an entered absolute downstream pressure in Pa, strictly positive or `None`. Configuration neither establishes an upstream pressure nor solves or controls the stream pressure.

```python
from pfd_core import Endpoint, add_equipment, connect, new_document, validate_document

regulator_doc = add_equipment(new_document("Pressure regulator"), "feed", id="upstream")
regulator_doc = add_equipment(
    regulator_doc,
    "pressureRegulator",
    id="reg",
    x=250,
    config={"actuation": "selfActing", "outletPressurePa": None},
)
regulator_doc = add_equipment(regulator_doc, "product", id="downstream", x=500)
regulator_doc = connect(
    regulator_doc,
    Endpoint(equipment_id="upstream", port_id="out"),
    Endpoint(equipment_id="reg", port_id="in"),
    tag="Upstream",
)
regulator_doc = connect(
    regulator_doc,
    Endpoint(equipment_id="reg", port_id="out"),
    Endpoint(equipment_id="downstream", port_id="in"),
    tag="Downstream",
)
assert validate_document(regulator_doc).valid
print(regulator_doc.engineering.equipment[1].config)
```

These three types are also development-source additions and are not included in the published PyPI 0.1.0 package.

## Flow restriction / orifice

`flowRestriction` provides material `in` (left) and `out` (right). `restrictionType` accepts `orificePlate` or `fixedRestriction`; both use the same generic plate symbol. `boreDiameterM` is a positive entered diameter in metres, or `None`. `pressureDropPa` is a nonnegative entered differential in Pa, or `None`. Flow is not calculated from these fields; geometry is not sized, and no cavitation, choking or measurement correction is inferred.

This self-contained PFD uses arbitrary illustrative pressure entries. Equipment configuration and stream properties are separate: changing the entered drop does not modify the outlet pressure.

```python
from pfd_core import (
    Document,
    Endpoint,
    Quantity,
    add_equipment,
    connect,
    new_document,
    update_stream,
    validate_document,
)

restriction_doc = new_document("Illustrative orifice restriction")
for identity, kind, x in [
    ("supply", "feed", 0),
    ("orifice", "flowRestriction", 250),
    ("outlet", "product", 500),
]:
    config = (
        {"restrictionType": "orificePlate", "boreDiameterM": None, "pressureDropPa": 1000.0}
        if kind == "flowRestriction"
        else None
    )
    restriction_doc = add_equipment(restriction_doc, kind, id=identity, x=x, config=config)
restriction_doc = connect(
    restriction_doc,
    Endpoint(equipment_id="supply", port_id="out"),
    Endpoint(equipment_id="orifice", port_id="in"),
    id="restriction-in",
    tag="Upstream",
)
restriction_doc = connect(
    restriction_doc,
    Endpoint(equipment_id="orifice", port_id="out"),
    Endpoint(equipment_id="outlet", port_id="in"),
    id="restriction-out",
    tag="Downstream",
)
restriction_doc = update_stream(
    restriction_doc,
    "restriction-in",
    pressure=Quantity(value=100000, unit="Pa", dimension="pressure"),
)
restriction_doc = update_stream(
    restriction_doc,
    "restriction-out",
    pressure=Quantity(value=99000, unit="Pa", dimension="pressure"),
)
assert validate_document(restriction_doc).valid
assert Document.model_validate_json(restriction_doc.to_json()) == restriction_doc
print(restriction_doc.engineering.equipment[1].config)
```

## Compressor: centrifugal

`compressor` has material `in` (left suction) and `out` (right discharge), plus an optional energy `power` inlet on the bottom. `machineType` is `centrifugal` or `reciprocating`, with distinct symbols. `drive` is `electric`, `steam` or `other`. `isentropicEfficiency` is an entered fraction greater than zero and at most one, or `None`. `outletPressurePa` is an entered positive absolute pressure in Pa, or `None`.

This gas compression/aftercooling illustration uses arbitrary manually entered inlet and outlet pressures. No power, temperature rise, surge, gas suitability, stage performance or cooling duty is calculated. The unconnected exchanger shell circuit is an allowed draft warning. The optional compressor shaft-power port may remain unconnected; use an energy stream to represent it when a suitable energy source extension is registered.

```python
from pfd_core import (
    Document,
    Endpoint,
    Quantity,
    add_equipment,
    connect,
    new_document,
    update_stream,
    validate_document,
)

compressor_doc = new_document("Illustrative centrifugal compression and aftercooling")
for identity, kind, x in [
    ("gas", "feed", 0),
    ("compressor", "compressor", 250),
    ("aftercooler", "heatExchanger", 500),
    ("product", "product", 750),
]:
    config = (
        {
            "machineType": "centrifugal",
            "drive": "electric",
            "isentropicEfficiency": None,
            "outletPressurePa": 200000.0,
        }
        if kind == "compressor"
        else None
    )
    compressor_doc = add_equipment(compressor_doc, kind, id=identity, x=x, config=config)
for stream_id, source, outlet, target, inlet, tag in [
    ("suction", "gas", "out", "compressor", "in", "Suction gas"),
    ("discharge", "compressor", "out", "aftercooler", "tubeIn", "Discharge gas"),
    ("cooled", "aftercooler", "tubeOut", "product", "in", "Aftercooled gas"),
]:
    compressor_doc = connect(
        compressor_doc,
        Endpoint(equipment_id=source, port_id=outlet),
        Endpoint(equipment_id=target, port_id=inlet),
        id=stream_id,
        tag=tag,
    )
compressor_doc = update_stream(
    compressor_doc, "suction", pressure=Quantity(value=100000, unit="Pa", dimension="pressure")
)
compressor_doc = update_stream(
    compressor_doc,
    "discharge",
    pressure=Quantity(value=200000, unit="Pa", dimension="pressure"),
    temperature=Quantity(value=None, unit="K", dimension="temperature"),
)
assert validate_document(compressor_doc).valid
assert validate_document(compressor_doc).physical_checks_performed == []
assert Document.model_validate_json(compressor_doc.to_json()) == compressor_doc
print(compressor_doc.engineering.equipment[1].config)
```

## Compressor: reciprocating

This continuation changes the compressor subtype while retaining its ports, stream identities, entered conditions and connections. It uses `compressor_doc` from the preceding example. The source document is unchanged by the graph command.

```python
from pfd_core import update_equipment, validate_document

reciprocating_doc = update_equipment(
    compressor_doc, "compressor", config={"machineType": "reciprocating"}
)
reciprocating_doc.title = "Illustrative reciprocating compression and aftercooling"
assert validate_document(reciprocating_doc).valid
assert compressor_doc.engineering.equipment[1].config["machineType"] == "centrifugal"
assert reciprocating_doc.engineering.streams == compressor_doc.engineering.streams
print(reciprocating_doc.engineering.equipment[1].config)
```

Flow restriction and compressor are development-source additions; PyPI 0.1.0 does not include them. Install from the source checkout until the next release. The next planned equipment is the blower, followed by the fan.
