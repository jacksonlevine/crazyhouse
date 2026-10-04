/* ============================================================
   crazyhouse: the debug panel. Only loads with ?debug in the URL.

   - Free cam: F (or the button). WASD moves, the mouse looks (click
     the view to grab the mouse, Esc to let go), Shift goes up, Ctrl
     or C goes down. (Ctrl+W closes the browser tab and no web page
     can stop that, so C is the safe way down.)
   - FOV slider, for the current cam or all of them.
   - Night vision and fully lit buttons.
   - Copy cam: copies where you are as a line for cams.js.
   - ghoul1: show him / freeze him.
   - Closet door: folds the accordion door open or shut.
   ============================================================ */

export function createDebug(api) {
  const { THREE, scene, camera, CAMS, showCam, ghoul, toggleNight, frame, debug } = api;

  /* ─── the panel ─── */
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="dbg-title">debug</div>
    <button data-act="free">free cam (F)</button>
    <div class="dbg-help">WASD move · click view, then mouse looks · Shift up · Ctrl or C down · Esc lets go of the mouse</div>
    <label>speed <input type="range" min="2" max="40" step="1" value="12" data-in="speed"> <span data-out="speed">12</span> ft/s</label>
    <label>fov <input type="range" min="15" max="120" step="1" value="64" data-in="fov"> <span data-out="fov">64</span>°</label>
    <label class="dbg-check"><input type="checkbox" data-in="allcams"> use this fov on all cams</label>
    <div class="dbg-row">
      <button data-act="night">night vision</button>
      <button data-act="lit">fully lit</button>
    </div>
    <div class="dbg-row">
      <button data-act="ghoul">show ghoul</button>
      <button data-act="freeze">freeze ghoul</button>
    </div>
    <button data-act="closet">closet door</button>
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
    if (k === 'f' && !e.repeat) { setFree(!debug.free); return; }
    if (!debug.free) return;
    if (['w', 'a', 's', 'd', 'c', 'shift', 'control'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  debug.tick = dt => {
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
    // fold the closet door toward where the button sent it
    if (closet && closetGoal !== null) {
      const o = closet.userData.open, step = dt * 1.2;
      closet.userData.setOpen(Math.abs(closetGoal - o) <= step ? closetGoal : o + Math.sign(closetGoal - o) * step);
      if (closet.userData.open === closetGoal) closetGoal = null;
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

  /* ─── ghoul ─── */
  btn('ghoul').addEventListener('click', () => {
    ghoul.forcePresence = ghoul.forcePresence === null ? 1 : null;
    btn('ghoul').classList.toggle('on', ghoul.forcePresence !== null);
  });
  btn('freeze').addEventListener('click', () => {
    ghoul.paused = !ghoul.paused;
    btn('freeze').classList.toggle('on', ghoul.paused);
  });

  /* ─── closet door ─── */
  const closet = scene.getObjectByName('door-closet');
  let closetGoal = null;           // only set while the button is moving it
  btn('closet').addEventListener('click', () => {
    closetGoal = closet.userData.open > 0.5 ? 0 : 1;
    btn('closet').classList.toggle('on', closetGoal === 1);
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

  let lastRead = 0;
  function readout() {
    const now = performance.now();
    if (now - lastRead < 150) return;
    lastRead = now;
    const p = camera.position;
    let text = `pos  ${r(p.x)}, ${r(p.y)}, ${r(p.z)}\nfov  ${Math.round(camera.fov)}°  ${debug.free ? '(free cam)' : '(cam ' + (api.camIndex() + 1) + ')'}\nghoul ${ghoul.state}`;
    if (now < copiedUntil) text += `\ncopied:\n${copied}`;
    out('read').textContent = text;
    // keep the slider honest when cams switch
    if (!debug.fov && document.activeElement !== fovIn && +fovIn.value !== Math.round(camera.fov)) {
      fovIn.value = Math.round(camera.fov);
      out('fov').textContent = fovIn.value;
    }
  }
}
