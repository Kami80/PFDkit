"""Build the self-contained GitHub Pages documentation from the package README."""

import os
import re
import tempfile
from html import escape
from pathlib import Path

from docs_diagram import diagram
from docs_preview import document_output, example_output
from gallery_processes import process_gallery
from markdown_it import MarkdownIt
from pfd_core import add_equipment, new_document, registry
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

root = Path(__file__).resolve().parents[1]
source = (root / "packages/pfd-core/README.md").read_text(encoding="utf-8")
source = source.replace(
    "Install from a PFDkit checkout, or install a built wheel independently:",
    "Install the published package from PyPI:",
)
source = source.replace("https://kami80.github.io/PFDkit/symbol-", "symbol-")
source = source.replace(
    "python -m pip install ./packages/pfd-core\n# Alternatively: python -m pip install /path/to/pfd_core-0.1.0-py3-none-any.whl",
    "python -m pip install pfd-core",
)
guide = (root / "packages/pfd-core/GUIDE.md").read_text(encoding="utf-8")
guide = guide.replace("# Building and using a PFD", "## Building and using a PFD", 1)
guide = guide.replace("## ", "### ")
guide = guide.replace("### Building and using a PFD", "## Building and using a PFD", 1)
guide = guide.replace(
    "[package README](README.md)",
    "[package README](https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/README.md)",
)
source += "\n\n" + guide
catalog = (root / "packages/pfd-core/EQUIPMENT.md").read_text(encoding="utf-8")
catalog = re.sub(r"^(#{1,5}) ", r"#\1 ", catalog, flags=re.MULTILINE)
source += "\n\n" + catalog
gallery_markdown = (root / "packages/pfd-core/GALLERY.md").read_text(encoding="utf-8")
gallery_markdown = re.sub(r"^(#{1,5}) ", r"#\1 ", gallery_markdown, flags=re.MULTILINE)
source += "\n\n" + gallery_markdown
api = (root / "packages/pfd-core/API.md").read_text(encoding="utf-8")
api = re.sub(r"^# ", "## ", api, count=1, flags=re.MULTILINE)
api = re.sub(r"^## ", "### ", api, flags=re.MULTILINE)
api = api.replace("### pfd-core API reference", "## pfd-core API reference", 1)
source += "\n\n" + api
source = source.replace(
    "(API.md)", "(https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/API.md)"
)
source = source.replace(
    "(GUIDE.md)",
    "(https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/GUIDE.md)",
).replace(
    "(README.md)",
    "(https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/README.md)",
)


def highlight_code(code: str, language: str, _attrs: str) -> str:
    try:
        lexer = get_lexer_by_name(language or "text")
    except ClassNotFound:
        lexer = get_lexer_by_name("text")
    return highlight(code, lexer, HtmlFormatter(nowrap=True))


md = MarkdownIt("commonmark", {"highlight": highlight_code})
tokens = md.parse(source)
nav = ["<details open><summary>Getting started</summary><nav>"]
group_open = True
seen = {}
for i, token in enumerate(tokens):
    if token.type == "heading_open" and token.tag in ("h2", "h3"):
        title = tokens[i + 1].content
        slug = "-".join(title.lower().split())
        seen[slug] = seen.get(slug, 0) + 1
        if seen[slug] > 1:
            slug += f"-{seen[slug]}"
        token.attrSet("id", slug)
        if title in (
            "Building and using a PFD",
            "Process gallery",
            "Equipment catalog and expansion plan",
            "pfd-core API reference",
        ):
            if group_open:
                nav.append("</nav></details>")
            label = (
                "Build with Python"
                if title == "Building and using a PFD"
                else (
                    "Equipment catalog"
                    if title == "Equipment catalog and expansion plan"
                    else "Process gallery"
                    if title == "Process gallery"
                    else "API reference"
                )
            )
            nav.append(f"<details open><summary>{label}</summary><nav>")
            group_open = True
        nav.append(f'<a class="nav-{token.tag}" href="#{slug}">{escape(title)}</a>')
if group_open:
    nav.append("</nav></details>")
namespace = {"__name__": "__main__"}
previous = Path.cwd()
with tempfile.TemporaryDirectory(prefix="pfd-docs-") as directory:
    os.chdir(directory)
    try:
        for token in tokens:
            if token.type == "fence" and token.info.strip() == "python":
                token.meta["output"] = example_output(token.content, namespace)
    finally:
        os.chdir(previous)
fence = md.renderer.rules["fence"]


def render_fence(tokens, index, options, env):
    language = escape(tokens[index].info.strip() or "text")
    toolbar = f'<div class="code-toolbar"><span>{language}</span><button class="copy-code" type="button">Copy code</button></div>'
    return (
        '<div class="code-box">'
        + toolbar
        + fence(tokens, index, options, env)
        + "</div>"
        + tokens[index].meta.get("output", "")
    )


md.renderer.rules["fence"] = render_fence
body = md.renderer.render(tokens, md.options, {})
out = root / "docs/core-site"
for name, document, scope, reference, url in process_gallery():
    (out / f"{name}.json").write_text(document.to_json(), encoding="utf-8")
    image = diagram(document)
    svg = re.search(r"<svg.*?</svg>", image).group(0)
    svg = svg.replace(
        "><defs>",
        "><style>svg{background:#fff;color:#0969bd;--surface:#fff;--ink:#20242c;--muted:#536174;--line:#ced8e4}text{font:14px system-ui;fill:#20242c}.equipment-kind{font-size:12px}.stream-value{font-size:13px}.stream-label,.equipment-tag{font-weight:600}</style><defs>",
        1,
    )
    (out / f"{name}.svg").write_text(svg, encoding="utf-8")
    links = f'<div class="agent-toolbar"><a href="{name}.svg" target="_blank" rel="noopener">Open full-size SVG ↗</a><a href="{name}.json" download>Download PFD JSON</a><a href="gallery_processes.py" download>Python source</a></div>'
    body = body.replace(
        f"<!-- gallery-{name} -->",
        '<section class="gallery-card">'
        + links
        + document_output(document)
        + "</section>",
    )
