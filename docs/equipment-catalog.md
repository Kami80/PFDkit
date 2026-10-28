# Equipment catalog and symbol extensions

The development source provides 14 original, MIT-licensed schematics attributed to **PFDkit contributors**. PyPI 0.1.0 still has the original ten; the four flow-control additions require a source installation until the next release. They are teaching-oriented process symbols, not certified ISO, ISA or P&ID drawings. No symbol implies a balance, sizing, phase-equilibrium or reaction calculation. The [living catalog](../packages/pfd-core/EQUIPMENT.md) tracks subsequent additions.

## Coordinates and rendering

Every symbol uses a **120 × 80** viewBox. A canvas node is **140 × 140** document units, with its artwork at **(10, 28)**. Tags occupy the space above; names occupy the space below. Long tags truncate on the canvas, with the full tag available through its tooltip, accessible node name and inspector. Exports retain the full text and include its bounds. SVG strokes scale with the figure; the editor and export use the same declarative geometry in `apps/web/src/lib/symbols.ts`.

Shapes declare geometry and the paint roles `body`/`none`. Presentation presets and object overrides supply stroke, fill, text color, line width and font. Selection outlines and handles are editor affordances and are excluded from exports. Material connections are solid; energy connections also use a dashed pattern and labeled ports, so meaning does not rely on color.

Ports declare a stable ID, direction, kind, side and fractional offset along that side. `getPortPosition(type, portId, config)` returns the node-local center used by both the canvas and exported streams. A configuration change never renames a port.

## Supported catalog

| Type           | Category             | Ports (each permits one stream)                              | Configuration                                               |
| -------------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Feed           | Boundaries           | material `out`                                               | description                                                 |
| Product        | Boundaries           | material `in`                                                | description                                                 |
| Pump           | Fluid transport      | material `in`, `out`; optional energy `power`                | efficiency (unknown or fraction >0 to 1), drive             |
| Heat exchanger | Heat transfer        | separate `tubeIn`, `tubeOut`, `shellIn`, `shellOut` circuits | flow arrangement, tube and shell passes; explorer available |
| Separator      | Separation           | `in`, `vaporOut`, `liquidOut`                                | orientation, vapor/liquid or liquid/liquid service          |
| Tank           | Storage              | `in`, `out`; optional `vent`                                 | orientation, fixed/open roof                                |
| Mixer          | Mixing and splitting | three fixed `in1`–`in3`, one `out`; third inlet optional     | static/agitated mixing                                      |
| Splitter       | Mixing and splitting | one `in`, three fixed `out1`–`out3`; third outlet optional   | description                                                 |
| Column         | Separation           | `feed`, `overhead`, `bottoms`; optional `reflux`, `boilup`   | service, trays/packing                                      |
| Reactor        | Reaction             | material `in`, `out`; optional energy `heat`                 | stirred tank/plug flow, continuous/batch                    |

Unconnected required ports produce draft warnings. Mixer/splitter connection counts are fixed in this release; configuration changes retain all four IDs. There is no automatic distribution of flow. The separator's upper/lower phase labels remain valid for either declared service.

## Adding an equipment extension

The development catalog also includes `valve`, `checkValve`, `pressureReliefValve` and `pressureRegulator`, each with one material `in` and one `out`. Relief inlet geometry is bottom-facing; the other three inlets face left. All outlets face right. Their generic original artwork is shared across subtypes. The living catalog documents fields, units, limitations and executed examples. The original catalog-demo fixture below retains the original ten symbols.

Define an independently versioned configuration model and register stable port IDs in Python. The following working development example is tested in `test_catalog.py` and does not alter the built-in registry:

```python
from pydantic import BaseModel
from pfd_core import EquipmentRegistry, PortDefinition, add_equipment, new_document

class ValveConfig(BaseModel):
    description: str = "Manual isolation"

extensions = EquipmentRegistry()
extensions.register(
    type="demo.valve", name="Manual valve", description="Extension example",
    tag_prefix="XV", category="Fluid transport", config_model=ValveConfig,
    extension="example", version="0.1.0",
    ports=[
        PortDefinition(id="in", name="Inlet", direction="in", side="left"),
        PortDefinition(id="out", name="Outlet", direction="out", side="right"),
    ],
)
document = add_equipment(new_document(), "demo.valve", equipment_registry=extensions)
```

For a browser extension, register its definition in the application registry, add a `getSymbol` case using `SymbolShape` geometry, and regenerate the contract with the workspace Python interpreter and `node scripts/generate_types.mjs`. Include provenance and license, test port centers against connector endpoints, and verify placement, connection, configuration, JSON round-trip and export. An unregistered imported type is rejected clearly; PFDkit never silently substitutes another engineering type.

The catalog demo is an editable draft that places all ten symbols. Browser verification covers actual handle connections, keyboard palette operation, long tags and zoom. Detailed column stages, reactor internals and generalized equipment explorers remain in M3.
