# Milestone 1 acceptance record

This record tracks the implemented foundation against its observable behavior.
Verification was performed on 2026-10-26 using Windows, Node.js 24.16.0, npm
11.13.0, Python 3.11.4 and installed Chrome 155.0.8059.86. The configured CI
matrix additionally targets Python 3.14; that second interpreter has not been run
locally.

## Required behavior

| Area                  | Acceptance check                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Independent core      | Install `pfd-core` without frontend dependencies; import its public API.                                                     |
| Identity and metadata | Preserve process, equipment, stream, port references, extension metadata, and explicit unknown values.                       |
| Connections           | Reject missing references, reversed ports, material/energy mismatches, and exhausted port capacity without partial mutation. |
| Editable drafts       | Allow incomplete equipment and unknown operating values, with useful warnings.                                               |
| Recycles              | Accept a structurally valid directed cycle.                                                                                  |
| Units and composition | Preserve units and composition basis; convert compatible units; reject incompatible dimensions and ambiguous units.          |
| Registry              | Define the four starter types and permit explicitly registered extensions with version/configuration information.            |
| Shared contract       | Generate schema/types from Python, detect stale output, and validate shared fixtures in both runtimes.                       |
| Native document       | Keep engineering, presentation, and educational data separate and preserve them through serialization.                       |
| Browser editing       | Add/place/connect/select/move/delete equipment; edit tags, configuration, stream values, and units.                          |
| Browser safety        | Reject invalid imports without changing the active document; explain unsupported types/versions.                             |
| Complete workflow     | Create the sample, edit engineering values and layout, export JSON, reopen it, and compare persisted data.                   |
| Repeatable setup      | Install locked dependencies and run lint, typing, tests, production build, and browser checks with documented commands.      |

## Verification evidence

| Check                                                      | Executed result                                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                                             | 18 passed: 14 contract checks and 4 independent editor command integration checks.                                                                                                        |
| `python -m pytest packages/pfd-core/tests -q`              | 36 passed, including shared fixtures, graph commands, registry extensions, units and independent acceptance checks.                                                                       |
| `npm run contract:check`                                   | Schema, normalized schema, registry, units, fixtures and TypeScript are current.                                                                                                          |
| `npm run typecheck`                                        | Passed.                                                                                                                                                                                   |
| `npm run core:lint`                                        | Passed.                                                                                                                                                                                   |
| `npm run core:typecheck`                                   | Passed for all six core source files.                                                                                                                                                     |
| `npm run format:check`                                     | Passed for all matched repository files.                                                                                                                                                  |
| `python -m ruff format --check packages/pfd-core scripts`  | Passed for all matched source, scripts, tests and embedded README examples.                                                                                                               |
| `python -m build --no-isolation packages/pfd-core`         | Wheel and sdist built; archives contain the MIT license and declare Pydantic as the only runtime dependency.                                                                              |
| Independent wheel installation                             | Installed the built wheel into an isolated target and imported/used `new_document` and `validate_document`.                                                                               |
| Independent live Chromium review                           | All eleven checks passed; zero uncaught browser exceptions and zero console resource errors.                                                                                              |
| Actual browser document loaded by installed Python package | Four equipment and three streams validated, with only two expected shell-circuit draft warnings; metadata, entered zero, unknown values and `11520 kg/h` survived Python reserialization. |
| `npm run test:e2e`                                         | Three Chromium interaction workflows passed in 4.8 seconds, including actual handle drag rejection followed by a valid connection.                                                        |
| Clean locked npm installation and production build         | Clean npm ci installed 439 locked packages offline; the full npm run check passed, including the Next.js 16.4.3 production build.                                                         |

The final independent browser review ran against the compiled production server and passed all eleven checks in 4.6 seconds, with zero page exceptions or console errors. It verified actual palette drag/drop for all
four types, actual node movement with engineering data unchanged, handle-based
connections for the complete sample, pump/exchanger edits, unit conversion
(`3.2 kg/s` to `11520 kg/h`), zero versus unknown values, exact document equality
after export/import including custom metadata/configuration/education, rejected
malformed/version/type imports without data loss, and deletion cascades.
The production server became ready in 272 ms and was stopped after verification. The complete clean-check log is retained in ignored .artifacts/final-check.log. Local browser evidence is retained in ignored `.artifacts/m1-browser-report.json`,
`.artifacts/root-browser-review.cjs`, screenshots and exported JSON documents.

The committed automated interaction suite independently covers sample creation,
configuration and stream editing, native download/import equality, rejected
reference imports, keyboard selection/deletion, integer configuration editing and
incompatible connections. Shared fixtures include valid/incomplete/recycle
documents, bad references, material/energy mismatch, unsupported version/type,
partial-composition overflow and unsafe integer metadata, and integral-float configuration values.

## Decisions and limitations

The core uses structural validation and performs no physical calculations.
Unknown values are null; numeric zero remains entered zero. Native JSON uses
finite IEEE 754 numbers, and integer-valued numbers stay within the portable safe
range. Extension metadata requiring arbitrary precision uses strings. Required
unconnected ports are draft warnings, so the example's unused shell circuit does
not prevent editing or saving. Material/energy port mismatches and invalid
references are errors. Energy rates use `properties.power`.

Source code uses MIT. Original contributed examples/documentation use MIT unless
another compatible license is explicitly declared; third-party attribution and
licenses remain separate. There is no account, backend, external API or credential
requirement for this milestone. Native JSON saving is explicit; browser refresh
starts a new session. Autosave, undo/redo, figure export and equipment explorers
remain in M2 or later.

The execution sandbox blocked the default npm registry and local child-process
sockets. The verified environment used the npm mirror for package retrieval and
elevated local development/browser commands. The committed lockfile keeps
canonical npm registry URLs and real package integrity hashes; ordinary local
development does not require project-specific proxy configuration.

### Python environment isolation

Final Python verification uses the workspace's `.venv\Scripts\python.exe` with
the exact contributor lock and editable `pfd-core` installed there. The interpreter
prefix and Ruff, mypy, pytest and Pydantic module paths were checked to point
inside `.venv`; the editable core points to this checkout. The isolated checks
passed Ruff, mypy, all 36 tests, dependency consistency, and wheel/sdist builds.
A separate installation of the built wheel into `.artifacts/final-wheel-check`
was imported and used for validation and JSON round trips, with Pydantic loaded
from `.venv`. Evidence is in `.artifacts/python-workspace-isolation.json`.

An earlier setup step installed contributor tools into the existing Python 3.11
interpreter before workspace isolation was corrected. Known changes are pytest
8.0.2 to 9.1.1, Ruff added at 0.17.2, and mypy added at 2.4.0. Pydantic 2.13.4
and build 1.5.0 remained unchanged. Current hatchling 1.32.4, editables 0.6 and
the editable core 0.1.0 are recorded without assuming unknown prior package
versions. Shared packages were left in place rather than blindly uninstalled.
The known baseline/current evidence is retained in
`.artifacts/python-global-environment-deviation.json`. All documented setup and
subsequent dependency installations use a workspace environment.
