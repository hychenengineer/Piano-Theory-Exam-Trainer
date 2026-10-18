const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app_source.html'), 'utf8');
const c = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('// MATHEMATICAL MUSIC THEORY ENGINE'), source.indexOf('// INTERACTIVE STATE & UI RENDERING')), c);

// Independent quarter-note values and staff pitches: do not use generator helpers
// to compute expected bar lengths or the transposition answer.
const beats = { w:4, h:2, hd:3, q:1, qd:1.5, '8':.5, '8d':.75, '16':.25, '88':1, '888':1.5, '8d_16':1, '16x4':1, qr:1, hr:2, '8r':.5, '16r':.25 };
const length = notes => notes.reduce((n,x) => { assert.ok(x.dur in beats, x.dur); return n+beats[x.dur]; },0);
const pitchNumber = p => Math.floor(p/7)*12+[0,2,4,5,7,9,11][((p%7)+7)%7];
const offsets = {'':0,n:0,'#':1,b:-1};
const pitches = items => items.flatMap(item => /r$/.test(item.dur) ? [] : (item.positions || item.beamPositions || [item]).map(p=>typeof p==='number'?{pos:p}:p));
const effectivePitches = (items,key) => {
  const active = new Map();
  return pitches(items).map(n=>{
    if(n.acc) active.set(n.pos,offsets[n.acc]);
    const offset=active.has(n.pos)?active.get(n.pos):(((n.pos%7)+7)%7===6 && key==='F'?-1:0);
    return {pos:n.pos,semitone:pitchNumber(n.pos)+offset};
  });
};
const durations = items => items.flatMap(n => n.dur==='8d_16'?[.75,.25]:(n.positions||n.beamPositions)?Array((n.positions||n.beamPositions).length).fill(beats[n.dur]/(n.positions||n.beamPositions).length):[beats[n.dur]]);
function hasSyncopation(items,pulse) {
  let at=0, found=false;
  for(const n of items){
    const parts=durations([n]);
    for(const d of parts){
      if(!/r$/.test(n.dur) && at%pulse!==0 && Math.floor((at+1e-6)/pulse)<Math.floor((at+d-1e-6)/pulse)) found=true;
      at+=d;
    }
  }
  return found;
}
const vocabulary = new Map([
  ['con moto','with motion'],['non troppo','not too much'],['simile','continue in the same manner as the preceding music'],
  ['subdominant note','the fourth note of a scale'],['dominant note','the fifth note of a scale'],
  ['alla breve','cut time: two half-note beats per measure'],['cantabile','in a singing style'],
  ['leggiero','lightly and delicately'],['largo','very slow and broad'],['vivace','lively and quick']
]);
const problems=[];
function check(label,fn){try{fn();}catch(e){if(problems.length<25)problems.push(`${label}: ${e.message}`);}}
const unique={q4:new Set(),q8:new Set(),q9:new Set()}, seenTerms=new Set();
for(const variant of ['mockA','random']) for(let seed=3001;seed<3201;seed++){
  const {raw}=c.buildExamData('4',variant,seed);
  const tag=`${variant}/${seed}`;
  check(`${tag}/Q1 no repeated natural pitches`,()=>{
    assert.equal(raw.q1.notes.length,10,'keep ten answer spaces');
    const notes=[raw.q1.exampleNote,...raw.q1.notes];
    assert.equal(new Set(notes.map(n=>n.pos)).size,11,'ignore accidentals and clef when rejecting repeated pitches, including the example');
  });
  const q4=raw.q4;
  check(`${tag}/Q4 bass single notes`,()=>{
    for(const side of ['source','target']) for(const m of q4[side].measures){
      assert.ok(m.bass.length>=2 && m.bass.length<=3,'every bar needs 2-3 bass notes');
      for(const n of m.bass){assert.equal(typeof n.pos,'number');assert.ok(!n.chordPositions && !n.positions && !n.beamPositions && !/r$/.test(n.dur),'bass must contain single notes only');}
    }
  });
  check(`${tag}/Q4 meter and transposition`,()=>{
    assert.equal(q4.source.measures.length,4);assert.equal(q4.target.measures.length,4);
    assert.equal(q4.source.keySig.count,0);assert.equal(q4.target.keySig.accType,'b');assert.equal(q4.target.keySig.count,1);
    for(let i=0;i<4;i++) for(const voice of ['treble','bass']){
      const src=q4.source.measures[i][voice],dst=q4.target.measures[i][voice];
      assert.equal(length(src),4);assert.equal(length(dst),4);
      assert.equal(JSON.stringify(src.map(n=>n.dur)),JSON.stringify(dst.map(n=>n.dur)),'answer preserves rhythm and rests');
      const a=effectivePitches(src,'C'), b=effectivePitches(dst,'F');
      assert.equal(a.length,b.length);
      for(let j=0;j<a.length;j++) {assert.equal(b[j].pos-a[j].pos,-4);assert.equal(b[j].semitone-a[j].semitone,-7,'answer must transpose every sounding pitch by exactly seven semitones');}
    }
  });
  check(`${tag}/Q4 rhythm requirements`,()=>{
    const bars=q4.source.measures.map(m=>m.treble);
    assert.ok(bars.some(m=>m.some((n,i)=>n.dur==='qd' && m[i+1]?.dur==='8')),'include dotted-quarter + eighth (two beats)');
    assert.ok(bars.some(m=>m.some(n=>n.dur==='8d_16')),'include dotted-eighth + sixteenth (one beat)');
    assert.ok(bars.some(m=>hasSyncopation(m,1)),'include actual offbeat syncopation');
    for(const side of ['source','target']){
      const all=q4[side].measures.flatMap(m=>[...m.treble,...m.bass]);
      assert.ok(all.filter(n=>/r$/.test(n.dur)).length<=3,'at most three rests in the whole passage');
      const accs=pitches(all).filter(p=>p.acc);
      assert.ok(accs.length<=2,'at most two printed accidentals in the whole passage');
      assert.ok(accs.every(p=>['#','b','n'].includes(p.acc)),'no double accidentals');
    }
  });
  check(`${tag}/Q8 rhythm requirements`,()=>{
    assert.equal(raw.q8.lines.length,2);
    for(const line of raw.q8.lines){
      const cap=typeof line.timeSig==='string'?4:line.timeSig[0]*4/line.timeSig[1];
      for(const measure of line.measures) assert.equal(length(measure),cap,'every bar matches its time signature');
      assert.ok(line.measures.some(m=>m.some(n=>['qd','8d','8d_16'].includes(n.dur))),'each line includes a dotted rhythm');
      assert.ok(line.measures.some(m=>hasSyncopation(m,cap===3?1.5:1)),'each line includes syncopation across its beat');
    }
  });
  check(`${tag}/Q9 guide vocabulary`,()=>{
    const q=raw.q9;assert.equal(q.leftItems.length,6);assert.equal(q.rightItems.length,6);
    assert.equal(new Set(q.leftItems.map(x=>x.term)).size,6,'no repeated terms');
    const byLetter=new Map(q.leftItems.map(x=>[x.letter,x.term]));
    assert.equal(new Set(q.rightItems.map(x=>x.ans)).size,6,'each answer letter is used once');
    for(const row of q.rightItems){
      const term=byLetter.get(row.ans);assert.ok(vocabulary.has(term),`${term} must come from the guide`);
      assert.equal(row.def,vocabulary.get(term),'definition must match its answer letter');seenTerms.add(term);
    }
  });
  check(`${tag}/Q9 example printed on blank exam`,()=>{
    const q=raw.q9;
    assert.equal(q.rightItems.filter(row=>row.isExample).length,1,'exactly one completed example');
    assert.equal(q.rightItems[0].isExample,true,'the first definition is the example');
    const html=c.renderTextMatchingBlock(q,false);
    assert.match(html,/example:/,'label the completed row directly on the exam');
    const answers=[...html.matchAll(/<span class="print-underline"[^>]*>(.*?)<\/span>/g)].map(m=>m[1]);
    assert.equal(answers.length,6);
    assert.equal(answers[0],`<b>${q.rightItems[0].ans}</b>`,'the example has its correct matching letter filled in');
    assert.ok(answers.slice(1).every(text=>text==='&nbsp;'),'the other five answers remain blank');
  });
  for(const q of Object.keys(unique))unique[q].add(JSON.stringify(q==='q9'?raw[q].leftItems.map(x=>x.term).sort():raw[q]));
}
check('vocabulary coverage',()=>assert.equal(seenTerms.size,10,'all ten Level 4 piano terms are reachable'));
for(const q of Object.keys(unique))check(`${q} random content`,()=>assert.ok(unique[q].size>20,`${q} needs varied content, not only shuffled answers`));
console.log(JSON.stringify({cases:400,unique:Object.fromEntries(Object.entries(unique).map(([q,s])=>[q,s.size])),vocabularyCovered:seenTerms.size,problems},null,2));
assert.deepEqual(problems,[]);
console.log('PASS: 400 Level 4 exams have unique Q1 natural pitches and meet guide vocabulary, rhythm, bass, accidental/rest and exact transposition requirements.');
