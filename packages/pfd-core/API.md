# pfd-core API reference

This reference describes the public exports of `pfd_core` 0.1.0, with Python 3.11+ and Pydantic 2.13+. See the [guide](GUIDE.md) for runnable composition and energy examples and the [README](README.md) for installation and extension registration. Validation checks document consistency; it performs no process simulation or physical calculation.

## Graph commands

Import these functions from `pfd_core`. Every command returns a deep copy and leaves its input unchanged, including on failure. Retain the return value. Unless shown otherwise, `equipment_registry` defaults to the built-in `registry`.

```text
new_document(title: str = "Untitled process") -> Document
add_equipment(document: Document, type: str, *, id: str | None = None,
              tag: str | None = None, config: dict | None = None,
              x: float = 0, y: float = 0,
              equipment_registry: EquipmentRegistry = registry) -> Document
connect(document: Document, source: Endpoint, target: Endpoint, *,
        kind: Literal["material", "energy"] = "material",
        id: str | None = None, tag: str = "",
        equipment_registry: EquipmentRegistry = registry) -> Document
update_equipment(document: Document, equipment_id: str, *,
                 tag: str | None = None, config: dict | None = None,
                 metadata: dict | None = None,
                 equipment_registry: EquipmentRegistry = registry) -> Document
update_stream(document: Document, stream_id: str, *,
              equipment_registry: EquipmentRegistry = registry, **changes) -> Document
remove_stream(document: Document, stream_id: str) -> Document
remove_equipment(document: Document, equipment_id: str) -> Document
```

`new_document` creates empty engineering, presentation and education sections and a generated ID. `add_equipment` requires a registered type, creates a `NodeLayout`, and generates an ID when omitted. An omitted tag uses the definition's prefix and the first unused number, such as `P-001`. An omitted config uses the registered defaults; a supplied config is validated but is not filled with defaults in the stored dictionary. IDs must be unique across equipment, streams and components.

`connect` creates a stream between an outlet and an inlet. Both ports must match `kind` and remain within capacity. Recycle loops, including a self-loop, are allowed. Connections do not propagate properties or solve balances.

`update_equipment` merges config and metadata dictionaries at the top level; it does not recursively merge nested dictionaries. `None` means leave that argument unchanged. `update_stream` accepts `Stream` field names as keyword changes: use Python snake_case names, such as `flow_rate` and `flow_basis`. Dictionary fields such as `properties` and `metadata` are replaced in full. Set an optional field to `None` to clear it. Model fields are revalidated before semantic validation.

Add/connect/update commands validate the entire resulting document. An existing unrelated semantic error can therefore reject a command. Warnings are accepted. Missing edit/delete targets raise `KeyError`. Unregistered types and duplicate equipment IDs raise `ValueError`; model errors raise Pydantic `ValidationError`; semantic failures raise `GraphValidationError`.

Removal commands do not perform semantic validation. `remove_equipment` also deletes attached streams and its node layout. Neither removal command repairs section membership, boundary ports or teaching references; update those references and call `validate_document` afterwards. There are no graph commands for components, sections, annotations or steps: edit a deep copy of their model collections, then revalidate the model and document.

## Document and engineering models

All listed models are Pydantic models. Their constructors accept both Python snake_case names and camelCase aliases. Unknown fields are rejected. Collection and dictionary defaults are independent per instance. Numeric values must be finite; integer-valued numbers anywhere in a document must fit ±(2^53−1). Unknown measurements are `None`, distinct from zero.

