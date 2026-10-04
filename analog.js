// Sampled color composite: 910 samples/line at 4x NTSC color carrier.
// Each texture row is a complete scanline, including sync and blanking.
import * as THREE from './vendor/three-r186/three.module.js';
const W = 910, H = 480;
const VERT = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export function createAnalogPass(renderer) {
  const picture = new THREE.WebGLRenderTarget(768, H, {type: THREE.HalfFloatType, samples: 4});
  const signal = new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer:false});
  const timing = new THREE.WebGLRenderTarget(1, H, {type: THREE.HalfFloatType, depthBuffer:false});
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const uniforms = { picture:{value:picture.texture}, signal:{value:signal.texture}, injection:{value:picture.texture}, injectionGain:{value:0}, time:{value:0}, interference:{value:0}, noise:{value:0.004}, bandwidthMHz:{value:4.2}, timing:{value:timing.texture}, testSignals:{value:new THREE.Vector4()}, impulse:{value:0}, testGain:{value:1}, exposure:{value:0.75}, monochrome:{value:0}, phases:{value:new THREE.Vector4()} };
  const material = fragmentShader => new THREE.ShaderMaterial({uniforms, vertexShader:VERT, fragmentShader, depthTest:false, depthWrite:false, toneMapped:false});
  const encode = material(`
    uniform sampler2D picture,injection; uniform float time,interference,noise,injectionGain,exposure,monochrome;
    uniform vec4 testSignals,phases; uniform float impulse,testGain;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    vec3 display(vec3 rgb){
      rgb*=exposure;
      rgb=clamp((rgb*(2.51*rgb+0.03))/(rgb*(2.43*rgb+0.59)+0.14),0.,1.);
      return mix(rgb*12.92,1.055*pow(rgb,vec3(1./2.4))-0.055,step(vec3(0.0031308),rgb));
    }
    void main(){
      float x=floor(vUv.x*910.); float line=floor(vUv.y*480.);
      float s=0.;
      if(x<67.) s=-0.4;
      else if(x>=80. && x<112.) s=0.2*cos(mod(x+line*910.,4.)*1.57079632679);
      else if(x>=140. && x<892.) {
        vec3 rgb=texture2D(picture,vec2((x-140.+0.5)/752.,vUv.y)).rgb;
        rgb=display(rgb);
        float y=dot(rgb,vec3(0.299,0.587,0.114));
        float i=dot(rgb,vec3(0.596,-0.274,-0.322))*(1.-monochrome);
        float q=dot(rgb,vec3(0.211,-0.523,0.312))*(1.-monochrome);
        float phase=mod(x+line*910.,4.)*1.57079632679;
        s=0.075+0.925*(y+i*cos(phase)+q*sin(phase));
      }
      float n=hash(vec2(x+floor(time*60.)*17.,line))-0.5;
      // A continuous interfering oscillator, indexed by actual sample time.
      // 227.5 carrier cycles per line makes phase alternate on adjacent lines.
      float carrier=sin(mod(x+line*910.,4.)*1.57079632679+time*19.);
      s+=noise*n+interference*0.22*carrier;
      // Test generators inject voltage across the whole line, including sync.
      float sampleIndex=x+line*910.;
      float sampleTime=sampleIndex/14318180.;
      float hum=sin(6.2831853*(sampleTime*60.+phases.x));
      float rf=sin(6.2831853*(sampleTime*1000000.+phases.y));
      // Independent, unsynchronised line-rate pulse source (4.7 us wide).
      float pulsePhase=fract(sampleTime*15680.+phases.z);
      float foreignSync=pulsePhase<0.0737 ? -0.65 : 0.;
      // 1 kHz impulse source with a 0.5 us pulse width.
      float impulses=fract(sampleTime*1000.+phases.w)<0.0005 ? 2.5 : 0.;
      s+=testGain*(testSignals.x*1.2*n+testSignals.y*0.35*hum+
        testSignals.z*0.35*rf+testSignals.w*foreignSync+impulse*impulses);
      if(injectionGain!=0.) s+=texture2D(injection,vUv).r*injectionGain;
      gl_FragColor=vec4(s,0.,0.,1.);
    }`);

  // Separate sync comparator and back-porch clamp, once per scanline.
  const recover = material(`
    uniform sampler2D signal; varying vec2 vUv;
    float voltage(float x){return texture2D(signal,vec2((x+0.5)/910.,vUv.y)).r;}
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
      for(int i=0;i<32;i++){
        float x=edge+13.+float(i);
        float phase=mod(x+floor(vUv.y*480.)*910.,4.)*1.57079632679;
        float v=voltage(x);
        bc+=v*cos(phase);bs+=v*sin(phase);
      }
      float burstPhase=bc*bc+bs*bs>0.00001 ? atan(-bs,bc) : 0.;
      gl_FragColor=vec4(edge,pedestal/16.,locked,burstPhase);
    }`);
  const decode = material(`
    uniform sampler2D signal,timing; uniform float bandwidthMHz;
    varying vec2 vUv;
    float sampleSignal(float x,float y){return texture2D(signal,vec2(x/910.,y)).r;}
    void main(){
      vec4 sync=texture2D(timing,vec2(0.5,vUv.y));
      // Active video begins 73 samples after the recovered sync trailing edge.
      // If sync is lost this minimal receiver free-runs at nominal line timing.
      float x=sync.r+73.+vUv.x*752.;
      // Separate luma and quadrature chroma using windowed-sinc FIR filters.
      float cutoff=clamp(min(bandwidthMHz,2.5)/14.31818,0.01,0.24);
      float chromaCutoff=1./14.31818;
      float base=floor(x);
      float y=0.,cw=0.,yw=0.;vec2 iq=vec2(0.);
      for(int i=-16;i<=16;i++){
        float f=float(i);
        float window=0.54+0.46*cos(3.14159265*f/16.);
        float wy=(i==0 ? 2.*cutoff : sin(6.2831853*cutoff*f)/(3.14159265*f))*window;
        float wc=(i==0 ? 2.*chromaCutoff : sin(6.2831853*chromaCutoff*f)/(3.14159265*f))*window;
        float voltage=(sampleSignal(base+f+0.5,vUv.y)-sync.g-0.075)/0.925;
        float phase=mod(base+f+floor(vUv.y*480.)*910.,4.)*1.57079632679+sync.a;
        y+=voltage*wy; yw+=wy;
        iq+=voltage*2.*vec2(cos(phase),sin(phase))*wc;cw+=wc;
      }
      y/=yw;iq/=cw;
      vec3 rgb=vec3(y)+vec3(0.956,-0.272,-1.106)*iq.x+vec3(0.621,-0.647,1.703)*iq.y;
      gl_FragColor=vec4(clamp(rgb,0.,1.),1.);

    }`);
  const quad = new THREE.Mesh(geometry,encode); quad.frustumCulled=false;
  const scene=new THREE.Scene(); scene.add(quad);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const controls={noise:0, bandwidthMHz:4.2, interference:0, automatic:false, injection:null, injectionGain:0, testGain:1, automaticHum:true, monochrome:false};
  const heldSignals = new Set();
  let burstUntil=0, nextBurst=performance.now()/1000+12;
  // Alternate quiet gaps and live mains injection; both last 1–5 seconds.
  let humOn=false, nextHumChange=performance.now()/1000+1+Math.random()*4;
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
    uniforms.exposure.value=renderer.toneMappingExposure;
    uniforms.monochrome.value=controls.monochrome?1:0;
    uniforms.time.value=seconds;
    uniforms.testSignals.value.set(...['KeyQ','KeyW','KeyE','KeyR'].map(key=>(heldSignals.has(key) || (key==='KeyW' && humOn))?1:0));
    uniforms.impulse.value=heldSignals.has('KeyT')?1:0;
    uniforms.testGain.value=controls.testGain*(heldSignals.has('boost')?2:1);
    uniforms.phases.value.set(...[60,1000000,15680,1000].map(f=>((seconds*f)%1+1)%1));
    uniforms.injection.value=controls.injection || picture.texture;
    uniforms.injectionGain.value=controls.injection ? controls.injectionGain : 0;
    uniforms.noise.value=controls.noise;
    uniforms.bandwidthMHz.value=controls.bandwidthMHz;
    uniforms.interference.value=Math.max(controls.interference,burst*0.65);
    const target=renderer.getRenderTarget();
    quad.material=encode;renderer.setRenderTarget(signal);renderer.render(scene,camera);
    quad.material=recover;renderer.setRenderTarget(timing);renderer.render(scene,camera);
    quad.material=decode;renderer.setRenderTarget(null);renderer.render(scene,camera);
    renderer.setRenderTarget(target);
  }
  return {picture, controls, render, heldSignals, disturb(seconds=0.6){burstUntil=performance.now()/1000+seconds;}};
}
