// Sampled color composite: 910 samples/line at 4x NTSC color carrier.
// Each texture row is a complete scanline, including sync and blanking.
import * as THREE from './vendor/three-r186/three.module.js';
const W = 910, H = 480;
const VERT = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// 33-tap Hamming-window FIR, normalized to preserve DC voltage.
export function lowPassKernel(cutoffMHz) {
  const cutoff = Math.max(0.001, Math.min(0.49, cutoffMHz / 14.31818));
  const weights = Float32Array.from({length:33}, (_, index) => {
    const t=index-16;
    return (t===0 ? 2*cutoff : Math.sin(2*Math.PI*cutoff*t)/(Math.PI*t)) *
      (0.54+0.46*Math.cos(Math.PI*t/16));
  });
  const sum=weights.reduce((a,b)=>a+b,0);
  return weights.map(w=>w/sum);
}
export function createAnalogPass(renderer) {
  const picture = new THREE.WebGLRenderTarget(768, H, {type: THREE.HalfFloatType, samples: 4});
  const source = new THREE.WebGLRenderTarget(752, H, {type:THREE.HalfFloatType, depthBuffer:false});
  source.texture.minFilter=source.texture.magFilter=THREE.NearestFilter;
  const signal = new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer:false});
  const timing = new THREE.WebGLRenderTarget(1, H, {type: THREE.HalfFloatType, depthBuffer:false, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter});
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const clipFilter=new Float32Array(17);clipFilter[8]=1;
  const uniforms = { picture:{value:picture.texture}, source:{value:source.texture}, lumaKernel:{value:lowPassKernel(2.5)}, chromaKernel:{value:lowPassKernel(1)}, channelKernel:{value:lowPassKernel(4.2)}, signal:{value:signal.texture}, injection:{value:picture.texture}, injectionGain:{value:0}, time:{value:0}, interference:{value:0}, noise:{value:0.004}, timing:{value:timing.texture}, humGain:{value:0}, testGain:{value:1}, exposure:{value:0.75}, monochrome:{value:0}, humPhase:{value:0}, clipCurrent:{value:picture.texture}, clipNext:{value:picture.texture}, clipEnabled:{value:0}, clipHasNext:{value:0}, clipGain:{value:0}, clipOffset:{value:0}, clipRatio:{value:1}, clipNextStart:{value:1e20}, clipEnd:{value:1e20}, clipSamples:{value:1}, clipWidth:{value:1}, clipFilter:{value:clipFilter} };
  const material = fragmentShader => new THREE.ShaderMaterial({uniforms, vertexShader:VERT, fragmentShader, depthTest:false, depthWrite:false, toneMapped:false});
  const prepare = material(`
    uniform sampler2D picture;
    uniform float monochrome;
    ${THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure','exposure')}
    varying vec2 vUv;
    void main(){
      vec3 rgb=ACESFilmicToneMapping(texture2D(picture,vUv).rgb);
      rgb=mix(rgb*12.92,1.055*pow(rgb,vec3(1./2.4))-0.055,step(vec3(0.0031308),rgb));
      float y=dot(rgb,vec3(0.299,0.587,0.114));
      float i=0.493*(rgb.b-y)*(1.-monochrome);
      float q=0.877*(rgb.r-y)*(1.-monochrome);
      gl_FragColor=vec4(y,i,q,1.);
    }`);
  const encode = material(`
    uniform sampler2D source,injection,clipCurrent,clipNext; uniform float time,interference,noise,injectionGain;
    uniform float lumaKernel[33],chromaKernel[33];
    uniform float humGain,humPhase,testGain;
    uniform float clipEnabled,clipHasNext,clipGain,clipOffset,clipRatio,clipNextStart,clipEnd,clipSamples,clipWidth;
    uniform float clipFilter[17];
    varying vec2 vUv;
    float clipSample(float index){
      if(index<0. || index>=clipEnd)return 0.;
      bool next=index>=clipNextStart;
      if(next){if(clipHasNext<0.5)return 0.;index-=clipNextStart;}
      if(index>=clipSamples)return 0.;
      vec2 uv=vec2((mod(index,clipWidth)+0.5)/clipWidth,(floor(index/clipWidth)+0.5)/525.);
      return next?texture2D(clipNext,uv).r:texture2D(clipCurrent,uv).r;
    }
    float clipVoltage(float index){
      float base=floor(index),fraction=fract(index),v=0.;
      for(int i=0;i<17;i++){
        float x=base+float(i-8);
        v+=mix(clipSample(x),clipSample(x+1.),fraction)*clipFilter[i];
      }
      return v;
    }
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      float x=floor(vUv.x*910.); float line=floor(vUv.y*480.);
      float s=0.;
      if(x<67.) s=-0.4;
      else if(x>=80. && x<112.) s=-0.2*cos(mod(x+line*910.,4.)*1.57079632679);
      else if(x>=140. && x<892.) {
        vec3 yiq=vec3(0.);
        for(int tap=0;tap<33;tap++){
          vec3 inputSample=texture2D(source,vec2((x-140.+0.5+float(tap-16))/752.,vUv.y)).rgb;
          yiq+=inputSample*vec3(lumaKernel[tap],chromaKernel[tap],chromaKernel[tap]);
        }
        float phase=mod(x+line*910.,4.)*1.57079632679;
        s=0.075+0.925*(yiq.x+yiq.y*cos(phase)+yiq.z*sin(phase));
      }
      float n=hash(vec2(x+floor(time*60.)*17.,line))-0.5;
      // A continuous interfering oscillator, indexed by actual sample time.
      // 227.5 carrier cycles per line makes phase alternate on adjacent lines.
      float carrier=sin(mod(x+line*910.,4.)*1.57079632679+time*19.);
      s+=noise*n+interference*0.22*carrier;
      // Mains voltage mixes across the entire line, including sync.
      float sampleTime=(x+line*910.)/14318180.;
      float hum=sin(6.2831853*(sampleTime*60.+humPhase));
      s+=testGain*humGain*0.35*hum;
      if(clipEnabled>0.5) s+=clipGain*clipVoltage(clipOffset+(x+line*910.)*clipRatio);
      if(injectionGain!=0.) s+=texture2D(injection,vUv).r*injectionGain;
      gl_FragColor=vec4(s,0.,0.,1.);
    }`);

  // Separate sync comparator and back-porch clamp, once per scanline.
  const channel = new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  uniforms.received={value:channel.texture};
  const receive = material(`
    uniform sampler2D signal; uniform float channelKernel[33]; varying vec2 vUv;
    void main(){
      float voltage=0.;
      for(int tap=0;tap<33;tap++){
        voltage+=texture2D(signal,vUv+vec2(float(tap-16)/910.,0.)).r*channelKernel[tap];
      }
      gl_FragColor=vec4(voltage,0.,0.,1.);
    }`);
  const recover = material(`
    uniform sampler2D received; varying vec2 vUv;
    float voltage(float x){return texture2D(received,vec2((x+0.5)/910.,vUv.y)).r;}
    void main(){
      float run=0.; float edge=67.; float locked=0.;
      for(int i=0;i<140;i++){
        float v=voltage(float(i));
        if(v < -0.2) run+=1.;
        else {
          if(run>=30.) {edge=float(i);locked=1.;break;}
          run=0.;
        }
      }
      float pedestal=0.;
      for(int i=0;i<16;i++) pedestal+=voltage(edge+53.+float(i));
      float bc=0.,bs=0.;
      for(int i=0;i<16;i++){
        float x=edge+21.+float(i);
        float phase=mod(x+floor(vUv.y*480.)*910.,4.)*1.57079632679;
        float v=voltage(x);
        bc+=v*cos(phase);bs+=v*sin(phase);
      }
      float burstPhase=bc*bc+bs*bs>0.00001 ? atan(sin(atan(-bs,bc)-3.14159265),cos(atan(-bs,bc)-3.14159265)) : 0.;
      gl_FragColor=vec4(edge,pedestal/16.,locked,burstPhase);
    }`);
  const decode = material(`
    uniform sampler2D received,timing; uniform float lumaKernel[33],chromaKernel[33];
    varying vec2 vUv;
    float sampleSignal(float x,float y){return texture2D(received,vec2(x/910.,y)).r;}
    void main(){
      vec4 sync=texture2D(timing,vec2(0.5,vUv.y));
      // Active video begins 73 samples after the recovered sync trailing edge.
      // If sync is lost this minimal receiver free-runs at nominal line timing.
      float x=sync.r+73.+vUv.x*752.;
      // Separate luma and quadrature chroma using windowed-sinc FIR filters.
      float base=floor(x);
      float y=0.,cw=0.,yw=0.;vec2 iq=vec2(0.);
      for(int i=-16;i<=16;i++){
        float f=float(i);
        float wy=lumaKernel[i+16];
        float wc=chromaKernel[i+16];
        float voltage=(sampleSignal(base+f+0.5,vUv.y)-sync.g-0.075)/0.925;
        float phase=mod(base+f+floor(vUv.y*480.)*910.,4.)*1.57079632679+sync.a;
        y+=voltage*wy; yw+=wy;
        iq+=voltage*2.*vec2(cos(phase),sin(phase))*wc;cw+=wc;
      }
      y/=yw;iq/=cw;
      float r=y+iq.y/0.877,b=y+iq.x/0.493;
      vec3 rgb=vec3(r,(y-0.299*r-0.114*b)/0.587,b);
      gl_FragColor=vec4(clamp(rgb,0.,1.),1.);

    }`);
  const quad = new THREE.Mesh(geometry,encode); quad.frustumCulled=false;
  const scene=new THREE.Scene(); scene.add(quad);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const controls={noise:0, bandwidthMHz:4.2, interference:0, automatic:false, injection:null, injectionGain:0, testGain:1, automaticHum:true, automaticHumGain:0.15, monochrome:false};
  const heldSignals = new Set();
  let clip=null;
  let burstUntil=0, nextBurst=performance.now()/1000+12;
  // Alternate quiet gaps and live mains injection; both last 1–5 seconds.
  let humOn=false, nextHumChange=performance.now()/1000+1+Math.random()*4;
  let previousBandwidth=4.2;
  function render(seconds){
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
      clip.update(seconds);
      const active=clip.active;
      if(active){
        uniforms.clipCurrent.value=active.current;
        uniforms.clipNext.value=active.next || active.current;
        uniforms.clipHasNext.value=active.next?1:0;
        uniforms.clipOffset.value=active.offset;
        uniforms.clipNextStart.value=Math.min(active.nextStart,1e20);
        uniforms.clipEnd.value=active.end;
        uniforms.clipGain.value=clip.gain*clip.manifest.voltageScale;
        uniforms.clipEnabled.value=1;
      }
    }
    uniforms.exposure.value=renderer.toneMappingExposure;
    uniforms.monochrome.value=controls.monochrome?1:0;
    uniforms.time.value=seconds;
    uniforms.humGain.value=heldSignals.has('KeyW')?1:(humOn?controls.automaticHumGain:0);
    uniforms.testGain.value=controls.testGain*(heldSignals.has('boost')?2:1);
    uniforms.humPhase.value=((seconds*60)%1+1)%1;
    uniforms.injection.value=controls.injection || picture.texture;
    uniforms.injectionGain.value=controls.injection ? controls.injectionGain : 0;
    uniforms.noise.value=controls.noise;
    if(controls.bandwidthMHz!==previousBandwidth){
      uniforms.channelKernel.value=lowPassKernel(controls.bandwidthMHz);
      previousBandwidth=controls.bandwidthMHz;
    }
    uniforms.interference.value=Math.max(controls.interference,burst*0.65);
    const target=renderer.getRenderTarget();
    quad.material=prepare;renderer.setRenderTarget(source);renderer.render(scene,camera);
    quad.material=encode;renderer.setRenderTarget(signal);renderer.render(scene,camera);
    quad.material=receive;renderer.setRenderTarget(channel);renderer.render(scene,camera);
    quad.material=recover;renderer.setRenderTarget(timing);renderer.render(scene,camera);
    quad.material=decode;renderer.setRenderTarget(null);renderer.render(scene,camera);
    renderer.setRenderTarget(target);
  }
  function setClip(next){
    clip?.dispose();clip=next;
    uniforms.clipEnabled.value=0;
    uniforms.clipCurrent.value=uniforms.clipNext.value=picture.texture;
    if(!clip)return;
    const ratio=clip.manifest.sampleRate/14318180;
    uniforms.clipRatio.value=ratio;uniforms.clipSamples.value=clip.manifest.samplesPerFrame;uniforms.clipWidth.value=clip.manifest.samplesPerLine;
    // Anti-alias the recorded voltage before sampling it on the game's clock.
    const cutoff=Math.min(0.49,0.45/ratio);
    let total=0;
    for(let i=0;i<17;i++){
      const x=i-8;
      clipFilter[i]=(x===0?2*cutoff:Math.sin(2*Math.PI*cutoff*x)/(Math.PI*x))*(0.54+0.46*Math.cos(Math.PI*x/8));
      total+=clipFilter[i];
    }
    for(let i=0;i<17;i++)clipFilter[i]/=total;
  }
  return {picture, controls, render, heldSignals, setClip, get clip(){return clip;}, disturb(seconds=0.6){burstUntil=performance.now()/1000+seconds;}};
}
