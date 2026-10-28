# M1 prototype walkthrough

Complete the local setup in the repository README, run `npm run dev`, and open the local editor. Everything in the workflow works without a user account or external API.

1. Choose **New diagram**. Add a feed, pump, heat exchanger, and product from the palette. Each palette item supports a click/keyboard action; dragging the item onto the canvas places it at the pointer position. Equipment appears with a stable identifier, an assigned tag and a matching SVG symbol.
2. Open **Connect ports** to use the keyboard-friendly connection controls, or drag from an outlet handle to an inlet. Connect feed outlet → pump suction, pump discharge → exchanger tube inlet, exchanger tube outlet → product inlet. Flow arrows and stream labels show direction. The shell circuit remains an editable draft until connected.
3. Select equipment, edit its tag, pump efficiency/drive or exchanger flow arrangement/pass counts in Properties. Select a stream to edit its label, flow basis, flow rate, temperature, pressure and units. Blank numeric values remain unknown; entered zero is preserved. Changes update the persisted document through editor commands.
4. Drag a node to change layout. Use canvas pan, zoom and fit controls. Select equipment or streams for deletion; the Properties delete action and Delete key support removal, and removing equipment also removes its attached streams.
5. Set a document title and choose **Export JSON**. The downloaded `.pfd.json` includes all engineering data, shared equipment configuration, metadata, education and presentation layout. Save the file somewhere you can reopen it.
6. Choose **New diagram**, then **Import**, and reopen that saved file. Confirm the title, labels, property values, units and layout return. Alternatively choose **Load example** for the committed feed → pump → exchanger → product fixture.
7. Import `examples/broken-reference.json` or `examples/energy-material-mismatch.json`. The import message explains the error and the current process remains intact. Unsupported versions and equipment types are also explained. A warning-only draft imports normally.
8. Open the validation findings to inspect severity and affected object. Select a finding to inspect that object where applicable. The initial example deliberately warns about the unconnected exchanger shell circuit; it does not claim to be a fully specified or physically solved process.

## Verification and limits

`npm run check` runs the documented lint, typing, shared-contract/Python unit checks, generated-output freshness, and production build. `npm run test:e2e` runs the actual Chromium create/connect/edit/download/import/rejected-import workflow. Use `npx playwright install chromium` first when using the bundled test browser. To use an installed browser locally, set `PLAYWRIGHT_EXECUTABLE_PATH` to its absolute executable path. CI installs Chromium normally. Detailed executed results belong in [the M1 acceptance record](m1-acceptance.md).

The milestone provides four equipment types and native JSON interchange. The editor targets desktop and tablet screens, with a minimum layout width of 560 pixels. Undo/redo, autosave, persistent accounts, SVG/PNG/PDF export, richer symbols, automatic routing, and equipment explorers belong to later milestones. Browser refresh starts a fresh local session; export JSON before closing. Values are manually entered and illustrative. Structural validation covers the documented document, reference, port, configuration, unit and composition checks; it performs no physical calculations.

The implementation environment could reach the npm mirror while the default npm host was blocked. Dependencies were installed using `npm install --registry=https://registry.npmmirror.com`, with real package integrity values; the committed lockfile uses canonical npm registry URLs for ordinary `npm ci`. This mirror is an environment workaround and is not required project configuration.
