const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/generated-audit');
fs.mkdirSync(output, { recursive: true });
const levels = ['P', '1', '2', '3', '4', '5', '6', '7', '8'];
const templates = JSON.parse(fs.readFileSync(path.join(__dirname, 'official_layout.json')));
const protectedMode = process.argv.includes('--protected');
(async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(root, protectedMode ? 'index.html' : 'app_source.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    if (protectedMode) {
      const script = fs.readFileSync(path.join(root, 'set_api_key.ps1'), 'utf8');
      const key = script.match(/\[string\]\$ApiKey\s*=\s*"([^"]+)"/)[1];
      await page.locator('#apiKeyInput').fill(key);
      await page.locator('#unlockSubmitBtn').click();
      await page.waitForSelector('#levelSelectorBar button');
    }
    const cases = [];
    for (const level of levels) {
      for (const variant of ['mockA', 'random']) {
        for (const seed of variant === 'mockA' ? [2002] : [3001, 7777, 90001]) {
        for (const key of [false, true]) {
          await page.evaluate(({ level, variant, key, seed }) => {
            selectLevel(level);
            selectVariant(variant);
            currentExamData = buildExamData(level, variant, seed);
            isAnswerKeyVisible = key;
            renderDspfPages(key);
          }, { level, variant, key, seed });
          const layout = await page.evaluate(() => [...document.querySelectorAll('.dspf-page')].map((paper, pageIndex) => {
            const bounds = paper.getBoundingClientRect();
            const blocks = [...paper.querySelectorAll('.print-q-block')];
            const clippedSvg = [...paper.querySelectorAll('svg')].flatMap((svg, svgIndex) => {
              const box = svg.getBBox();
              const view = svg.viewBox.baseVal;
              if (box.x < view.x - 1 || box.y < view.y - 1 || box.x + box.width > view.x + view.width + 1 || box.y + box.height > view.y + view.height + 1) {
                return [{ svgIndex, question: svg.closest('.print-q-block')?.querySelector('.print-q-text')?.textContent, box: { x: box.x, y: box.y, width: box.width, height: box.height }, view: { x: view.x, y: view.y, width: view.width, height: view.height } }];
              }
              return [];
            });
            return {
              page: pageIndex + 1,
              questions: blocks.map(b => b.querySelector('.print-q-text')?.textContent?.match(/^\s*(\d+)\./)?.[1]).filter(Boolean),
              slots: [...paper.querySelectorAll('.generated-question-slot')].map(slot => ({
                number: Number(slot.dataset.question),
                top: (slot.getBoundingClientRect().top - bounds.top) * .75,
                scale: Number(slot.dataset.scale),
                fits: slot.firstElementChild.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1,
              })),
              overflow: blocks.filter(b => b.getBoundingClientRect().bottom > bounds.bottom - 36).map(b => b.querySelector('.print-q-text')?.textContent),
              invalidSvg: [...paper.querySelectorAll('svg *')].filter(el => [...el.attributes].some(a => /NaN|undefined/.test(a.value))).length,
              clippedSvg,
              labelOverlaps: [...paper.querySelectorAll('svg')].flatMap(svg => {
                const heads = [...svg.querySelectorAll('ellipse')].map(el => el.getBoundingClientRect());
                return [...svg.querySelectorAll('.pitch-answer')].filter(el => {
                  const label = el.getBoundingClientRect();
                  return heads.some(head => head.left < label.right && head.right > label.left && head.bottom + 3 > label.top && head.top < label.bottom);
                }).map(el => el.textContent);
              }),
              captionOverlaps: [...paper.querySelectorAll('.target-caption')].filter(el => el.getBoundingClientRect().bottom + 2 > el.nextElementSibling.getBoundingClientRect().top).length,
              rhythmOverlaps: [...paper.querySelectorAll('svg')].flatMap(svg => {
                const options = [...svg.querySelectorAll('.rhythm-option')].map(el => el.getBoundingClientRect());
                return options.slice(1).filter((box, i) => options[i].right > box.left - 2).length ? ['rhythm choices overlap'] : [];
              }),
            };
          }));
          for (let i = 0; i < 3; i++) {
            assert.deepEqual(layout[i].questions.map(Number), templates[level][i].map(q => q.number), `Level ${level} page ${i + 1}: official question order`);
            assert.equal(layout[i].slots.length, templates[level][i].length);
            layout[i].slots.forEach((slot, j) => {
              assert.ok(Math.abs(slot.top - templates[level][i][j].top) < 1, 'question must stay at the source PDF page position');
              assert.ok(slot.fits, `Level ${level} Q${slot.number}: overlap with next question`);
              assert.ok(slot.scale >= .8, `Level ${level} Q${slot.number}: text scaled too small (${slot.scale})`);
            });
          }
          cases.push({ level, variant, seed, key, layout });
          if (variant === 'mockA') {
            for (let i = 0; i < 3; i++) await page.locator('.dspf-page').nth(i).screenshot({ path: path.join(output, `${level}-${key ? 'key' : 'blank'}-${i + 1}.png`) });
          }
          if (seed === 2002 || seed === 7777) {
            await page.pdf({ path: path.join(output, `${level}-${variant}-${key ? 'key' : 'blank'}.pdf`), preferCSSPageSize: true });
          }
        }
        }
      }
    }
    // Actual mode controls must keep blank/key states and random generation usable.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { selectVariant('official'); selectLevel('4'); selectVariant('random'); rollNewRandomExam(); });
    assert.equal(await page.locator('.dspf-page').count(), 3);
    assert.equal(await page.locator('#btnToggleKey').isDisabled(), false);
    await page.evaluate(() => toggleAnswerKey());
    assert.ok(await page.locator('.print-ans-text, [fill="#d00000"]').count() > 0);
    assert.equal(await page.evaluate(() => currentExamData.raw.q1.notes.length), 10, 'Level 4 note question has the original number of answer spaces');
    fs.writeFileSync(path.join(output, `${protectedMode ? 'protected' : 'source'}-layout.json`), JSON.stringify({ errors, cases }, null, 2));
    const problems = cases.flatMap(c => c.layout.filter(p => p.overflow.length || p.clippedSvg.length || p.invalidSvg || p.rhythmOverlaps.length || p.labelOverlaps.length || p.captionOverlaps).map(p => `${c.level}/${c.variant}/${c.key ? 'key' : 'blank'}/p${p.page}: overflow=${p.overflow.length}, clippedSVG=${p.clippedSvg.length}, invalid=${p.invalidSvg}, rhythmOverlaps=${p.rhythmOverlaps.length}, labelOverlaps=${p.labelOverlaps}, captionOverlaps=${p.captionOverlaps}`));
    console.log(problems.join('\n'));
    assert.deepEqual(errors, []);
    assert.equal(problems.length, 0, 'generated exams must fit their pages and render complete music notation');
    console.log(`PASS: ${cases.length} generated exams / ${cases.length * 3} pages; no clipped notation, page overflow or invalid SVG.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
