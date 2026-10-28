"""Equipment extensions declare stable ports, config models and version metadata."""

from math import isfinite
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import Model


class PortDefinition(Model):
    id: str
    name: str
    direction: Literal["in", "out"]
    kind: Literal["material", "energy"] = "material"
    max_connections: int = Field(default=1, ge=1)
    required: bool = True
    circuit: str | None = None
    side: Literal["left", "right", "top", "bottom"]
    offset: float = Field(default=0.5, ge=0, le=1, strict=True)


def _space_column_ports(ports: list[PortDefinition]) -> None:
    """Fan out schematic handles; mirror contracts/src/equipment.ts exactly.

    The 80-unit PFD side fits 14 ports with 6-unit center spacing, greater than
    the radius of an 11px hovered handle. Logical stage references do not change.
    """
    gap, lower, upper = 6 / 80, 1 / 80, 79 / 80
    for side in ("left", "right"):
        ordered = sorted(
            (item for item in ports if item.side == side),
            key=lambda item: (item.offset, item.id),
        )
        for index, item in enumerate(ordered):
            item.offset = max(item.offset, ordered[index - 1].offset + gap if index else lower)
        for index in range(len(ordered) - 1, -1, -1):
            ordered[index].offset = min(
                ordered[index].offset,
                upper if index == len(ordered) - 1 else ordered[index + 1].offset - gap,
            )


class Config(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)


class TerminalConfig(Config):
    description: str = ""


class PumpConfig(Config):
    efficiency: float | None = Field(default=None, gt=0, le=1, strict=True)
    drive: Literal["electric", "steam", "other"] = "electric"


class ValveConfig(Config):
    valveType: Literal["generic", "globe", "gate", "ball", "butterfly", "needle"] = "generic"
    actuation: Literal["manual", "pneumatic", "electric"] = "manual"
    opening: float | None = Field(default=None, ge=0, le=1, strict=True)


class ExchangerConfig(Config):
    flowArrangement: Literal["counterCurrent", "coCurrent", "crossFlow"] = "counterCurrent"
    tubePasses: int = Field(default=1, ge=1, le=16, strict=True)
    shellPasses: int = Field(default=1, ge=1, le=8, strict=True)
    baffleCount: int = Field(default=0, ge=0, le=12, strict=True)
    tubeLengthM: float | None = Field(default=None, gt=0, strict=True)
    shellDiameterM: float | None = Field(default=None, gt=0, strict=True)

    @field_validator("tubePasses", "shellPasses", "baffleCount", mode="before")
    @classmethod
    def json_integer(cls, value: Any) -> Any:
        # JSON Schema integers include 2.0; retain strict rejection of strings/bools.
        if isinstance(value, float) and isfinite(value) and value.is_integer():
            return int(value)
        return value


class SeparatorConfig(Config):
    orientation: Literal["vertical", "horizontal"] = "vertical"
    service: Literal["vaporLiquid", "liquidLiquid"] = "vaporLiquid"


class TankConfig(Config):
    orientation: Literal["vertical", "horizontal"] = "vertical"
    roof: Literal["fixed", "open"] = "fixed"


class MixerConfig(Config):
    mixingMethod: Literal["static", "agitated"] = "static"


class SplitterConfig(Config):
    description: str = ""


