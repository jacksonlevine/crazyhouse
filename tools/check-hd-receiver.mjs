import assert from 'node:assert/strict';
import {HDReceiver,HD_SIGNAL as S} from '../hd-receiver.js';
const L=S.samplesPerLine,H=S.linesPerFrame+2*S.guard;
function metadata(frame,{vertical=0,missing=false,dc=0}={}){
 const pixels=new Float32Array(H*8);
 for(let row=0;row<H;row++){
  const line=((row-S.guard-vertical)%S.linesPerFrame+S.linesPerFrame)%S.linesPerFrame;
  const broad=line<6,edge=31.5,index=((H-1-row)*2)*4;
  pixels.set([broad||missing?-1:edge,broad?1:0,-2/7+dc,dc],index);
  const phase=(row*L+edge)*Math.PI/2+frame*Math.PI+Math.PI;
  pixels.set([Math.cos(phase),Math.sin(phase),broad?0:.1,-2/7+dc],index+4);
 }
 return pixels;
}
const receiver=new HDReceiver(),clean=receiver.recover(metadata(0),{frame:0}).slice();
for(let row=0;row<S.height;row++){
 assert(Math.abs(clean[row*4]-((S.guard+S.firstActive+row)*L+32))<.02,'sample-center timing lost');
 assert(Math.abs(clean[row*4+1]-(row%2?-1:1))<1e-5,'burst/carrier phase lost');
 assert(Math.abs(clean[row*4+2])<.001);
}
assert(receiver.sliceValid);
assert.deepEqual(receiver.recover(metadata(0),{frame:0}),clean,'display redraw advanced the analog clock');
const next=receiver.recover(metadata(1),{frame:1});assert(Math.abs(next[1]+1)<1e-5,'frame carrier inversion lost');
const skipped=receiver.recover(metadata(4),{frame:4});assert(Math.abs(skipped[1]-1)<1e-5,'missed-frame carrier phase lost');
const hold=receiver.recover(metadata(5,{missing:true}),{frame:5});
assert([...hold].every(Number.isFinite),'missing horizontal sync broke free-running receiver');
const shifted=new HDReceiver().recover(metadata(0,{vertical:2,dc:.05}),{frame:0});
assert(Math.abs(shifted[0]-((S.guard+2+S.firstActive)*L+32))<.02,'vertical sync was ignored');
assert(Math.abs(shifted[3]-.05)<1e-6,'back-porch clamp was ignored');
const noBurst=metadata(0);for(let row=0;row<H;row++)noBurst[((H-1-row)*2+1)*4+2]=0;
const killed=new HDReceiver().recover(noBurst,{frame:0});
assert([...killed].every(Number.isFinite));
for(let row=0;row<S.height;row++){assert.equal(Math.abs(killed[row*4+1]),0);assert.equal(Math.abs(killed[row*4+2]),0);}
console.log('Passed HD sample-center timing, burst lock, repeated refresh, missed frames, absent sync, vertical acquisition, and DC clamp.');
