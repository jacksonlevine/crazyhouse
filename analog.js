// Sampled color composite: 910 samples/line at 4x NTSC color carrier.
// Each texture row is a complete scanline, including sync and blanking.
import {createCompositeWorker} from './composite-worker-client.js?v=1';
import * as THREE from './vendor/three-r186/three.module.js';
export const GAME_SIGNAL = Object.freeze({sampleRate:14318181.818181818, samplesPerLine:910, linesPerFrame:525, syncUS:4.7, burstUS:5.3, burstCycles:9, activeUS:9.4, activeDurationUS:52.655, baseDelaySamples:32});
const W = 910, H = 480, GUARD=144, SIGNAL_H=525+2*GUARD;
const VERT = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export function gameSignalClock(seconds,epoch) {
  const period=GAME_SIGNAL.samplesPerLine*GAME_SIGNAL.linesPerFrame/GAME_SIGNAL.sampleRate;
  const frame=Math.floor((seconds-epoch)/period);
  return {frame,time:epoch+frame*period};
}
export function createAnalogPass(renderer,{videoSource=null,onFrame=null}={}) {
  const picture = new THREE.WebGLRenderTarget(768, H, {type: THREE.HalfFloatType, samples: 4});
  const source = new THREE.WebGLRenderTarget(720, H, {type:THREE.HalfFloatType, depthBuffer:false});
  source.texture.minFilter=source.texture.magFilter=THREE.NearestFilter;
  const filtered = new THREE.WebGLRenderTarget(720,H,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  const signal = new THREE.WebGLRenderTarget(W, SIGNAL_H, {type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer:false});
  const receiverWorker=createCompositeWorker();
  const timingTexture=new THREE.DataTexture(new Float32Array(480*4),1,480,THREE.RGBAFormat,THREE.FloatType);
  timingTexture.minFilter=timingTexture.magFilter=THREE.NearestFilter;
  const receivedTexture=new THREE.DataTexture(new Float32Array(W*SIGNAL_H),W,SIGNAL_H,THREE.RedFormat,THREE.FloatType);
  receivedTexture.minFilter=receivedTexture.magFilter=THREE.NearestFilter;
  const decoded=new THREE.WebGLRenderTarget(720,480,{depthBuffer:false});
  let signalReadback=new Float32Array(W*SIGNAL_H*4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const clipFilter=new Float32Array(17);clipFilter[8]=1;
  const uniforms = { videoMode:{value:videoSource?1:0}, videoSource:{value:videoSource??picture.texture}, picture:{value:picture.texture}, source:{value:filtered.texture}, channelBandwidth:{value:0}, signal:{value:signal.texture}, injection:{value:picture.texture}, injectionGain:{value:0}, time:{value:0}, interference:{value:0}, noise:{value:0.004}, timing:{value:timingTexture}, humGain:{value:0}, testGain:{value:1}, exposure:{value:0.75}, monochrome:{value:0}, humPhase:{value:0}, frameParity:{value:0}, comb:{value:0}, colorKiller:{value:1}, receiverSetup:{value:7.5}, clipPrevious:{value:picture.texture}, clipHasPrevious:{value:0}, clipPreviousStart:{value:-1e20}, clipCurrent:{value:picture.texture}, clipNext:{value:picture.texture}, clipEnabled:{value:0}, clipHasNext:{value:0}, clipGain:{value:0}, clipOffset:{value:0}, clipRatio:{value:1}, clipNextStart:{value:1e20}, clipEnd:{value:1e20}, clipSamples:{value:1}, clipWidth:{value:1}, clipLines:{value:480}, clipFilter:{value:clipFilter} };
  const material = fragmentShader => new THREE.ShaderMaterial({uniforms, vertexShader:VERT, fragmentShader, depthTest:false, depthWrite:false, toneMapped:false});
  const prepare = material(`
    uniform sampler2D picture,videoSource;uniform float videoMode;
    uniform float monochrome;
    ${THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure','exposure')}
    varying vec2 vUv;
    void main(){
      vec3 rgb=ACESFilmicToneMapping(texture2D(picture,vUv).rgb);
      rgb=mix(rgb*12.92,1.055*pow(rgb,vec3(1./2.4))-0.055,step(vec3(0.0031308),rgb));
      if(videoMode>.5)rgb=texture2D(videoSource,vec2(vUv.x,1.-vUv.y)).rgb;
      float y=dot(rgb,vec3(0.299,0.587,0.114));
      float i=0.493*(rgb.b-y)*(1.-monochrome);
      float q=0.877*(rgb.r-y)*(1.-monochrome);
      gl_FragColor=vec4(y,i,q,1.);
    }`);
  // The export engine uses this same 49-tap Blackman source filter at 720 pixels.
  const bandlimit = material(`
    uniform sampler2D unfiltered; varying vec2 vUv;
    float sinc(float x){return abs(x)<0.000001?1.:sin(3.14159265359*x)/(3.14159265359*x);}
    void main(){
      vec3 fc=vec3(4.2,1.3,1.3)/(720./52.655),total=vec3(0.),norm=vec3(0.);
      float pixel=floor(vUv.x*720.);
      for(int k=-24;k<=24;k++){
        float t=float(k),w=.42+.5*cos(3.14159265359*t/25.)+.08*cos(2.*3.14159265359*t/25.);
        vec3 z=2.*fc*t,h=2.*fc*vec3(sinc(z.x),sinc(z.y),sinc(z.z))*w;
        total+=texture2D(unfiltered,vec2((clamp(pixel+t,0.,719.)+.5)/720.,vUv.y)).rgb*h;norm+=h;
      }
      gl_FragColor=vec4(total/norm,1.);
    }`);
  uniforms.unfiltered={value:source.texture};
  const encode = material(`
    uniform sampler2D source,injection,clipCurrent,clipNext,clipPrevious; uniform float time,interference,noise,injectionGain;
    uniform float humGain,humPhase,testGain,frameParity;
    uniform float clipHasPrevious,clipPreviousStart,clipEnabled,clipHasNext,clipGain,clipOffset,clipRatio,clipNextStart,clipEnd,clipSamples,clipWidth,clipLines;
    uniform float clipFilter[17];
    varying vec2 vUv;
    float clipSample(float index){
      if(index>=clipEnd)return 0.;
      bool previous=index<0.,next=index>=clipNextStart;
      if(previous){if(clipHasPrevious<.5 || index<clipPreviousStart)return 0.;index-=clipPreviousStart;}
      else if(next){if(clipHasNext<.5)return 0.;index-=clipNextStart;}
      if(index<0. || index>=clipSamples)return 0.;
      vec2 uv=vec2((mod(index,clipWidth)+.5)/clipWidth,(floor(index/clipWidth)+.5)/clipLines);
      if(previous)return texture2D(clipPrevious,uv).r;
      return next?texture2D(clipNext,uv).r:texture2D(clipCurrent,uv).r;
    }
    float clipVoltage(float index){
      float base=floor(index),fraction=fract(index),v=0.;
      if(clipRatio<=1.)return mix(clipSample(base),clipSample(base+1.),fraction);
      for(int i=0;i<17;i++){
        float x=base+float(i-8);
        v+=mix(clipSample(x),clipSample(x+1.),fraction)*clipFilter[i];
      }
      return v;
    }
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      float x=floor(vUv.x*910.),line=floor((1.-vUv.y)*813.)-144.;
      float tick=x+line*910.-32.+frameParity*525.*910.;
      float ft=mod(tick,525.*910.),parity=floor(ft/(262.5*910.));
      float localField=ft-parity*262.5*910.,lp=mod(ft,910.);
      float us=315./88.*4.,phase=mod(tick,4.)*1.57079632679;
      float halfLine=floor(localField/455.),hp=mod(localField,455.),s=0.;
      if(halfLine<18.){
        float width=halfLine>=6.&&halfLine<12.?455.-4.7*us:2.3*us;
        s=hp<width?-2./7.:0.;
      }else if(lp<4.7*us)s=-2./7.;
      else if(lp>=5.3*us&&lp<5.3*us+36.)s=-cos(phase)/7.;
      else{
        float rasterLine=floor(ft/910.),first=parity<.5?20.:283.;
        if(rasterLine>=first&&rasterLine<first+240.&&lp>=9.4*us&&lp<9.4*us+52.655*us){
          float pictureRow=(rasterLine-first)*2.+parity;
          vec3 yuv=texture2D(source,vec2((lp-9.4*us)/(52.655*us),1.-(pictureRow+.5)/480.)).rgb;
          s=7.5/140.+(5./7.-7.5/140.)*(yuv.x+yuv.y*cos(phase)+yuv.z*sin(phase));
        }
      }
      float n=hash(vec2(x+floor(time*60.)*17.,line))-0.5;
      // A continuous interfering oscillator, indexed by actual sample time.
      // 227.5 carrier cycles per line makes phase alternate on adjacent lines.
      float carrier=sin(mod(x+line*910.,4.)*1.57079632679+time*19.);
      s+=noise*n+interference*(.22/1.4)*carrier;
      // Mains voltage mixes across the entire line, including sync.
      float sampleTime=(x+line*910.)/14318181.818181818; // exact 4× carrier
      float hum=sin(6.2831853*(sampleTime*60.+humPhase));
      s+=testGain*humGain*.25*hum;
      if(clipEnabled>0.5) s+=clipGain*clipVoltage(clipOffset+(x+line*910.)*clipRatio);
      if(injectionGain!=0.) s+=texture2D(injection,vUv).r*injectionGain;
      gl_FragColor=vec4(s,0.,0.,1.);
    }`);

  uniforms.received={value:receivedTexture};
  const decode = material(`
    uniform sampler2D received,timing; uniform float comb,colorKiller,receiverSetup; varying vec2 vUv;
    float wave(float index){
      index=clamp(index,0.,910.*813.-1.);
      float base=floor(index),fraction=fract(index);
      vec2 a=vec2((mod(base,910.)+.5)/910.,(floor(base/910.)+.5)/813.);
      float next=min(base+1.,910.*813.-1.);
      vec2 b=vec2((mod(next,910.)+.5)/910.,(floor(next/910.)+.5)/813.);
      return mix(texture2D(received,a).r,texture2D(received,b).r,fraction);
    }
    float sinc(float x){return abs(x)<.000001?1.:sin(3.14159265359*x)/(3.14159265359*x);}
    void main(){
      float row=floor((1.-vUv.y)*480.);
      vec4 sync=texture2D(timing,vec2(.5,(row+.5)/480.));
      float offset=9.4*(315./88.*4.)+vUv.x*52.655*(315./88.*4.);
      float center=144.*910.+sync.r+offset;
      vec4 previous=texture2D(timing,vec2(.5,(max(row-2.,0.)+.5)/480.));
      float centerB=144.*910.+previous.r+offset;
      float y=(wave(center-2.)+2.*wave(center)+wave(center+2.))*.25-sync.b;
      if(comb>.5&&row>=2.)y=(wave(center)-sync.b+wave(centerB)-previous.b)*.5;
      vec2 uv=vec2(0.);float norm=0.;
      for(int k=-16;k<=16;k++){
        float t=float(k),fc=1.3/(315./88.*4.);
        float win=.42+.5*cos(3.14159265359*t/17.)+.08*cos(2.*3.14159265359*t/17.);
        float w=2.*fc*sinc(2.*fc*t)*win;
        float angle=6.28318530718*mod(offset+t,4.)/4.+sync.g;
        float c=wave(center+t)-sync.b;
        if(comb>.5&&row>=2.)c=(c-(wave(centerB+t)-previous.b))*.5;
        uv+=2.*c*vec2(cos(angle),sin(angle))*w;norm+=w;
      }
      uv/=norm;if(colorKiller>.5)uv*=smoothstep(.012,.035,sync.a);
      y=(y-receiverSetup/140.)/(5./7.-receiverSetup/140.);uv/=(5./7.-receiverSetup/140.);
      float r=y+uv.y/.877,b=y+uv.x/.493;
      gl_FragColor=vec4(clamp(vec3(r,(y-.299*r-.114*b)/.587,b),0.,1.),1.);
    }`);
  uniforms.finalView={value:decoded.texture};
  const display=material(`uniform sampler2D finalView;varying vec2 vUv;void main(){gl_FragColor=texture2D(finalView,vUv);}`);
  const quad = new THREE.Mesh(geometry,encode); quad.frustumCulled=false;
  const scene=new THREE.Scene(); scene.add(quad);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const controls={noise:0, bandwidthMHz:0, interference:0, automatic:false, injection:null, injectionGain:0, testGain:1, automaticHum:true, automaticHumGain:0.15, monochrome:false};
  const heldSignals = new Set();
  let clip=null;
  let burstUntil=0, nextBurst=performance.now()/1000+12;
  // Alternate quiet gaps and live mains injection; both last 1–5 seconds.
  let humOn=false, nextHumChange=performance.now()/1000+1+Math.random()*4;
  let signalEpoch=null,lastSignalFrame=-1,inFlight=false,stalledTime=null,stalledAt=0,lastClockTime=null;
  const stats={frames:0,signalFPS:0,readMilliseconds:0,receiverMilliseconds:0,buffering:false,error:''};
  let statsStart=performance.now(),statsFrames=0;
  function show(){const target=renderer.getRenderTarget();quad.material=display;renderer.setRenderTarget(null);renderer.render(scene,camera);renderer.setRenderTarget(target);}
  function render(seconds){
    if(signalEpoch===null)signalEpoch=seconds;
    if(inFlight||stats.error){show();return;}
    if(stalledTime!==null&&clip){
      clip.update(stalledTime);
      if(clip.buffering){show();return;}
      const pause=seconds-stalledAt;signalEpoch+=pause;clip.started+=pause;stalledTime=null;
    }
    const clock=gameSignalClock(seconds,signalEpoch);
    const signalFrame=lastSignalFrame<0?0:Math.min(clock.frame,lastSignalFrame+1);
    const waveformSeconds=signalEpoch+signalFrame*W*525/GAME_SIGNAL.sampleRate;
    if(signalFrame===lastSignalFrame){show();return;}
    if(controls.automatic && seconds>=nextBurst){burstUntil=seconds+0.65;nextBurst=seconds+18+Math.random()*25;}
    const burst=Math.max(0,Math.min(1,(burstUntil-seconds)/0.18));
    if (!controls.automaticHum) {
      humOn=false;
      nextHumChange=seconds+1+Math.random()*4;
    } else if (seconds>=nextHumChange) {
      humOn=!humOn;
      nextHumChange=seconds+1+Math.random()*4;
    }
    uniforms.clipEnabled.value=0;
    if(clip){
      clip.update(waveformSeconds);
      const active=clip.active;
      if(clip.enabled&&clip.buffering){stats.buffering=true;stalledTime=waveformSeconds;stalledAt=seconds;show();return;}
      stats.buffering=false;
      if(active){
        uniforms.clipCurrent.value=active.current;
        uniforms.clipPrevious.value=active.previous || active.current;
        uniforms.clipHasPrevious.value=active.previous?1:0;
        uniforms.clipPreviousStart.value=Math.max(active.previousStart,-1e20);
        uniforms.clipNext.value=active.next || active.current;
        uniforms.clipHasNext.value=active.next?1:0;
        uniforms.clipOffset.value=active.offset;
        uniforms.clipNextStart.value=Math.min(active.nextStart,1e20);
        uniforms.clipEnd.value=active.end;
        uniforms.clipGain.value=clip.gain*(clip.manifest.raster?clip.manifest.voltageScale:clip.manifest.voltageScale/1.4);
        uniforms.clipEnabled.value=1;
      }
    }
    uniforms.exposure.value=renderer.toneMappingExposure;
    uniforms.monochrome.value=controls.monochrome?1:0;
    uniforms.time.value=waveformSeconds;
    uniforms.humGain.value=heldSignals.has('KeyW')?1:(humOn?controls.automaticHumGain:0);
    uniforms.testGain.value=controls.testGain*(heldSignals.has('boost')?2:1);
    uniforms.humPhase.value=((waveformSeconds*60)%1+1)%1;
    uniforms.injection.value=controls.injection || picture.texture;
    uniforms.injectionGain.value=controls.injection ? controls.injectionGain : 0;
    uniforms.noise.value=controls.noise;
    uniforms.frameParity.value=signalFrame%2;
    uniforms.interference.value=Math.max(controls.interference,burst*0.65);
    const target=renderer.getRenderTarget();
    quad.material=prepare;renderer.setRenderTarget(source);renderer.render(scene,camera);
    quad.material=bandlimit;renderer.setRenderTarget(filtered);renderer.render(scene,camera);
    quad.material=encode;renderer.setRenderTarget(signal);renderer.render(scene,camera);
    renderer.setRenderTarget(target);
    lastSignalFrame=signalFrame;lastClockTime=waveformSeconds;inFlight=true;
    const started=performance.now();
    const parameters={...(clip?.manifest.receiverParameters??{}),frame:signalFrame};
    if(controls.bandwidthMHz>0)parameters.bandwidth=controls.bandwidthMHz;
    renderer.readRenderTargetPixelsAsync(signal,0,0,W,SIGNAL_H,signalReadback).then(async pixels=>{
      stats.readMilliseconds=performance.now()-started;
      const result=await receiverWorker.call('receive',{pixels:pixels.buffer,parameters},[pixels.buffer]);
      signalReadback=new Float32Array(result.pixels);
      receivedTexture.image.data=new Float32Array(result.samples);receivedTexture.needsUpdate=true;
      timingTexture.image.data=new Float32Array(result.timing);timingTexture.needsUpdate=true;
      uniforms.comb.value=parameters.comb?1:0;uniforms.colorKiller.value=parameters.colorKiller===false?0:1;uniforms.receiverSetup.value=parameters.setupIRE??7.5;
      const target=renderer.getRenderTarget();quad.material=decode;renderer.setRenderTarget(decoded);renderer.render(scene,camera);renderer.setRenderTarget(target);
      stats.receiverMilliseconds=result.milliseconds;stats.frames++;statsFrames++;
      onFrame?.({frame:signalFrame,target:decoded,stats});
      const elapsed=performance.now()-statsStart;if(elapsed>=1000){stats.signalFPS=statsFrames*1000/elapsed;statsFrames=0;statsStart=performance.now();}
    }).catch(error=>{stats.error=error.message;console.error('Composite receiver:',error);}).finally(()=>{inFlight=false;});
    show();
  }
  function setClip(next){
    clip?.dispose();clip=next;stalledTime=null;
    if(clip){const now=performance.now()/1000,period=W*525/GAME_SIGNAL.sampleRate;clip.started=(lastClockTime??now)+((now-(signalEpoch??now))%period);}
    uniforms.clipEnabled.value=0;
    uniforms.clipPrevious.value=uniforms.clipCurrent.value=uniforms.clipNext.value=picture.texture;
    if(!clip)return;
    const ratio=clip.manifest.sampleRate/GAME_SIGNAL.sampleRate;
    uniforms.clipRatio.value=ratio;uniforms.clipSamples.value=clip.manifest.samplesPerFrame;uniforms.clipWidth.value=clip.manifest.samplesPerLine;uniforms.clipLines.value=clip.manifest.linesPerFrame;
    // Anti-alias the recorded voltage before sampling it on the game's clock.
    if(ratio<=1){clipFilter.fill(0);clipFilter[8]=1;return;}
    const cutoff=Math.min(0.49,0.45/ratio);
    let total=0;
    for(let i=0;i<17;i++){
      const x=i-8;
      clipFilter[i]=(x===0?2*cutoff:Math.sin(2*Math.PI*cutoff*x)/(Math.PI*x))*(0.54+0.46*Math.cos(Math.PI*x/8));
      total+=clipFilter[i];
    }
    for(let i=0;i<17;i++)clipFilter[i]/=total;
  }
  return {picture, controls, render, heldSignals, setClip, stats, get clip(){return clip;}, disturb(seconds=0.6){burstUntil=performance.now()/1000+seconds;}};
}