| Model               | Fields and defaults                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Document`          | `schema_version="1.0.0"`, generated `id`, `title="Untitled process"`, `metadata={}`, `engineering=Engineering()`, `presentation=Presentation()`, `education=Education()` |
| `Engineering`       | `equipment=[]`, `streams=[]`, `components=[]`, `sections=[]`                                                                                                             |
| `Equipment`         | generated `id`, required nonempty `type`, `tag=""`, `config={}`, `metadata={}`                                                                                           |
| `Endpoint`          | required nonempty `equipment_id` and `port_id`                                                                                                                           |
| `Component`         | generated `id`, required nonempty `name`, optional `formula=None`, `metadata={}`                                                                                         |
| `ComponentFraction` | required nonempty `component_id`, `value=None` or a number from 0 to 1                                                                                                   |
| `Composition`       | `basis="mole"` (`"mole"` or `"mass"`), `fractions=[]`                                                                                                                    |
| `Quantity`          | `value=None` or a finite number, required nonempty `unit`, required `dimension`                                                                                          |

All generated IDs are UUID strings from `new_id() -> str`. Explicit model IDs must be nonempty.

`Stream` requires `source: Endpoint` and `target: Endpoint`; its remaining fields are:

| Field         | Type / default                            | Meaning                                           |
| ------------- | ----------------------------------------- | ------------------------------------------------- |
| `id`, `tag`   | generated string, `""`                    | Stable identity and display label                 |
| `kind`        | `"material"` or `"energy"`; `"material"`  | Must match both endpoint ports                    |
| `flow_basis`  | `"mass"`, `"molar"`, `"volume"`; `"mass"` | Selects expected flow-rate dimension              |
| `flow_rate`   | `Quantity                                 | None = None`                                      | Mass, molar or volume flow                |
| `temperature` | `Quantity                                 | None = None`                                      | Temperature state                         |
| `pressure`    | `Quantity                                 | None = None`                                      | Absolute pressure                         |
| `composition` | `Composition                              | None = None`                                      | Fractions referencing document components |
| `properties`  | `dict[str, Quantity] = {}`                | Named quantities; energy power uses key `"power"` |
| `metadata`    | `dict = {}`                               | JSON extension data                               |

Energy streams reject non-null flow rate and composition. Their `properties["power"]`, when present, must have dimension `power`. Other property keys are checked for valid units but have no prescribed dimension. Temperature and pressure retain their usual dimension checks. Power is not required and sign/physical feasibility is not assessed. Composition references must be unique and exist; all-known fractions sum to one within `1e-6`, while partial known totals cannot exceed `1 + 1e-6`. A partial composition produces a warning.

## Serialization and model validation

`document.to_json() -> str` returns camelCase JSON with sorted object keys, two-space indentation and a trailing newline. Array order is preserved. `Document.model_validate_json(text)` loads JSON; `Document.model_validate(mapping)` validates a Python dictionary. Both check shape and numeric portability, but do not check graph semantics. Run `validate_document` after loading.

Use `model_dump(mode="json", by_alias=True)` for interchange dictionaries and `Document.model_json_schema(by_alias=True)` for JSON Schema. Only schema version `1.0.0` is accepted. `model_copy(deep=True)` creates an independent editable copy, but `model_copy(update=...)` and direct field/collection mutation do not automatically validate updates. Rebuild with `Document.model_validate(document.model_dump())` before semantic validation when editing directly. Metadata and equipment config preserve JSON extensions; arbitrary extra model fields do not.

## Presentation and education

| Export         | Fields and defaults                                                     |
| -------------- | ----------------------------------------------------------------------- |
| `NodeLayout`   | `x=0`, `y=0`, `metadata={}`; coordinates are drawing units              |
| `Viewport`     | `x=0`, `y=0`, `zoom=1`; zoom must be positive                           |
| `Presentation` | `nodes: dict[str, NodeLayout]={}`, `viewport=Viewport()`, `metadata={}` |
| `Education`    | `notes=""`, `metadata={}`, `annotations=[]`, `steps=[]`                 |

Node dictionary keys reference equipment IDs. Section and detailed teaching models are available from `pfd_core.models`, rather than exported from the package root:

| Model              | Fields and defaults                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProcessSection`   | generated `id`, required `name`, `parent_id=None`, `equipment_ids=[]`, `boundary_ports=[]`                                                                                                                                                 |
| `BoundaryPort`     | generated `id`, required `stream_id`, `internal_endpoint: Endpoint`, `direction` (`in`/`out`), `kind` (`material`/`energy`)                                                                                                                |
| `Annotation`       | generated `id`, `kind="note"` (`note`/`callout`/`arrow`/`component`), `text=""`, `target_id=None`, `x=0`, `y=0`, `end_x=None`, `end_y=None`, `visible=True`, `provenance="conceptual"` (`conceptual`/`manual`/`illustrative`/`calculated`) |
| `PresentationStep` | generated `id`, `title="Untitled step"`, `target_ids=[]`, `reveal_ids=[]`, `annotation_ids=[]`, `notes=""`, `explorer_id=None`                                                                                                             |

Hierarchy and teaching references are semantically checked. See the repository's [section and teaching guide](../../docs/process-sections-and-teaching.md) for boundary and presentation rules. A provenance label does not cause calculations.

## Equipment registry

`registry` is the shared built-in `EquipmentRegistry` instance. `EquipmentRegistry()` creates an empty registry. Keep an independent registry for isolated extensions and pass it to graph/validation calls. The built-in types are `feed`, `product`, `pump`, `heatExchanger`, `separator`, `tank`, `mixer`, `splitter`, `column`, `reactor`.

| Method                                     | Return and behavior                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `get(type: str)`                           | A deep copy of `EquipmentDefinition`; unknown type raises `ValueError`                                                                    |
| `definitions()`                            | List of copied definitions in registration order                                                                                          |
| `for_equipment(type: str, config: dict)`   | Copied definition with configuration-specific ports; column feeds, side draws and port offsets reflect the supplied config                |
| `validate_config(type: str, config: dict)` | `None` on success; raises `ValueError` for unknown type or Pydantic `ValidationError` for invalid config; does not rewrite the dictionary |
| `register(*, ...)`                         | `None`; installs a type and configuration model; duplicate type or duplicate local port IDs raises `ValueError`                           |

