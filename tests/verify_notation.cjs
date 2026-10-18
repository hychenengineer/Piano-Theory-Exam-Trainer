const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app_source.html', 'utf8');
const core = source.slice(source.indexOf('// MATHEMATICAL MUSIC THEORY ENGINE'), source.indexOf('// INTERACTIVE STATE & UI RENDERING'));
const context = vm.createContext({});
vm.runInContext(core, context);
const render = item => context.drawPitchedItemOnStaffSVG(item, 100, 'treble', 40, 100, 8);
for (const [duration, positions] of [['88', [5, 6]], ['888', [5, 7, 6]], ['16x4', [5, 8, 6, 7]]]) {
  const svg = render({ dur: duration, positions });
  assert.ok(!/NaN|undefined/.test(svg), `${duration}: every pitch must have finite coordinates`);
  const ys = [...svg.matchAll(/<ellipse[^>]+cy="([^"]+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(ys, positions.map(p => 72 - (p - 2) * 4), `${duration}: render every requested note at its pitch`);
}
const chord = context.drawPitchedItemOnStaffSVG({ dur: 'q', chordPositions: [-7, -5, -3] }, 100, 'bass', 40, 100, 8);
assert.ok(!/NaN|undefined/.test(chord));
assert.deepEqual([...chord.matchAll(/<ellipse[^>]+cy="([^"]+)"/g)].map(m => Number(m[1])), [120, 112, 104]);
assert.equal([...chord.matchAll(/<line x1="([^"]+)" y1="[^"]+" x2="\1"/g)].length, 1, 'chord notes share one stem');
console.log('PASS: pitched beam groups preserve all pitches; numeric chords share one valid stem.');
const voices = context.layoutPitchedMeasure([
  [{ dur: '16x4', positions: [5, 6, 7, 8] }, { dur: 'q', pos: 6 }, { dur: 'h', pos: 4 }],
  [{ dur: 'q', pos: -7 }, { dur: 'q', pos: -5 }, { dur: 'h', pos: -7 }]
], 100, 220);
assert.ok(voices[0][0].item.beamXs[3] + 10 < voices[0][1].x, 'beam group must end before the following note');
assert.equal(voices[0][1].x, voices[1][1].x, 'simultaneous beats align across staves');
assert.equal(voices[0][2].x, voices[1][2].x);
console.log('PASS: beamed groups do not collide with the following note and simultaneous voices align.');
const lowNoteQuestion = context.renderGrandStaffNotesBlock({ num: 1, prompt: 'Name notes', exampleNote: { staff: 'treble', pos: 6, ans: 'B' }, notes: [{ staff: 'bass', pos: -13, ans: 'D' }] }, true);
const lowestHead = Math.max(...[...lowNoteQuestion.matchAll(/<ellipse[^>]+cy="([^"]+)"/g)].map(m => Number(m[1])));
const answerBaseline = Number(lowNoteQuestion.match(/<text[^>]+y="([^"]+)"[^>]+fill="#d00000"/)[1]);
assert.ok(answerBaseline - lowestHead >= 22, 'low bass notes need clear space above answer labels');
console.log('PASS: low ledger notes have independent answer-label clearance.');
for (const level of ['P', '1', '2', '3', '4', '5', '6', '7', '8']) {
  for (const seed of [2002, 3001, 7777, 90001]) {
    for (const q of Object.values(context.buildExamData(level, 'random', seed).raw)) {
      if (q.triads) for (const triad of [q.exampleTriad, ...q.triads]) {
        assert.ok(triad.qual, `Level ${level} Q${q.num}: every triad has a valid quality and complete answer`);
      }
    }
  }
}
console.log('PASS: generated triads have complete quality answers across all levels.');
