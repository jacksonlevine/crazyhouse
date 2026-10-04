/* ============================================================
   crazyhouse: title screen, the security cams, input, and
   keeping ghoul1 walking (and drawing him through the ghost pass).
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { buildWorld, ROOMS, roomAt, GLASS_LAYER, captureReflections } from './world.js?v=13';
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
let renderer, scene, camera, ghoul, ghost, lamps, emp, skyTick, ir;
const EXPOSURE = 0.75;         // overall brightness of the picture
const buffer = new THREE.Vector2();
let shiftStart = 0;
let lastFrame = 0;

/* Shadows are drawn once, then only redrawn for lamps near ghoul1, so
   his shadow moves with him without redrawing every lamp every frame.
   A lamp he just walked away from gets one more redraw to clear him. */
const NEAR_LAMP = 18;          // feet
let nearLamps = new Set();
const lampAt = new THREE.Vector3();
function refreshShadows() {
  const now = new Set();
  for (const l of lamps) {
    if (l.isPointLight && l.getWorldPosition(lampAt).distanceTo(ghoul.object.position) < NEAR_LAMP) now.add(l);
  }
  // something in the house moved (the closet door, an anomaly): lamps near it redraw too
  const moved = scene.userData.moved;
  if (moved) {
    for (const at of moved) for (const l of lamps) {
      if (l.isPointLight && l.getWorldPosition(lampAt).distanceTo(at) < NEAR_LAMP) now.add(l);
    }
    scene.userData.moved = null;
  }
  for (const l of now) l.shadow.needsUpdate = true;
  for (const l of nearLamps) if (!now.has(l)) l.shadow.needsUpdate = true;
  nearLamps = now;
}

// is ghoul1 anywhere in front of the current cam? (skips the ghost pass if not)
const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), around = new THREE.Sphere();
function ghoulInView() {
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // real lighting: shadows from every lamp, and film-like tone mapping
  // so bright lamp light rolls off softly instead of clipping
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  scene = buildWorld();
  lamps = scene.userData.lamps;
  const heavens = scene.getObjectByName('heavens');
  skyTick = (heavens && heavens.userData.tick) || (() => {});
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
    if (o.shadow) o.shadow.camera.layers.enable(GHOST_LAYER);
  });
  ghost = createGhostPass(renderer);
  // each window's reflection: one small snapshot apiece, taken now, never again
  captureReflections(renderer, scene);
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);
  camera.layers.enable(GLASS_LAYER);        // the main view draws window glass too

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
      THREE, scene, camera, renderer, CAMS, showCam, ghoul, lamps, fireEmp, toggleNight, frame, debug,
      isNight: () => night, camIndex: () => camIndex
    };
    window.crazyhouse = api;
    import('./debug.js?v=3').then(m => m.createDebug(api));
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
    skyTick(dt);
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
