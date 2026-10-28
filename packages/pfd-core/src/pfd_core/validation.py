"""Structural validation only: no balances, thermodynamics or sizing are solved."""

from collections import Counter
from typing import Literal

from pydantic import ValidationError

from .hierarchy_validation import validate_hierarchy
from .models import (
    Component,
    Dimension,
    Document,
    Equipment,
    Finding,
    Quantity,
    Stream,
    ValidationResult,
)
from .registry import EquipmentRegistry, registry
from .units import check_quantity


def validate_document(
    document: Document, equipment_registry: EquipmentRegistry = registry
) -> ValidationResult:
    result = ValidationResult()

    def issue(
        code: str,
        message: str,
        object_id: str | None = None,
        path: str = "",
        severity: Literal["error", "warning", "info"] = "error",
    ) -> None:
        result.issues.append(
            Finding(code=code, message=message, object_id=object_id, path=path, severity=severity)
        )  # type: ignore[arg-type]

    equipment = {item.id: item for item in document.engineering.equipment}
    components = {item.id for item in document.engineering.components}
    objects: list[Equipment | Stream | Component] = [
        *document.engineering.equipment,
        *document.engineering.streams,
        *document.engineering.components,
    ]
    for identity, count in Counter(item.id for item in objects).items():
        if count > 1:
            issue(
                "duplicate_id",
                "Object identifiers must be unique across the engineering document.",
                identity,
            )
    for tag, count in Counter(
        item.tag for item in document.engineering.equipment if item.tag
    ).items():
        if count > 1:
            issue("duplicate_tag", f"Equipment tag '{tag}' is repeated.", severity="warning")
    definitions = {}
    for item in document.engineering.equipment:
        try:
            equipment_registry.validate_config(item.type, item.config)
            definitions[item.id] = equipment_registry.for_equipment(item.type, item.config)
            if item.type == "heatExchanger":
                tube = item.config.get("tubePasses", 1)
                shell = item.config.get("shellPasses", 1)
                if item.config.get("flowArrangement") == "crossFlow" and (tube != 1 or shell != 1):
                    issue(
                        "unsupported_illustration",
                        "Cross-flow teaching geometry requires one tube and one shell pass; choose an axial arrangement for multiple passes.",
                        item.id,
                        "config",
                        "warning",
                    )
                if shell > tube:
                    issue(
                        "unsupported_illustration",
                        "Supported shell passes cannot exceed tube passes.",
                        item.id,
                        "config",
                        "warning",
                    )
        except ValidationError as error:
            issue("invalid_configuration", str(error), item.id, "config")
        except ValueError as error:
            issue("unsupported_equipment", str(error), item.id, "type")
    counts: Counter[tuple[str, str]] = Counter()

    def quantity(
        value: Quantity | None, expected: Dimension | None, object_id: str, path: str
    ) -> None:
        if value is None:
            return
        try:
            check_quantity(value)
        except ValueError as error:
            issue("invalid_unit", str(error), object_id, path)
        if expected is not None and value.dimension != expected:
            issue(
                "quantity_dimension",
                f"Expected {expected.value}, received {value.dimension.value}.",
                object_id,
                path,
            )

    for stream in document.engineering.streams:
        if stream.kind == "energy" and (
            stream.flow_rate is not None or stream.composition is not None
        ):
            issue(
                "energy_material_property",
                "Energy streams use properties.power; material flow rate and composition do not apply.",
                stream.id,
            )
        for label, endpoint, direction in [
            ("source", stream.source, "out"),
            ("target", stream.target, "in"),
        ]:
            if endpoint.equipment_id not in equipment:
                issue(
                    "missing_equipment", f"The {label} equipment does not exist.", stream.id, label
                )
                continue
            definition = definitions.get(endpoint.equipment_id)
            if definition is None:
                continue
            port = next((port for port in definition.ports if port.id == endpoint.port_id), None)
            if port is None:
                issue(
                    "missing_port",
                    f"Port '{endpoint.port_id}' does not exist on the {label} equipment.",
                    stream.id,
                    label,
                )
                continue
            counts[(endpoint.equipment_id, endpoint.port_id)] += 1
            if port.direction != direction:
                issue(
                    "port_direction",
                    f"The {label} must use an {'outlet' if direction == 'out' else 'inlet'} port.",
                    stream.id,
                    label,
                )
            if port.kind != stream.kind:
                issue(
                    "stream_kind",
                    f"A {stream.kind} stream cannot connect to a {port.kind} port.",
                    stream.id,
                    label,
                )
        expected = {
            "mass": Dimension.MASS_FLOW,
            "molar": Dimension.MOLAR_FLOW,
            "volume": Dimension.VOLUME_FLOW,
        }[stream.flow_basis]
        quantity(stream.flow_rate, expected, stream.id, "flowRate")
        quantity(stream.temperature, Dimension.TEMPERATURE, stream.id, "temperature")
        quantity(stream.pressure, Dimension.PRESSURE, stream.id, "pressure")
        for name, value in stream.properties.items():
            quantity(
                value,
                Dimension.POWER if stream.kind == "energy" and name == "power" else None,
                stream.id,
                f"properties.{name}",
            )
        if stream.composition is not None:
            fractions = stream.composition.fractions
            if len({part.component_id for part in fractions}) != len(fractions):
                issue(
                    "duplicate_component",
                    "A composition component can appear only once.",
                    stream.id,
                    "composition",
                )
            for part in fractions:
                if part.component_id not in components:
                    issue(
                        "missing_component",
                        f"Component '{part.component_id}' does not exist.",
                        stream.id,
                        "composition",
                    )
            total = sum(part.value for part in fractions if part.value is not None)
            if fractions and all(part.value is not None for part in fractions):
                if abs(total - 1) > 1e-6:
                    issue(
                        "composition_sum",
                        f"Known fractions must sum to 1; received {total:g}.",
                        stream.id,
                        "composition",
                    )
            elif fractions:
                if total > 1 + 1e-6:
                    issue(
                        "composition_sum",
                        f"Known fractions cannot exceed 1; received {total:g}.",
                        stream.id,
                        "composition",
                    )
                issue(
                    "unknown_composition",
                    "Composition contains unknown fractions.",
                    stream.id,
                    "composition",
                    "warning",
                )
    for identity, definition in definitions.items():
        for port in definition.ports:
            count = counts[(identity, port.id)]
            if count > port.max_connections:
                issue(
                    "port_capacity",
                    f"Port '{port.id}' permits {port.max_connections} connection(s), received {count}.",
                    identity,
                    f"ports.{port.id}",
                )
            elif port.required and count == 0:
                issue(
                    "unconnected_port",
                    f"Port '{port.name}' is not connected; this is an editable draft.",
                    identity,
                    f"ports.{port.id}",
                    "warning",
                )
    for identity in document.presentation.nodes:
        if identity not in equipment:
            issue(
                "orphan_layout",
                "Layout refers to equipment that does not exist.",
                identity,
                "presentation.nodes",
            )
    result.issues.extend(validate_hierarchy(document))
    result.checks_performed.extend(["process_hierarchy", "teaching_references"])
    return result
