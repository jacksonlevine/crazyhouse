/* ============================================================
   crazyhouse: title screen, the security cams, input, and
   keeping ghoul1 walking (and drawing him through the ghost pass).
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { buildWorld, ROOMS, roomAt, GLASS_LAYER, CULL_LAYER, captureReflections } from './world.js?v=21';
import { buildPVS } from './pvs.js?v=1';
import { createEmp } from './emp.js?v=6';
import { CAMS, camAt } from './cams.js?v=8';
import { createGhoul } from './ghoul.js?v=12';
import { createGhostPass, GHOST_LAYER } from './ghost.js?v=3';


const $ = id => document.getElementById(id);
const frame   = $('frame');
const canvas  = $('view');
const title   = $('title');
const startBt = $('start');
const camNum  = $('camNum');
const camName = $('camName');
const clock   = $('clock');
const dots    = $('dots');

let state = 'title';
// filled in by debug.js when ?debug is on
const debug = { free: false, fov: null, tick: null, onCam: null };       // 'title' | 'playing'
let camIndex = 0;
let renderer, scene, camera, ghoul, ghost, lamps, emp, ticks, ir, pvs;
const EXPOSURE = 0.75;         // overall brightness of the picture
const RESOLUTION = 1;          // pixel ratio (window.devicePixelRatio for full retina sharpness, at 4x the cost)
const buffer = new THREE.Vector2();
let shiftStart = 0;
let lastFrame = 0;

/* Shadows are drawn once, then only redrawn when something moves. Each
   redraw of a lamp's shadows draws the house around it six times, so:
   - lamps only redraw for ghoul1 while he's actually here (he casts no
     shadow while gone, see ghoul.js),
   - lamps near him take turns: at most SHADOW_TURNS of them redraw per
     frame, and only if he's moved since that lamp last drew him,
   - a lamp he just walked away from gets one more redraw to clear him,
   - when something else moves (a door, an anomaly), lamps near it redraw. */
const NEAR_LAMP = 18;          // feet
const SHADOW_TURNS = 1;        // lamps redrawn per frame for ghoul1 (they take turns)
let nearLamps = new Set(), turn = 0, wasHere = false;
const drawnAt = new Map(), lampAt = new THREE.Vector3();
function refreshShadows() {
  const here = ghoul.presence > 0.5, pos = ghoul.object.position;     // he casts a shadow while mostly here (ghoul.js)
  const now = new Set();
  if (here || wasHere) {
    for (const l of lamps) if (l.isPointLight && l.getWorldPosition(lampAt).distanceTo(pos) < NEAR_LAMP) now.add(l);
  }
  const redraw = new Set();
  if (here) {
    const list = [...now].filter(l => !drawnAt.has(l) || drawnAt.get(l).distanceTo(pos) > 0.08);
    for (let k = 0; k < Math.min(SHADOW_TURNS, list.length); k++) redraw.add(list[(turn + k) % list.length]);
    turn++;
  } else if (wasHere) {
    now.forEach(l => redraw.add(l));                      // he just left: clear his shadow everywhere once
  }
  for (const l of nearLamps) if (!now.has(l)) redraw.add(l);
  const moved = scene.userData.moved;
  if (moved) {
    for (const at of moved) for (const l of lamps) {
      if (l.isPointLight && l.getWorldPosition(lampAt).distanceTo(at) < NEAR_LAMP) redraw.add(l);
    }
    scene.userData.moved = null;
  }
  for (const l of redraw) { l.shadow.needsUpdate = true; drawnAt.set(l, pos.clone()); }
  nearLamps = now;
  wasHere = here;
}

// what the current cam can see this frame (things like the swaying bulb ask it)
const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), around = new THREE.Sphere();
function updateView() {
  camera.updateMatrixWorld();
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
  scene.userData.frustum = frustum;
}

// is ghoul1 anywhere in front of the current cam? (skips the ghost pass if not)
function ghoulInView() {
  around.center.copy(ghoul.object.position);
  around.center.y += 3;
  around.radius = 4;
  return frustum.intersectsSphere(around);
}


/* ─── setup (runs once, on the first START) ─── */

