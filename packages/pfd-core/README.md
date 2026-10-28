# pfd-core

Typed process flow diagram documents, an extensible equipment registry, quantities, graph commands, and structural validation for teaching and engineering illustrations. Requires Python 3.11+ and Pydantic 2.13+. No browser, Django, numerical solver, paid API, or development tool is required at runtime. Source and this documentation are MIT licensed.

Install from a PFDkit checkout, or install a built wheel independently:

```sh
python -m pip install ./packages/pfd-core
# Alternatively: python -m pip install /path/to/pfd_core-0.1.0-py3-none-any.whl
```

## Create, connect, save and reload

The built-in registry provides `feed`, `product`, `pump`, `heatExchanger`, `separator`, `tank`, `mixer`, `splitter`, `column` and `reactor`. The quickstart below uses the first four process roles. IDs identify objects; editable tags identify them to the reader. Ports have stable local IDs, a direction, a material/energy kind, a connection capacity and optional drawing-side offsets. Mixer and splitter ports have fixed identities, including an optional third branch. The exchanger's tube and shell circuits are distinct. Definitions also expose category, keywords, supported views and symbol provenance; those do not imply numerical calculations.

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

process = new_document("Illustrative feed heating")
for index, (identity, equipment_type, tag) in enumerate(
    [
        ("feed", "feed", "F-101"),
        ("pump", "pump", "P-101"),
        ("exchanger", "heatExchanger", "E-101"),
        ("product", "product", "PR-101"),
    ]
):
    process = add_equipment(
        process,
        equipment_type,
        id=identity,
        tag=tag,
        x=index * 240.0,
        y=160.0,
    )

for index, (source, outlet, target, inlet) in enumerate(
    [
        ("feed", "out", "pump", "in"),
        ("pump", "out", "exchanger", "tubeIn"),
        ("exchanger", "tubeOut", "product", "in"),
    ],
    1,
):
    process = connect(
        process,
        Endpoint(equipment_id=source, port_id=outlet),
        Endpoint(equipment_id=target, port_id=inlet),
        id=f"stream-{index}",
        tag=f"S-{index:03}",
    )

process = update_stream(
    process,
    "stream-1",
    flow_rate=Quantity(value=1.25, unit="kg/s", dimension="massFlow"),
    temperature=Quantity(value=None, unit="degC", dimension="temperature"),
)
report = validate_document(process)
assert report.valid
assert report.physical_checks_performed == []
print([(item.severity, item.code, item.object_id) for item in report.issues])
# The unconnected shellIn/shellOut ports produce editable-draft warnings.

payload = process.to_json()  # UTF-8-compatible JSON text, camelCase keys
reopened = Document.model_validate_json(payload)
assert reopened == process
assert validate_document(reopened).valid
```

Assign the return value of every graph command: commands copy the document and leave the input intact. `add_equipment` also creates layout coordinates. `update_equipment` merges supplied configuration/metadata with existing values. `remove_equipment` removes attached streams and its layout; `remove_stream` removes one connection. Recycle loops are allowed. `Document.model_validate_json` checks the envelope and field types; call `validate_document` afterwards to check references, ports and registered equipment semantics.

## Quantities and unknown values

`None` is an unknown measurement, never an implicit zero. A null quantity means no quantity was supplied; a `Quantity(value=None, ...)` preserves a known dimension/unit while its value remains unknown. Numeric zero is an entered value. A stream's `flow_basis` (`mass`, `molar`, `volume`) selects its flow-rate dimension. Composition supports mole or mass fractions referencing component IDs. Fully known fractions must sum to one within `1e-6`; known partial fractions cannot exceed one. Energy streams use a power quantity in `properties["power"]` and cannot carry material flow or composition.

```python
from pfd_core import Quantity, convert_quantity

flow = Quantity(value=1.25, unit="kg/s", dimension="massFlow")
assert convert_quantity(flow, "kg/h").value == 4500.0
unknown = Quantity(value=None, unit="degC", dimension="temperature")
assert convert_quantity(unknown, "K").value is None
zero = Quantity(value=0.0, unit="degC", dimension="temperature")
assert convert_quantity(zero, "K").value == 273.15
```

`UNITS` lists supported units. Dimensions include mass/molar/volume flow, temperature, pressure, power and dimensionless quantities. Temperatures represent states and include offset conversion; pressures are absolute. Unit strings are case-sensitive. Unknown units, ambiguous names such as gauge-pressure abbreviations, and incompatible dimensions raise `ValueError` from `check_quantity` or `convert_quantity`. No phase or physical feasibility is inferred from entered values.

## Validation and errors

`validate_document` returns a `ValidationResult` with `valid`, `issues`, `checks_performed` and `physical_checks_performed`. Each finding has severity (`error`, `warning`, `info`), a stable code, message, optional object ID and path. Checks cover identities, registered configuration, references, port directions/kinds/capacities, units, composition and draft completeness. Warnings permit incomplete diagrams; errors reject graph commands. No balances, thermodynamics, equipment sizing or other physical calculations are performed.

```python
from pfd_core import GraphValidationError

