# PFDkit

An open-source process flow diagram editor and chemical engineering teaching toolkit. Create diagrams locally, explore exchangers and columns, organize process sections, present a lesson, reopen browser projects, and export editable JSON or SVG/PNG/PDF figures. The optional Django/PostgreSQL platform adds accounts, private projects, revision recovery and an academic library. Guest drawing and exports work without accounts, credentials, a database or paid AI APIs. Measurements are entered by the user; PFDkit does not solve thermodynamics, size equipment, or calculate material and energy balances.

- Ten equipment types with stable material/energy ports and shared vector symbols.
- Undo/redo, selection groups, copy/paste, reconnection, search and grid snapping.
- Four visual presets, per-object styling and recoverable local autosave.
- Shared exchanger and column explorers with configuration-driven passes, baffles, stages, feeds and side draws.
- Nested process sections, reusable templates, saved lecture steps, annotations and read-only presentation inspection.
- Portable SVG, configurable PNG and vector PDF export with academic page presets for diagrams, sections and equipment detail.
- Private account projects with revision-checked autosave, recoverable browser drafts, immutable history and restoration.
- Deliberate publication of a fixed saved revision, searchable educational templates and attributed private reuse.

Start with [the first-release walkthrough](docs/first-release.md). [The catalog](docs/equipment-catalog.md) and [editing guide](docs/editing-workflow.md) explain supported equipment and interactions.

For teaching, follow [process sections and presentations](docs/process-sections-and-teaching.md) and [academic export and the five example lessons](docs/teaching-export.md). Contributors can extend supported equipment through [the explorer-authoring guide](docs/explorer-authoring.md).

## Local setup

Use **Node.js 24 LTS**, **npm 11**, and **Python 3.11–3.14**. Python 3.11 is the minimum; CI is configured for the minimum and 3.14. See the acceptance records for actually executed environments. Node 24 is selected from the [official supported release schedule](https://github.com/nodejs/Release); the installed toolchain was Node 24.16.0 / npm 11.13.0. Python support follows the [Python version status](https://devguide.python.org/versions/).

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.lock
python -m pip install --no-deps --no-build-isolation -e packages/pfd-core
npm ci
npm run dev
```

On macOS/Linux activate with `source .venv/bin/activate`. Open [the local editor](http://127.0.0.1:3000). No `.env` file is necessary; `.env.example` explains the configuration boundary. If PowerShell execution policy blocks `npm`, use `npm.cmd`.

## Optional account platform

Follow [platform operations](docs/platform-operations.md) for native PostgreSQL or
Docker Compose installation, migrations, recovery delivery, backups and upgrades.
Copy `.env.example` to ignored `.env`, replace the database password and Django
secret, then use `docker compose up --build -d` for the complete local stack.
Compose binds the web service to loopback by default. Public hosting needs the
documented HTTPS and cookie settings.

The [API guide](apps/api/README.md) covers sessions, CSRF, document limits and the
permission matrix. [Architecture](docs/platform-architecture.md) explains private
revisions and sanitized public snapshots. [Release instructions](docs/platform-release.md)
identify the release checks and limitations. New projects are private; publishing
requires a saved revision, chosen content license and explicit owner confirmation.

```sh
npm run check                 # web lint/types/unit tests, contract freshness, Python lint/types/tests, production build
npm run test:e2e              # Chromium editor workflow; first run: npx playwright install chromium
npm run contract:generate     # regenerate JSON Schema, registry, units, examples, and TypeScript
npm run format:check
python -m build --no-isolation packages/pfd-core
```

The web app uses Next.js, React Flow, Tailwind, shadcn-style local UI components, and Zustand. The Python package is independently installable with `python -m pip install ./packages/pfd-core`.

## Repository

| Path                     | Responsibility                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `apps/web`               | Browser editor, state, runtime validation, interaction tests                           |
| `packages/pfd-core`      | Authoritative Python engineering models, registry, units, graph operations, validation |
| `packages/contracts`     | Browser schema/semantic validation and native document serialization                   |
| `contracts/generated`    | Committed Python-generated schema/registry/units and generated frontend types          |
| `examples`               | Shared valid and invalid contract fixtures with expected results                       |
| `scripts`                | Repeatable contract generation and checks                                              |
| `apps/api`               | Django Ninja accounts, PostgreSQL persistence, permissions, revisions and library      |
| `deploy`, `compose.yaml` | Self-hosting containers, health checks and database persistence                        |
| `docs`                   | Contract, contributor workflow, validation scope, and walkthrough                      |

See [the contract](docs/document-contract.md), [contributing](CONTRIBUTING.md), [the M3 acceptance record](docs/m3-acceptance.md), and [the project plan](PROJECT_PLAN.md). The [M2 acceptance record](docs/m2-acceptance.md), [foundation walkthrough](docs/prototype-walkthrough.md) and [M1 acceptance record](docs/m1-acceptance.md) retain the earlier milestones' evidence.

Source code is [MIT licensed](LICENSE). Contributors retain copyright; [the contribution policy](CONTRIBUTING.md) covers example/documentation attribution and third-party content separately.
