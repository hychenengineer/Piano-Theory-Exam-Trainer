const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root=path.resolve(__dirname,'..'), output=path.join(root,'tmp/level4-guide-update');
const protectedMode=process.argv.includes('--protected');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,protectedMode?'index.html':'app_source.html')));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],exams=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1100}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    if(protectedMode){
      const script=fs.readFileSync(path.join(root,'set_api_key.ps1'),'utf8');
      const key=script.match(/\[string\]\$ApiKey\s*=\s*"([^"]+)"/)[1];
      await page.locator('#apiKeyInput').fill(key);await page.locator('#unlockSubmitBtn').click();
    }
    await page.locator('#levelSelectorBar button').filter({hasText:/^Level 4$/}).click();
    // Reproduce two different RNG inputs through the actual UI. This keeps the
    // evidence repeatable and avoids treating a legitimate repeated subset as
    // a flaky failure (six terms are sampled from a pool of ten).
    await page.evaluate(()=>{const draws=[.210123,.780456,.410789];Math.random=()=>draws.shift()??.630123;});
    await page.locator('#btnVarRandom').click();
    for(const label of ['A','B']){
      if(label==='B')await page.locator('#btnRollNewRandom').click();
      const raw=await page.evaluate(()=>currentExamData.raw);exams.push(raw);
      assert.equal(raw.q1.notes.length,10);
      assert.equal(new Set([raw.q1.exampleNote,...raw.q1.notes].map(n=>n.pos)).size,11,'Q1 pitches never repeat even with different accidentals or clefs');
      fs.writeFileSync(path.join(output,`exam-${label}-raw.json`),JSON.stringify(raw,null,2));
      for(const key of [false,true]){
        if(key)await page.locator('#btnToggleKey').click();
        const matching=page.locator('[data-question="9"]');
        await matching.getByText('example:',{exact:true}).waitFor({state:'visible'});
        const answers=await matching.locator('.print-underline').allTextContents();
        assert.equal(answers.length,6);
        assert.equal(answers[0].trim(),raw.q9.rightItems[0].ans,'the example is filled on the exam itself');
        assert.deepEqual(answers.slice(1).map(x=>x.trim()),key?raw.q9.rightItems.slice(1).map(x=>x.ans):Array(5).fill(''),'blank exam keeps five unanswered matches; key reveals them');
        const geometry=await page.evaluate(()=>{
          const q8=document.querySelector('[data-question="8"]');
          const caption=q8.querySelector('.barline-example-caption'),melody=q8.querySelector('svg');
          const arrow=q8.querySelector('.barline-example-arrow'),bar=q8.querySelector('.example-barline');
          if(!caption||!melody||!arrow||!bar)return {missingExampleGeometry:true};
          const c=caption.getBoundingClientRect();
          const melodyBottom=Math.max(...[...melody.querySelectorAll('.barline-melody')].map(x=>x.getBoundingClientRect().bottom));
          const q7=document.querySelector('[data-question="7"]');
          const mcArrow=q7.querySelector('.rhythm-example-arrow'),mcBox=q7.querySelector('.rhythm-example-box');
          return {
            captionGap:c.top-melodyBottom,
            captionFont:Number.parseFloat(getComputedStyle(caption).fontSize),
            arrowX:Number(arrow.getAttribute('x2')),arrowY:Number(arrow.getAttribute('y2')),
            barX:Number(bar.getAttribute('x1')),barBottom:Number(bar.getAttribute('y2')),
            mcArrowX:mcArrow?Number(mcArrow.getAttribute('x2')):null,mcArrowY:mcArrow?Number(mcArrow.getAttribute('y2')):null,
            mcBoxCenter:mcBox?Number(mcBox.getAttribute('x'))+Number(mcBox.getAttribute('width'))/2:null,
            mcBoxBottom:mcBox?Number(mcBox.getAttribute('y'))+Number(mcBox.getAttribute('height')):null,
            slots:[...document.querySelectorAll('.generated-question-slot')].map(slot=>({q:slot.dataset.question,scale:Number(slot.dataset.scale),fits:slot.firstElementChild.getBoundingClientRect().bottom<=slot.getBoundingClientRect().bottom+1})),
          };
        });
        assert.ok(!geometry.missingExampleGeometry,'example text and arrow need measurable, separate geometry');
        assert.ok(geometry.captionGap>=8,'example caption must stay below all notes and stems');
        assert.ok(geometry.captionFont>=10 && geometry.captionFont<=11,'example font must remain readable without covering the notes');
        assert.equal(geometry.arrowX,geometry.barX,'arrow must point to the first demonstrated barline');
        assert.equal(geometry.arrowY,geometry.barBottom+2);
        assert.equal(geometry.mcArrowX,geometry.mcBoxCenter,'rhythm example arrow points to the answer box');
        assert.equal(geometry.mcArrowY,geometry.mcBoxBottom);
        geometry.slots.forEach(slot=>{assert.ok(slot.fits,`Q${slot.q} fits its page slot`);assert.ok(slot.scale>=.8,`Q${slot.q} remains readable`);});
        fs.writeFileSync(path.join(output,`exam-${label}-${key?'key':'blank'}-geometry.json`),JSON.stringify(geometry,null,2));
        for(let p=0;p<3;p++)await page.locator('.dspf-page').nth(p).screenshot({path:path.join(output,`exam-${label}-${key?'key':'blank'}-page-${p+1}.png`),animations:'disabled'});
        await page.pdf({path:path.join(output,`exam-${label}-${key?'key':'blank'}.pdf`),preferCSSPageSize:true});
      }
      await page.locator('#btnToggleKey').click();
    }
    for(const q of ['q4','q8'])assert.notEqual(JSON.stringify(exams[0][q]),JSON.stringify(exams[1][q]),`${q}: musical content changes when Generate New Random Exam is clicked`);
    assert.notEqual(JSON.stringify(exams[0].q9.leftItems.map(x=>x.term).sort()),JSON.stringify(exams[1].q9.leftItems.map(x=>x.term).sort()),'Q9 samples a new vocabulary selection in these two exams');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#btnRollNewRandom').click();
    assert.equal(await page.locator('.dspf-page').count(),3);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,`${protectedMode?'protected':'source'}-browser-result.json`),JSON.stringify({errors,exams:2,states:4,pages:12,mobileViewport:true},null,2));
    console.log(`PASS: ${protectedMode?'protected':'source'} browser, two Level 4 random exams, blank/key pages, example clearance and arrow targets, fresh Q4/Q8/Q9 content, mobile viewport.`);
    await page.close();
  }finally{
    server.closeAllConnections();server.close();
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
