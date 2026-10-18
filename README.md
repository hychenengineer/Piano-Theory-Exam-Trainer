# 🎹 PMTA / DSPF Piano Theory Exam Trainer (Protected Access)

This repository hosts the **AES-256 Encrypted** web application for the **Pennsylvania Music Teachers Association (PMTA) — Dorothy Sutton Performance Festival (DSPF)** Piano Theory Exam Trainer (Primer Level – Level 8).

### 🔒 Access & Security
- **Live Application:** [https://hychenengineer.github.io/Piano-Theory-Exam-Trainer/](https://hychenengineer.github.io/Piano-Theory-Exam-Trainer/)
- **Encryption:** All exam content and interactive modules are encrypted client-side using **PBKDF2-HMAC-SHA256 + AES-256-CBC** and require a valid **API Key** to decrypt and access.

### Official exam sources

Official Practice Exam displays the supplied original PDFs for Primer and Levels 1–8. Each exam contains three lossless page renders, with an unchanged original PDF available to download for selectable text and vector-quality printing. Mock and random exams use the question generator.

The previous official mode selected fixed entries from manually authored question pools. Those entries and simplified music renderers did not reproduce the source exams. Official mode now bypasses that generator entirely. The previous generated answer keys do not correspond to the original questions, so official answer-key controls are disabled with an explanation. Mock and random answer keys remain available.

### Local rebuild and verification

The plaintext `app_source.html`, source PDFs in `official_reference_pdfs/`, and PowerShell packaging scripts intentionally remain local and ignored by Git. Never publish those files or an access key.

1. Run `python tools/build_official_assets.py` with Poppler's `pdftoppm` on PATH and `pypdf` installed. It embeds all nine PDFs and 27 page images in the private source and updates `official_sources_manifest.json`.
2. Run `./set_api_key.ps1` using the existing access key configuration. This rebuilds the encrypted `index.html` and copies the application's stylesheet into the protected shell. Do not use `-PushToGitHub` unless publishing is intended.
3. Run `./verify_exams.ps1`, then `node tests/verify_official.cjs` and `node tests/verify_official.cjs --protected` with Playwright and Edge available (`NODE_PATH` may point to the installed packages).
4. Run `python tests/verify_official_pixels.py` with Pillow, pypdf and Poppler. This independently compares all 27 source pages and checks the browser's printed PDFs. Verification artifacts remain under ignored `tmp/official-audit/`.

Browser verification covers desktop Edge and a narrow viewport. Physical iPad Safari and physical printer output require separate testing.
