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

### Generated exam format

Mock and random exams use the official PDFs' question order and page coordinates. Each generated blank exam and answer key stays on the same three Letter pages. Beamed passages and chords use shared notation rendering and aligned rhythmic spacing; SVG bounds reserve room for ledger lines, stems, examples, and answers.

Run `python tools/build_layout_templates.py` (requires pdfplumber) to refresh the layout templates in the private source and the coordinate fixture. For generated exams, run `node tests/verify_notation.cjs`, `node tests/verify_rhythm.cjs`, and `node tests/verify_generated.cjs --protected` after rebuilding. The browser check covers both modes, three random seeds, blank exams and answer keys for all levels, including section fit, original question positions, notation bounds and printed PDFs. Artifacts stay in ignored `tmp/generated-audit/`.

Run `python tests/verify_generated_prints.py` afterward to check all 36 printed exams/keys for three Letter pages and the original question distribution. The notation checks also cover note/answer clearance, complete chord answers, rhythmic alignment, and unique correct rhythm choices.

Level 4 generated exams follow the supplied Theory Test Content guide's Level 4 vocabulary list: six matching terms are sampled from its ten piano terms. Question 1 keeps ten answer spaces and rejects repeated natural pitches, ignoring accidentals and clef and including the example in the uniqueness check. Question 4 generates a fresh four-bar passage with dotted-quarter/eighth and dotted-eighth/sixteenth combinations plus syncopation, 2–3 single bass notes per bar, at most two accidentals and three rests across the passage, and a computed downward perfect-fifth answer in F major. Question 8 generates new melodies with dotted rhythms and syncopation in both 6/8 and common time. Its example caption stays below the notation and its arrow points to the demonstrated first barline.

Run `node tests/verify_level4_generation.cjs` for independent rhythm, pitch, transposition, vocabulary, and content-variation checks over 400 exams. Run `node tests/verify_level4_browser.cjs --protected` for two reproducible random exams through the actual controls, blank/key rendering, example clearance and arrow targeting, and printed pages. Evidence stays under ignored `tmp/level4-guide-update/`.

Accidentals use symbol-specific vertical anchors so flat hollows align with their staff pitches and flat bowls stay within spaces. Chords allocate separate accidental columns where needed, and passages reserve extra horizontal room before accidental-bearing notes while keeping simultaneous beats aligned. Key-signature rows display both bass and treble clef changes. Run `node tests/verify_accidentals.cjs --protected` for line/space fixtures, accidental and notehead clearance, staggered thirds and sevenths, and 108 generated blank/key exams across all nine levels. Close-up images and results stay under ignored `tmp/accidental-audit/`.