class StageConnection(Model):
    port_id: str = Field(min_length=1, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    stage: int = Field(ge=1, le=100, strict=True)

    @field_validator("stage", mode="before")
    @classmethod
    def json_integer(cls, value: Any) -> Any:
        return ExchangerConfig.json_integer(value)


class SideDraw(StageConnection):
    phase: Literal["liquid", "vapor"] = "liquid"


class StageCondition(Model):
    stage: int = Field(ge=1, le=100, strict=True)
    temperature_k: float | None = Field(default=None, gt=0, strict=True)
    pressure_pa: float | None = Field(default=None, ge=0, strict=True)
    status: Literal["manual", "illustrative"] = "manual"

    @field_validator("stage", mode="before")
    @classmethod
    def json_integer(cls, value: Any) -> Any:
        return ExchangerConfig.json_integer(value)


class ColumnConfig(Config):
    service: Literal["distillation", "absorption", "stripping"] = "distillation"
    internals: Literal["trays", "packing"] = "trays"
    stageCount: int = Field(default=10, ge=1, le=100, strict=True)
    stageNumbering: Literal["topDown", "bottomUp"] = "topDown"
    stageBasis: Literal["actual", "theoretical"] = "theoretical"
    feedStage: int = Field(default=5, ge=1, le=100, strict=True)
    feeds: list[StageConnection] = Field(default_factory=list, max_length=12)
    sideDraws: list[SideDraw] = Field(default_factory=list, max_length=12)
    stageProperties: list[StageCondition] = Field(default_factory=list, max_length=100)
    condenser: Literal["total", "partial", "none"] = "total"
    reboiler: Literal["partial", "total", "none"] = "partial"
    refluxRatio: float | None = Field(default=None, ge=0, strict=True)
    boilupRatio: float | None = Field(default=None, ge=0, strict=True)

    @field_validator("stageCount", "feedStage", mode="before")
    @classmethod
    def json_integer(cls, value: Any) -> Any:
        return ExchangerConfig.json_integer(value)

    @model_validator(mode="after")
    def stage_references(self) -> "ColumnConfig":
        # The legacy feed's default follows a short column; explicitly supplied invalid stages fail.
        if self.feedStage > self.stageCount:
            if "feedStage" not in self.model_fields_set:
                self.feedStage = self.stageCount
            else:
                raise ValueError(
                    "Feed stage exceeds stage count. Move the feed before removing stages."
                )
        if (
            any(item.stage > self.stageCount for item in self.feeds)
            or any(item.stage > self.stageCount for item in self.sideDraws)
            or any(item.stage > self.stageCount for item in self.stageProperties)
        ):
            raise ValueError(
                "A feed, side draw or operating condition references a removed stage. Move or remove it before reducing stage count."
            )
        ids = [item.port_id for item in [*self.feeds, *self.sideDraws]]
        if len(ids) != len(set(ids)) or set(ids) & {
            "feed",
            "overhead",
            "bottoms",
            "reflux",
            "boilup",
        }:
            raise ValueError(
                "Additional feed and side-draw port identities must be unique and cannot replace fixed column ports."
            )
        if len({item.stage for item in self.stageProperties}) != len(self.stageProperties):
            raise ValueError("Only one operating condition record is allowed per stage.")
        return self


class ReactorConfig(Config):
    reactorType: Literal["stirredTank", "plugFlow"] = "stirredTank"
    operation: Literal["continuous", "batch"] = "continuous"


class EquipmentDefinition(Model):
    type: str
    name: str
    description: str
    version: str = "1.0.0"
    extension: str = "pfd-core"
    tag_prefix: str
    ports: list[PortDefinition]
    config_schema: dict[str, Any]
    default_config: dict[str, Any]
    category: str = "Other"
    keywords: list[str] = Field(default_factory=list)
    available_views: list[str] = Field(default_factory=lambda: ["pfd"])
    explorer: dict[str, Any] | None = None
    provenance: dict[str, str] = Field(
        default_factory=lambda: {
            "author": "PFDkit contributors",
            "license": "MIT",
            "source": "Original PFDkit schematic; illustrative, not a claim of ISO/ISA compliance.",
        }
    )


class EquipmentRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, EquipmentDefinition] = {}
        self._configs: dict[str, type[BaseModel]] = {}

    def register(
        self,
        *,
        type: str,
        name: str,
        description: str,
        tag_prefix: str,
        ports: list[PortDefinition],
        config_model: type[BaseModel],
        version: str = "1.0.0",
        extension: str = "pfd-core",
        category: str = "Other",
        keywords: list[str] | None = None,
        available_views: list[str] | None = None,
        provenance: dict[str, str] | None = None,
        explorer: dict[str, Any] | None = None,
    ) -> None:
        if type in self._definitions:
            raise ValueError(f"Equipment type '{type}' is already registered.")
        if len({port.id for port in ports}) != len(ports):
            raise ValueError("Port identifiers must be unique within an equipment type.")
        self._definitions[type] = EquipmentDefinition(
            type=type,
            name=name,
            description=description,
            tag_prefix=tag_prefix,
            ports=ports,
            config_schema=config_model.model_json_schema(),
            default_config=config_model().model_dump(),
            version=version,
            extension=extension,
            category=category,
            keywords=keywords or [],
            available_views=available_views or ["pfd"],
            explorer=explorer,
            **({"provenance": provenance} if provenance is not None else {}),
        )
        self._configs[type] = config_model

    def get(self, type: str) -> EquipmentDefinition:
        if type not in self._definitions:
            raise ValueError(
                f"Unsupported equipment type '{type}'. Register its extension before editing."
            )
        return self._definitions[type].model_copy(deep=True)

    def definitions(self) -> list[EquipmentDefinition]:
        return [self.get(key) for key in self._definitions]

    def for_equipment(self, type: str, config: dict[str, Any]) -> EquipmentDefinition:
        definition = self.get(type)
        if type == "column":
            column = ColumnConfig.model_validate(config)
            physical_feed = (
                column.stageCount + 1 - column.feedStage
                if column.stageNumbering == "bottomUp"
                else column.feedStage
            )
            next(item for item in definition.ports if item.id == "feed").offset = physical_feed / (
                column.stageCount + 1
            )
            for connection in [*column.feeds, *column.sideDraws]:
                is_feed = isinstance(connection, StageConnection) and not isinstance(
                    connection, SideDraw
                )
                physical = (
                    column.stageCount + 1 - connection.stage
                    if column.stageNumbering == "bottomUp"
                    else connection.stage
                )
                definition.ports.append(
                    port(
                        connection.port_id,
                        f"{'Feed' if is_feed else 'Side draw'} at stage {connection.stage}",
                        "in" if is_feed else "out",
                        "left" if is_feed else "right",
                        required=False,
                        offset=physical / (column.stageCount + 1),
                    )
                )
            _space_column_ports(definition.ports)
        return definition

    def validate_config(self, type: str, config: dict[str, Any]) -> None:
        self.get(type)
        self._configs[type].model_validate(config)