`register` requires keyword arguments `type`, `name`, `description`, `tag_prefix`, `ports: list[PortDefinition]`, and `config_model: type[BaseModel]`. Optional arguments are `version="1.0.0"`, `extension="pfd-core"`, `category="Other"`, `keywords=None`, `available_views=None`, `provenance=None`, `explorer=None`. The config model must construct without arguments because registration calls it to obtain defaults. Schema comes from its `model_json_schema()`. See the README's complete extension example.

`EquipmentDefinition` exposes the arguments above plus `config_schema` and `default_config`; `available_views` defaults to `["pfd"]`, keywords to `[]`, explorer to `None`. Default provenance identifies PFDkit contributors, MIT licensing and an illustrative original schematic. Definition metadata does not provide a browser renderer or a solver.

`PortDefinition` requires `id`, `name`, `direction` (`in`/`out`) and `side` (`left`/`right`/`top`/`bottom`). Optional fields are `kind="material"`, `max_connections=1` (integer ≥1), `required=True`, `circuit=None`, and `offset=0.5` (0–1). Port identity is local to an equipment type. Required ports with no connections produce draft warnings. Inspect `for_equipment` when configuration can add ports; `get` describes the base definition.

## Dimensions and units

`Dimension` is a string enum: `MASS_FLOW="massFlow"`, `MOLAR_FLOW="molarFlow"`, `VOLUME_FLOW="volumeFlow"`, `TEMPERATURE="temperature"`, `PRESSURE="pressure"`, `POWER="power"`, `DIMENSIONLESS="dimensionless"`.

| Dimension         | Supported unit strings           |
| ----------------- | -------------------------------- |
| Mass flow         | `kg/s`, `kg/h`, `g/s`            |
| Molar flow        | `mol/s`, `kmol/s`, `kmol/h`      |
| Volume flow       | `m3/s`, `m3/h`, `L/s`            |
| Temperature       | `K`, `degC`, `degF`              |
| Absolute pressure | `Pa`, `kPa`, `MPa`, `bar`, `atm` |
| Power             | `W`, `kW`, `MW`                  |
| Dimensionless     | `1`, `%`                         |

`UNITS` maps those case-sensitive strings to immutable unit records with `dimension`, `scale`, `offset`. Conversion uses `(value * source.scale + source.offset - target.offset) / target.scale`; temperatures are states, not temperature differences. Gauge pressure and ambiguous abbreviations are unsupported.

`check_quantity(quantity: Quantity) -> None` verifies that the unit exists and matches the declared dimension, raising `ValueError` otherwise. Construction of a `Quantity` alone does not perform that check. `convert_quantity(quantity: Quantity, target_unit: str) -> Quantity` returns a new quantity, preserves unknown `None`, validates both units and rejects incompatible dimensions with `ValueError`. It does not convert flow or composition bases.

## Validation and errors

`validate_document(document: Document, equipment_registry: EquipmentRegistry = registry) -> ValidationResult` checks semantic consistency without modifying the document. It expects a model that has already passed shape validation. Registered config validation, endpoint directions/kinds/capacities, component references and totals, units, layout references, hierarchy and teaching references are checked. Required unconnected ports and unknown composition fractions are warnings.

`ValidationResult.issues` is a list of `Finding`; `valid` is a computed boolean that is false if any issue has severity `error`. `checks_performed` lists the consistency checks, including `process_hierarchy` and `teaching_references`. `physical_checks_performed` is empty. A valid report can contain warnings and does not establish physical feasibility.

`Finding` has required `severity` (`error`/`warning`/`info`), `code`, `message`, and optional `object_id=None`, `path=""`. Paths identify the affected field, such as `composition` or `properties.power`. Use codes and object IDs for programmatic handling; messages are human-readable.

Common error codes include `duplicate_id`, `unsupported_equipment`, `invalid_configuration`, `missing_equipment`, `missing_port`, `port_direction`, `stream_kind`, `port_capacity`, `invalid_unit`, `quantity_dimension`, `energy_material_property`, `missing_component`, `duplicate_component`, `composition_sum`, and `orphan_layout`. Common warning codes include `duplicate_tag`, `unconnected_port`, `unknown_composition`, and `unsupported_illustration`. Hierarchy and teaching validation adds further reference-specific findings.

`GraphValidationError` subclasses `ValueError`. Its `.result` contains the complete `ValidationResult`, including warnings; its message joins error messages. Catch Pydantic `ValidationError` separately for malformed model data, `KeyError` for missing command targets, and `ValueError` for registry/unit/duplicate-equipment-ID failures. Failed graph commands leave the original input intact.
