# M3 — Equipment Exploration and Teaching

[Project overview](../../PROJECT_PLAN.md) · Previous: [Usable editor](02-editor.md) · Next: [Platform](04-platform.md)

Status: complete and verified on 2026-10-28. Model: **GPT-6.1 Sol throughout**.

Goal: support deeper equipment exploration, reusable process sections, classroom presentation, and publication-ready exports.

## 3.1 Reusable explorer framework

Purpose: make new equipment explorers consistent and maintainable as the equipment library expands.

Dependencies: M2.

- [x] **3.1.1** Define explorer capabilities in the equipment registry, including supported symbol, detail, and educational views.
- [x] **3.1.2** Establish a shared explorer shell for navigation, configuration, operating properties, illustration, component labels, and contextual explanations.
- [x] **3.1.3** Share equipment configuration schemas and field definitions across Python validation, property panels, and explorer forms.
- [x] **3.1.4** Connect explorer edits to the document command/history system; keep external stream references and unsaved form state consistent.
- [x] **3.1.5** Define reusable illustration conventions for components, flow paths, labels, selection, zoom, and educational overlays.
- [x] **3.1.6** Add content structures for operating principles, reference sources, component descriptions, and the provenance/status of displayed values.
- [x] **3.1.7** Write an explorer-extension tutorial using a representative equipment example and clearly define the boundary between document data and executable extension code.
- [x] **3.1.8** Verify missing optional properties, rejected configurations, navigation, undo/redo, educational overlays, and equipment-detail export through the shared framework.

Expected outputs: reusable explorer components, extension contracts, content structures, and an explorer-authoring guide.

Complete when: the exchanger uses the framework and a contributor can follow the documented path to add another supported explorer.

Additional requests, decisions, and evidence: Registry capabilities and content drive the shared `EquipmentExplorer`/`ExplorerShell`; generated configuration fields are shared with property panels. Trusted renderers remain application code. [Explorer authoring](../explorer-authoring.md) documents the extension path, unsupported legacy arrangements, manual values and original-content references. `explorers.test.ts`, Python `test_explorers.py`, and the committed M3 lecture browser scenario verify configuration, history, rejected edits, detail output and navigation. Final verification is recorded in [M3 acceptance](../m3-acceptance.md).

## 3.2 Advanced equipment

Purpose: provide detailed exchanger and distillation illustrations that agree with supported saved configurations.

Dependencies: 3.1.

- [x] **3.2.1** Review engineering references and define supported configurations, geometric simplifications, terminology, and the scope of each illustration.
- [x] **3.2.2** Extend the exchanger model and controls with supported tube/shell passes, baffles, and geometric specifications; validate configuration compatibility.
- [x] **3.2.3** Generate exchanger fluid paths from the supported pass arrangement and inlet/outlet locations; label cocurrent, countercurrent, and multi-pass behavior appropriately.
- [x] **3.2.4** Build a column configuration model for stage count, stage numbering, actual trays versus theoretical stages, and optional stage operating properties.
- [x] **3.2.5** Support multiple feeds and side draws with stable port identities and stage locations; explain or repair affected references when stages are removed or renumbered.
- [x] **3.2.6** Add supported condenser/reboiler arrangements, reflux, boilup, and vapor/liquid flow paths; document how these components relate to the declared stage count.
- [x] **3.2.7** Add component labels, educational explanations, and manually supplied conditions to both explorers without implying unperformed process calculations.
- [x] **3.2.8** Verify representative and boundary configurations, including multiple feeds, changed stage counts, changed pass arrangements, saved references, and readable detail exports.

Expected outputs: advanced exchanger explorer, configurable column explorer, engineering references, and representative example configurations.

Complete when: supported configurations generate corresponding illustrations, external stream references remain valid, and unsupported combinations receive useful feedback.

Additional requests, decisions, and evidence: Exchanger detail supports one to eight tube passes, one/two shell passes, zero to twelve baffles and entered dimensions; unsupported older configurations remain intact with explicit warnings. Columns support one to one hundred actual/theoretical contacting stages, stable additional feed/draw ports, stage conditions and external condenser/reboiler arrangements. The count excludes external units; numbering changes remap physical locations atomically. DOE and ETH references, scope and simplifications appear in [the explorer guide](../explorer-authoring.md). Shared maximum-density fixtures verify Python/TypeScript port geometry; independent browser tests exercise rejected connected-port changes and reachable handles.

## 3.3 Process hierarchy

Purpose: let users organize real process sections while keeping all process connections consistent.

Dependencies: 3.1–3.2 and the shared document contract.

- [x] **3.3.1** Define subflowsheet identity, parent/child relationships, boundary ports, and the mapping between external and internal connections.
- [x] **3.3.2** Extend the document contract and Python/frontend validation for nested process references, supported depth, and broken or recursive containment.
- [x] **3.3.3** Add entering/exiting a process section, breadcrumbs, and restoration of the relevant viewport, selection, and editor context.
- [x] **3.3.4** Support creating a subflowsheet from a selected connected section while preserving boundary streams and equipment properties.
- [x] **3.3.5** Define and implement the supported ungroup/extract operation with consistent identifier mapping and undo behavior.
- [x] **3.3.6** Add reusable process-section templates and duplication with correctly remapped equipment, ports, streams, nested references, and annotations.
- [x] **3.3.7** Extend import/export and selected-section export for the supported hierarchy, including useful handling of older documents.
- [x] **3.3.8** Verify nested save/reopen, boundary edits, template duplication, deletion, and invalid containment; keep valid process recycle loops distinct from invalid recursive containment.

