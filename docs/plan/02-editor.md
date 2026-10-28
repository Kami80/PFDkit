# M2 — Usable Editor and First Release

[Project overview](../../PROJECT_PLAN.md) · Previous: [Foundation](01-foundation.md) · Next: [Teaching](03-teaching.md)

Status: complete and verified on 2026-10-27; see [the M2 acceptance record](../m2-acceptance.md). Model: **GPT-6.1 Sol throughout**.

Goal: make PFDkit useful to a guest who wants to create a diagram, explore a heat exchanger, reopen the project locally, and export a clear figure.

## 2.1 Equipment catalog

Purpose: establish a consistent, extensible visual language for the first release.

Dependencies: M1.

- [x] **2.1.1** Define symbol sizing, coordinate conventions, port placement, strokes, labels, and scaling behavior for the initial catalog.
- [x] **2.1.2** Create SVG symbols for feed, product, pump, exchanger, separator, tank, mixer, splitter, column, and reactor.
- [x] **2.1.3** Register category, display name, description, configuration defaults, ports, and available views for each equipment type.
- [x] **2.1.4** Define supported connection counts for mixers, splitters, and other multi-port equipment; preserve port identity when configuration changes.
- [x] **2.1.5** Keep colors, selected/hover states, and text appearance driven by shared styling rather than embedded engineering assumptions.
- [x] **2.1.6** Review recognizability, inlet/outlet meaning, long labels, zoom behavior, and accessibility cues across the symbols.
- [x] **2.1.7** Record symbol provenance, contributor attribution, licensing, and the scope of any claimed drawing conventions.
- [x] **2.1.8** Document how to add another equipment definition and symbol; verify the extension path with a representative additional definition or development example.

Expected outputs: ten registered equipment types, reusable SVG conventions, catalog metadata, and symbol-extension guidance.

Complete when: every catalog item can be placed, connected, edited, saved, and reopened using the same document contract.

Evidence: the catalog tests verify all ten definitions, stable ports and an independent extension; browser workflows configure/save/reopen every type. Shared geometry, provenance and extension guidance are documented in the catalog guide. See the M2 acceptance record for final results.

## 2.2 Editing workflow

Purpose: make normal diagram construction efficient and predictable.

Dependencies: 2.1.

- [x] **2.2.1** Introduce command history for document changes, including compound actions, undo/redo shortcuts, and a reasonable history limit.
- [x] **2.2.2** Support multi-selection, moving a selection, and deleting equipment with connected streams through a coherent undoable action.
- [x] **2.2.3** Add copy/paste and duplication with fresh identifiers and correctly remapped ports, internal references, and copied streams.
- [x] **2.2.4** Add basic orthogonal stream paths, endpoints, arrowheads, labels, and reconnection; preserve valid engineering connections while equipment moves.
- [x] **2.2.5** Add grid display and snapping with predictable zoom behavior; document current routing and alignment limitations.
- [x] **2.2.6** Add equipment search, categories, click-to-add and drag-to-add interactions, keyboard navigation, and informative empty results.
- [x] **2.2.7** Refine property panels with meaningful field groups, unit input, inline feedback, mixed-selection behavior, and reliable commit/cancel interactions.
- [x] **2.2.8** Verify workflows combining undo, delete, copy/paste, movement, reconnection, and property editing; confirm the saved document remains structurally consistent.

Expected outputs: complete everyday editing interactions, undoable commands, basic routed streams, and usable palette/property panels.

Complete when: a user can construct and revise a multi-equipment PFD, recover from normal editing mistakes, and preserve valid references throughout.

Evidence: history/integration tests and real browser workflows verify compound undo, native multi-selection, group movement, remapped copy/paste, deletion recovery, actual handle connections/reconnection and property commit/cancel. Basic routing limitations are documented in the editing guide; final results are in the M2 acceptance record.

## 2.3 Styling and local persistence

Purpose: produce readable diagrams and protect a guest's work between visits.

Dependencies: 2.2.

- [x] **2.3.1** Define styling tokens for equipment, streams, labels, typography, canvas background, and selection, keeping these outside engineering data.
- [x] **2.3.2** Implement Engineering Classic and Academic Colorful presets with readable defaults and per-object overrides.
- [x] **2.3.3** Add equipment/stream colors, line thickness, label appearance, diagram titles, and a useful legend configuration.
- [x] **2.3.4** Add light/dark interface behavior and colorblind-friendly choices; preserve critical meaning through labels, shapes, or line patterns as well as color.
- [x] **2.3.5** Store local documents and recoverable autosave snapshots in browser persistence using the versioned document format.
- [x] **2.3.6** Provide local project creation, naming, reopening, duplication, and deliberate deletion with clear handling of the active project.
- [x] **2.3.7** Show save state and recoverable failures; handle unavailable storage, capacity limits, interrupted writes, and potential cross-tab overwrite conflicts.
- [x] **2.3.8** Verify reopen/recovery, style persistence, preset overrides, and the independence of engineering data from visual changes.

