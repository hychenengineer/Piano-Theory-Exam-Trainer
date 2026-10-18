"""Embed the supplied PDFs and lossless 200-DPI page renders in the private app.

Requires Poppler (pdftoppm) and pypdf. Source PDFs and generated plaintext stay
local; set_api_key.ps1 packages the entire app inside the existing encrypted gate.
"""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
START = "// BEGIN EMBEDDED OFFICIAL SOURCES"
END = "// END EMBEDDED OFFICIAL SOURCES"


def build():
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise SystemExit("pdftoppm is required to render the source PDFs")
    output = ROOT / "tmp/official-assets"
    output.mkdir(parents=True, exist_ok=True)
    assets = {}
    manifest = {}
    for level in ["P", *map(str, range(1, 9))]:
        source = ROOT / "official_reference_pdfs" / f"DSPF-Piano-{level}-Practice.pdf"
        pdf_bytes = source.read_bytes()
        reader = PdfReader(source)
        if len(reader.pages) != 3 or any(tuple(map(float, p.mediabox[2:])) != (612, 792) for p in reader.pages):
            raise ValueError(f"Unexpected page count or paper size: {source.name}")
        subprocess.run([renderer, "-r", "200", "-gray", "-png", str(source), str(output / level)], check=True)
        pages = []
        page_hashes = []
        for number in range(1, 4):
            png = (output / f"{level}-{number}.png").read_bytes()
            pages.append("data:image/png;base64," + base64.b64encode(png).decode("ascii"))
            page_hashes.append(hashlib.sha256(png).hexdigest())
        sha = hashlib.sha256(pdf_bytes).hexdigest()
        assets[level] = {
            "filename": source.name,
            "sourceSha256": sha,
            "pdfData": "data:application/pdf;base64," + base64.b64encode(pdf_bytes).decode("ascii"),
            "images": pages,
        }
        manifest[level] = {"filename": source.name, "sourceSha256": sha, "pageCount": 3, "dpi": 200, "pageSha256": page_hashes}
    source_path = ROOT / "app_source.html"
    source_html = source_path.read_text(encoding="utf-8")
    block = START + "\nconst OFFICIAL_SOURCES = " + json.dumps(assets, separators=(",", ":")) + ";\n" + END
    if START in source_html:
        begin = source_html.index(START)
        end = source_html.index(END, begin) + len(END)
        source_html = source_html[:begin] + block + source_html[end:]
    else:
        marker = "// MATHEMATICAL MUSIC THEORY ENGINE"
        source_html = source_html.replace(marker, block + "\n" + marker, 1)
    source_path.write_text(source_html, encoding="utf-8")
    (ROOT / "official_sources_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Embedded 9 original PDFs and 27 lossless page images in the private source.")


if __name__ == "__main__":
    build()
