# M1 — Foundation and Working Prototype

[Project overview](../../PROJECT_PLAN.md) · Next milestone: [Usable editor](02-editor.md)

Status: complete — all 40 actions implemented and verified on 2026-10-26. Model: **GPT-6.1 Sol throughout**.

Goal: establish the engineering document contract and prove a complete create → edit → save → reopen workflow using a small PFD.

## 1.1 Project setup

Purpose: make the project understandable, independently installable where required, and repeatable on another developer's machine.

Dependencies: project definition and selected technology stack.

- [x] **1.1.1** Define the repository layout for the web app, `pfd-core`, generated contracts, example documents, and documentation; reserve the backend location for M4.
- [x] **1.1.2** Select supported Python and Node.js versions, package managers, and dependency-locking conventions using their current supported versions at implementation time.
- [x] **1.1.3** Initialize version control and add ignore rules, editor settings, line-ending conventions, and a clear policy for generated files and local configuration.
- [x] **1.1.4** Scaffold the frontend and independently installable Python package; provide root commands for the normal development workflow.
- [x] **1.1.5** Add example environment configuration and local setup instructions; keep required credentials out of the local editor workflow.
- [x] **1.1.6** Configure formatting, linting, Python typing, and TypeScript checks with commands contributors can run locally.
- [x] **1.1.7** Add CI that installs locked dependencies and runs applicable build, type, and test checks as functionality is introduced.
- [x] **1.1.8** Establish the source-license decision and initial README, contribution guide, code of conduct, and contribution-attribution rules.

Expected outputs: initial repository structure, dependency configuration, developer commands, CI configuration, and onboarding documents.

Complete when: a clean checkout can install the Python package, start the web app, and run the documented checks without undocumented setup.

Additional requests, decisions, and evidence:

- The npm workspace contains `apps/web`, an independent `packages/pfd-core`, shared `packages/contracts`, generated assets, examples and documentation. `apps/api` is reserved for M4. Git is initialized locally; no remote, commit or deployment was created.
- Node 24/npm 11 and Python 3.11+ are documented, with committed npm and Python contributor locks. CI targets Python 3.11 and 3.14; only Python 3.11 was executed locally. MIT covers source and original contributed examples/documentation, with separate third-party attribution rules.
- A clean `npm ci --offline --no-audit --no-fund` installed 439 packages. A workspace `.venv` installed the Python lock and editable package; interpreter/module paths were verified. The complete `npm run check` passed, including the production build. Wheel/sdist builds, standalone wheel installation, contributor documentation, formatting and CI configuration were verified. See [the acceptance record](../m1-acceptance.md) for commands and the candid record of an earlier shared-Python installation deviation.

## 1.2 Engineering core

Purpose: define the equipment and stream information that every view of a process shares.

Dependencies: 1.1.

- [x] **1.2.1** Define process, equipment, and stream identities; equipment tags; optional metadata; and the difference between an unknown value and an entered value.
- [x] **1.2.2** Model typed inlet and outlet ports, material versus energy connections, permitted connection counts, and stable port identifiers.
- [x] **1.2.3** Model stream component identities, composition basis, optional composition, flow-rate basis, temperature, pressure, and user-supplied properties.
- [x] **1.2.4** Define quantities, dimensions, supported units, and conversion rules; preserve unknown values and reject ambiguous or incompatible units with useful messages.
- [x] **1.2.5** Build an equipment registry that declares type, port definitions, configuration schema, descriptive metadata, and extension/version information.
- [x] **1.2.6** Define the first feed, pump, exchanger, and product models; distinguish the exchanger's two fluid circuits and keep its configuration independent of its drawing.
- [x] **1.2.7** Implement graph operations for adding, connecting, updating, and deleting equipment and streams; permit process recycle loops and editable incomplete diagrams.
- [x] **1.2.8** Define validation results with severity, stable error codes, relevant object identifiers, and the checks actually performed; document the boundary between structural and physical validation.

Expected outputs: public Python models, registry and graph operations, quantity conventions, and a small example process.

