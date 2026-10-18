const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/accidental-audit');fs.mkdirSync(out,{recursive:true});
const protectedMode=process.argv.includes('--protected');
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,protectedMode?'index.html':'app_source.html')));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:2});
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    if(protectedMode){const script=fs.readFileSync(path.join(root,'set_api_key.ps1'),'utf8');const key=script.match(/\[string\]\$ApiKey\s*=\s*"([^"]+)"/)[1];await page.locator('#apiKeyInput').fill(key);await page.locator('#unlockSubmitBtn').click();await page.waitForSelector('#levelSelectorBar button');}
    const problems=[],cases=[];
    // Literal staff-pitch fixtures exercise line/space placement, adjacent
    // flattened thirds, seconds with displaced heads, and a beamed accidental.
    const fixture=await page.evaluate(()=>{
      const host=document.createElement('div');host.id='accidental-fixtures';host.style='background:white;padding:24px;color:black';
      function svg(content){return `<svg width="680" height="140" viewBox="0 0 680 140">${content}</svg>`;}
      let html='';const targets=[];
      for(const clef of ['treble','bass']){
        const base=drawSingleStaffBaseSVG(680,30,8.2,clef,true).svg;
        html+=svg(base+drawKeySigOnStaffSVG(clef,'b',7,80,30,8.2));
        const positions=clef==='treble'?[6,9,5,8,4,7,3]:[-8,-5,-9,-6,-10,-7,-11];
        targets.push(positions.map(p=>clef==='treble'?62.8-(p-2)*4.1:30-(p+2)*4.1));
      }
      html+=svg(drawPitchedItemOnStaffSVG({dur:'q',chordPositions:[{pos:2,acc:'b'},{pos:4,acc:'b'},{pos:6,acc:'b'}]},150,'treble',40,100,8.2));
      html+=svg(drawPitchedItemOnStaffSVG({dur:'q',chordPositions:[{pos:2,acc:'b'},{pos:3,acc:'b'},{pos:5,acc:'b'}]},150,'treble',40,100,8.2));
      html+=svg(drawPitchedItemOnStaffSVG({dur:'88',positions:[{pos:4,acc:'b'},{pos:5,acc:'#'}]},150,'treble',40,100,8.2));
      html+=svg(drawPitchedItemOnStaffSVG({dur:'q',chordPositions:[{pos:2,acc:'x'},{pos:4,acc:'x'}]},150,'treble',40,100,8.2));
      host.innerHTML=html;document.body.append(host);
      const faults=[];
      const row=document.createElement('div');
      row.innerHTML=renderKeySignaturesRowBlock({num:5,prompt:'Clef changes',exampleItem:{clef:'treble',accType:'b',count:2,maj:'B-flat'},items:[{clef:'bass',accType:'b',count:4,maj:'A-flat'},{clef:'treble',accType:'b',count:3,maj:'E-flat'}]},false);
      const clefs=[...row.querySelectorAll('svg text')].map(t=>t.textContent).filter(t=>['𝄞','𝄢'].includes(t));
      if(JSON.stringify(clefs)!==JSON.stringify(['𝄞','𝄢','𝄞']))faults.push('key-signature row must show each change back to treble as well as bass');
      [...host.querySelectorAll('svg')].slice(0,2).forEach((s,staff)=>{
        [...s.querySelectorAll('text')].filter(t=>t.textContent==='♭').forEach((t,i)=>{
          const baseline=Number(t.getAttribute('y')),pitch=targets[staff][i];
          // Independently measured Segoe UI Symbol flat hollow: -4.8098..-.4351
          // relative to baseline at 16.5px; bowl silhouette: -5.5994..0.
          if(Math.abs(baseline-2.62245-pitch)>.15)faults.push(`${staff}/${i}: flat hollow misses its staff pitch`);
          const onSpace=Math.abs((pitch-30)/8.2-Math.round((pitch-30)/8.2))>.1;
          if(onSpace && (baseline-5.5994<pitch-4.1+.35 || baseline>pitch+4.1-.35))faults.push(`${staff}/${i}: flat bowl spills out of the space`);
        });
      });
      [...host.querySelectorAll('svg')][5].querySelectorAll('text').forEach((t,i)=>{
        if(t.textContent==='𝄪' && Math.abs(Number(t.getAttribute('y'))-8.06299-[72.8,64.6][i])>.15)faults.push('double sharp must be centered on its note pitch');
      });
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      function ink(t){const style=getComputedStyle(t);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const m=ctx.measureText(t.textContent),x=Number(t.getAttribute('x')),y=Number(t.getAttribute('y'));const matrix=t.getScreenCTM();const a=new DOMPoint(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent).matrixTransform(matrix),b=new DOMPoint(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent).matrixTransform(matrix);return {left:a.x,right:b.x,top:a.y,bottom:b.y};}
      const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
      for(const [i,s]of [...host.querySelectorAll('svg')].entries()){
        const glyphs=[...s.querySelectorAll('text')].filter(t=>/^[♭♯♮𝄪]+$/u.test(t.textContent)).map(ink);
        const heads=[...s.querySelectorAll('ellipse')].filter(e=>Number(e.getAttribute('rx'))>=4&&Number(e.getAttribute('rx'))<=7).map(e=>e.getBoundingClientRect());
        glyphs.forEach((g,j)=>{
          if(heads.some(h=>overlaps(g,h,2.5)))faults.push(`fixture ${i}/${j}: accidental lacks clearance from a notehead`);
          if(glyphs.slice(j+1).some(h=>overlaps(g,h,1)))faults.push(`fixture ${i}/${j}: accidentals overlap instead of staggering`);
        });
      }
      return faults;
    });
    problems.push(...fixture);
    await page.locator('#accidental-fixtures').screenshot({path:path.join(out,'fixtures.png'),animations:'disabled'});
    await page.evaluate(()=>document.getElementById('accidental-fixtures').remove());
    for(const level of ['P','1','2','3','4','5','6','7','8'])for(const seed of level==='4'?[2002,7777,...Array.from({length:28},(_,i)=>3001+i)]:[2002,3001,7777])for(const key of [false,true]){
      await page.evaluate(({level,seed,key})=>{selectLevel(level);selectVariant('random');currentExamData=buildExamData(level,'random',seed);isAnswerKeyVisible=key;renderDspfPages(key);},{level,seed,key});
      const faults=await page.evaluate(()=>{
        const ctx=document.createElement('canvas').getContext('2d'),faults=[];
        for(const svg of document.querySelectorAll('.generated-page svg')){
          const texts=[...svg.querySelectorAll('text')].filter(t=>/^[♭♯♮𝄪]+$/u.test(t.textContent));
          const glyphs=texts.map(t=>{const style=getComputedStyle(t);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const m=ctx.measureText(t.textContent),x=Number(t.getAttribute('x')),y=Number(t.getAttribute('y')),mat=t.getScreenCTM();const a=new DOMPoint(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent).matrixTransform(mat),b=new DOMPoint(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent).matrixTransform(mat);return {left:a.x,right:b.x,top:a.y,bottom:b.y};});
          const heads=[...svg.querySelectorAll('ellipse')].filter(e=>Number(e.getAttribute('rx'))>=4&&Number(e.getAttribute('rx'))<=7).map(e=>e.getBoundingClientRect());
          const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
          glyphs.forEach((g,i)=>{
            if(heads.some(h=>overlaps(g,h,2)))faults.push(`Q${svg.closest('[data-question]').dataset.question}: accidental lacks 2px of notehead clearance`);
            if(glyphs.slice(i+1).some(h=>overlaps(g,h,1)))faults.push(`Q${svg.closest('[data-question]').dataset.question}: accidentals lack clear separation`);
          });
        }
        return faults;
      });
      cases.push({level,seed,key,faults});
      if(faults.length)problems.push(`${level}/${seed}/${key?'key':'blank'}: ${faults.join('; ')}`);
      if(level==='4'&&seed===7777)for(const number of ['1','2','3','4','5'])await page.locator(`[data-question="${number}"]`).screenshot({path:path.join(out,`level4-q${number}-${key?'key':'blank'}.png`),animations:'disabled'});
    }
    fs.writeFileSync(path.join(out,`${protectedMode?'protected':'source'}-results.json`),JSON.stringify({fixture,cases,problems},null,2));
    console.log(JSON.stringify({cases:cases.length,problems},null,2));assert.deepEqual(problems,[]);
    console.log('PASS: line/space flat anchors, clef changes, accidental-note clearance, staggered chords, and 108 generated blank/key exams across nine levels.');
    await page.close();
  }finally{server.closeAllConnections();server.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
