// Run with NODE_PATH pointing to an installed playwright package if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const protectedMode = process.argv.includes('--protected');
const levels = ['P', '1', '2', '3', '4', '5', '6', '7', '8'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  const html = fs.readFileSync(path.join(root, protectedMode ? 'index.html' : 'app_source.html'));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    if (protectedMode) {
      assert.equal(await page.locator('.official-source-image').count(), 0, 'source pages must stay behind the access gate');
      // Reuse the existing local build credential without logging or copying it.
      const keyScript = fs.readFileSync(path.join(root, 'set_api_key.ps1'), 'utf8');
      const key = keyScript.match(/\[string\]\$ApiKey\s*=\s*"([^"]+)"/)[1];
      await page.locator('#apiKeyInput').fill('incorrect-test-key');
      await page.locator('#unlockSubmitBtn').click();
      await page.waitForFunction(() => !document.getElementById('authErrorMsg').classList.contains('hidden'));
      assert.equal(await page.locator('.official-source-image').count(), 0);
      await page.locator('#apiKeyInput').fill(key);
      await page.locator('#unlockSubmitBtn').click();
      await page.waitForSelector('#levelSelectorBar button');
    }
    const evidence = [];
    for (const level of levels) {
      await page.evaluate(lv => selectLevel(lv), level);
      assert.equal(await page.locator('.official-source-image').count(), 3, `Level ${level}: official view must use all three source pages`);
      await page.waitForFunction(() => [...document.querySelectorAll('.official-source-image')].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('#btnToggleKey').isDisabled(), true);
      assert.equal(await page.locator('#btnPrintKey').isDisabled(), true);
      const actual = await page.evaluate(() => ({
        source: currentExamData.sourceSha256,
        pdf: currentExamData.pdfData,
        pages: [...document.querySelectorAll('.official-source-image')].map(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight })),
        keys: currentExamData.pagesKey
      }));
      const pdf = fs.readFileSync(path.join(root, `official_reference_pdfs/DSPF-Piano-${level}-Practice.pdf`));
      assert.equal(actual.source, hash(pdf), `Level ${level}: PDF provenance`);
      assert.deepEqual(Buffer.from(actual.pdf.split(',')[1], 'base64'), pdf, `Level ${level}: exact original PDF download`);
      assert.equal(actual.keys, null, 'do not attach reconstructed answers to original questions');
      for (let i = 0; i < 3; i++) {
        assert.equal(actual.pages[i].width, 1700);
        assert.equal(actual.pages[i].height, 2200);
        const pixels = Buffer.from(actual.pages[i].src.split(',')[1], 'base64');
        const expected = fs.readFileSync(path.join(root, `tmp/official-assets/${level}-${i + 1}.png`));
        assert.deepEqual(pixels, expected, `Level ${level}, page ${i + 1}: source image binding`);
      }
      await page.evaluate(() => toggleAnswerKey());
      assert.equal(await page.locator('.official-source-image').count(), 3);
      await page.emulateMedia({ media: 'print' });
      const boxes = await page.locator('.dspf-page').evaluateAll(els => els.map(el => {
        const style = getComputedStyle(el);
        return [style.paddingTop, style.paddingLeft, el.scrollHeight <= el.clientHeight];
      }));
      assert.deepEqual(boxes, [['0px', '0px', true], ['0px', '0px', true], ['0px', '0px', true]], 'original pages must not be inset or clipped when printing');
      await page.pdf({ path: path.join(root, `tmp/official-audit/print-${level}.pdf`), preferCSSPageSize: true });
      await page.emulateMedia({ media: 'screen' });
      if (level === '4') await page.locator('.dspf-page').nth(1).screenshot({ path: path.join(root, 'tmp/official-audit/fixed-level4-page2.png') });
      for (const variant of ['mockA', 'random']) {
        await page.evaluate(v => selectVariant(v), variant);
        assert.equal(await page.locator('.dspf-page').count(), 3);
        assert.equal(await page.locator('.official-source-image').count(), 0);
        assert.equal(await page.locator('#btnToggleKey').isDisabled(), false);
        await page.evaluate(() => toggleAnswerKey());
        assert.ok(await page.locator('.print-ans-text, .mc-circle-ans, [fill="#d00000"]').count() > 0);
        await page.evaluate(() => selectVariant('official'));
        assert.equal(await page.locator('.official-source-image').count(), 3, 'returning from visible mock key must restore original blank pages');
      }
      const distinct = await page.evaluate(lv => JSON.stringify(buildExamData(lv, 'random', 3001).pagesKey) !== JSON.stringify(buildExamData(lv, 'random', 7777).pagesKey), level);
      assert.equal(distinct, true);
      evidence.push({ level, pages: 3, originalPdf: 'PASS', sourceImages: 'PASS', printLayout: 'PASS', mockAndRandom: 'PASS' });
    }
    // Original download must be usable in a real browser, not merely correct in memory.
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#btnDownloadOfficial').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'DSPF-Piano-8-Practice.pdf');
    await download.saveAs(path.join(root, 'tmp/official-audit/downloaded.pdf'));
    assert.deepEqual(fs.readFileSync(path.join(root, 'tmp/official-audit/downloaded.pdf')), fs.readFileSync(path.join(root, 'official_reference_pdfs/DSPF-Piano-8-Practice.pdf')));
    // Replace only the OS print-dialog boundary, exercising the real print handler.
    const printState = await page.evaluate(async () => {
      const printed = [];
      window.print = () => printed.push([...document.querySelectorAll('.official-source-image')].map(img => img.complete && img.naturalWidth > 0));
      await printDspfExam(true);
      const blockedKeyCalls = printed.length;
      await printDspfExam(false);
      return { blockedKeyCalls, printed };
    });
    assert.deepEqual(printState, { blockedKeyCalls: 0, printed: [[true, true, true]] }, 'print action waits for all source images and refuses a mismatched key');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => selectLevel('4'));
    await page.waitForFunction(() => [...document.querySelectorAll('.official-source-image')].every(img => img.complete));
    assert.equal(await page.locator('.official-source-image').count(), 3);
    assert.deepEqual(errors, [], 'browser JavaScript errors');
    fs.writeFileSync(path.join(root, `tmp/official-audit/${protectedMode ? 'protected' : 'source'}-results.json`), JSON.stringify(evidence, null, 2));
    console.log(`PASS: ${protectedMode ? 'encrypted build' : 'source'}, 9 levels, 27 source pages, exact PDF downloads, print layout, answer guards, mock/random regressions, mobile viewport; no JavaScript errors.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