registry = EquipmentRegistry()


def port(
    id: str,
    name: str,
    direction: Literal["in", "out"],
    side: Literal["left", "right", "top", "bottom"],
    *,
    kind: Literal["material", "energy"] = "material",
    required: bool = True,
    circuit: str | None = None,
    offset: float = 0.5,
) -> PortDefinition:
    return PortDefinition(
        id=id,
        name=name,
        direction=direction,
        side=side,
        kind=kind,
        required=required,
        circuit=circuit,
        offset=offset,
    )


registry.register(
    type="feed",
    name="Feed",
    description="Material entering the process boundary.",
    tag_prefix="F",
    ports=[port("out", "Material outlet", "out", "right")],
    config_model=TerminalConfig,
    category="Boundaries",
    keywords=["source", "inlet", "boundary"],
)
registry.register(
    type="pump",
    name="Pump",
    description="Transfers a liquid; entered values are illustrative, not solved.",
    tag_prefix="P",
    ports=[
        port("in", "Suction", "in", "left"),
        port("out", "Discharge", "out", "right"),
        port("power", "Shaft power", "in", "bottom", kind="energy", required=False),
    ],
    config_model=PumpConfig,
    category="Fluid transport",
    keywords=["liquid", "pressure", "centrifugal"],
)
registry.register(
    type="heatExchanger",
    name="Heat exchanger",
    description="Separate tube and shell material circuits; no mixing is implied.",
    tag_prefix="E",
    ports=[
        port("tubeIn", "Tube inlet", "in", "left", circuit="tube"),
        port("tubeOut", "Tube outlet", "out", "right", circuit="tube"),
        port("shellIn", "Shell inlet", "in", "top", circuit="shell"),
        port("shellOut", "Shell outlet", "out", "bottom", circuit="shell"),
    ],
    config_model=ExchangerConfig,
    category="Heat transfer",
    keywords=["exchanger", "shell", "tube", "cooler", "heater"],
    available_views=["pfd", "explorer"],
    explorer={
        "views": ["symbol", "detail", "education"],
        "principle": "Separate tube and shell circuits exchange thermal energy through tube walls. Passes reverse a circuit locally; baffles guide the shell circuit. No heat duty, pressure drop or outlet temperature is calculated.",
        "components": {
            "shell": "Housing surrounding the tube bundle.",
            "tubeSheet": "Separates tube headers from the shell circuit.",
            "baffles": "Alternating segmental guides; schematic spacing is not a mechanical design.",
            "tubeBundle": "Separate tube flow circuit, drawn as one representative path per pass.",
        },
        "references": [
            {
                "title": "DOE Fundamentals Handbook, Heat Transfer, heat exchangers",
                "url": "https://www.energy.gov/documents/doe-hdbk-1012-92vol2",
            }
        ],
        "valueStatus": "manual",
    },
)
registry.register(
    type="product",
    name="Product",
    description="Material leaving the process boundary.",
    tag_prefix="PR",
    ports=[port("in", "Material inlet", "in", "left")],
    config_model=TerminalConfig,
    category="Boundaries",
    keywords=["sink", "outlet", "boundary"],
)

