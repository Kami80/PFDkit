"""Build the self-contained GitHub Pages documentation from the package README."""

from html import escape
from pathlib import Path

from markdown_it import MarkdownIt

root = Path(__file__).resolve().parents[1]
source = (root / "packages/pfd-core/README.md").read_text(encoding="utf-8")
source = source.replace(
    "Install from a PFDkit checkout, or install a built wheel independently:",
    "Install the published package from PyPI:",
)
source = source.replace(
    "python -m pip install ./packages/pfd-core\n# Alternatively: python -m pip install /path/to/pfd_core-0.1.0-py3-none-any.whl",
    "python -m pip install pfd-core",
)
md = MarkdownIt("commonmark")
tokens = md.parse(source)
nav = []
for i, token in enumerate(tokens):
    if token.type == "heading_open" and token.tag == "h2":
        title = tokens[i + 1].content
        slug = "-".join(title.lower().split())
        token.attrSet("id", slug)
        nav.append(f'<a href="#{slug}">{escape(title)}</a>')
body = md.renderer.render(tokens, md.options, {})
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
(out / "index.html").write_text(page, encoding="utf-8")
