# Milestone 2 acceptance record

M2 is complete and verified on 2026-10-27. Verification ran on Windows with
Node.js 24.16.0, npm 11.13.0, workspace-isolated Python 3.11.4 and installed
Chrome. Python 3.14 is configured in CI but was not executed locally.

## Acceptance matrix

| Package                     | Required observable behavior                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Catalog                 | All ten equipment types share a symbol/port geometry, registry metadata, stable multiports, configuration defaults, provenance and a verified extension path.                                              |
| 2.2 Editing                 | Compound undo/redo, multi-selection and group movement/deletion, correctly remapped copy/paste, reconnection preserving stream identity, orthogonal edges, snapping, search and reliable property editing. |
| 2.3 Styling and persistence | Two presets and per-object styling remain separate from engineering; local projects, autosave, recovery, storage failures and stale-tab conflicts protect documents.                                       |
| 2.4 Explorer                | A configuration-driven exchanger view preserves external stream identities, unknown/manual values, history, selection and PFD viewport through navigation and reopening.                                   |
| 2.5 Export and release      | Portable SVG and sized/transparent PNG reflect saved geometry/style, include text/legend bounds, support full/selection/detail targets and open correctly outside the editor.                              |

## Cross-feature review

- Reconnecting a stream excludes its existing occupancy and preserves its ID,
  values, units and metadata.
- Group copy creates fresh IDs and remaps internal stream endpoints, layout and
  reserved per-object styles without rewriting unrelated metadata.
- Dragging and form editing produce useful history entries; failed operations
  leave both document and history intact.
- Project changes flush or cancel autosave for the captured project. Initial
  hydration does not overwrite newer edits. Conflicts preserve both revisions.
- Exchanger navigation preserves the PFD viewport; supported pass/flow changes
  alter actual paths, with clear scope for unsupported saved geometry.
- Export colors are explicit and readable independently of interface dark mode.
  Long or escaped text, strokes, markers and legends fit the calculated bounds.
- Real handle gestures remain usable after incompatible attempts and after
  multi-selection changes. SVG/PNG contain no editing handles or selection state.

## Implementation boundaries

The Python engineering schema remains authoritative. Presentation styling uses
reserved `presentation.metadata.style` and `objectStyles` namespaces. Python
preserves their JSON; the TypeScript resolver sanitizes the visual settings.
Unknown unrelated metadata survives native saving. Drawing geometry is shared by
the canvas and exporters; original symbols do not claim standards certification.

All Python tooling and installations use the workspace `.venv`. Package inputs
and Next build processes have one owner. No backend, public deployment, numerical
solver or M3 work is included.

## Executed verification

| Check                                                  | Executed result                                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                        | Passed web lint, TypeScript, all 51 frontend tests, generated-contract freshness, Python Ruff, mypy for six source files, all 40 Python tests and the Next.js 16.4.3 production build.                                                       |
| `npm run test:e2e` against the built production server | All 14 Chromium workflows passed in 13.3 seconds.                                                                                                                                                                                            |
| Independent production browser review                  | All eight checks passed, with zero page exceptions and zero console errors.                                                                                                                                                                  |
| Independent production storage review                  | All seven checks passed, with zero uncaught exceptions.                                                                                                                                                                                      |
| Standalone export inspection                           | Five SVG/PNG pairs passed: no clipped text, unresolved marker references, external resources or rendering errors; PNG dimensions, transparency and opaque letterboxing matched the requests.                                                 |
| Independent Python wheel use                           | Imported the built package from an isolated target; all ten catalog types and a ten-equipment/nine-stream document validated and survived an equal JSON round trip. The archive includes the MIT license. No physical checks were performed. |

The final check log is `.artifacts/m2-final-check.log`; the committed browser suite
log is `.artifacts/m2-final-e2e.log`. The independent reviews were repeated
sequentially against the built `next start` server on port 3000 after the complete
check passed. Their logs are `.artifacts/m2-production-browser.log` and
`.artifacts/m2-production-storage.log`; results are recorded in
`.artifacts/m2-root-browser-report.json` and `.artifacts/m2-storage-report.json`.
The production server was stopped after verification. These ignored local
artifacts are supporting evidence, not required application files.