function setup() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    frame.classList.add('no-gl');
    return false;
  }
  // 1 pixel per screen pixel, even on retina screens: a quarter of the work
  // at 2x, and security cam footage is meant to look a little soft
  renderer.setPixelRatio(RESOLUTION);
  // real lighting: shadows from every lamp, and film-like tone mapping
  // so bright lamp light rolls off softly instead of clipping
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  scene = buildWorld();
  const worldRoots = [...scene.children];      // the house and yard (ghoul1 and the EMP come later)
  lamps = scene.userData.lamps;
  // things that move on their own every frame: the clouds, the fire
  ticks = [];
  scene.traverse(o => { if (o.userData.tick) ticks.push(o.userData.tick); });
  // ...and everything that opens, so openTo() can swing doors smoothly
  scene.traverse(o => { if (o.userData.step) ticks.push(o.userData.step); });
  ghoul = createGhoul();
  // he lives on his own layer: the normal render skips him and the
  // ghost pass draws him, so he can blur and fade
  ghoul.object.traverse(o => o.layers.set(GHOST_LAYER));
  scene.add(ghoul.object);
  emp = createEmp(scene);
  // the camera's infrared light: off until night vision is on (always in
  // the scene so switching it on doesn't make the browser stall)
  ir = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(ir);
  // ...so the lights have to reach that layer too, and their shadows include him
  scene.traverse(o => {
    if (!o.isLight) return;
    o.layers.enable(GHOST_LAYER);
    if (o.shadow) { o.shadow.camera.layers.enable(GHOST_LAYER); o.shadow.camera.layers.enable(CULL_LAYER); }
  });
  ghost = createGhostPass(renderer);
  // each window's reflection: one small snapshot apiece, taken now, never again
  captureReflections(renderer, scene);
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);
  camera.layers.enable(GLASS_LAYER);        // the main view draws window glass too
  // per-cam culling: what each cam can see, worked out once (pvs.js)
  pvs = buildPVS(renderer, scene, worldRoots, CAMS, CULL_LAYER);
  scene.userData.pvs = pvs;

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(buffer);
    ghost.setSize(buffer.x, buffer.y);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  CAMS.forEach(() => dots.appendChild(document.createElement('i')));

  // add ?debug to the URL for the debug panel (free cam, FOV, lighting
  // modes) and to poke at the scene from the browser console
  if (new URLSearchParams(location.search).has('debug')) {
    const api = {
      THREE, scene, camera, renderer, CAMS, showCam, ghoul, lamps, fireEmp, toggleNight, frame, debug, pvs,
      isNight: () => night, camIndex: () => camIndex
    };
    window.crazyhouse = api;
    import('./debug.js?v=5').then(m => m.createDebug(api));
  }

  renderer.setAnimationLoop(now => {
    if (state !== 'playing') return;
    // seconds since the last frame, capped so a hidden tab doesn't make him jump
    const dt = Math.min((now - lastFrame) / 1000 || 0, 0.1);
    lastFrame = now;
    ghoul.update(dt, camAt);
    emp.update(dt);
    if (debug.tick) debug.tick(dt);
    ir.position.copy(camera.position);
    // free cam or a changed FOV can see anything, so cull nothing then
    pvs.apply(debug.free || debug.fov ? null : camIndex);
    updateView();
    for (const tick of ticks) tick(dt);
    tickEmp();
    refreshShadows();
    tickClock();
    renderer.render(scene, camera);
    // blur scales with the picture, so it looks the same at any size
    if (ghoulInView()) ghost.render(scene, camera, ghoul.presence, ghoul.blur * buffer.y * 0.022);
  });
  return true;
}

/* ─── cams ──────────────────────────────────── */

function showCam(i) {
  camIndex = (i + CAMS.length) % CAMS.length;
  const c = CAMS[camIndex];
  camera.position.set(...c.pos);
  camera.fov = debug.fov || c.fov;
  if (debug.free) { debug.free = false; if (debug.onCam) debug.onCam(); }
  camera.updateProjectionMatrix();
  camera.lookAt(...c.look);

  camNum.textContent = 'cam ' + (camIndex + 1);
  camName.textContent = c.name;
  [...dots.children].forEach((d, n) => d.classList.toggle('on', n === camIndex));

  // a quick drop to black, like the feed switching over
  frame.classList.remove('cut');
  void frame.offsetWidth;
  frame.classList.add('cut');
}

const next = () => showCam(camIndex + 1);
const prev = () => showCam(camIndex - 1);

