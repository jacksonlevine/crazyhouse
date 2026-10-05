/* ============================================================
   crazyhouse: the debug panel. Only loads with ?debug in the URL.

   - Free cam: F (or the button). WASD moves, the mouse looks (click
     the view to grab the mouse, Esc to let go), Shift goes up, Ctrl
     or C goes down. (Ctrl+W closes the browser tab and no web page
     can stop that, so C is the safe way down.)
   - FOV slider, for the current cam or all of them.
   - Night vision and fully lit buttons, and lighting off (L): flat
     colours, no lights or shadows, to see what the lighting costs.
   - Copy cam: copies where you are as a line for cams.js.
   - First person (P): walk round the house and yard (firstperson.js):
     WASD, mouse, Shift runs, E opens doors and inspects things.
   - ghoul1: he's despawned for now; spawn him, show him, freeze him.
   - Light switches: every circuit as a button, and all on / all off.
   - Open it all: swings open (or shut) everything that opens: every
     door, both closets, the fridge and freezer, the washer lid, the dryer
     door, the kitchen cabinets, the shower door and the bead curtain.
   ============================================================ */

export function createDebug(api) {
  const { THREE, scene, camera, CAMS, showCam, ghoul, toggleNight, frame, debug } = api;

  /* ─── the panel ─── */
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="dbg-title">debug</div>
    <button data-act="fp">first person (P)</button>
    <div class="dbg-help">WASD walk · mouse looks · Shift runs · E opens doors and inspects things</div>
    <button data-act="free">free cam (F)</button>
    <div class="dbg-help">WASD move · click view, then mouse looks · Shift up · Ctrl or C down · Esc lets go of the mouse</div>
    <label>speed <input type="range" min="2" max="40" step="1" value="12" data-in="speed"> <span data-out="speed">12</span> ft/s</label>
    <label>fov <input type="range" min="15" max="120" step="1" value="64" data-in="fov"> <span data-out="fov">64</span>°</label>
    <label class="dbg-check"><input type="checkbox" data-in="allcams"> use this fov on all cams</label>
    <div class="dbg-row">
      <button data-act="night">night vision</button>
      <button data-act="lit">fully lit</button>
      <button data-act="unlit">lighting off (L)</button>
    </div>
    <div class="dbg-row">
      <button data-act="spawn">spawn ghoul</button>
      <button data-act="ghoul">show ghoul</button>
      <button data-act="freeze">freeze ghoul</button>
    </div>
    <button data-act="open">open it all</button>
    <details class="dbg-lights"><summary>light switches</summary>
      <div class="dbg-row"><button data-act="lights-on">all on</button><button data-act="lights-off">all off</button></div>
      <div class="dbg-switches"></div>
    </details>
    <button data-act="copy">copy cam</button>
    <pre class="dbg-read" data-out="read"></pre>`;
  document.body.appendChild(panel);
  const $ = sel => panel.querySelector(sel);
  const btn = act => $(`[data-act="${act}"]`);
  const out = name => $(`[data-out="${name}"]`);

  /* ─── free cam ─── */
  let yaw = 0, pitch = 0, speed = 12;
  const keys = new Set();

  function setFree(on) {
    debug.free = on;
    if (on) {
      // start from wherever the current cam is looking
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z);
      pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      showCam(api.camIndex());
    }
    btn('free').classList.toggle('on', on);
  }
  debug.onCam = () => { btn('free').classList.remove('on'); keys.clear(); };

  frame.addEventListener('click', e => {
    if (debug.free && !e.target.closest('button')) frame.requestPointerLock();
  });
  addEventListener('mousemove', e => {
    if (!debug.free || document.pointerLockElement !== frame) return;
    yaw -= e.movementX * 0.0025;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.5, 1.5);
  });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input')) return;
    const k = e.key.toLowerCase();
    if (k === 'p' && !e.repeat) { toggleFP(); return; }
    if (k === 'l' && !e.repeat) { setUnlit(!debug.unlit); return; }
    if (debug.fp) return;
    if (k === 'f' && !e.repeat) { setFree(!debug.free); return; }
    if (!debug.free) return;
    if (['w', 'a', 's', 'd', 'c', 'shift', 'control'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  debug.tick = dt => {
    if (debug.fp && fp) fp.update(dt);
    showSwitches();
    frameMs = frameMs * 0.95 + dt * 1000 * 0.05;
    if (debug.free) {
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const step = speed * dt;
      if (keys.has('w')) camera.position.addScaledVector(fwd, step);
      if (keys.has('s')) camera.position.addScaledVector(fwd, -step);
      if (keys.has('d')) camera.position.addScaledVector(right, step);
      if (keys.has('a')) camera.position.addScaledVector(right, -step);
      if (keys.has('shift')) camera.position.y += step;
      if (keys.has('control') || keys.has('c')) camera.position.y -= step;
    }
    readout();
  };

  /* ─── sliders ─── */
  $('[data-in="speed"]').addEventListener('input', e => {
    speed = +e.target.value;
    out('speed').textContent = speed;
  });
  const fovIn = $('[data-in="fov"]'), allCams = $('[data-in="allcams"]');
  function applyFov() {
    const v = +fovIn.value;
    out('fov').textContent = v;
    camera.fov = v;
    camera.updateProjectionMatrix();
    debug.fov = allCams.checked ? v : null;
  }
  fovIn.addEventListener('input', applyFov);
  allCams.addEventListener('change', applyFov);

  /* ─── lighting modes ─── */
  btn('night').addEventListener('click', () => {
    toggleNight();
    btn('night').classList.toggle('on', api.isNight());
  });

  // fully lit: strong even light everywhere and no fog, to see how
  // everything is put together. (The light is added on first use.)
  let flood = null, lit = false;
  const keepFog = scene.fog;
  btn('lit').addEventListener('click', () => {
    lit = !lit;
    if (!flood) { flood = new THREE.AmbientLight(0xffffff, 0); scene.add(flood); flood.layers.enableAll(); }
    flood.intensity = lit ? 2.6 : 0;
    scene.fog = lit ? null : keepFog;
    btn('lit').classList.toggle('on', lit);
  });

  // lighting off: every surface flat in its own colour, no lights, no
  // shadows. Shows what the lighting costs (watch the fps) and shows
  // everything plainly. Switching takes a moment (shaders get rebuilt).
  const flatMats = new Map(), wasMat = new Map(), darkened = [];
  function setUnlit(on) {
    debug.unlit = on;
    if (on) {
      scene.traverse(o => {
        if (o.isLight && o.visible) { darkened.push(o); o.visible = false; }
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m = o.material;
        if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
        if (!flatMats.has(m)) flatMats.set(m, new THREE.MeshBasicMaterial({
          color: m.color, map: m.map, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent,
          opacity: m.opacity, alphaTest: m.alphaTest, fog: m.fog,
          polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits
        }));
        wasMat.set(o, m);
        o.material = flatMats.get(m);
      });
    } else {
      wasMat.forEach((m, o) => { o.material = m; });
      wasMat.clear();
      darkened.forEach(l => { l.visible = true; });             // the light budget sorts them out next frame
      darkened.length = 0;
    }
    btn('unlit').classList.toggle('on', on);
  }
  btn('unlit').addEventListener('click', () => setUnlit(!debug.unlit));

  /* ─── ghoul ─── */
  /* ─── light switches ─── */
  const sw = scene.userData.switches, swBox = $('.dbg-switches');
  for (const name of sw.names) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.circuit = name;
    b.addEventListener('click', () => { sw.toggle(name); b.blur(); });
    swBox.appendChild(b);
  }
  btn('lights-on').addEventListener('click', () => sw.all(true));
  btn('lights-off').addEventListener('click', () => sw.all(false));
  const showSwitches = () => swBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', sw.isOn(b.dataset.circuit)));

  /* ─── first person ─── */
  let fp = null;
  import('./firstperson.js?v=2').then(m => { fp = api.fp = m.createFirstPerson({ scene, camera, frame }); });
  const leaveFP = () => {
    if (!debug.fp) return;
    fp.exit();
    debug.fp = false;
    btn('fp').classList.remove('on');
  };
  debug.leaveFP = leaveFP;
  function toggleFP() {
    if (!fp) return;
    if (debug.fp) { leaveFP(); showCam(api.camIndex()); return; }
    if (debug.free) setFree(false);
    debug.fp = true;
    const ms = fp.enter();
    if (ms) console.log(`first person: traced the floor map in ${ms} ms`);
    btn('fp').classList.add('on');
  }
  btn('fp').addEventListener('click', e => { toggleFP(); e.currentTarget.blur(); });

  /* ─── ghoul ─── */
  btn('spawn').addEventListener('click', () => {
    ghoul.enabled = !ghoul.enabled;
    ghoul.object.visible = ghoul.enabled;
    btn('spawn').classList.toggle('on', ghoul.enabled);
    btn('spawn').textContent = ghoul.enabled ? 'despawn ghoul' : 'spawn ghoul';
  });
  btn('ghoul').addEventListener('click', () => {
    ghoul.forcePresence = ghoul.forcePresence === null ? 1 : null;
    btn('ghoul').classList.toggle('on', ghoul.forcePresence !== null);
  });
  btn('freeze').addEventListener('click', () => {
    ghoul.paused = !ghoul.paused;
    btn('freeze').classList.toggle('on', ghoul.paused);
  });

  /* ─── open it all ─── */
  const openers = [];
  scene.traverse(o => { if (o.userData.openTo) openers.push(o); });
  btn('open').addEventListener('click', () => {
    const goal = openers.filter(o => o.userData.open > 0.5).length > openers.length / 2 ? 0 : 1;
    for (const o of openers) o.userData.openTo(goal, 1.5);
    btn('open').classList.toggle('on', goal === 1);
  });

  /* ─── copy the current view as a cams.js line ─── */
  const r = n => Math.round(n * 10) / 10;
  function camLine() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const p = camera.position, look = p.clone().addScaledVector(dir, 10);
    const name = CAMS[api.camIndex()].name;
    return `{ name: '${name}', pos: [${r(p.x)}, ${r(p.y)}, ${r(p.z)}], look: [${r(look.x)}, ${r(look.y)}, ${r(look.z)}], fov: ${Math.round(camera.fov)} },`;
  }
  btn('copy').addEventListener('click', () => {
    const line = camLine();
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => {});
    copied = line;
    copiedUntil = performance.now() + 4000;
  });
  let copied = '', copiedUntil = 0;

  let lastRead = 0, frameMs = 16;
  function readout() {
    const now = performance.now();
    if (now - lastRead < 150) return;
    lastRead = now;
    const p = camera.position;
    const mode = debug.fp ? '(first person)' : debug.free ? '(free cam)' : '(cam ' + (api.camIndex() + 1) + ')';
    let text = `${Math.round(1000 / frameMs)} fps  (${frameMs.toFixed(1)} ms a frame)\npos  ${r(p.x)}, ${r(p.y)}, ${r(p.z)}\nfov  ${Math.round(camera.fov)}°  ${mode}\nghoul ${ghoul.enabled ? ghoul.state : 'despawned'}`;
    if (now < copiedUntil) text += `\ncopied:\n${copied}`;
    out('read').textContent = text;
    // keep the slider honest when cams switch
    if (!debug.fov && document.activeElement !== fovIn && +fovIn.value !== Math.round(camera.fov)) {
      fovIn.value = Math.round(camera.fov);
      out('fov').textContent = fovIn.value;
    }
  }
}
