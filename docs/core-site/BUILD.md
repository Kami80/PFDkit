# Build the library documentation

From the repository root, create the project virtual environment, install `pfd-core`, then install `requirements-docs.txt`. Run `npm ci` for the editor's TypeScript dependency and vector artwork bridge.

```sh
python -m pip install -e packages/pfd-core -r requirements-docs.txt
npm ci
python scripts/build-core-docs.py
npm exec prettier -- --write docs/core-site
npm run format:check
```

The builder executes trusted repository Python examples in a temporary working directory, validates all gallery documents, uses the editor's original equipment artwork and writes static HTML, Markdown, SVG and JSON. Do not use untrusted Markdown as build input. The site needs no Python or Node runtime after publication.

Edit `packages/pfd-core/README.md`, `GUIDE.md`, `API.md` and `GALLERY.md` for prose; `scripts/gallery_processes.py` defines the gallery documents. Keep the generated `docs/core-site/gallery_processes.py` copy synchronized by rebuilding. SVG references use the same port definitions and configuration as the Python registry.