Expected outputs: nested process models, boundary mappings, hierarchy navigation, reusable sections, and hierarchy-aware document handling.

Complete when: a connected process section can be nested, edited, reused, and reopened without breaking its external or internal references.

Additional requests, decisions, and evidence: Typed section containment overlays one canonical process graph; original crossing stream identities and quantities remain unchanged. Direct membership is disjoint, containment depth is four, and boundary mappings update in the same command as connection edits. Empty sections remain editable. Templates remap nested objects and teaching content; local untargeted notes follow documented bounds. [The hierarchy guide](../process-sections-and-teaching.md) records import compatibility, scope restoration and template semantics. Unit/Python parity tests and seven independent real-browser grouping, nesting, duplication, extraction, template, scoped deletion and reopening checks provide evidence.

## 3.4 Teaching and presentation

Purpose: turn a diagram into a clear explanation suitable for a classroom or academic presentation.

Dependencies: 3.1–3.3.

- [x] **3.4.1** Add fullscreen presentation with editing controls hidden, clear navigation, and preservation of the editing workspace on exit.
- [x] **3.4.2** Add equipment and process-section focus, highlighting, zoom targets, and controlled opening of supported explorers during a presentation.
- [x] **3.4.3** Define saved presentation steps that reference equipment, streams, sections, and annotations through stable identifiers.
- [x] **3.4.4** Implement sequential reveals and step navigation with predictable back/forward behavior; keep temporary reveal state separate from engineering data.
- [x] **3.4.5** Add educational annotations, callouts, arrows, component names, explanations, and lecture notes with explicit visibility controls.
- [x] **3.4.6** Provide keyboard controls, visible focus, reduced-motion behavior, readable contrast, and a useful presentation empty state.
- [x] **3.4.7** Distinguish conceptual teaching content, manually entered specifications, illustrative values, and any explicitly calculated results; handle deleted presentation targets clearly.
- [x] **3.4.8** Verify a complete lecture scenario that moves between PFD, nested section, and explorer, then returns to editing without losing changes or unintentionally editing engineering data.

Expected outputs: presentation mode, saved teaching steps, annotations, notes, and a sample lecture walkthrough.

Complete when: a presenter can explain a process in stages, inspect equipment, and return to the editor with the document and intended visibility settings preserved.

Additional requests, decisions, and evidence: Saved typed annotations and lecture steps reference stable identifiers. Presentation renders a disposable view with cumulative/reversible reveals, section/equipment focus and read-only explorer inspection. Notes start hidden; keyboard focus, fullscreen exit, reduced motion and dark-interface contrast are covered. [The lecture walkthrough](../process-sections-and-teaching.md) distinguishes conceptual, manual, illustrative and externally calculated content. The committed M3 browser scenario verifies PFD → nested section → explorer → editing, byte-identical native JSON and reopening. Independent browser review also walks through every teaching example.

## 3.5 Academic export and examples

Purpose: support academic output formats and demonstrate the product with inspectable teaching examples.

Dependencies: 3.2–3.4 and the export pipeline from 2.5.

- [x] **3.5.1** Add PDF generation with vector content where supported, intentional font handling, useful error messages, and documented output limitations.
- [x] **3.5.2** Add 16:9, 4:3, A4, Letter, scientific-figure, and custom-size presets with margins, aspect-ratio behavior, and configurable backgrounds.
- [x] **3.5.3** Refine full-PFD, selected-section, and equipment-detail exports so titles, legends, labels, and relevant educational annotations fit their intended bounds.
- [x] **3.5.4** Add Minimal Scientific and Presentation visual presets, preserving readable grayscale/colorblind behavior and user overrides.
- [x] **3.5.5** Build example documents for distillation, fermentation, water treatment, hydrogen production, and heat-exchanger networks, with clearly labeled illustrative values.
- [x] **3.5.6** Review example structure and educational explanations; record author attribution, references, and licensing information for reusable content.
- [x] **3.5.7** Inspect representative PDFs, SVGs, and PNGs at intended display/print sizes, including large diagrams, long labels, multiple stages, and transparent backgrounds.
- [x] **3.5.8** Publish the in-repository export/teaching guide, document verified example outputs and known limitations, and record the evidence needed to close M3.

Expected outputs: PDF export, academic presets, four total visual themes, teaching examples, inspected output files, and export guidance.

Complete when: a user can produce readable lecture and paper figures from the same process document, and the example lessons have traceable content provenance.

Additional requests, decisions, and evidence: SVG, PNG and local vector PDF share the export scene. Presets cover 16:9, 4:3, A4, Letter, scientific figure and bounded custom pages with point margins and aspect-preserving fit. PDF uses deliberate base-font mappings and explicit unsupported-glyph feedback; a nonblocking warning identifies effective text below 6 pt. Four visual themes preserve overrides. Five original MIT-attributed examples include primary references and clearly illustrative 25 °C inlet values, with remaining unknown conditions retained. [The export/teaching guide](../teaching-export.md) documents physical sizes, fonts, provenance and limitations. Independent review checks six SVG/PNG/PDF scenes, raster-visible PDF stream labels, transparency, long labels and a 100-stage column; final artifact paths and production checks appear in [M3 acceptance](../m3-acceptance.md).

## Milestone checkpoint

- All work packages 3.1–3.5 are complete and have verification evidence.
- Exchanger and column illustrations reflect their supported saved configuration.
- Hierarchy, presentation, and academic exports preserve the intended information.
- The project overview is updated before proceeding to M4.

All 40 actions are complete. Production verification passed the full repository check,
15 browser workflows, 27 independent browser checks and the export/package reviews
recorded in [M3 acceptance](../m3-acceptance.md). M4 remains unstarted.