/* ─── the clock (night shift starts at midnight) ─── */

function tickClock() {
  const secs = Math.floor((performance.now() - shiftStart) / 1000);
  const h24 = Math.floor(secs / 3600) % 24;
  const m = Math.floor(secs / 60) % 60;
  const s = secs % 60;
  const h12 = h24 % 12 || 12;
  const pad = n => String(n).padStart(2, '0');
  const text = `${h12}:${pad(m)}:${pad(s)} ${h24 < 12 ? 'am' : 'pm'}`;
  if (clock.textContent !== text) clock.textContent = text;
}

/* ─── the EMP ───────────────────────────────── */

/* Fires at the room the current cam is watching. If ghoul1 is in that
   room, he's knocked out of reality. Then it needs RECHARGE seconds
   before it can fire again. */
const RECHARGE = 6;
let empReadyAt = 0;
const empBt = $('emp');

function fireEmp() {
  if (state !== 'playing' || performance.now() < empReadyAt) return;
  empReadyAt = performance.now() + RECHARGE * 1000;
  const room = ROOMS.find(r => r.cam === CAMS[camIndex].name);
  if (room) {
    emp.fire(room);
    const his = roomAt(ghoul.object.position.x, ghoul.object.position.z);
    if (his && his.name === room.name) ghoul.zap();
  }
  frame.classList.remove('emp-hit');
  void frame.offsetWidth;
  frame.classList.add('emp-hit');
}

// the button's charge bar
function tickEmp() {
  const left = Math.max(0, empReadyAt - performance.now()) / (RECHARGE * 1000);
  empBt.style.setProperty('--charge', (1 - left).toFixed(3));
  empBt.classList.toggle('charging', left > 0);
}

/* ─── night vision ──────────────────────────── */

/* Like a real security cam: switching to night vision turns on an
   infrared light at the camera that floods the room it's watching,
   and the picture gets brighter, green and grainy. */
const IR_STRENGTH = 900;
const NV_GAIN = 3;            // how much brighter the picture gets
let night = false;
const nvBt = $('nv');

function toggleNight() {
  if (state !== 'playing') return;
  night = !night;
  frame.classList.toggle('night', night);
  nvBt.classList.toggle('on', night);
  nvBt.setAttribute('aria-pressed', night);
  ir.intensity = night ? IR_STRENGTH : 0;
  renderer.toneMappingExposure = EXPOSURE * (night ? NV_GAIN : 1);
}

// a tile of random grain for the night-vision layer, made once
(function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const x = c.getContext('2d');
  const img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 34;
  }
  x.putImageData(img, 0, 0);
  frame.style.setProperty('--grain', `url(${c.toDataURL()})`);
})();

/* ─── start / quit ──────────────────────────── */

function start() {
  if (state === 'playing') return;
  if (!renderer && !setup()) return;
  state = 'playing';
  shiftStart = performance.now();
  startBt.blur();
  frame.classList.add('playing');
  showCam(0);
}

function quit() {
  state = 'title';
  frame.classList.remove('playing', 'cut');
}

/* ─── input ─────────────────────────────────── */

startBt.addEventListener('click', start);
$('prev').addEventListener('click', prev);
$('next').addEventListener('click', next);
empBt.addEventListener('click', () => { fireEmp(); empBt.blur(); });
nvBt.addEventListener('click', () => { toggleNight(); nvBt.blur(); });

addEventListener('keydown', e => {
  if (e.repeat) return;
  // the debug free cam owns these keys while it's flying
  if (debug.free && ['w', 'a', 's', 'd', 'c', 'shift', 'control', 'escape'].includes(e.key.toLowerCase())) return;
  if (state === 'title') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    return;
  }
  // arrows, the number pad (4 / 6), or A / D
  if (e.key === 'ArrowRight' || e.code === 'Numpad6' || e.key === 'd' || e.key === 'D') {
    e.preventDefault(); next();
  } else if (e.key === 'ArrowLeft' || e.code === 'Numpad4' || e.key === 'a' || e.key === 'A') {
    e.preventDefault(); prev();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault(); toggleNight();
  } else if (e.key === 'e' || e.key === 'E') {
    e.preventDefault(); fireEmp();
  } else if (e.key === 'Escape') {
    quit();
  }
});
