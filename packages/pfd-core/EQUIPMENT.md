# Equipment catalog and expansion plan

This working catalog covers common chemical-process equipment and specialist families that may be useful later. Variants share a type when their ports and document behavior are the same. Specialist industries may require further additions. Planned entries are not available in the library yet.

## Available now

Feed (`feed`), product (`product`), pump (`pump`), heat exchanger (`heatExchanger`), separator (`separator`), tank (`tank`), mixer (`mixer`), splitter (`splitter`), column (`column`), reactor (`reactor`), and valve (`valve`).

## Implementation sequence

Each unchecked entry is a separate implementation task. Finish its port contract, configuration validation, editor symbol, connection tests, working example and documentation before marking it complete. Maintain Python/TypeScript parity and regenerate contracts after each addition. Equipment symbols and entered properties do not imply a numerical solver.

### 1. Flow control and fluid transport

- [x] Inline valve: generic, globe, gate, ball, butterfly and needle configuration
- [ ] Check valve
- [ ] Pressure relief valve
- [ ] Pressure reducing regulator
- [ ] Flow restriction / orifice
- [ ] Compressor: centrifugal and reciprocating variants
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
