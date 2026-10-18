"""Check PDFs produced by verify_generated.cjs: page size, count and questions."""
import json
import re
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
templates = json.loads((ROOT / "tests/official_layout.json").read_text())
count = 0
for level, pages in templates.items():
    for variant in ["mockA", "random"]:
        for state in ["blank", "key"]:
            path = ROOT / "tmp/generated-audit" / f"{level}-{variant}-{state}.pdf"
            pdf = PdfReader(path)
            assert len(pdf.pages) == 3, f"{path.name}: unexpected page break"
            for page, questions in zip(pdf.pages, pages):
                assert abs(float(page.mediabox.width) - 612) < 1
                assert abs(float(page.mediabox.height) - 792) < 1
                text = page.extract_text()
                for question in questions:
                    # PDF text extraction can insert spaces inside scaled text runs.
                    number = r"\s*".join(str(question["number"]))
                    assert re.search(rf"(?m)^\s*{number}\s*\.\s", text), (path.name, question)
            count += 1
print(f"PASS: {count} printed PDFs / {count * 3} Letter pages; every question stays on its original page.")