try:
    connect(
        process,
        Endpoint(equipment_id="feed", port_id="out"),
        Endpoint(equipment_id="pump", port_id="power"),
    )  # A material stream cannot connect to a shaft-power energy port.
except GraphValidationError as error:
    assert any(item.code == "stream_kind" for item in error.result.issues)
assert len(process.engineering.streams) == 3  # Failed command left it intact.
```

Malformed field values or unsupported `schemaVersion` values raise Pydantic `ValidationError` when constructing/loading models. `GraphValidationError` exposes a semantic report through `.result`. Registry lookups and adding an unregistered type raise `ValueError`; semantic document validation instead reports `unsupported_equipment`. Missing update/delete targets raise `KeyError`; duplicate IDs supplied to `add_equipment` raise `ValueError`. Loading unknown equipment preserves its model data, but callers must reject semantic errors before treating the document as editable.

## Register a Python extension

Extensions declare type, version, source, tag prefix, stable ports and a Pydantic configuration model. Configuration fields need defaults because registration constructs a default configuration. This example uses an independent registry; pass that registry to every applicable graph/validation call. It does not modify the built-in registry or add a browser renderer automatically.

```python
from pydantic import BaseModel, ConfigDict, Field
from pfd_core import EquipmentRegistry, PortDefinition


class ValveConfig(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    opening: float | None = Field(default=None, ge=0, le=1, strict=True)


teaching_registry = EquipmentRegistry()
teaching_registry.register(
    type="teachingValve",
    name="Teaching valve",
    description="An illustrative valve with a manually entered opening.",
    tag_prefix="V",
    version="1.0.0",
    extension="example.teaching",
    ports=[
        PortDefinition(id="in", name="Inlet", direction="in", side="left"),
        PortDefinition(id="out", name="Outlet", direction="out", side="right"),
    ],
    config_model=ValveConfig,
)
valve_process = add_equipment(
    new_document("Valve teaching draft"),
    "teachingValve",
    id="valve-1",
    config={"opening": 0.5},
    equipment_registry=teaching_registry,
)
assert validate_document(valve_process, teaching_registry).valid
definition = teaching_registry.get("teachingValve")
assert definition.default_config == {"opening": None}
assert definition.version == "1.0.0"
```

`EquipmentRegistry.definitions()` provides serializable definitions and configuration schemas; `validate_config(type, config)` checks a configuration without filling defaults or rewriting the supplied dictionary. Duplicate registered types and duplicate port IDs raise `ValueError`. To share an extension with the PFDkit browser, register it in the authoritative Python source, regenerate contract assets and provide an equipment renderer before importing its documents.

## Public model and interchange conventions

The public package exports `Document`, engineering models (`Equipment`, `Stream`, `Component`, `Composition`, `Endpoint`, `Quantity`, `Dimension`), layout/education models, registry definitions, validation reports, graph commands, unit helpers and `new_id`. Python attributes use snake_case; `.to_json()` and `.model_dump(mode="json", by_alias=True)` use the camelCase interchange format. `Document.model_json_schema(by_alias=True)` produces the JSON Schema. Version `1.0.0` is supported; no migration from another version is implemented.

Engineering data, presentation layout and education notes are separate sections of one document. Equipment configuration is shared engineering data rather than a drawing property. `metadata` dictionaries and equipment `config` preserve agreed JSON extension values; other unknown model fields are rejected. Store attribution as metadata such as creator/source/license when adapting educational examples.

JSON numbers must be finite IEEE 754 double values. All integer-valued numbers, including extension metadata, must fit ±9,007,199,254,740,991 for browser interchange. Use strings for arbitrary-precision identifiers or metadata. NaN/infinity and unsafe integers are rejected. Serialization sorts object keys, preserves array ordering, uses two-space indentation and adds a trailing newline. Nulls, entered zeros, stable IDs, units, configuration and layout survive a valid save/reload round trip.
