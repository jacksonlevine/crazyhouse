/* ============================================================
   crazyhouse: title screen, the four security cams, input.
   ============================================================ */

import * as THREE from '../vendor/three-r186/three.module.js';
import { buildWorld, CEIL } from './world.js?v=3';

/* The cams, in the order left/right steps through them. Positions
   are in feet (see world.js: the house is centred on 0, the front
   door faces -x). Inside cams hang just under the ceiling in a room
   corner and look across the room, like real ones do. */
const HIGH = CEIL - 0.4;
const CAMS = [
  { name: 'front yard',     pos: [-78, 27, 50],       look: [-5, 5, 1],          fov: 32 },
  { name: 'foyer',          pos: [-17.2, HIGH, 6.0],  look: [-17.2, 3.5, -2.5],  fov: 64 },
  { name: 'living room',    pos: [-6.0, HIGH, -15.9], look: [-5.5, 3, -2],       fov: 64 },
  { name: 'kitchen',        pos: [2.6, HIGH, -8.9],   look: [13, 3, -1],         fov: 64 },
  { name: 'master bedroom', pos: [5.4, HIGH, 4.3],    look: [14, 3.5, 13],       fov: 64 },
  { name: 'bathroom',       pos: [-3.2, HIGH, 15.9],  look: [-10.5, 3.5, 10.5],  fov: 64 }
];

const $ = id => document.getElementById(id);
const frame   = $('frame');
const canvas  = $('view');
const title   = $('title');
const startBt = $('start');
const camNum  = $('camNum');
const camName = $('camName');
const clock   = $('clock');
const dots    = $('dots');

let state = 'title';       // 'title' | 'playing'
let camIndex = 0;
let renderer, scene, camera;
let shiftStart = 0;

/* ─── setup (runs once, on the first START) ─── */

function setup() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    frame.classList.add('no-gl');
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = buildWorld();
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  CAMS.forEach(() => dots.appendChild(document.createElement('i')));

  // add ?debug to the URL to poke at the scene from the browser console
  if (new URLSearchParams(location.search).has('debug')) {
    window.crazyhouse = { THREE, scene, camera, renderer, CAMS, showCam };
  }

  renderer.setAnimationLoop(() => {
    if (state !== 'playing') return;
    tickClock();
    renderer.render(scene, camera);
  });
  return true;
}

/* ─── cams ──────────────────────────────────── */

function showCam(i) {
  camIndex = (i + CAMS.length) % CAMS.length;
  const c = CAMS[camIndex];
  camera.position.set(...c.pos);
  camera.fov = c.fov;
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

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (state === 'title') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    return;
  }
  // arrows, the number pad (4 / 6), or A / D
  if (e.key === 'ArrowRight' || e.code === 'Numpad6' || e.key === 'd' || e.key === 'D') {
    e.preventDefault(); next();
  } else if (e.key === 'ArrowLeft' || e.code === 'Numpad4' || e.key === 'a' || e.key === 'A') {
    e.preventDefault(); prev();
  } else if (e.key === 'Escape') {
    quit();
  }
});
