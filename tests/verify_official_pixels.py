"""Independently re-render original PDFs and compare all embedded page pixels.

Also checks browser print output: three Letter pages, no unexpected blank pages,
and close visual agreement with the originals (allowing print resampling).
"""
import base64
import io
import json
from pathlib import Path
import re
import subprocess
from PIL import Image, ImageChops, ImageStat
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "app_source.html").read_text(encoding="utf-8")
assets = json.loads(re.search(r"const OFFICIAL_SOURCES = (.*);\n// END EMBEDDED", source).group(1))
out = ROOT / "tmp/official-audit/independent"
out.mkdir(parents=True, exist_ok=True)
results = []
for level, asset in assets.items():
    original = ROOT / "official_reference_pdfs" / asset["filename"]
    printed = ROOT / "tmp/official-audit" / f"print-{level}.pdf"
    pages = PdfReader(printed).pages
    assert len(pages) == 3, (level, "print page count", len(pages))
    assert all(tuple(map(float, p.mediabox[2:])) == (612, 792) for p in pages)
    # RGB independent render compared with the embedded grayscale source images.
    subprocess.run(["pdftoppm", "-r", "200", "-png", str(original), str(out / f"source-{level}")], check=True)
    subprocess.run(["pdftoppm", "-r", "200", "-png", str(printed), str(out / f"print-{level}")], check=True)
    for i, data in enumerate(asset["images"], 1):
        expected = Image.open(out / f"source-{level}-{i}.png").convert("L")
        embedded = Image.open(io.BytesIO(base64.b64decode(data.split(",")[1]))).convert("L")
        assert expected.size == embedded.size == (1700, 2200)
        # Poppler grayscale and RGB conversion may differ by a gray level.
        diff = ImageStat.Stat(ImageChops.difference(expected, embedded))
        assert diff.mean[0] < 0.1, (level, i, "embedded/source difference", diff.mean)
        browser_print = Image.open(out / f"print-{level}-{i}.png").convert("L")
        print_diff = ImageStat.Stat(ImageChops.difference(expected, browser_print)).mean[0]
        assert print_diff < 3.0, (level, i, "print/source difference", print_diff)
        results.append({"level": level, "page": i, "sourcePixelMeanError": round(diff.mean[0], 4), "printPixelMeanError": round(print_diff, 4)})
(ROOT / "tmp/official-audit/pixel-results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"PASS: {len(results)} embedded page pixel comparisons; 9 printed PDFs have 3 Letter pages and match original content.")
