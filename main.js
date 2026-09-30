/* ============================================================
   crazyhouse: title screen, the four security cams, input.
   ============================================================ */

import * as THREE from '../vendor/three-r186/three.module.js';
import { buildWorld } from './world.js?v=1';

/* The four cams, in order around the house. Pressing right moves to
   the next one, which is also the one to your right. */
const CAMS = [
  { name: 'front yard', pos: [-10.5, 6.6, 11.5], look: [0.6, 2.1, 0.4], fov: 52 },
  { name: 'side yard',  pos: [ 12.0, 6.9,  9.0], look: [-0.4, 2.2, -0.8], fov: 50 },
  { name: 'backyard',   pos: [ 11.0, 6.4, -11.0], look: [-0.6, 2.0, -1.2], fov: 54 },
  { name: 'back fence', pos: [-11.5, 6.8, -9.5], look: [0.4, 2.2, 0.2], fov: 50 }
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
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 200);

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