Complete when: Python code can create and inspect the example process, report incompatible connections, and preserve valid recycles and unknown operating values.

Additional requests, decisions, and evidence:

- Pydantic models preserve stable IDs, extension metadata, entered zero and unknown null values. Material/energy ports declare direction, capacity and circuit; the exchanger has separate tube and shell paths. Mass/mole composition and explicit quantity dimensions/units are supported; pressure is absolute and temperature conversions include offsets.
- Registry extensions declare version/source, ports and configuration schemas. Energy rates use `properties.power`; energy streams reject material flow/composition. Graph commands copy before mutation, reject incompatible connections and configurations, cascade deletion, and allow cycles and incomplete drafts.
- All 36 Python tests pass, including independent extension/energy, unit, recycle, composition, metadata and rollback checks. Ruff and mypy pass. Validation explicitly records structural checks and performs no physical calculations. The standalone package README contains four executed Python examples; the final wheel was independently imported and exercised.

## 1.3 Shared document contract

Purpose: let the Python package, browser editor, future backend, and exports exchange the same document reliably.

Dependencies: 1.2.

- [x] **1.3.1** Specify the document envelope, identity, schema version, metadata, and distinct engineering, presentation, and educational sections.
- [x] **1.3.2** Define reference rules between equipment, ports, streams, layout, and equipment configuration so presentation changes preserve engineering data.
- [x] **1.3.3** Generate JSON Schema from the Python models and produce frontend types through a documented, repeatable command.
- [x] **1.3.4** Choose browser runtime schema checks and clearly document which checks are shared with Python and which require additional semantic validation.
- [x] **1.3.5** Establish serialization conventions for numbers, unknown values, quantities, enums, optional fields, and deterministic output.
- [x] **1.3.6** Define supported-version handling, future migration entry points, extension metadata, and behavior for unknown equipment types or unsupported document versions.
- [x] **1.3.7** Add shared fixtures covering a valid process, an incomplete draft, a recycle, energy/material mismatches, broken references, and an unsupported version.
- [x] **1.3.8** Add contract documentation and checks that detect stale generated types or disagreements between Python and frontend handling of the shared fixtures.

Expected outputs: versioned JSON contract, generated schema and types, shared fixtures, and contract-generation instructions.

Complete when: both runtimes handle the agreed fixtures consistently within their documented validation responsibilities, and regenerating types produces no unexplained changes.

Additional requests, decisions, and evidence:

- Contract `1.0.0` separates engineering, presentation and education. Python generates Draft 2020-12 JSON Schema, normalized TypeScript types, registry and units; AJV plus matching semantic checks validate browser documents without rewriting configuration.
- Ten shared fixtures cover a valid process, incomplete draft, recycle, incompatible kinds, missing references, unsupported version/type, partial-composition overflow, unsafe integers and integral-float integer configuration. Both runtimes accept integer values written as `2` or `2.0` while rejecting numeric strings and booleans. Metadata/configuration extension values are preserved within the documented finite IEEE 754/safe-integer policy.
- All 18 frontend unit/integration tests and 36 Python tests pass; `npm run contract:check` confirms every generated asset is current. Unsupported versions/types fail explicitly and no implicit migration runs. See [the contract](../document-contract.md).

## 1.4 Working prototype

Purpose: prove that structured engineering data can drive an understandable interactive editor.

Dependencies: 1.1–1.3.

- [x] **1.4.1** Build the initial editor shell with equipment palette, canvas, property panel, document title, and clear empty/selection states.
- [x] **1.4.2** Establish editor state and commands; distinguish persisted document data from temporary selection, viewport, and panel state.
- [x] **1.4.3** Render the four starter equipment symbols as SVG nodes with port positions derived from their registered definitions.
- [x] **1.4.4** Support adding equipment from the palette, dragging it onto the canvas, assigning identifiers/tags, and placing it at the intended coordinates.
- [x] **1.4.5** Support connecting and removing streams, showing flow direction and labels, and checking port compatibility during connection.
- [x] **1.4.6** Build property editing for equipment tags, supported configuration, stream values, and units; update the underlying document through the same command path.
- [x] **1.4.7** Add selection, deletion, pan, zoom, fit-to-view, visible focus, and a usable keyboard path for the core workflow.
- [x] **1.4.8** Provide the feed → pump → exchanger → product example and verify that changes to its data and layout appear in the correct views.

