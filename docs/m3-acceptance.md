# Milestone 3 acceptance record

M3 is complete and verified on 2026-10-28. All 40 detailed actions and all five
work packages passed their acceptance checks. M4 has not started.

## Acceptance matrix

| Package                | Required observable behavior                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Explorer framework | Registry capabilities, shared configuration forms and shell, component content, source references, provenance, history and export integration.                                                |
| 3.2 Advanced equipment | Configuration-driven exchanger passes/baffles and column stages, feeds, side draws, condenser/reboiler arrangements, stable external references and explicit unknown/manual operating values. |
| 3.3 Process hierarchy  | Typed nested sections, validated boundary mappings, connected grouping, extraction, scoped navigation, reusable templates and complete identifier remapping.                                  |
| 3.4 Teaching           | Saved steps and annotations, sequential reveal, section/equipment/explorer focus, keyboard/fullscreen navigation and restoration of the editing workspace.                                    |
| 3.5 Academic output    | Downloadable vector PDF, academic size presets and visual themes, five attributed teaching examples, shared SVG/PNG/PDF content and inspected outputs.                                        |

## Contract decisions

Sections retain a single canonical equipment/stream graph. Containment records
direct equipment membership and parent identities; boundary ports map existing
crossing streams without duplicating their engineering values or identifiers.
Containment supports four levels and rejects recursion. Ordinary process recycle
streams remain valid.

The document contract uses additive defaulted typed fields under schema version
1.0.0. Older documents acquire empty section, annotation and presentation-step
collections during normalization. Unknown metadata remains portable. Python and
TypeScript parity checks cover nested membership/boundaries, integer-valued
floating stage numbers, rejected fractional stages, unsupported legacy exchanger
warnings and reserved-looking identifiers. Older applications that forbid unknown
fields cannot open the extended document; current PFDkit remains the reader for
M3 documents.

Presentation steps and annotations are document content. Active step, cumulative
reveal, fullscreen, focus and lecture-note visibility are temporary interface
state. No thermodynamic, sizing, heat-duty or separation calculation is added.

## Implemented and reviewed behavior

| Package | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1     | `EquipmentExplorer`/`ExplorerShell` uses registry capabilities/content, shared JSON Schema forms, operating fields, history, labels, overlay/zoom controls and detail export. [Explorer authoring](explorer-authoring.md) explains the configuration/renderer boundary and representative extension path. Python/TypeScript explorer tests and real browser inspection verify missing values, rejected changes, navigation and undo.                                                                                                                                                                        |
| 3.2     | Exchanger illustrations follow one to eight tube passes, one/two shell passes and zero to twelve baffles. Legacy unsupported saved configurations remain intact. Columns draw one to one hundred declared actual/theoretical contacting stages, multiple feeds and liquid/vapor draws, optional conditions, reflux/boilup and total/partial/absent external units. Numbering remaps declared stage locations atomically; connected port removal/rename and invalid stage reduction fail with inline feedback. Shared Python/TypeScript fixtures cover bounded handle geometry and physical location parity. |
| 3.3     | Connected grouping, nested navigation, boundary synchronization, extraction/undo, template storage/insertion and duplication preserve canonical wiring. Copied sections, equipment, streams, annotations and step references receive consistent new identities. Seven independent browser checks verify grouping/nesting, duplication, extraction, templates, scoped deletion and reopening. [The section guide](process-sections-and-teaching.md) specifies empty-container policy, depth four, boundary and local-note semantics.                                                                         |
| 3.4     | Saved steps and typed annotations support cumulative reversible reveals, target focus, read-only explorer inspection, notes hidden by default, keyboard controls, native fullscreen and exact restoration of editing. The committed lecture scenario saves/reopens nested sections, inspects an exchanger and compares native JSON before/after. Independent browser workflows exercise all five example lessons without document changes. Dark teaching text measured contrast above 10:1 in the reviewed browser.                                                                                         |
| 3.5     | SVG/PNG/vector PDF share scene bounds, labels, relevant annotations, titles and legends. Presets include slides, paper, scientific and custom sizes with point margins and aspect-preserving fit. Four visual themes retain overrides. Five attributed MIT examples include primary sources and explicitly illustrative inlet values. [The export guide](teaching-export.md) records fonts, physical sizing, provenance and output limits.                                                                                                                                                                  |

## Executed verification

Verification used Windows, Node.js 24.16.0, npm 11.13.0, installed Chrome and the
workspace Python 3.11.4 environment. Other operating systems and Python 3.14 are
not claimed from configuration alone. All project Python tooling and package
installations used `.venv`; no global Python installation was changed.

