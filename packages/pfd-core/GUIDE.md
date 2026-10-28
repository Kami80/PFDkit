# Building and using a PFD

This guide targets `pfd-core` 0.1.0 and Python 3.11 or later. Install it with `python -m pip install pfd-core`. The package models and validates diagrams; it does not draw them or solve process equations. Use the PFDkit editor to view and export diagrams.

## Build a process diagram

Create a feed, pump, heat exchanger and product, connect their material ports, enter a flow rate, validate, and save the document. This illustration leaves the exchanger shell circuit unconnected, so validation reports warnings. Every graph command returns a new document: keep its return value. The later editing and error-handling snippets use `doc` from this example; the other examples are standalone.

```python
from pathlib import Path
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

doc = new_document("Feed heating")
for kind, identity, tag, x in [
    ("feed", "feed", "F-101", 0),
    ("pump", "pump", "P-101", 220),
    ("heatExchanger", "heater", "E-101", 440),
    ("product", "product", "PR-101", 660),
]:
    doc = add_equipment(doc, kind, id=identity, tag=tag, x=x, y=100)

for identity, source, outlet, target, inlet in [
    ("s1", "feed", "out", "pump", "in"),
    ("s2", "pump", "out", "heater", "tubeIn"),
    ("s3", "heater", "tubeOut", "product", "in"),
]:
    doc = connect(
        doc,
        Endpoint(equipment_id=source, port_id=outlet),
        Endpoint(equipment_id=target, port_id=inlet),
        id=identity,
    )

doc = update_stream(doc, "s1", flow_rate=Quantity(value=1.25, unit="kg/s", dimension="massFlow"))
report = validate_document(doc)
for finding in report.issues:
    print(finding.severity, finding.code, finding.message)
assert report.valid  # Unconnected exchanger shell ports are warnings.
Path("feed-heating.json").write_text(doc.to_json(), encoding="utf-8")
loaded = Document.model_validate_json(Path("feed-heating.json").read_text(encoding="utf-8"))
assert validate_document(loaded).valid
```

Open the JSON file in the PFDkit editor to see its layout. Positions are drawing coordinates, not physical dimensions.

## Discover equipment and ports

The built-in types are `feed`, `product`, `pump`, `heatExchanger`, `separator`, `tank`, `mixer`, `splitter`, `column`, and `reactor`. Port IDs and valid configurations differ by type. Inspect the registry rather than guessing:

```python
from pfd_core import registry

for definition in registry.definitions():
    print(definition.type)
    for port in definition.ports:
        print(port.id, port.direction, port.kind, port.max_connections)
```

## Example: a recycle loop

Process flow loops are allowed. This small example connects a pump outlet back to its inlet and checks the graph:

```python
from pfd_core import Endpoint, add_equipment, connect, new_document, validate_document

recycle = add_equipment(new_document("Recycle"), "pump", id="pump")
recycle = connect(
    recycle,
    Endpoint(equipment_id="pump", port_id="out"),
    Endpoint(equipment_id="pump", port_id="in"),
    id="recycle-stream",
)
assert validate_document(recycle).valid
```

## Example: inspect validation results

Warnings describe incomplete drafts. Check both the validity flag and each finding when presenting a document to a user:

```python
from pfd_core import add_equipment, new_document, validate_document

draft = add_equipment(new_document("Draft"), "heatExchanger", id="hx")
result = validate_document(draft)
print("Valid:", result.valid)
for issue in result.issues:
    print(issue.severity, issue.code, issue.object_id, issue.path)
print("Physical calculations:", result.physical_checks_performed)
```

## Example: preserve unknown values

Record a known unit even when the measured value is unavailable. This is different from recording zero:

```python
from pfd_core import Quantity, convert_quantity

unknown_temperature = Quantity(value=None, unit="degC", dimension="temperature")
freezing_water = Quantity(value=0, unit="degC", dimension="temperature")
assert convert_quantity(unknown_temperature, "K").value is None
assert convert_quantity(freezing_water, "K").value == 273.15
```

Material and energy ports cannot be connected to one another; capacities and directions are checked. Recycle loops are supported. For a second exchanger circuit, use its `shellIn` and `shellOut` ports.

## Example: material composition

Components belong to the document; fractions reference their stable IDs. This standalone example records a mole composition and molar flow. Composition basis and flow basis are independent declarations: the library does not convert between mole and mass fractions.

```python
from pfd_core import (
    Component,
    ComponentFraction,
    Composition,
    Document,
    Endpoint,
    Quantity,
    add_equipment,
    connect,
    new_document,
    update_stream,
    validate_document,
)

mixture = new_document("Binary feed")
# There is no add_component graph command. Copy before editing model collections.
mixture = mixture.model_copy(deep=True)
mixture.engineering.components = [
    Component(id="water", name="Water", formula="H2O"),
    Component(id="ethanol", name="Ethanol", formula="C2H6O"),
]
mixture = add_equipment(mixture, "feed", id="feed")
mixture = add_equipment(mixture, "product", id="product", x=240)
mixture = connect(
    mixture,
    Endpoint(equipment_id="feed", port_id="out"),
    Endpoint(equipment_id="product", port_id="in"),
    id="mixture-stream",
)
mixture = update_stream(
    mixture,
    "mixture-stream",
    flow_basis="molar",
    flow_rate=Quantity(value=2.0, unit="mol/s", dimension="molarFlow"),
    composition=Composition(
        basis="mole",
        fractions=[
            ComponentFraction(component_id="water", value=0.75),
            ComponentFraction(component_id="ethanol", value=0.25),
        ],
    ),
)
assert validate_document(mixture).valid
assert Document.model_validate_json(mixture.to_json()) == mixture

partial = update_stream(
    mixture,
    "mixture-stream",
    composition=Composition(
        basis="mole",
        fractions=[
            ComponentFraction(component_id="water", value=0.75),
            ComponentFraction(component_id="ethanol", value=None),
        ],
    ),
)
report = validate_document(partial)
assert report.valid
assert any(issue.code == "unknown_composition" for issue in report.issues)
```

