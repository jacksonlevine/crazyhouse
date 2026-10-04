import * as THREE from './vendor/three-r186/three.module.js';
import {createCompositeWorker} from './composite-worker-client.js?v=4';
import {HD_SIGNAL as S} from './hd-receiver.js?v=1';
export {HD_SIGNAL} from './hd-receiver.js?v=1';
const W=S.samplesPerLine,H=S.height,SH=S.linesPerFrame+2*S.guard;
const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const FIR=(mhz,n=17)=>{
 const fc=mhz/(S.sampleRate/1e6),r=(n-1)/2;
 const weights=Array.from({length:n},(_,i)=>{const x=i-r,z=2*fc*x;return 2*fc*(x===0?1:Math.sin(Math.PI*z)/(Math.PI*z))*(.42+.5*Math.cos(Math.PI*x/(r+1))+.08*Math.cos(2*Math.PI*x/(r+1)));});
 const sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>w/sum);
};
export function createHDAnalogPass(renderer,{videoSource=null,onFrame=null,receiverParameters={}}={}){
 const target=(w,h,type=THREE.HalfFloatType,extra={})=>new THREE.WebGLRenderTarget(w,h,{type,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,...extra});
 const picture=target(S.width,H,THREE.HalfFloatType,{depthBuffer:true,samples:2});
 const source=target(S.width,H),filtered=target(S.width,H),demodulated=target(S.width,H,THREE.HalfFloatType,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}),decoded=target(S.width,H,THREE.UnsignedByteType,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
 const slots=Array.from({length:2},()=>({wave:target(W,SH,THREE.FloatType,{format:THREE.RedFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}),channel:target(W,SH,THREE.FloatType,{format:THREE.RedFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}),meta:target(2,SH,THREE.FloatType),pixels:new Float32Array(2*SH*4)}));
 // Reuse small pixel-pack buffers and poll fences without blocking the GPU.
 // Three's general readback creates a buffer and polls every 4 ms; this bounded
 // path avoids that allocation and reduces latency at monitor refresh.
 const gl=renderer.getContext();
 for(const slot of slots){slot.pack=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,slot.pack);gl.bufferData(gl.PIXEL_PACK_BUFFER,slot.pixels.byteLength,gl.STREAM_READ);}
 gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 function readMetadata(slot){
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,slot.pack);
  gl.readPixels(0,0,2,SH,gl.RGBA,gl.FLOAT,0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  return new Promise((resolve,reject)=>{
   function poll(){
    const status=gl.clientWaitSync(fence,0,0);
    if(status===gl.TIMEOUT_EXPIRED){setTimeout(poll,1);return;}
    gl.deleteSync(fence);
    if(status===gl.WAIT_FAILED){reject(new Error('HD signal GPU fence failed'));return;}
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,slot.pack);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,slot.pixels);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);resolve(slot.pixels);
   }
   setTimeout(poll,1);
  });
 }
 const timing=new THREE.DataTexture(new Float32Array(H*4),1,H,THREE.RGBAFormat,THREE.FloatType);timing.minFilter=timing.magFilter=THREE.NearestFilter;
 // Pair taps of the same sign: linear texture interpolation evaluates the
 // original FIR exactly with fewer fetches, preserving its transfer function.
 const packedChroma=[];
 const cw=FIR(S.chromaMHz);
 for(let i=0;i<cw.length;i++){
  let offset=i-8,weight=cw[i];
  if(i+1<cw.length&&cw[i]*cw[i+1]>0){const next=cw[++i];offset+=next/(weight+next);weight+=next;}
  packedChroma.push(new THREE.Vector2(offset,weight));
 }
 const yWeights=FIR(S.lumaMHz),cWeights=FIR(S.chromaMHz),sourceWeights=yWeights.map((w,i)=>new THREE.Vector3(w,cWeights[i],cWeights[i]));
 const u={picture:{value:picture.texture},video:{value:videoSource??picture.texture},videoMode:{value:videoSource?1:0},exposure:{value:1},monochrome:{value:0},unfiltered:{value:source.texture},source:{value:filtered.texture},sourceWeights:{value:sourceWeights},chromaTaps:{value:packedChroma},wave:{value:slots[0].wave.texture},timing:{value:timing},finalView:{value:decoded.texture},frameParity:{value:0},time:{value:0},humGain:{value:0},humPhase:{value:0},noise:{value:0},interference:{value:0},slice:{value:-1/7},sliceValid:{value:0},setup:{value:7.5},threshold:{value:-.12},autoSlice:{value:1},comb:{value:1},gain:{value:1},bias:{value:0},headroom:{value:0},injection:{value:picture.texture},injectionGain:{value:0},clipCurrent:{value:picture.texture},clipNext:{value:picture.texture},clipPrevious:{value:picture.texture},clipEnabled:{value:0},clipGain:{value:0},clipOffset:{value:0},clipRatio:{value:1},clipSamples:{value:1},clipWidth:{value:1},clipLines:{value:1},clipPreviousStart:{value:-1e20},clipNextStart:{value:1e20},clipEnd:{value:1e20},channelWeights:{value:new Float32Array(129)},channelTaps:{value:1}};
 const material=code=>new THREE.ShaderMaterial({uniforms:u,vertexShader:VERT,fragmentShader:code,depthTest:false,depthWrite:false,toneMapped:false});
 const common=`varying vec2 vUv;uniform sampler2D wave;
 float sampleWave(float index){
  index=clamp(index,0.,${W*SH-1}.);float base=floor(index),fraction=fract(index),x=mod(base,${W}.),row=floor(base/${W}.);
  if(x<${W-1}.)return texture2D(wave,vec2((x+fraction+.5)/${W}.,1.-(row+.5)/${SH}.)).r;
  float next=min(base+1.,${W*SH-1}.);
  return mix(texture2D(wave,vec2((x+.5)/${W}.,1.-(row+.5)/${SH}.)).r,texture2D(wave,vec2((mod(next,${W}.)+.5)/${W}.,1.-(floor(next/${W}.)+.5)/${SH}.)).r,fraction);
 }`;
 const prepare=material(`uniform sampler2D picture,video;uniform float monochrome,videoMode;varying vec2 vUv;
 ${THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure','exposure')}
 void main(){vec3 rgb=ACESFilmicToneMapping(texture2D(picture,vUv).rgb);rgb=mix(rgb*12.92,1.055*pow(rgb,vec3(1./2.4))-.055,step(vec3(.0031308),rgb));if(videoMode>.5)rgb=texture2D(video,vec2(vUv.x,1.-vUv.y)).rgb;float y=dot(rgb,vec3(.299,.587,.114));gl_FragColor=vec4(y,.493*(rgb.b-y)*(1.-monochrome),.877*(rgb.r-y)*(1.-monochrome),1.);}`);
 const bandlimit=material(`uniform sampler2D unfiltered;uniform vec3 sourceWeights[17];varying vec2 vUv;
 void main(){vec3 total=vec3(0.);float x=floor(vUv.x*${S.width}.);for(int k=0;k<17;k++)total+=texture2D(unfiltered,vec2((clamp(x+float(k-8),0.,${S.width-1}.)+.5)/${S.width}.,vUv.y)).rgb*sourceWeights[k];gl_FragColor=vec4(total,1.);}`);
 const encode=material(`varying vec2 vUv;uniform sampler2D source,injection,clipCurrent,clipNext,clipPrevious;
 uniform float frameParity,time,humGain,humPhase,noise,interference,injectionGain,gain,bias,headroom,setup;
 uniform float clipEnabled,clipGain,clipOffset,clipRatio,clipSamples,clipWidth,clipLines,clipPreviousStart,clipNextStart,clipEnd;
 float clipSample(float x){if(x>=clipEnd||x<clipPreviousStart)return 0.;bool previous=x<0.,next=x>=clipNextStart;if(previous)x-=clipPreviousStart;else if(next)x-=clipNextStart;if(x<0.||x>=clipSamples)return 0.;vec2 uv=vec2((mod(x,clipWidth)+.5)/clipWidth,(floor(x/clipWidth)+.5)/clipLines);return previous?texture2D(clipPrevious,uv).r:(next?texture2D(clipNext,uv).r:texture2D(clipCurrent,uv).r);}
 void main(){
 float x=floor(vUv.x*${W}.),line=floor((1.-vUv.y)*${SH}.)-${S.guard}.;
 float local=x+line*${W}.,tick=local-${S.baseDelaySamples}.+frameParity*${W*S.linesPerFrame}.,ft=mod(tick,${W*S.linesPerFrame}.),raster=floor(ft/${W}.),lp=mod(ft,${W}.),q=mod(tick,4.);
 float co=q<.5?1.:(q>1.5&&q<2.5?-1.:0.),si=q>.5&&q<1.5?1.:(q>2.5?-1.:0.),v=0.;
 if(raster<6.)v=lp<${W-S.syncSamples}.?-2./7.:0.;
 else if(lp<${S.syncSamples}.)v=-2./7.;
 else if(lp>=${S.burstStart}.&&lp<${S.burstStart+S.burstSamples}.)v=-co/7.;
 else if(raster>=${S.firstActive}.&&raster<${S.firstActive+H}.&&lp>=${S.activeStart}.&&lp<${S.activeStart+S.activeSamples}.){
 vec3 yuv=texture2D(source,vec2((lp-${S.activeStart}.+.5)/${S.activeSamples}.,1.-(raster-${S.firstActive}.+.5)/${H}.)).rgb;
 v=setup/140.+(5./7.-setup/140.)*(yuv.x+yuv.y*co+yuv.z*si);
 }
 if(humGain!=0.)v+=humGain*.25*sin(6.28318530718*(local/${S.sampleRate}.*60.+humPhase));
 if(noise>0.)v+=noise*(fract(sin(dot(vec2(x+floor(time*60.)*17.,line),vec2(127.1,311.7)))*43758.5453)-.5);
 if(interference!=0.)v+=interference*(.22/1.4)*sin(local*1.57079632679+time*19.);
 if(clipEnabled>.5){float t=clipOffset+local*clipRatio,b=floor(t);v+=clipGain*mix(clipSample(b),clipSample(b+1.),fract(t));}
 if(injectionGain!=0.)v+=injectionGain*texture2D(injection,vUv).r;
 v=v*gain+bias;if(headroom>0.)v=headroom*(2./(1.+exp(-2.*v/headroom))-1.);
 gl_FragColor=vec4(v,0.,0.,1.);
 }`);
 const channel=material(`${common}uniform float channelWeights[129];uniform int channelTaps;void main(){float x=floor(vUv.x*${W}.),row=floor((1.-vUv.y)*${SH}.),center=row*${W}.+x,v=0.;for(int k=0;k<129;k++){if(k>=channelTaps)break;v+=sampleWave(center-float(k))*channelWeights[k];}gl_FragColor=vec4(v,0.,0.,1.);}`);
 const scan=material(`${common}uniform float slice,sliceValid,threshold,autoSlice;
 void main(){float row=floor((1.-vUv.y)*${SH}.),base=row*${W}.,th=autoSlice>.5?slice:threshold,low=0.;
 if(autoSlice>.5&&sliceValid<.5){for(int k=0;k<${W};k+=4)low=min(low,sampleWave(base+float(k)));th=low<-.03?.5*low:-.12;}
 float edge=-1.,distance=${W/2}.;
 for(int k=0;k<${W};k+=4){float x=float(k),v=sampleWave(base+x),previous=sampleWave(base+x-4.);if(v>th||previous<=th)continue;
 float left=x-4.,right=x;for(int j=0;j<2;j++){float mid=(left+right)*.5;if(sampleWave(base+mid)>th)left=mid;else right=mid;}
 float a=sampleWave(base+left),b=sampleWave(base+right),candidate=mix(left,right,clamp((th-a)/(b-a),0.,1.));
 if(sampleWave(base+candidate+5.)>=th||sampleWave(base+candidate+11.)>=th||sampleWave(base+candidate+23.)>=th||sampleWave(base+candidate+53.)>=th||sampleWave(base+candidate+80.)<=th)continue;
 float d=min(abs(candidate-${S.baseDelaySamples}.),${W}.-abs(candidate-${S.baseDelaySamples}.));if(d<distance){distance=d;edge=candidate;}
 }
 float vertical=sampleWave(base+256.)<th&&sampleWave(base+512.)<th&&sampleWave(base+1024.)<th&&sampleWave(base+1600.)<th?1.:0.;
 float e=edge<0.?${S.baseDelaySamples}.:edge,bx=0.,by=0.,dc=0.,tip=0.;
 for(int k=0;k<${S.burstSamples};k++){float off=${S.burstStart}.+float(k),q=mod(off,4.),co=q<.5?1.:(q>1.5&&q<2.5?-1.:0.),si=q>.5&&q<1.5?1.:(q>2.5?-1.:0.),v=sampleWave(base+e+off);bx+=v*co;by-=v*si;}
 for(int k=0;k<8;k++){dc+=sampleWave(base+e+${S.porchStart}.+float(k));tip+=sampleWave(base+e+16.+float(k));}dc/=8.;tip/=8.;
 gl_FragColor=vUv.x<.5?vec4(edge,vertical,low,dc):vec4(bx,by,2.*length(vec2(bx,by))/${S.burstSamples}.,tip);
 }`);
 const demod=material(`${common}uniform sampler2D timing;uniform float setup,comb;
 void main(){float row=floor((1.-vUv.y)*${H}.),x=floor(vUv.x*${S.width}.),offset=${S.activeStart}.+x;
 vec4 t=texture2D(timing,vec2(.5,(row+.5)/${H}.));float value=sampleWave(t.r+offset)-t.a,y=value,c=value;
 if(comb>.5&&row>=1.){vec4 p=texture2D(timing,vec2(.5,(row-.5)/${H}.));float previous=sampleWave(p.r+offset)-p.a;y=(value+previous)*.5;c=(value-previous)*.5;}
 else {y=(sampleWave(t.r+offset-2.)+2.*sampleWave(t.r+offset)+sampleWave(t.r+offset+2.))*.25-t.a;c=value-y;}
 float q=mod(offset,4.),co=q<.5?1.:(q>1.5&&q<2.5?-1.:0.),si=q>.5&&q<1.5?1.:(q>2.5?-1.:0.),range=5./7.-setup/140.;
 gl_FragColor=vec4((y-setup/140.)/range,2.*c*(co*t.g-si*t.b)/range,2.*c*(si*t.g+co*t.b)/range,1.);
 }`);
 u.demodulated={value:demodulated.texture};
 const decode=material(`varying vec2 vUv;uniform sampler2D demodulated;uniform vec2 chromaTaps[${packedChroma.length}];void main(){float x=floor(vUv.x*${S.width}.);vec3 center=texture2D(demodulated,vUv).rgb;vec2 uv=vec2(0.);for(int k=0;k<${packedChroma.length};k++)uv+=texture2D(demodulated,vec2((clamp(x+chromaTaps[k].x,0.,${S.width-1}.)+.5)/${S.width}.,vUv.y)).gb*chromaTaps[k].y;float r=center.r+uv.y/.877,b=center.r+uv.x/.493;gl_FragColor=vec4(clamp(vec3(r,(center.r-.299*r-.114*b)/.587,b),0.,1.),1.);}`);
 const display=material('varying vec2 vUv;uniform sampler2D finalView;void main(){gl_FragColor=texture2D(finalView,vUv);}');
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
 const quad=new THREE.Mesh(geometry,prepare);quad.frustumCulled=false;const scene=new THREE.Scene();scene.add(quad);const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),worker=createCompositeWorker();
 const draw=(mat,rt)=>{quad.material=mat;renderer.setRenderTarget(rt);renderer.render(scene,camera);};
 const show=()=>{const old=renderer.getRenderTarget();draw(display,null);renderer.setRenderTarget(old);};
 const controls={noise:0,bandwidthMHz:0,interference:0,automatic:false,injection:null,injectionGain:0,testGain:1,automaticHum:true,automaticHumGain:.15,monochrome:false};
 const heldSignals=new Set(),stats={frames:0,signalFPS:0,readMilliseconds:0,receiverMilliseconds:0,buffering:false,error:'',receiverMode:'HD1080 line comb',readbackBytes:2*SH*4*4};
 let clip=null,epoch=null,stalledTime=null,stalledAt=0,humOn=false,nextHumChange=performance.now()/1000+1+Math.random()*4,nextBurst=performance.now()/1000+12,burstUntil=0,queue=Promise.resolve(),statsStart=performance.now(),statsFrames=0,lastBandwidth=-1;
 function render(seconds){
  if(epoch===null)epoch=seconds;if(slots.length===0||stats.error){show();return;}
  if(stalledTime!==null&&clip){clip.update(stalledTime);if(clip.buffering){show();return;}const pause=seconds-stalledAt;epoch+=pause;clip.started+=pause;stalledTime=null;}
  const frame=Math.max(0,Math.floor((seconds-epoch)*S.frameRate)),time=epoch+frame/S.frameRate;
  // Lab's NTSC receiver bandwidth/settings belong to NTSC mode, not this raster.
  const parameters={...receiverParameters,frame};
  if(clip){clip.update(time);if(clip.enabled&&clip.buffering){stats.buffering=true;stalledTime=time;stalledAt=seconds;show();return;}stats.buffering=false;}
  if(!controls.automaticHum){humOn=false;nextHumChange=seconds+1+Math.random()*4;}else if(seconds>=nextHumChange){humOn=!humOn;nextHumChange=seconds+1+Math.random()*4;}
  if(controls.automatic&&seconds>=nextBurst){burstUntil=seconds+.65;nextBurst=seconds+18+Math.random()*25;}
  u.humGain.value=controls.testGain*(heldSignals.has('KeyW')?1:humOn?controls.automaticHumGain:0);u.humPhase.value=(time*60)%1;u.time.value=time;u.frameParity.value=frame%2;u.monochrome.value=controls.monochrome?1:0;u.exposure.value=renderer.toneMappingExposure;
  u.interference.value=Math.max(controls.interference,Math.max(0,Math.min(1,(burstUntil-seconds)/.18))*.65);u.noise.value=controls.noise;u.injection.value=controls.injection??picture.texture;u.injectionGain.value=controls.injection?controls.injectionGain:0;
  u.gain.value=parameters.gain??1;u.bias.value=parameters.bias??0;u.headroom.value=parameters.headroom??0;u.setup.value=parameters.setupIRE??7.5;u.comb.value=parameters.comb===false?0:1;u.threshold.value=parameters.threshold??-.12;u.autoSlice.value=parameters.autoSlice===false?0:1;
  u.clipEnabled.value=clip?.active?1:0;
  if(clip?.active){const a=clip.active;u.clipCurrent.value=a.current;u.clipNext.value=a.next;u.clipPrevious.value=a.previous;u.clipOffset.value=a.offset;u.clipPreviousStart.value=a.previousStart;u.clipNextStart.value=a.nextStart;u.clipEnd.value=a.end;u.clipRatio.value=clip.manifest.sampleRate/S.sampleRate;u.clipWidth.value=clip.manifest.samplesPerLine;u.clipLines.value=clip.manifest.linesPerFrame;u.clipSamples.value=clip.manifest.samplesPerFrame;u.clipGain.value=clip.gain*(clip.manifest.raster?clip.manifest.voltageScale:clip.manifest.voltageScale/1.4);}
  const slot=slots.pop(),old=renderer.getRenderTarget();draw(prepare,source);draw(bandlimit,filtered);draw(encode,slot.wave);u.wave.value=slot.wave.texture;
  const bandwidth=controls.bandwidthMHz||parameters.bandwidth||0;
  if(bandwidth>0){if(bandwidth!==lastBandwidth){lastBandwidth=bandwidth;const a=Math.exp(-2*Math.PI*bandwidth/(S.sampleRate/1e6)),n=Math.min(129,Math.max(2,Math.ceil(-10/Math.log(a))));u.channelWeights.value.fill(0);let sum=0;for(let i=0;i<n;i++){u.channelWeights.value[i]=(1-a)*a**i;sum+=u.channelWeights.value[i];}for(let i=0;i<n;i++)u.channelWeights.value[i]/=sum;u.channelTaps.value=n;}draw(channel,slot.channel);u.wave.value=slot.channel.texture;}
  slot.receiverWave=u.wave.value;draw(scan,slot.meta);
  const started=performance.now(),read=readMetadata(slot);renderer.setRenderTarget(old);
  queue=queue.then(async()=>{
   const pixels=await read;stats.readMilliseconds=performance.now()-started;
   const result=await worker.call('receiveHD',{pixels:pixels.buffer,parameters},[pixels.buffer]);slot.pixels=new Float32Array(result.pixels);
   timing.image.data=new Float32Array(result.timing);timing.needsUpdate=true;u.slice.value=result.slice;u.sliceValid.value=result.sliceValid?1:0;
   u.wave.value=slot.receiverWave;u.setup.value=parameters.setupIRE??7.5;u.comb.value=parameters.comb===false?0:1;
   const target=renderer.getRenderTarget();draw(demod,demodulated);draw(decode,decoded);renderer.setRenderTarget(target);
   stats.receiverMilliseconds=result.milliseconds;stats.frames++;statsFrames++;stats.receiverMode='HD1080 '+(parameters.comb===false?'notch':'line comb');onFrame?.({frame,target:decoded,stats});
   const elapsed=performance.now()-statsStart;if(elapsed>=1000){stats.signalFPS=statsFrames*1000/elapsed;statsFrames=0;statsStart=performance.now();}
  }).catch(error=>{stats.error=error.message;console.error('HD composite receiver:',error);}).finally(()=>slots.push(slot));show();
 }
 function setClip(next){clip?.dispose();clip=next;stalledTime=null;if(clip)clip.started=epoch===null?null:epoch+Math.floor((performance.now()/1000-epoch)*S.frameRate)/S.frameRate;u.clipEnabled.value=0;u.clipPrevious.value=u.clipCurrent.value=u.clipNext.value=picture.texture;}
 return {picture,controls,render,heldSignals,setClip,stats,profile:S,get clip(){return clip;},disturb(seconds=.6){burstUntil=performance.now()/1000+seconds;}};
}
