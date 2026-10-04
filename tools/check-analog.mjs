import assert from 'node:assert/strict';
import {lowPassKernel} from '../analog.js';
const fs=14.31818;
function response(kernel,mhz){
  return Math.hypot(...kernel.reduce((a,w,n)=>[a[0]+w*Math.cos(2*Math.PI*mhz/fs*(n-16)),a[1]+w*Math.sin(2*Math.PI*mhz/fs*(n-16))],[0,0]));
}
for(const cutoff of [1,2.5,4.2]){
  const k=lowPassKernel(cutoff);
  assert(Math.abs(k.reduce((a,b)=>a+b,0)-1)<1e-6,'DC voltage must be preserved');
  assert(response(k,0.06)>0.99,'mains hum must pass the analog bandwidth filter');
}
assert(response(lowPassKernel(1),3.579545)<0.01,'chroma baseband filter rejects carrier');
assert(response(lowPassKernel(2.5),3.579545)<0.01,'luma filter rejects color carrier');
assert(response(lowPassKernel(4.2),6)>0 && response(lowPassKernel(4.2),6)<0.01,'channel rejects out-of-band voltage');
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const phase=x=>(x%4)*Math.PI/2;
const convolve=(a,k)=>a.map((_,x)=>k.reduce((v,w,i)=>v+w*a[Math.max(0,Math.min(a.length-1,x+i-16))],0));
for(const rgb of [[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1],[0.3,0.6,0.8]]){
  const y=dot(rgb,[.299,.587,.114]),i=dot(rgb,[.596,-.274,-.322]),q=dot(rgb,[.211,-.523,.312]);
  const signal=Array.from({length:910},(_,x)=>x<67?-.4:x>=80&&x<112?.2*Math.cos(phase(x)):x>=140&&x<892?.075+.925*(y+i*Math.cos(phase(x))+q*Math.sin(phase(x))):0);
  const received=convolve(signal,lowPassKernel(4.2));
  let run=0,edge=67,locked=false;
  for(let x=0;x<140;x++){
    if(received[x]<-.2)run++;
    else{if(run>=30){edge=x;locked=true;break;}run=0;}
  }
  assert(locked,'clean source must recover sync');assert.equal(edge,67);
  const pedestal=received.slice(edge+53,edge+69).reduce((a,b)=>a+b,0)/16;
  let bc=0,bs=0;
  for(let x=edge+21;x<edge+37;x++){bc+=received[x]*Math.cos(phase(x));bs+=received[x]*Math.sin(phase(x));}
  const burstPhase=Math.atan2(-bs,bc),lk=lowPassKernel(2.5),ck=lowPassKernel(1);
  let dy=0,di=0,dq=0;
  for(let tap=0;tap<33;tap++){
    const x=500+tap-16,v=(received[x]-pedestal-.075)/.925,p=phase(x)+burstPhase;
    dy+=v*lk[tap];di+=v*2*Math.cos(p)*ck[tap];dq+=v*2*Math.sin(p)*ck[tap];
  }
  const decoded=[dy+.956*di+.621*dq,dy-.272*di-.647*dq,dy-1.106*di+1.703*dq];
  assert(Math.max(...decoded.map((v,n)=>Math.abs(v-rgb[n])))<0.025,`color round-trip error: ${rgb} -> ${decoded}`);
}
console.log('Passed FIR DC/passband/rejection checks, clean sync recovery, and six color round trips (error <2.5%).');