Expected outputs: runnable prototype, initial SVG renderers, document-aware editor state, property editing, and a sample PFD.

Complete when: a user can construct the sample using the interface, edit it, and inspect a document whose data agrees with the canvas.

Additional requests, decisions, and evidence:

- The Next.js/React Flow/Tailwind/Zustand prototype provides a palette, SVG equipment, canvas, property inspector, connection composer, validation findings and clear empty states. Native handles align with symbol connector strokes. Tags, pump/exchanger configuration, stream values and generated units are editable; selection/panels remain transient while coordinates are persisted separately from engineering.
- Palette click/keyboard and actual drag/drop placement, actual handle connections, node movement, labels, selection, deletion, pan/zoom/fit and keyboard access were verified. Three committed Chromium workflows passed, and the independent live browser review passed all eleven checks with no page or console errors.
- The example is `examples/valid-process.json`; the shell circuit is deliberately incomplete and produces draft warnings. The interface targets desktop/tablet screens with a minimum layout width of 560 pixels. See [the walkthrough](../prototype-walkthrough.md).

## 1.5 Save, load, and validate

Purpose: finish the first complete workflow and establish trustworthy document handling.

Dependencies: 1.3 and 1.4.

- [x] **1.5.1** Implement native JSON download with document metadata, engineering data, equipment configuration, and presentation information.
- [x] **1.5.2** Implement file import with parse, schema, version, and reference checks; preserve the current document if an import fails.
- [x] **1.5.3** Apply supported compatibility handling and preserve agreed extension metadata; explain unsupported versions or equipment clearly.
- [x] **1.5.4** Verify that serialization preserves quantity units, numeric precision within the declared representation, labels, identifiers, and layout.
- [x] **1.5.5** Present validation findings by affected object and severity; distinguish an editable incomplete draft from an invalid reference or incompatible connection.
- [x] **1.5.6** Add meaningful Python and shared-contract checks for round trips, graph mutation, units, reference integrity, and valid recycle flows.
- [x] **1.5.7** Add frontend interaction coverage for creating the sample, editing properties, saving, reopening, and recovering from a rejected import.
- [x] **1.5.8** Document the prototype walkthrough, current limitations, validation scope, and the verified commands/results needed to close M1.

Expected outputs: working native import/export, validation feedback, representative automated checks, and a repeatable prototype demonstration.

Complete when: the example survives edit/save/reopen without losing engineering data or layout, and invalid documents produce useful feedback without corrupting the active project.

Additional requests, decisions, and evidence:

- Native JSON import parses, checks version/schema/references and validates before replacing state. Failed imports retain the entire active document. Exports preserve IDs, labels, quantity units/precision, unknown versus zero, layout, configuration extensions, metadata and educational content.
- The three Chromium tests cover create/edit/connect/export/reopen, exact saved JSON equality, rejected-import rollback, keyboard operations, configuration bounds and an actual invalid-then-valid handle connection. The independent eleven-check browser review additionally verifies palette dragging, real movement/handles, malformed/version/type rollback and browser → installed Python → browser document equality.
- The final clean `npm run check` passed ESLint, TypeScript, 18 frontend tests, contract freshness, Ruff, mypy, 36 Python tests and the Next.js 16.4.3 production build. Local logs/reports are retained under ignored `.artifacts`; reproducible commands, validation scope and current limitations are recorded in [the acceptance record](../m1-acceptance.md). M2 features remain unstarted.

## Milestone checkpoint

- [x] All work packages 1.1–1.5 are complete and have verification evidence.
- [x] The prototype is documented and can run on a clean development checkout.
- [x] The project overview is updated before proceeding to M2.