Fractions must lie between zero and one. Fully known fractions must sum to one within `1e-6`; a partially known subtotal cannot exceed `1 + 1e-6`. Unknown fractions stay `None`; the validator does not calculate the remainder. Duplicate component references and references to missing components are errors.

## Example: an energy stream

Built-in equipment provides energy inlets (`pump.power` and `reactor.heat`), but no energy outlet. A material feed cannot supply an energy connection. This standalone example uses an isolated copy of the built-in registry and adds an illustrative power source. Use that same registry for all graph and validation calls involving the extension.

```python
from copy import deepcopy
from pydantic import BaseModel
from pfd_core import (
    Document,
    Endpoint,
    PortDefinition,
    Quantity,
    add_equipment,
    connect,
    convert_quantity,
    new_document,
    registry,
    update_stream,
    validate_document,
)


class PowerSourceConfig(BaseModel):
    description: str = "Manually entered shaft power"


energy_registry = deepcopy(registry)
energy_registry.register(
    type="examplePowerSource",
    name="Power source",
    description="Illustrative energy supply; no performance calculation.",
    tag_prefix="PW",
    extension="example.energy",
    ports=[
        PortDefinition(
            id="out",
            name="Power outlet",
            direction="out",
            kind="energy",
            side="right",
        )
    ],
    config_model=PowerSourceConfig,
)
powered = new_document("Pump power")
powered = add_equipment(
    powered,
    "examplePowerSource",
    id="drive",
    equipment_registry=energy_registry,
)
powered = add_equipment(
    powered,
    "pump",
    id="pump",
    x=240,
    equipment_registry=energy_registry,
)
powered = connect(
    powered,
    Endpoint(equipment_id="drive", port_id="out"),
    Endpoint(equipment_id="pump", port_id="power"),
    id="shaft-power",
    kind="energy",
    equipment_registry=energy_registry,
)
powered = update_stream(
    powered,
    "shaft-power",
    equipment_registry=energy_registry,
    properties={"power": Quantity(value=5.0, unit="kW", dimension="power")},
)
report = validate_document(powered, energy_registry)
assert report.valid  # The pump's unconnected material ports are draft warnings.
power = powered.engineering.streams[0].properties["power"]
assert convert_quantity(power, "W").value == 5000.0
loaded = Document.model_validate_json(powered.to_json())
assert validate_document(loaded, energy_registry).valid
```

Energy streams store power in `properties["power"]`; leave `flow_rate` and `composition` as `None`. A power value may itself be `None` when unknown. The model permits an energy stream without a power property, so successful validation does not mean a duty was supplied. Extension definitions are not embedded in the JSON; consumers need a matching registry, and the browser also needs a renderer for custom equipment.

## Edit and remove objects

```python
from pfd_core import update_equipment, remove_stream, remove_equipment

doc = update_equipment(doc, "pump", tag="P-102", metadata={"service": "feed"})
doc = remove_stream(doc, "s3")
doc = remove_equipment(doc, "heater")  # Also removes its attached streams and layout.
```

Keep stable IDs when updating objects. Tags are human-readable labels and can change. Configuration updates merge with existing configuration; validate configuration against the equipment definition.

## Validate and handle errors

`Document.model_validate_json` checks the document shape; `validate_document` checks graph and engineering-data consistency. A valid document can still have warnings. The checks do not prove a design is physically feasible.

```python
from pfd_core import Endpoint, GraphValidationError, connect

try:
    doc = connect(
        doc,
        Endpoint(equipment_id="feed", port_id="out"),
        Endpoint(equipment_id="pump", port_id="power"),
    )
except GraphValidationError as exc:
    for issue in exc.result.issues:
        print(issue.severity, issue.code, issue.message)
```

Malformed model data raises Pydantic `ValidationError`. Missing edit targets raise `KeyError`; unknown equipment and duplicate IDs can raise `ValueError`. Failed commands do not mutate their input.

## Quantities and units

```python
from pfd_core import Dimension, Quantity, convert_quantity

flow = Quantity(value=3600, unit="kg/h", dimension=Dimension.MASS_FLOW)
assert convert_quantity(flow, "kg/s").value == 1
unknown = Quantity(value=None, unit="degC", dimension=Dimension.TEMPERATURE)
assert convert_quantity(unknown, "K").value is None
```

An unknown value is `None`; zero is a measured value. Units are case-sensitive, and incompatible units raise `ValueError`. `UNITS` contains the supported units. Temperatures are states and pressures are absolute.

## Interchange and boundaries

`doc.to_json()` produces the camelCase interchange format. `Document.model_validate_json()` loads it; always run semantic validation after loading. Schema version 1.0.0 is supported. Extensions in metadata and equipment configuration are preserved; arbitrary unknown model fields are rejected. Numbers must be finite and integers must fit the JavaScript safe-integer range.

The document separates engineering information, presentation layout, and educational content. It supports components and compositions, material and energy streams, nested sections, and teaching annotations. The library performs structural and data checks, not thermodynamics, material or energy balances, equipment sizing, or automatic process simulation.

## More detail

The [package README](README.md) contains the quickstart and custom equipment registration. The [API reference](API.md) documents the public models, commands, units, registry and validation reports. The [source and tests](https://github.com/Kami80/PFDkit/tree/v0.1.0/packages/pfd-core) contain additional working examples.
