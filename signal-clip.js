import * as THREE from './vendor/three-r186/three.module.js';

export function validateSignalManifest(m) {
  if (m?.format !== 'composite-lab-signal' || m.version !== 1 || m.encoding !== 'float32-le') throw new Error('Unsupported signal recording format');
  if (!Number.isFinite(m.sampleRate) || m.sampleRate < 1e6 || m.sampleRate > 120e6 ||
      !Number.isInteger(m.samplesPerLine) || m.samplesPerLine < 100 || m.samplesPerLine > 8192 ||
      m.linesPerFrame !== 525 || m.samplesPerFrame !== m.samplesPerLine * 525 ||
      !Number.isFinite(m.duration) || m.duration <= 0 || !Number.isFinite(m.voltageScale) || m.voltageScale <= 0 || m.voltageScale > 10 ||
      Math.abs(m.sampleRate / m.samplesPerLine - 15734.265734) > 1) throw new Error('Invalid signal timing or voltage metadata');
  if (!Array.isArray(m.tracks) || !m.tracks.length || m.tracks.length > 64 ||
      m.tracks.some(t => !/^[a-zA-Z0-9-]{1,80}$/.test(t.id)) || new Set(m.tracks.map(t=>t.id)).size !== m.tracks.length) throw new Error('Invalid signal tracks');
  if (!Array.isArray(m.frames) || !m.frames.length || m.frames.some((f,i)=>f.index !== i || !Number.isFinite(f.timestamp) || f.timestamp < 0 || f.timestamp >= m.duration || (i && f.timestamp <= m.frames[i-1].timestamp))) throw new Error('Invalid recording timeline');
  return m;
}

// Bounded chunk cache. Loading never reads the full recording into memory.
export class SignalClip {
  constructor(manifest, readChunk) {
    this.manifest=validateSignalManifest(manifest); this.readChunk=readChunk;
    this.track='all'; this.enabled=true; this.gain=0.25; this.error='';
    this.cache=new Map(); this.pending=new Map(); this.generation=0; this.started=null; this.disposed=false;
    this.active=null;
  }
  async load(index) {
    if(index<0 || index>=this.manifest.frames.length || this.disposed) return;
    if(this.cache.has(index)) return this.cache.get(index);
    if(this.pending.has(index)) return this.pending.get(index);
    const generation=this.generation;
    const task=(async()=>{
      const tracks=this.track==='all'?this.manifest.tracks:this.manifest.tracks.filter(t=>t.id===this.track);
      let sum=null;
      for(const track of tracks){
        const bytes=await this.readChunk(`${track.id}/${String(index).padStart(6,'0')}.f32`);
        if(bytes.byteLength !== this.manifest.samplesPerFrame*4) throw new Error('Signal chunk has the wrong sample count');
        const data=new Float32Array(bytes);
        if(!sum) sum=new Float32Array(data.length);
        for(let i=0;i<data.length;i++){
          if(!Number.isFinite(data[i])) throw new Error('Signal recording contains non-finite voltage');
          sum[i]+=data[i];
          if(!Number.isFinite(sum[i]))throw new Error('Mixed signal voltage overflow');
        }
      }
      if(this.disposed || generation!==this.generation) return;
      const texture=new THREE.DataTexture(sum,this.manifest.samplesPerLine,525,THREE.RedFormat,THREE.FloatType);
      texture.minFilter=texture.magFilter=THREE.NearestFilter; texture.generateMipmaps=false; texture.needsUpdate=true;
      this.cache.set(index,texture);
      while(this.cache.size>4){const oldest=this.cache.keys().next().value; this.cache.get(oldest).dispose(); this.cache.delete(oldest);}
      return texture;
    })().catch(e=>{if(generation===this.generation && !this.disposed){this.error=e.message;this.enabled=false;}}).finally(()=>{if(generation===this.generation)this.pending.delete(index);});
    this.pending.set(index,task);return task;
  }
  setTrack(id) {
    if(id!=='all' && !this.manifest.tracks.some(t=>t.id===id)) throw new Error('Unknown signal track');
    this.generation++;this.pending.clear();for(const texture of this.cache.values())texture.dispose();this.cache.clear();
    this.track=id;this.error='';this.active=null;
  }
  update(seconds) {
    if(this.started===null)this.started=seconds;
    this.active=null;
    if(!this.enabled || this.disposed || this.error)return;
    const elapsed=((seconds-this.started)%this.manifest.duration+this.manifest.duration)%this.manifest.duration;
    let lo=0,hi=this.manifest.frames.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(this.manifest.frames[mid].timestamp<=elapsed)lo=mid+1;else hi=mid;}
    const index=lo-1;if(index<0){void this.load(0);return;}
    // At most two outstanding reads, including after a seek/long hidden-tab gap.
    if(!this.cache.has(index) && this.pending.size<2)void this.load(index);
    if(!this.cache.has(index+1) && this.pending.size<2)void this.load(index+1);
    const current=this.cache.get(index);if(!current)return;
    const next=this.cache.get(index+1);
    const frame=this.manifest.frames[index];
    const offset=(elapsed-frame.timestamp)*this.manifest.sampleRate;
    const nextStart=index+1<this.manifest.frames.length ? (this.manifest.frames[index+1].timestamp-frame.timestamp)*this.manifest.sampleRate : Infinity;
    const end=(this.manifest.duration-frame.timestamp)*this.manifest.sampleRate;
    if(offset>=this.manifest.samplesPerFrame && offset<nextStart)return; // Explicit capture gap: no invented samples.
    this.active={current,next,offset,nextStart,end};
  }
  dispose(){this.disposed=true;this.generation++;for(const texture of this.cache.values())texture.dispose();this.cache.clear();this.active=null;}
}

export async function openSignalFolder(files) {
  const list=Array.from(files);
  const manifests=list.filter(f=>f.name==='manifest.json');
  if(manifests.length!==1)throw new Error('Choose one recording folder containing manifest.json');
  const file=manifests[0],relative=file.webkitRelativePath || file.name;
  const prefix=relative.slice(0,-'manifest.json'.length);
  const byPath=new Map(list.map(f=>[f.webkitRelativePath || f.name,f]));
  const manifest=validateSignalManifest(JSON.parse(await file.text()));
  // Validate presence before starting playback; individual chunks load on demand.
  for(const track of manifest.tracks)for(const frame of manifest.frames){
    const path=`${prefix}${track.id}/${String(frame.index).padStart(6,'0')}.f32`;
    const chunk=byPath.get(path);if(!chunk || chunk.size!==manifest.samplesPerFrame*4)throw new Error(`Missing or incomplete signal chunk: ${path}`);
  }
  return new SignalClip(manifest,async path=>byPath.get(prefix+path).arrayBuffer());
}

export async function openSignalURL(url) {
  const base=new URL(url,location.href);
  const response=await fetch(base);if(!response.ok)throw new Error(`Signal manifest: HTTP ${response.status}`);
  return new SignalClip(await response.json(),async path=>{
    const chunk=await fetch(new URL(path,base));if(!chunk.ok)throw new Error(`Signal chunk: HTTP ${chunk.status}`);return chunk.arrayBuffer();
  });
}
