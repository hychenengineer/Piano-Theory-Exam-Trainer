const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const s = fs.readFileSync('app_source.html', 'utf8'), c = vm.createContext({});
vm.runInContext(s.slice(s.indexOf('// MATHEMATICAL MUSIC THEORY ENGINE'), s.indexOf('// INTERACTIVE STATE & UI RENDERING')), c);
// Independent quarter-note durations, including triplets and mixed beam groups.
const durations = {w:4,h:2,hd:3,hdd:3.5,q:1,qd:1.5,'8':.5,'8d':.75,'16':.25,'32':.125,wr:4,hr:2,hdr:3,qr:1,qdr:1.5,'8r':.5,'8dr':.75,'16r':.25,'88':1,'888':1.5,'8888':2,'16x4':1,'1616':.5,'8t':1,'16t':.5,'8d_16':1,'8_1616':1,'1616_8':1,'8d_16_8':1.5,'8d_1616':1.25,'32_32':.25,'32_32_16':.5,'16d_32_8':1,'32x4_1616':1,'32x4_16':.75,'8_16x4':1.5};
const sum = notes => notes.reduce((total,n) => {const sym=typeof n==='string'?n:n.dur;assert.ok(sym in durations,sym);return total+durations[sym];},0);
const capacity = ts => typeof ts==='string'?4:ts[0]*4/ts[1];
const errors=[];
for(const level of ['P','1','2','3','4','5','6','7','8']) for(const variant of ['mockA','random']) {
 const exam=c.buildExamData(level,variant,3001);
 for(const q of Object.values(exam.raw)) {
  for(const [i,line] of (q.lines||[]).entries()) {
   if(line.options) {
    const target=q.prompt.includes('same number')?sum(line.given):capacity(line.timeSig)-sum(line.given);
    const matches=line.options.map((o,i)=>Math.abs(sum(o)-target)<.000001?i:-1).filter(i=>i>=0);
    if(matches.length!==1||matches[0]!==line.ansIdx) errors.push(`${level}/${variant}/Q${q.num}/row${i}: wrong or ambiguous rhythm answer`);
   }
  }
  if(q.source) for(const name of ['source','target']) for(const [i,m] of q[name].measures.entries()) for(const voice of ['notes','treble','bass']) {
   if(m[voice]&&Math.abs(sum(m[voice])-capacity(q[name].timeSig))>.000001)errors.push(`${level}/${variant}/Q${q.num}/${name}/bar${i}/${voice}: invalid bar duration`);
  }
 }
}
console.log(errors.join('\n'));
assert.deepEqual(errors,[]);
console.log('PASS: every generated rhythm choice has exactly one correct answer; all transposition bars match their time signatures.');
