# PFDkit — Project Task Tree

Status: M1 verified on 2026-10-26 and M2 complete and verified on 2026-10-27; M3 is complete and verified on 2026-10-28. M4 is complete and verified on 2026-10-28. See [the M1 acceptance record](docs/m1-acceptance.md), [the M2 acceptance record](docs/m2-acceptance.md), [the M3 acceptance record](docs/m3-acceptance.md), and [the M4 acceptance record](docs/m4-acceptance.md).

## Project definition

PFDkit is an open-source PFD editor and chemical engineering teaching platform. Users create structured process diagrams, inspect supported equipment, explain how a process works, and export figures for teaching and publications.

The first release supports drawing, equipment inspection, local saving, and export. Operating values are entered manually. Numerical simulation and equipment sizing require a separately scoped extension.

## Model and working approach

- Use **GPT-6.1 Sol for every task**, including planning, architecture, coding, tests, documentation, and review.
- Use **Medium reasoning** for routine work and **High reasoning** for architecture, complex engineering logic, integration, and debugging.
- Complete and verify each milestone before starting the next.
- Treat tests, documentation, accessibility, and contributor guidance as part of each milestone.
- Keep core product functionality usable without paid AI APIs.

## Planning structure

The project has **4 milestones**, **20 work packages (substeps)**, and **160 initial detailed actions**. Each work package has its own purpose, checklist, expected outputs, completion criteria, and space for additional requests and decisions. The checklists can grow as the project develops.

| Milestone                                  | Detailed checklist                            | Work packages | Initial actions |
| ------------------------------------------ | --------------------------------------------- | ------------- | --------------- |
| M1 — Foundation and working prototype      | [Foundation plan](docs/plan/01-foundation.md) | 1.1–1.5       | 40              |
| M2 — Usable editor and first release       | [Editor plan](docs/plan/02-editor.md)         | 2.1–2.5       | 40              |
| M3 — Equipment exploration and teaching    | [Teaching plan](docs/plan/03-teaching.md)     | 3.1–3.5       | 40              |
| M4 — Accounts, storage, and public library | [Platform plan](docs/plan/04-platform.md)     | 4.1–4.5       | 40              |

### How we work through a substep

1. Review its purpose, dependencies, and checklist; add the specific requests and design ideas for that work package.
2. Record material decisions and unresolved questions in its notes. Work on tasks that do not depend on an unresolved decision.
3. Implement its actions in manageable batches. A work package may span several sessions.
4. Verify the resulting behavior against its completion criteria and record the evidence.
5. Update its documentation and progress. Move unfinished ideas to an identified task or the future backlog.

Use task IDs such as **1.2.4** to identify a particular action. Use **1.2** to work on the whole engineering-core package. Every action uses **GPT-6.1 Sol**.

## Task tree

- [x] **M1 — Foundation and working prototype**
  - [x] **1.1 Project setup:** establish the repository structure, development commands, dependency management, CI, source-license decision, and initial contributor documentation.
  - [x] **1.2 Engineering core:** create the independently installable `pfd-core` Python package with equipment, typed material/energy ports, streams, units, stable identifiers, and an equipment registry.
  - [x] **1.3 Shared document contract:** define versioned JSON with separate engineering and presentation data; derive frontend types from the schema and add shared example documents.
  - [x] **1.4 Working prototype:** build a basic canvas with a feed, pump, heat exchanger, and product; support placement, connections, selection, labels, and property editing.
  - [x] **1.5 Save, load, and validate:** implement JSON import/export, structural validation, clear errors, and meaningful round-trip and connection checks.

- [x] **M2 — Usable editor and first release**
  - [x] **2.1 Equipment catalog:** add consistent SVG symbols and metadata for feed, product, pump, exchanger, separator, tank, mixer, splitter, column, and reactor.
  - [x] **2.2 Editing workflow:** add undo/redo, copy/paste, multi-selection, grid snapping, searchable equipment, property panels, stream labels, and basic orthogonal connections.
  - [x] **2.3 Styling and local persistence:** add Engineering Classic and Academic Colorful presets, editable colors and labels, accessible visual cues, browser autosave, and local project reopening.
  - [x] **2.4 First equipment explorer:** open a heat exchanger on double-click; show labeled components and hot/cold paths driven by its saved configuration, and return to the PFD with changes preserved.
  - [x] **2.5 Export and release verification:** export JSON, SVG, and configurable PNG, including transparent backgrounds and equipment detail views; verify the complete guest workflow and document installation.