### Work-package evidence

| Package                     | Verified deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Catalog                 | Python catalog tests cover all ten definitions, defaults, metadata, stable ports, native round trips and a representative independently registered valve extension. The committed browser suite configures, saves and reopens every catalog type; the independent review also adds and saves all ten through the UI. Shared declarative geometry drives the canvas and export. The catalog guide records coordinates, provenance, attribution and the extension path.                                                |
| 2.2 Editing                 | History/integration tests cover compound movement/deletion, copied component/endpoint/style references and identity-preserving reconnection. The 14 browser workflows include actual handle rejection followed by valid connection, endpoint reconnection, keyboard palette placement, native multi-selection, group movement, copy/paste/delete recovery and property commit/cancel.                                                                                                                                |
| 2.3 Styling and persistence | Feature/integration tests cover presentation-only styling, unknown metadata, both presets, stale writers, interrupted writes, corrupt snapshots and quota errors. Independent real-tab checks verify dirty-project flushing, clean focus without extra revisions, stale-tab recovery forks, deletion without resurrection, quota/failed-recovery retention with JSON fallback, and corrupt-record/snapshot recovery into a separate project. Reload preserves engineering, layout, styling and interface preference. |
| 2.4 Explorer                | Geometry tests verify one/two tube passes, supported flow arrangements, logical/physical nozzle mapping, unsupported saved configuration, unknown/zero values and unit offsets. Browser workflows verify explorer edit/cancel, undo, autosave and reopening; the independent review verifies double-click entry, changed saved pass geometry, unsupported configuration preservation and return to the exact PFD viewport. Detail exports include saved configuration and external stream identities.                |
| 2.5 Export and release      | Export tests cover escaped/long text bounds, references, selected stream endpoints, transparency and PNG limits. The independent guest workflow downloads full, selected and detail figures, rejects oversized PNG requests without data loss, and opens the resulting figures outside the editor. The README, first-release walkthrough, editing/catalog guides and contributor instructions document installation, samples and scope.                                                                              |

The independently opened outputs are full transparent (1400 × 900), full opaque
(1300 × 1000), selected content (1100 × 700), one-pass detail (1520 × 1040) and
two-pass detail (1520 × 1040). The files and their `*-inspection.json` reports are
retained under `.artifacts/m2-full-transparent`, `m2-full-opaque`, `m2-selected`,
`m2-detail-one-pass` and `m2-detail-two-pass`. The isolated wheel result is
`.artifacts/m2-python-package-report.json`. Earlier development-server checks
also passed; the production reruns are the final browser acceptance evidence.

## Decisions and limitations

The core performs structural validation, not thermodynamics, balances, equipment
sizing, heat duty or outlet-condition calculations. Unknown values remain null;
entered zero remains zero. Required unconnected ports produce editable-draft
warnings. Mixer/splitter branch counts and port identities are fixed in M2.

Orthogonal routing is basic and does not avoid equipment or labels. The explorer
illustrates one shell pass and one/two tube passes; other saved geometry remains
preserved and explicitly marked as unavailable. Circuit colors identify tube and
shell, while thermal roles depend on known entered inlet temperatures. Original
MIT artwork and educational text are attributed; the DOE educational reference
is linked in the walkthrough. Symbols make no standards-certification claim.

Projects belong to the current browser origin. Snapshots and recovery forks
protect recoverable work, but clearing browser storage removes them and an
abrupt termination before autosave's debounce can lose the final edit. Web Locks
serialize supported-browser writes; the fallback retains snapshots and checks
revisions with the simultaneous-write limits documented in the walkthrough.
Native JSON remains the portable editable backup. Export fonts can differ by
machine; custom colors require a contrast review.

Verification claims cover the executed Windows environment. Other operating
systems and Python 3.14 are not claimed from configuration alone. All final
Python commands used the workspace environment; the earlier global-environment
deviation remains documented in the M1 acceptance record. There is no backend,
account, deployment, public release publication, solver or M3 implementation in
this acceptance. M3 and M4 remain unstarted; the next planned package is 3.1.
