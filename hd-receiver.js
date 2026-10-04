// Custom progressive analog HD: a distinct signal format, not NTSC.
export const HD_SIGNAL=Object.freeze({width:1920,height:1080,samplesPerLine:2402,linesPerFrame:1125,guard:32,firstActive:40,activeStart:192,activeSamples:1920,syncSamples:64,burstStart:80,burstSamples:36,porchStart:156,baseDelaySamples:32,frameRate:60,sampleRate:2402*1125*60,lumaMHz:65,chromaMHz:30});
export class HDReceiver {
 constructor(){this.period=HD_SIGNAL.samplesPerLine;this.anchor=32;this.vertical=0;this.phase=0;this.slice=-1/7;this.sliceValid=false;this.initialized=false;this.lastFrame=null;this.frameStart=null;this.rows=new Float32Array(HD_SIGNAL.height*4);}
 recover(pixels,p={}){
  const s=HD_SIGNAL,L=s.samplesPerLine,H=s.linesPerFrame+2*s.guard,frame=p.frame??0;
  const keys=['period','anchor','vertical','phase','slice','sliceValid','initialized'];
  if(frame===this.lastFrame)Object.assign(this,this.frameStart);
  else{
   if(this.lastFrame!==null&&frame>this.lastFrame+1){const n=frame-this.lastFrame-1;this.phase+=n*Math.PI;this.anchor+=n*s.linesPerFrame*(this.period-L);}
   this.frameStart=Object.fromEntries(keys.map(k=>[k,this[k]]));this.lastFrame=frame;
  }
  const at=(row,column,k)=>pixels[((H-1-row)*2+column)*4+k];
  const edge=row=>at(row,0,0),vertical=row=>at(row,0,1)>.5;
  const natural=L/(1+(p.holdPPM??0)*1e-6),tracking=p.tracking??.8;
  let period=this.initialized?this.period:natural;period+=(natural-period)*.002;
  let origin=s.guard+this.vertical,best=32;
  for(let row=1;row<H-5;row++)if(vertical(row)&&!vertical(row-1)&&vertical(row+1)&&vertical(row+2)&&vertical(row+3)){
   const distance=Math.abs(row-origin);if(distance<best){origin=row;best=distance;}
  }
  let prediction=s.guard*L+this.anchor;
  prediction+=Math.round((origin*L-prediction)/period)*period;
  let phaseBase=this.phase,tip=0,porch=0,measured=0;
  const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
  for(let line=0;line<s.firstActive+s.height;line++){
   const expectedRow=Math.floor(prediction/L);let observed=-1,chosen=Math.max(0,Math.min(H-1,expectedRow)),distance=.45*L;
   for(let r=Math.max(0,expectedRow-1);r<=Math.min(H-1,expectedRow+1);r++){
    const x=edge(r);if(x<0)continue;const candidate=r*L+x,d=Math.abs(candidate-prediction);
    if(d<distance){observed=candidate;chosen=r;distance=d;}
   }
   const error=observed<0?0:observed-prediction,position=prediction+error*tracking;
   if(observed>=0)period=Math.max(.99*L,Math.min(1.01*L,period+error*.001*tracking));
   const amplitude=at(chosen,1,2),sampleEdge=chosen*L+(edge(chosen)<0?32:edge(chosen));
   const observedPhase=Math.atan2(at(chosen,1,1),at(chosen,1,0))-Math.PI+2*Math.PI*(position-sampleEdge)/4;
   let phase=wrap(phaseBase+2*Math.PI*(position%4)/4);
   if(amplitude>.012){const correction=(p.colorTracking??.5)*wrap(observedPhase-phase);phaseBase=wrap(phaseBase+correction);phase=wrap(phase+correction);}
   const dc=p.clamp===false?0:at(chosen,0,3),t=Math.max(0,Math.min(1,(amplitude-.012)/(.035-.012))),killer=p.colorKiller===false?1:t*t*(3-2*t);
   // Sync slicing locates the transition between samples; active video starts at sample centers.
   if(line>=s.firstActive)this.rows.set([position+.5,Math.cos(phase+Math.PI/4)*killer,Math.sin(phase+Math.PI/4)*killer,dc],(line-s.firstActive)*4);
   if(observed>=0&&line>=s.firstActive){tip+=at(chosen,1,3);porch+=at(chosen,0,3);measured++;}
   prediction=position+period;
  }
  if(measured>50){const depth=(porch-tip)/measured;if(depth>.04){const target=porch/measured-.5*depth;this.slice=this.sliceValid?this.slice+.5*(target-this.slice):target;this.sliceValid=true;}else this.sliceValid=false;}
  const next=prediction+Math.round(((s.guard+s.linesPerFrame)*L-prediction)/period)*period;
  this.period=period;this.anchor=next-(s.guard+s.linesPerFrame)*L;this.vertical=origin-s.guard+s.linesPerFrame*(period-L)/L;
  this.phase=wrap(phaseBase+Math.PI);this.initialized=true;
  return this.rows;
 }
}
