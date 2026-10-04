// Progressive adaptation of Composite Lab's receiver. Voltages retain Lab units:
// sync -2/7, blanking 0, white 5/7. This tracks timing; it does not draw effects.
export class CompositeReceiver {
  constructor({width=910,lines=480,guard=144}={}) {
    this.width=width;this.lines=lines;this.guard=guard;
    this.period=width;this.anchor=0;this.phase=0;this.initialized=false;
    this.slice=0;this.sliceValid=false;
    this.rows=new Float32Array(lines*4);
  }
  recover(samples) {
    const f=Math.fround,L=this.width,spc=L/227.5,us=f(f(315/88)*spc),count=samples.length;
    const wave=x=>{x=f(Math.max(0,Math.min(count-2,f(x))));const i=Math.floor(x);return f(samples[i]+f((samples[i+1]-samples[i])*(x-i)));};
    const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
    const candidates=[];
    for(let row=0;row<Math.ceil(count/L);row++) {
      let th=this.slice;
      if(!this.sliceValid) {
        let low=0;
        for(let i=row*L;i<Math.min((row+1)*L,count-2);i++)low=Math.min(low,(samples[i]+samples[i+1]+samples[i+2])/3);
        th=low<-.03?.5*low:-.12;
      }
      const edges=[];
      for(let i=Math.max(1,row*L);i<Math.min((row+1)*L,count-Math.trunc(28*us));i++) {
        if(samples[i]>th||samples[i-1]<=th)continue;
        if(samples[i+Math.trunc(us)]>=th||samples[i+Math.trunc(2*us)]>=th)continue;
        if(samples[i+Math.trunc(3.7*us)]<th&&samples[i+Math.trunc(6*us)]>th&&edges.length<4)
          edges.push(f(i-1+f(f(th-samples[i-1])/f(samples[i]-samples[i-1]))));
      }
      candidates.push(edges);
    }
    const nearest=target=>{
      const row=Math.floor(target/L);let best=-1,dist=.45*L;
      for(let r=Math.max(0,row-1);r<=Math.min(candidates.length-1,row+1);r++)for(const x of candidates[r]){
        const d=Math.abs(x-target);if(d<dist){dist=d;best=x;}
      }
      return best;
    };
    let period=this.initialized?this.period:L;
    period+=(L-period)*.002;
    const origin=this.guard*L,anchor=origin+(this.initialized?this.anchor:0);
    let prediction=anchor+Math.round((origin-anchor)/period)*period,basePhase=this.phase;
    let tipSum=0,porchSum=0,measured=0;
    for(let line=0;line<this.lines;line++) {
      const observed=nearest(prediction),error=observed>=0?observed-prediction:0;
      const position=f(prediction+f(error*f(.8)));
      if(observed>=0)period=f(Math.max(.99*L,Math.min(1.01*L,period+f(f(error*f(.001))*f(.8)))));
      let bx=0,by=0,dc=0;
      for(let k=0;k<Math.trunc(7*spc);k++) {
        const off=f(f(f(f(5.3)*us)+spc)+k),v=wave(position+off),angle=f(f(f(2*Math.PI)*(off%spc))/spc);
        bx=f(bx+f(v*f(Math.cos(angle))));by=f(by-f(v*f(Math.sin(angle))));
      }
      const amplitude=2*Math.hypot(bx,by)/(7*spc);
      let phase=wrap(basePhase+2*Math.PI*(position%spc)/spc);
      if(amplitude>.012){const correction=.5*wrap(Math.atan2(by,bx)-Math.PI-phase);basePhase=wrap(basePhase+correction);phase=wrap(phase+correction);}
      for(let k=0;k<Math.trunc(spc*2);k++)dc+=wave(f(position+f(f(8.3)*us))+k);
      dc/=spc*2;
      this.rows.set([position-origin,phase,dc,amplitude],line*4);
      if(observed>=0){let tip=0;const n=Math.trunc(2.5*us);for(let k=0;k<n;k++)tip+=wave(position+us+k);tipSum+=tip/n;porchSum+=dc;measured++;}
      prediction=f(position+period);
    }
    const next=prediction+Math.round((origin+this.lines*L-prediction)/period)*period;
    if(measured>50){const tip=tipSum/measured,porch=porchSum/measured,depth=porch-tip;
      if(depth>.04){const target=porch-.5*depth;this.slice=this.sliceValid?this.slice+.5*(target-this.slice):target;this.sliceValid=true;}else this.sliceValid=false;
    }else this.sliceValid=false;
    this.period=period;this.anchor=next-this.lines*L-origin;
    this.phase=wrap(basePhase+2*Math.PI*((this.lines*L)%spc)/spc);this.initialized=true;
    return this.rows;
  }
}