| Check                                | Result                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean npm installation               | `npm ci --offline --no-audit --no-fund` installed 467 packages from the frozen lockfile. Locked dependencies use canonical npm registry URLs and integrity hashes.                                                                                                            |
| Full repository check                | Web lint, TypeScript, all 85 frontend unit tests, generated-contract freshness, Python Ruff, mypy, all 69 Python tests and the Next.js 16.4.3 production build passed after the final formatting cleanup.                                                                     |
| Production browser suite             | All 15 Chromium workflows passed in 12.5 seconds, including native fullscreen, rejected/valid handle gestures, reconnection, multiple selection, history, persistence, exports and the complete nested lecture scenario.                                                      |
| Formatting                           | Full Prettier check and Ruff format check passed.                                                                                                                                                                                                                             |
| Hierarchy/teaching parity            | Six Python/TypeScript semantic cases plus reserved-ID template/focus checks passed. Shared maximum-density fixtures also compare dynamic port identity, direction, names and coordinates.                                                                                     |
| Independent hierarchy browser review | Seven actual interaction checks passed, preserving boundaries and wiring through nesting, duplication, extraction, templates, scoped deletion and reopening.                                                                                                                  |
| Independent advanced browser review  | Seven checks passed: rejected connected-port removal/rename, rejected stage reduction, numbering/stream preservation, dark contrast, individually reachable handles, a real connection to a formerly overlapping feed port and all 29 handles at maximum feed/draw density.   |
| Five example lessons                 | Python validation/round trips and actual browser import → lecture → notes/explorer → exit preserved saved content. Each first inlet is an arbitrary illustrative 25 °C entry; other stream conditions stay unknown.                                                           |
| Independent exports                  | Six PDF/SVG/PNG scenes passed structural checks, SVG bounds/reference checks, PNG dimensions/alpha checks and PDF raster inspection. PDFs contain selectable text and vector path operators, with no image XObjects or out-of-page characters.                                |
| Visible PDF text regression          | Post-fix Poppler raster checks found visible ink for S-001/S-002/S-003 in the A4 PDF (63/68/70 dark pixels) and S-002 in the section PDF (275), confirming text remains visible as well as selectable.                                                                        |
| Independent Python package           | Built wheel and sdist, installed the wheel without dependencies into a separate ignored target, imported that exact target, round-tripped all five examples and typed hierarchy/teaching, checked 29 dense ports and verified the included MIT license/new validation module. |

The 27 independent browser checks (seven hierarchy, seven advanced equipment,
five example lessons and eight export checks) were repeated against the final
production server and passed with no uncaught browser errors. All six PDF
structural/raster reviews and both visible-label checks also passed on fresh
production exports. The production server was stopped after verification.

Supporting logs and reports are local ignored artifacts, not application inputs:

- `.artifacts/m3-clean-install.log`, `.artifacts/m3-final-check.log`,
  `.artifacts/m3-final-e2e.log` and `.artifacts/m3-production-independent.log`.
- `.artifacts/m3-hierarchy-browser-report.json`,
  `.artifacts/m3-hierarchy-parity-report.json` and
  `.artifacts/m3-advanced-browser-report.json`.
- `.artifacts/m3-examples-browser-report.json` and
  `.artifacts/m3-python-package-report.json`.
- `.artifacts/m3-export-browser-report.json`, the six `*.inspection.json`/
  `*-inspection.json` reports, PDF raster PNGs and the `*.visible-labels.json`
  checks.
- `.artifacts/m3-pdf-page-sizes.json` confirms the six PDF page sizes match their
  requested physical presets/custom dimensions.

The six reviewed output stems are `m3-full-a4`, `m3-section-wide`,
`m3-column-letter`, `m3-column-100-custom`, `m3-exchanger-standard` and
`m3-pump-scientific`. They cover annotated full PFD, nested section, multiple
same-stage feeds/draws, a wide long serif label and 100 stages, eight tube/two
shell passes with six baffles, and a transparent scientific selection.

## Limitations

The supported equipment drawings are educational schematics, not fabrication
drawings or standards certification. Entered operating values remain manual or
explicitly illustrative. Declared column stages exclude external condenser and
reboiler units even when a different textbook convention counts partial units as
equilibrium stages. No stage efficiency, balance, duty, temperature, purity,
pressure drop, kinetics or sizing calculation is performed.

Column PFD handles fan out schematically to remain reachable when logical ports
share a stage. The detail view retains the actual declared stage locations and
full stable port identities. Dense PFD diagrams benefit from zoom and the port
chooser. Basic routing does not avoid obstacles; duplication uses an offset and
can overlap existing equipment.

PDF uses standard Helvetica/Times/Courier with deliberate common-symbol
transliteration. Unsupported glyphs stop export with SVG/PNG fallback feedback.
PDF-specific text conversion removes stroke halos because svg2pdf does not honor
SVG `paint-order`; shared SVG/PNG output retains them. PDFs are single-page
figures, without automatic tiling, font embedding, PDF/A or tagged-document
accessibility. Long columns or large diagrams reduced to paper/scientific sizes
can have small text; the dialog warns when effective text falls below 6 pt.
Choose drawing bounds, a larger custom page, a selected section or a simpler
figure and inspect its intended print size. Poppler emitted optional Symbol and
Arial Unicode display-font warnings in the inspected environment; actual Latin
Helvetica/Times/Courier rendering, bounds and visible-label ink checks passed.
The inspection does not claim pristine renderer stderr or support for those
unsupported glyph sets.

Browser projects/templates remain local to the current origin. Clearing browser
storage removes them; native JSON is the portable backup. This milestone adds no
backend, accounts, hosting, remote publication or M4 implementation.