registry.register(
    type="separator",
    name="Separator",
    description="Separates two material outlet phases; no phase-equilibrium calculation is performed.",
    tag_prefix="V",
    category="Separation",
    keywords=["flash", "drum", "vapor", "liquid"],
    ports=[
        port("in", "Feed inlet", "in", "left"),
        port("vaporOut", "Upper phase outlet", "out", "top"),
        port("liquidOut", "Lower phase outlet", "out", "bottom"),
    ],
    config_model=SeparatorConfig,
)
registry.register(
    type="tank",
    name="Tank",
    description="Material storage with a stable inlet, outlet and optional vent.",
    tag_prefix="TK",
    category="Storage",
    keywords=["vessel", "storage", "reservoir"],
    ports=[
        port("in", "Material inlet", "in", "left"),
        port("out", "Material outlet", "out", "right"),
        port("vent", "Vent outlet", "out", "top", required=False),
    ],
    config_model=TankConfig,
)
registry.register(
    type="mixer",
    name="Mixer",
    description="Three fixed material inlets and one outlet. The third inlet is optional; no mixing balance is solved.",
    tag_prefix="M",
    category="Mixing and splitting",
    keywords=["combine", "blend", "junction"],
    ports=[
        port("in1", "Inlet 1", "in", "left", offset=0.25),
        port("in2", "Inlet 2", "in", "left", offset=0.5),
        port("in3", "Inlet 3", "in", "left", offset=0.75, required=False),
        port("out", "Mixed outlet", "out", "right"),
    ],
    config_model=MixerConfig,
)
registry.register(
    type="splitter",
    name="Splitter",
    description="One inlet and three fixed material outlets. The third outlet is optional; split fractions are not calculated.",
    tag_prefix="SP",
    category="Mixing and splitting",
    keywords=["divide", "branch", "junction"],
    ports=[
        port("in", "Material inlet", "in", "left"),
        port("out1", "Outlet 1", "out", "right", offset=0.25),
        port("out2", "Outlet 2", "out", "right", offset=0.5),
        port("out3", "Outlet 3", "out", "right", offset=0.75, required=False),
    ],
    config_model=SplitterConfig,
)
registry.register(
    type="column",
    name="Column",
    description="Separation column with feed, overhead and bottoms ports; optional reflux and boilup inlets keep their identities.",
    tag_prefix="C",
    category="Separation",
    keywords=["distillation", "absorption", "stripping", "tower"],
    ports=[
        port("feed", "Feed inlet", "in", "left"),
        port("overhead", "Overhead outlet", "out", "top"),
        port("bottoms", "Bottoms outlet", "out", "bottom"),
        port("reflux", "Reflux inlet", "in", "right", offset=0.25, required=False),
        port("boilup", "Boilup inlet", "in", "right", offset=0.75, required=False),
    ],
    config_model=ColumnConfig,
    available_views=["pfd", "explorer"],
    explorer={
        "views": ["symbol", "detail", "education"],
        "principle": "Vapor rises and liquid descends through contacting stages. Reflux returns liquid; boilup returns vapor. Declared stages exclude the external condenser and reboiler in every arrangement. Actual trays and theoretical equilibrium stages are different conventions; no efficiency conversion is performed. Packed columns show conceptual stages rather than physical tray plates.",
        "components": {
            "stages": "Numbered contacting locations; numbering changes labels but keeps feed and draw stage identities explicit.",
            "condenser": "Total: condenses the overhead vapor; partial: also permits a vapor product.",
            "reboiler": "Partial: returns vapor while retaining a liquid bottoms stream; total: vaporizes the supplied liquid.",
            "sideDraws": "Additional stable logical ports located at declared stages.",
        },
        "references": [
            {
                "title": "ETH Zurich Hyper-TVT, distillation, non-standard arrangements and stage efficiency",
                "url": "https://www.hyper-tvt.ethz.ch/distillation-page.html",
            }
        ],
        "valueStatus": "manual",
    },
)
registry.register(
    type="reactor",
    name="Reactor",
    description="Illustrative stirred-tank or plug-flow reactor. Kinetics, conversion and heat duty are not calculated.",
    tag_prefix="R",
    category="Reaction",
    keywords=["reaction", "cstr", "pfr", "vessel"],
    ports=[
        port("in", "Feed inlet", "in", "left"),
        port("out", "Product outlet", "out", "right"),
        port("heat", "Heat input", "in", "bottom", kind="energy", required=False),
    ],
    config_model=ReactorConfig,
)

registry.register(
    type="valve",
    name="Valve",
    description="Inline valve with manually entered opening; no pressure-drop or flow calculation.",
    tag_prefix="V",
    category="Flow control",
    keywords=["control", "isolation", "throttling"],
    ports=[port("in", "Inlet", "in", "left"), port("out", "Outlet", "out", "right")],
    config_model=ValveConfig,
)