Expected outputs: two visual presets, editable styling, local project persistence, save-state feedback, and recovery behavior.

Complete when: a styled diagram reopens with its data intact, and a storage failure is visible with a usable route to save work locally.

Evidence: style/persistence tests and independent production storage review verify preset independence, reload, dirty switching, clean focus, stale-tab forks, deliberate deletion, quota failures and corrupt recovery with JSON fallback. Seven independent storage checks passed; see the M2 acceptance record for evidence and persistence limits.

## 2.4 First equipment explorer

Purpose: demonstrate the project's central educational interaction with a useful heat exchanger view.

Dependencies: 2.1–2.3.

- [x] **2.4.1** Open the exchanger explorer through double-click and a keyboard-accessible action; preserve the selected equipment and PFD viewport.
- [x] **2.4.2** Render a supported simple shell-and-tube arrangement with shell-side and tube-side paths derived from saved equipment configuration.
- [x] **2.4.3** Connect the external stream identities to labeled exchanger inlets/outlets, with consistent hot/cold and shell/tube distinctions.
- [x] **2.4.4** Provide supported configuration controls and immediate illustration updates; clearly explain configurations that this first explorer does not support.
- [x] **2.4.5** Show editable operating values and units with explicit unknown/illustrative status; preserve the distinction between entered and calculated information.
- [x] **2.4.6** Add component labels, an operating-principle explanation, and reference/provenance fields for the educational content.
- [x] **2.4.7** Preserve edits through navigation and the normal undo history; provide clear save/cancel behavior for any staged form edits.
- [x] **2.4.8** Verify change → return to PFD → save → reopen, including consistent ports, stream labels, configuration, and exported equipment detail.

Expected outputs: first interactive exchanger explorer, configuration-driven illustration, educational overlay, and preserved editor state.

Complete when: changing supported exchanger configuration changes its illustration and survives navigation and document round trips.

Evidence: geometry/unit tests and production browser review verify supported pass/flow paths, stable external stream identities, unknown/zero values, unit conversion, edit/cancel/undo, exact viewport restoration, reopen and detail exports. Unsupported saved geometry is preserved and explained; provenance and the DOE reference are documented in the walkthrough.

## 2.5 Export and release verification

Purpose: make the first release useful for real coursework, lectures, and figures.

Dependencies: 2.1–2.4 and native JSON handling from M1.

- [x] **2.5.1** Build an SVG export pipeline for document symbols, streams, labels, markers, and annotations with portable vector output.
- [x] **2.5.2** Calculate export bounds including text, strokes, arrowheads, legends, and padding; provide full-diagram, selected-content, and equipment-detail targets.
- [x] **2.5.3** Handle text escaping, font choices/fallbacks, long labels, and symbol identifiers so exports remain readable outside the editor.
- [x] **2.5.4** Add PNG export with configurable dimensions, transparency, and useful feedback for unsupported or excessively large requests.
- [x] **2.5.5** Build an export dialog with format, bounds, background, dimensions, and preview controls; reuse native JSON export for editable documents.
- [x] **2.5.6** Verify that exports reflect saved equipment configuration and chosen styling without editing handles, selection outlines, or unintended clipping.
- [x] **2.5.7** Inspect representative SVG/PNG output in independent viewers and complete the guest create → explore → reopen → export workflow.
- [x] **2.5.8** Prepare the first-release quickstart, sample diagrams, known limitations, contributor instructions, and recorded verification evidence.

Expected outputs: JSON/SVG/PNG export, export controls, inspected example outputs, and first-release documentation.

Complete when: a guest can produce a readable reusable diagram and a clean figure without registration or required paid services.

Evidence: the final full check and production build passed, followed by all 14 committed browser workflows. Independent production review passed eight checks and inspected five standalone SVG/PNG pairs with no clipped text, unresolved references or browser errors; dimensions, alpha and opaque margins matched requests. Installation, samples, contributor guidance, limitations and exact evidence are recorded in the M2 acceptance record and first-release walkthrough.

## Milestone checkpoint

- All work packages 2.1–2.5 are complete and have verification evidence.
- The guest workflow is usable from a clean installation.
- The first release includes the ten-symbol catalog and working exchanger explorer.
- The project overview is updated before proceeding to M3.
