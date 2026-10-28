# First release: local diagrams, exploration and figures

PFDkit's M2 editor supports ten equipment types, a local project library, a first shell-and-tube explorer, and native JSON/SVG/PNG export. It runs without registration, credentials, a backend database, or paid services. Operating values are entered manually; the editor does not calculate balances, thermodynamics, heat duty, outlet conditions or equipment sizes.

## Install and create a diagram

Use Node 24 LTS, npm 11, and Python 3.11–3.14. From a checkout, create/activate a virtual environment, install `requirements-dev.lock`, install the local Python package without dependency/build isolation, and run `npm ci`. The repository README gives the platform-specific commands. Start `npm run dev`, then open [the local editor](http://127.0.0.1:3000).

Click **New diagram** or **Local projects → Create project**. Search the palette or filter by category, then click or drag equipment onto the canvas. Use a symbol's outlet/inlet handles or **Connect ports** to create typed connections. The first catalog includes feed, product, pump, heat exchanger, separator, tank, mixer, splitter, column and reactor. Tags identify equipment to the reader; stable IDs and port IDs maintain references when labels change.

Select equipment or a stream to edit its properties. Enter or blur commits a numeric/text input; Escape cancels its current input where indicated. The palette, connection controls and Properties actions provide keyboard paths. Use Shift selection or the selection rectangle for groups. Undo/redo, copy/paste, duplicate, grid snapping and orthogonal stream paths support normal editing; the editor's shortcut hints show the platform modifier keys. The history retains up to 100 document changes. Drag gestures and grouped changes are undoable as coherent commands. A pasted group receives fresh identifiers and remapped internal stream/component references.

**Load example** opens the feed → pump → exchanger → product teaching process. The committed `examples/catalog-demo.json` demonstrates the full initial catalog. These are illustrative drafts: unconnected required ports produce warnings. Missing references, incompatible port kinds/directions/capacities, invalid configurations/units and invalid compositions are errors. Recycles are permitted.

## Style the figure

Open **Style** to choose **Engineering Classic** or **Academic Colorful**. Diagram background, font, font size, line thickness, title and legend settings are shared by the canvas and export. Select an object for stroke, fill, text color, line thickness, label size and visibility overrides. Resetting an object override returns it to the diagram preset. Styling lives in presentation metadata and does not alter engineering values.

The reserved style subformat is `presentation.metadata.style.version: 1`, with per-object values in `presentation.metadata.objectStyles`. Rendering sanitizes colors, font choices and numeric ranges; native JSON retains unknown extension metadata. Default text contrasts with the selected diagram background. Explicit custom text colors remain the user's choice, so review contrast after overriding them.

The colorblind-friendly palette uses blue, purple and orange families with distinct equipment geometry. Stream direction remains an arrow, energy streams retain dashed lines, and labels identify objects regardless of color. The interface supports light, dark and system appearance independently of the saved drawing. Exports carry explicit drawing colors and do not inherit the surrounding interface theme. Focus outlines, keyboard controls, text labels and reduced-motion behavior remain available.

## Local projects, autosave and recovery

The permanent **Local projects** section displays save state and **Save now**. Document changes autosave after a short debounce. Projects belong to this browser/origin, not an online account. Reopening a project restores its native document, including labels, units, configuration, layout, styling and educational metadata. Creation, naming, reopening, duplication and deliberate deletion are available in the library. Duplication creates a new document identity. Deletion asks for confirmation, removes that project's local revisions, and closes it if active.

Each save writes a versioned immutable recovery snapshot before updating the current project record. The library exposes **Recover autosave snapshots**, which opens a snapshot as a separate project rather than replacing another revision. Up to eight recent snapshots from the current writer are retained; snapshots from other writers are retained for conflict recovery. A malformed snapshot does not hide healthy ones or invalidate a committed project.

Project switches flush the old document before opening another. An explicitly reopened project becomes the next project's reload target without requiring an edit or an unnecessary revision. Pending saves capture the original document and its identity, so a delayed callback cannot store old work under a newly opened project's ID. Deliberate deletion cancels pending saves for that project.

Modern browsers use Web Locks to serialize local writes across tabs. If another tab saved a newer revision, PFDkit preserves the remote project and saves your edits as a **conflict recovery** project. Reopen either version from the library. Merely focusing another tab does not create a new revision for an unchanged document. The fallback for browsers without Web Locks retains independent snapshots and checks revisions before updating the current record; review recovery snapshots after a simultaneous-write conflict.

Storage can fail when disabled, blocked, full, or interrupted. Save-state feedback distinguishes those cases and keeps the current diagram open. An interrupted current-record write can leave a newer recoverable snapshot. A failure to store the recent-project preference or clean old snapshots is reported separately after the main project was saved. Export JSON immediately when storage fails. If preserving the current project fails, a library switch is cancelled so current edits remain available. No automatic download occurs.

Keep native JSON backups before clearing browser data, switching browser profiles, changing origins, or moving computers. Autosave protects normal use; it cannot guarantee the final keystroke survives an abrupt browser/process termination before the debounce completes. Clearing browser storage also clears local projects and snapshots.

## Explore a heat exchanger

Double-click a heat exchanger, or use its keyboard-accessible **Explore heat exchanger** action in Properties. The PFD remains mounted, preserving selection and viewport for **Return to PFD**. The explorer edits the same equipment and streams through the normal command history. Committed edits apply immediately and autosave; Undo/Redo reverse them. Enter/blur commits an operating-value input, and Escape cancels its current draft without closing the explorer.

The first detail illustrates one shell pass with one or two tube passes. Changing flow arrangement changes the saved co-current, countercurrent or cross-flow schematic paths. Two tube passes show outward and return travel with a turn in the right header; the outlet is physically on the left in that detail. Its label maps the stable logical `tubeOut` identity to this physical nozzle, while the PFD symbol retains its logical port. Multi-pass local directions alternate, so the whole unit is not described as uniformly countercurrent. Larger saved tube/shell pass counts are preserved and explicitly marked as having unavailable detailed routing; they are never silently reset.

Solid tube and dashed shell paths remain separate. The tube sheets, tube bundle, shell housing and physical nozzles are labeled. Connected external stream labels and IDs identify `tubeIn`, `tubeOut`, `shellIn` and `shellOut`. Missing connections/measurements are explicitly unknown. Circuit color means tube versus shell; it does not assert which fluid is hot. Only when both entered inlet temperatures are known does the interface compare their relative thermal roles. It calculates no outlet condition.

Operating values and units are editable for connected streams. Blank values remain null/unknown, entered zero remains zero, and changing a supported unit converts the existing value, including temperature offsets. The artwork and explanation are original PFDkit content under MIT. The educational reference is the [DOE Fundamentals Handbook, Thermodynamics, Heat Transfer, and Fluid Flow, volume 2, heat exchanger section](https://www.energy.gov/documents/doe-hdbk-1012-92vol2), pp. 31–33. The schematic explains fluid separation and flow paths; it is not a fabrication drawing or a claimed standards-compliant symbol set.

## Export editable documents and portable figures

**Export JSON** saves the full editable document. Import validates it before replacement; a rejected import leaves the current project intact. Native JSON includes metadata, engineering data, layout, styling and education. This is the format to keep for further editing.

**Export figure** provides SVG, PNG or JSON. SVG is portable vector artwork built from the same symbol geometry and styles as the canvas. It includes routed streams, explicit-color arrowheads, escaped text, object labels, optional title/legend and padding. It does not include handles, selection outlines or editor controls. SVG bounds account for symbols, strokes, markers and conservatively measured text, including wide/long labels and titles. Fonts use portable system choices and fallbacks, so exact glyph appearance can differ between machines.

Choose the full diagram, selected content, or heat exchanger detail. Selected streams include their endpoint symbols so the exported connection remains understandable. Equipment-detail export uses the explorer's saved configuration and physical port mapping. Native JSON always exports the complete editable document even if a figure target is selected.

PNG uses the SVG rendering with configurable width/height, background color and transparency. Each side must be a whole number from 64 through 8192 pixels, with at most 32 million pixels overall. **Match figure aspect ratio** sets the corresponding height. Other ratios preserve the figure proportions with margins; opaque export fills the entire image background, while transparent export retains an alpha channel. Unsupported or excessively large requests produce useful feedback and leave SVG/JSON available. The preview shows the same figure content used by the export.

## Scope, contribution and verification

Orthogonal routing is basic and can overlap equipment; obstacle avoidance and automatic layout are future work. The first detail supports the explicitly documented geometry, not advanced baffles, column explorers or arbitrary exchanger construction. Publication/PDF export, process hierarchy, simulation and cloud accounts remain outside M2. Inspect a figure before academic use, and distinguish user-entered values from calculations.

The source and original examples are MIT licensed; preserve attribution and third-party content licenses. Add equipment in the authoritative Python registry, regenerate the contract, and add matching declarative symbol geometry. See `CONTRIBUTING.md` and `docs/equipment-catalog.md`. The Python package's own README provides an independent public-API and registry-extension quickstart.

Run `npm run check` for lint, typing, tests, generated-contract freshness and production build. Run `npm run test:e2e` for real Chromium workflows, including local persistence, exchanger edits, rejected storage and downloads. Python tooling should run from the repository virtual environment. Actual commands/results, independently inspected SVG/PNG outputs and release evidence are recorded in `docs/m2-acceptance.md`.