- [x] **M3 — Equipment exploration and teaching**
  - [x] **3.1 Reusable explorer framework:** share equipment configuration, illustrations, labels, descriptions, and educational overlays across supported explorers.
  - [x] **3.2 Advanced equipment:** extend the exchanger with passes, baffles, and flow arrangements; build the column explorer with stages, feed locations, reflux, boilup, condenser/reboiler arrangements, and side draws.
  - [x] **3.3 Process hierarchy:** add reusable process sections and nested subflowsheets with consistent equipment, port, and stream references.
  - [x] **3.4 Teaching and presentation:** add fullscreen viewing, equipment highlighting, section focus, sequential reveals, annotations, lecture notes, and clear labels for illustrative values.
  - [x] **3.5 Academic export and examples:** add PDF, document/presentation size presets, the remaining visual themes, and reviewed teaching examples; verify illustration consistency and export quality.

- [x] **M4 — Accounts, storage, and public library**
  - [x] **4.1 Backend foundation:** introduce Django, Django Ninja, PostgreSQL, migrations, authentication, and project ownership; validate saved documents through `pfd-core`.
  - [x] **4.2 Personal projects:** add the project dashboard, project metadata, duplication, signed-in autosave, and revision history.
  - [x] **4.3 Privacy and publishing:** enforce access permissions, keep projects private by default, and support explicit owner-controlled publication and sharing.
  - [x] **4.4 Academic library:** add search, categories, templates, author attribution, content licensing, duplication, and a documented community contribution workflow.
  - [x] **4.5 Platform release:** complete Docker Compose setup, API/access-control checks, backup/restore guidance, equipment-extension tutorials, and end-to-end release verification.

## Milestone completion checks

| Milestone          | Required result                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1                 | Create the example PFD, edit its properties, save and reload it without losing data or layout, and receive useful feedback for incompatible connections. |
| M2 — first release | A guest creates a useful diagram, inspects and edits the exchanger, reopens the project locally, and exports a readable figure without registering.      |
| M3                 | Equipment configuration changes update the corresponding illustrations; hierarchy, presentation, and academic exports preserve the intended content.     |
| M4                 | Users save private projects, enforce ownership, recover revisions, deliberately publish diagrams, and duplicate public examples with attribution.        |

## Architecture decisions

- **Frontend:** Next.js, React, TypeScript, React Flow, Tailwind CSS, shadcn/ui, Zustand, and SVG equipment renderers.
- **Engineering library:** Python, Pydantic, versioned JSON, and NetworkX only where graph algorithms justify it.
- **Backend:** Django and Django Ninja with PostgreSQL, introduced in M4. Earlier milestones use local documents and browser persistence.
- **Contract:** `pfd-core` defines the engineering schema. Generated frontend types and shared fixtures help keep both implementations aligned.
- **Separation:** engineering data, equipment illustration/layout, and educational content have distinct responsibilities. All views read the same underlying equipment configuration.
- **Hierarchy:** trays, baffles, and tube passes are equipment configuration. Connected process sections use subflowsheets.
- **Validation:** structural checks cover schema, references, ports, connectivity, and units. Physical validation identifies the specific engineering calculations performed.
- **Drafts:** incomplete diagrams and unknown properties remain editable. Missing operating values are preserved as unknown rather than silently converted to zero; process recycle loops are allowed.
- **Open source:** document source-code licensing and contributed-content licensing separately; publish projects only through an explicit owner action.

## Scope kept for later

- After the basic editing workflow: obstacle-avoiding stream routing, automatic layout, grouping, and advanced alignment guides.
- After the first catalog and explorer: more equipment types, detailed views, and educational templates.
- Separate future proposals: thermodynamic solvers, equipment sizing, automatic mass/energy balance calculations, real-time collaboration, and optional AI-assisted features.

## Progress tracking

- Check a task only after its deliverable and relevant verification are complete.
- Keep the overview's work-package checkbox aligned with its detailed checklist; partial completion stays unchecked.
- Check a milestone only after every included task and its completion check pass.
- Record material design decisions and unresolved issues alongside the affected task as implementation proceeds.
- Add new requests to the relevant detailed checklist, preserving existing task IDs. If a request changes scope, record the affected milestone and dependencies.
- Record verification evidence in the work package's notes, such as a command result, example document, or inspected export.
- **Completed implementation milestone: M4 � Accounts, storage, and public library (4.1�4.5), verified on 2026-10-28. All four milestones are complete. See the M4 acceptance record for executed checks and explicit unexecuted Docker/target-host deployment checks.**
