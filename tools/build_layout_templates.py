"""Extract question/page anchors from the supplied PDFs for generated exam layout.

Only question numbers and page coordinates are retained, never PDF text.
Requires pdfplumber. Regenerate when the supplied official PDFs change.
"""
import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
templates = {}
for level in ["P", *map(str, range(1, 9))]:
    pages = []
    with pdfplumber.open(ROOT / "official_reference_pdfs" / f"DSPF-Piano-{level}-Practice.pdf") as pdf:
        for page in pdf.pages:
            questions = []
            for line in page.extract_text_lines():
                match = re.match(r"^(\d{1,2})\.\s", line["text"])
                if match:
                    questions.append({"number": int(match[1]), "top": round(line["top"], 2)})
            pages.append(questions)
    assert len(pages) == 3 and all(pages), f"Missing question anchors: {level}"
    templates[level] = pages
data = json.dumps(templates, separators=(",", ":"))
start, end = "// BEGIN GENERATED PAGE TEMPLATES", "// END GENERATED PAGE TEMPLATES"
block = start + "\nconst GENERATED_PAGE_TEMPLATES = " + data + ";\n" + end
source = ROOT / "app_source.html"
html = source.read_text(encoding="utf-8")
if start in html:
    a = html.index(start)
    b = html.index(end, a) + len(end)
    html = html[:a] + block + html[b:]
else:
    marker = "// INTERACTIVE STATE & UI RENDERING"
    html = html.replace(marker, block + "\n" + marker)
source.write_text(html, encoding="utf-8")
(ROOT / "tests/official_layout.json").write_text(json.dumps(templates, indent=2) + "\n", encoding="utf-8")
print("Extracted question positions for all 27 official pages.")