for symbol_set in ("precision", "teaching"):
    demo = new_document("Equipment symbol styles")
    for i, definition in enumerate(registry.definitions()):
        demo = add_equipment(
            demo, definition.type, id=definition.type, x=(i % 4) * 250, y=(i // 4) * 250
        )
    demo.presentation.metadata["style"] = {"symbolSet": symbol_set}
    svg = re.search(
        r"<svg.*?</svg>", diagram(demo, horizontal_spacing=210, vertical_spacing=220)
    ).group(0)
    svg = svg.replace(
        "><defs>",
        "><style>svg{background:#fff;color:#0969bd;--surface:#fff;--ink:#20242c;--muted:#536174;--line:#ced8e4;--teaching-accent:#006b80}text{font:14px system-ui;fill:#20242c}.equipment-kind{font-size:12px}.equipment-tag{font-weight:600}</style><defs>",
        1,
    )
    (out / f"symbol-{symbol_set}.svg").write_text(svg, encoding="utf-8")
(out / "gallery_processes.py").write_text(
    (root / "scripts/gallery_processes.py").read_text(encoding="utf-8"),
    encoding="utf-8",
)
page = (
    """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Documentation for the pfd-core Python library"><title>pfd-core documentation</title><link rel="stylesheet" href="style.css"></head>
<body><a class="skip" href="#content">Skip to content</a><header><a class="brand" href="#top">PFD<span>kit</span> <small> / pfd-core</small></a><nav aria-label="Project links"><a href="https://pypi.org/project/pfd-core/">PyPI ↗</a><a href="https://github.com/Kami80/PFDkit">GitHub ↗</a></nav></header><div class="layout" id="top"><aside><p class="label">DOCUMENTATION · 0.1.0</p><strong>On this page</strong><nav aria-label="Contents">"""
    + "".join(nav)
    + """</nav></aside><main id="content"><div class="eyebrow">PYTHON LIBRARY · VERSION 0.1.0</div>"""
    + body
    + """<section class="reference"><h2>API reference</h2><p>The public package exports the following entry points. The <a href="https://github.com/Kami80/PFDkit/tree/v0.1.0/packages/pfd-core/src/pfd_core">versioned source</a> contains full signatures and model fields.</p><ul><li><code>new_document</code>, <code>add_equipment</code>, <code>update_equipment</code>, <code>remove_equipment</code></li><li><code>connect</code>, <code>update_stream</code>, <code>remove_stream</code></li><li><code>Document</code>, <code>Equipment</code>, <code>Stream</code>, <code>Endpoint</code>, <code>Quantity</code></li><li><code>validate_document</code>, <code>GraphValidationError</code>, <code>ValidationResult</code></li><li><code>registry</code>, <code>EquipmentRegistry</code>, <code>PortDefinition</code></li><li><code>UNITS</code>, <code>check_quantity</code>, <code>convert_quantity</code></li></ul></section><footer>Built for the PFDkit community · MIT license · <a href="https://github.com/Kami80/PFDkit/issues">Report an issue</a></footer></main></div></body></html>"""
)
out = root / "docs/core-site"
out.mkdir(parents=True, exist_ok=True)
page = re.sub(r'<section class="reference">.*?</section>', "", page)
page = page.replace(
    "</head>", '<link rel="icon" type="image/svg+xml" href="icon.svg"></head>'
)
page = page.replace(
    '<a class="brand" href="#top">',
    '<a class="brand" href="#top"><img class="brand-icon" src="icon.svg" width="28" height="28" alt="">',
)
page = page.replace(
    '<link rel="stylesheet"',
    '<script src="theme-init.js"></script><link rel="stylesheet"',
)
page = page.replace(
    "<aside>", '<aside id="sidebar" aria-label="Documentation navigation">'
)
page = page.replace(
    "<header>",
    '<header><button id="sidebar-toggle" aria-controls="sidebar" aria-expanded="true" aria-label="Toggle navigation">☰</button>',
)
page = page.replace(
    '<nav aria-label="Project links">',
    '<nav aria-label="Project links"><button id="theme-toggle" aria-label="Switch to midnight theme">◐</button>',
)
agent_source = source
for name, *_ in process_gallery():
    agent_source = agent_source.replace(
        f"<!-- gallery-{name} -->",
        f"[PFD JSON](https://kami80.github.io/PFDkit/{name}.json) · [SVG](https://kami80.github.io/PFDkit/{name}.svg) · [Python source](https://kami80.github.io/PFDkit/gallery_processes.py)",
    )
(out / "agent-guide.md").write_text(agent_source, encoding="utf-8")
page = page.replace(
    "</main></div></body></html>",
    '</main></div><button class="view-toggle" type="button" aria-label="Switch to agent view" '
    'aria-pressed="false" title="Switch to agent view">&lt;/&gt;</button>'
    '<script src="site.js" defer></script></body></html>',
)
(out / "index.html").write_text(page, encoding="utf-8")
