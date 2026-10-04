import assert from 'node:assert/strict';
// Validate the game encoder against samples produced by Composite Lab's Metal
// game-export engine, including the route's causal base latency.
import {readFileSync} from 'node:fs';
import {GAME_SIGNAL,gameSignalClock} from '../analog.js';
const directory=process.argv[2]||new URL('./fixtures/',import.meta.url).pathname;
const nativeLine=JSON.parse(readFileSync(`${directory}/game-signal-line.json`));
const us=GAME_SIGNAL.sampleRate/1e6;
for(let x=0;x<910;x++){
 const sx=(x-32+910)%910;
 if(sx>=9.4*us&&sx<9.4*us+52.655*us)continue; // source picture tested by native image tests
 const expected=sx<4.7*us?-2/7:sx>=5.3*us&&sx<5.3*us+36?-Math.cos((x-32)*Math.PI/2)/7:0;
 assert(Math.abs(nativeLine[x]-expected)<1e-5,`Metal/game waveform disagreement at sample ${x}`);
}
assert(Math.abs(GAME_SIGNAL.sampleRate/910-15734.265734265734)<1e-8);
console.log('Passed sample-by-sample Metal/game sync, burst, blanking, carrier phase, and base latency agreement.');

// Uneven display redraws must never phase-shift an otherwise identical interferer.
const period=910*480/GAME_SIGNAL.sampleRate;
for(const elapsed of [0,.005,.016,.03,.031,.047,.06,.061,.117,1.234]) {
 const clock=gameSignalClock(100+elapsed,100);
 assert.equal(clock.frame,Math.floor(elapsed/period));
 const recordedOffset=(clock.time-100)*GAME_SIGNAL.sampleRate;
 assert(Math.abs(recordedOffset-clock.frame*910*480)<1e-6,'display draw jitter leaked into the signal clock');
}
