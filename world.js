/* ============================================================
   crazyhouse: the world (house, yard, fence, trees).

   Every solid is black faces + white edges. The black faces are
   what make it read: parts hide whatever is behind them, so you
   get a clean line drawing instead of a see-through tangle.

   Units are roughly metres. The house sits at the origin with
   its front door facing +z.

   Each top-level piece has a .name so later code can find it
   with scene.getObjectByName('shed') and mess with it.
   ============================================================ */

import * as THREE from '../vendor/three-r186/three.module.js';

const FILL = new THREE.MeshBasicMaterial({
  color: 0x000000,
  // push faces back a hair so their own edges draw on top cleanly
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
const EDGE  = new THREE.LineBasicMaterial({ color: 0xffffff });
const FAINT = new THREE.LineBasicMaterial({ color: 0x3c3c3c });

/* ─── building blocks ───────────────────────── */

// A solid: black faces with a white outline.
function solid(geo, [x, y, z] = [0, 0, 0], rot) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, FILL));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), EDGE));
  g.position.set(x, y, z);
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  return g;
}

const box = (w, h, d, pos, rot) => solid(new THREE.BoxGeometry(w, h, d), pos, rot);

// Loose lines from a list of [a, b] point pairs.
function lines(pairs, mat = EDGE) {
  const pts = pairs.flat().map(p => new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// Rectangle outline in the local XY plane, centred on (x, y).
function rect(w, h, x = 0, y = 0) {
  const l = x - w / 2, r = x + w / 2, b = y - h / 2, t = y + h / 2;
  return [
    [[l, b, 0], [r, b, 0]], [[r, b, 0], [r, t, 0]],
    [[r, t, 0], [l, t, 0]], [[l, t, 0], [l, b, 0]]
  ];
}

// Group a list of parts under one name.
function named(name, ...parts) {
  const g = new THREE.Group();
  g.name = name;
  g.add(...parts);
  return g;
}

/* ─── house dimensions ──────────────────────── */

const W = 8;        // width (x)
const D = 6;        // depth (z)
const BASE = 0.3;   // foundation height
const WALL = 3;     // wall height
const RISE = 2.2;   // gable height
const EAVE = BASE + WALL;
const RIDGE = EAVE + RISE;

/* Flat details (windows, doors) are drawn facing +z in local space,
   then stuck to a wall with this. `along` is left-right as you face
   that wall from outside, `y` is height from the ground. */
function onWall(obj, side, along, y) {
  const off = 0.02;
  const spot = {
    front: [along, y, D / 2 + off, 0],
    back:  [-along, y, -D / 2 - off, Math.PI],
    right: [W / 2 + off, y, -along, Math.PI / 2],
    left:  [-W / 2 - off, y, along, -Math.PI / 2]
  }[side];
  obj.position.set(spot[0], spot[1], spot[2]);
  obj.rotation.y = spot[3];
  return obj;
}

function windowPane(w = 1.1, h = 1.1) {
  return named('window',
    lines([
      ...rect(w, h),
      ...rect(w - 0.16, h - 0.16),
      [[0, -h / 2 + 0.08, 0], [0, h / 2 - 0.08, 0]],
      [[-w / 2 + 0.08, 0, 0], [w / 2 - 0.08, 0, 0]]
    ]),
    box(w + 0.24, 0.07, 0.16, [0, -h / 2 - 0.035, 0.07])   // sill
  );
}

function door(w = 1, h = 2.1) {
  return named('door',
    lines([
      ...rect(w + 0.16, h + 0.08, 0, 0.04),        // trim
      ...rect(w, h),
      ...rect(w - 0.34, h * 0.3, 0, h * 0.2),      // upper panel
      ...rect(w - 0.34, h * 0.3, 0, -h * 0.2)      // lower panel
    ]),
    box(0.08, 0.08, 0.08, [w / 2 - 0.15, -0.06, 0.04])   // knob
  );
}

function roundVent(r = 0.34) {
  return named('vent',
    new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(r, 18)), EDGE),
    lines([[[-r, 0, 0], [r, 0, 0]], [[0, -r, 0], [0, r, 0]]])
  );
}

/* ─── the house ─────────────────────────────── */

function house() {
  const parts = [];

  parts.push(box(W + 0.4, BASE, D + 0.4, [0, BASE / 2, 0]));        // foundation
  parts.push(box(W, WALL, D, [0, BASE + WALL / 2, 0]));             // walls

  // attic: the triangle that fills each gable end
  const tri = new THREE.Shape([
    new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, RISE)
  ]);
  const attic = new THREE.ExtrudeGeometry(tri, { depth: W, bevelEnabled: false });
  attic.rotateY(Math.PI / 2);
  attic.translate(-W / 2, EAVE, 0);
  parts.push(solid(attic));

  // roof: one solid with a chevron cross-section, so the ridge is clean
  const th = Math.atan2(RISE, D / 2);
  const s = Math.sin(th), c = Math.cos(th);
  const T = 0.14;                                  // roof thickness
  const run = Math.hypot(D / 2, RISE) + 0.55;      // slope length incl. overhang
  const tz = c * run, ty = RIDGE - s * run;        // bottom tip of each slope
  const chevron = new THREE.Shape([
    new THREE.Vector2(0, RIDGE),
    new THREE.Vector2(tz, ty),
    new THREE.Vector2(tz + s * T, ty + c * T),
    new THREE.Vector2(0, RIDGE + T / c),
    new THREE.Vector2(-tz - s * T, ty + c * T),
    new THREE.Vector2(-tz, ty)
  ]);
  const LEN = W + 0.9;
  const roof = new THREE.ExtrudeGeometry(chevron, { depth: LEN, bevelEnabled: false });
  roof.rotateY(Math.PI / 2);
  roof.translate(-LEN / 2, 0, 0);
  parts.push(named('roof', solid(roof)));

  // chimney, poking out of the back slope
  parts.push(named('chimney',
    box(0.7, 1.9, 0.7, [2.4, 5.15, -1.3]),
    box(0.86, 0.12, 0.86, [2.4, 6.16, -1.3])
  ));

  // front: door off to the left, a small window, a wide picture window
  const DOOR_X = -1.4;
  parts.push(onWall(door(), 'front', DOOR_X, BASE + 1.05));
  parts.push(onWall(windowPane(1.1, 1.1), 'front', -3.05, 2.0));
  parts.push(onWall(windowPane(2.2, 1.2), 'front', 1.9, 1.95));
  parts.push(named('awning', box(1.6, 0.07, 0.75, [DOOR_X, BASE + 2.4, D / 2 + 0.36], [0.22, 0, 0])));
  parts.push(named('step', box(1.8, 0.3, 0.9, [DOOR_X, 0.15, D / 2 + 0.65])));

  // sides
  parts.push(onWall(windowPane(), 'right', -1.4, 2.0));
  parts.push(onWall(windowPane(), 'right', 1.4, 2.0));
  parts.push(onWall(windowPane(1.3, 1.1), 'left', 0, 2.0));
  parts.push(onWall(roundVent(), 'right', 0, EAVE + 0.95));
  parts.push(onWall(roundVent(), 'left', 0, EAVE + 0.95));

  // back: a back door and two windows
  parts.push(onWall(door(0.95, 2.05), 'back', 2.0, BASE + 1.025));
  parts.push(onWall(windowPane(), 'back', -0.4, 2.0));
  parts.push(onWall(windowPane(), 'back', -2.6, 2.0));
  parts.push(box(1.4, 0.3, 0.8, [-2.0, 0.15, -D / 2 - 0.6]));        // back step

  return named('house', ...parts);
}

/* ─── the yard ──────────────────────────────── */

function ground() {
  const pairs = [];
  const R = 26, STEP = 2;
  for (let v = -R; v <= R; v += STEP) {
    pairs.push([[v, 0, -R], [v, 0, R]]);
    pairs.push([[-R, 0, v], [R, 0, v]]);
  }
  return named('ground', lines(pairs, FAINT));
}

function path() {
  // paving slabs from the front step out to the sidewalk
  const x = -1.4, hw = 0.6, y = 0.01, z0 = D / 2 + 1.1, z1 = 14;
  const pairs = [[[x - hw, y, z0], [x - hw, y, z1]], [[x + hw, y, z0], [x + hw, y, z1]]];
  for (let z = z0; z <= z1; z += 1.2) pairs.push([[x - hw, y, z], [x + hw, y, z]]);
  return named('path', lines(pairs));
}

function mailbox() {
  return named('mailbox',
    box(0.12, 1.1, 0.12, [0, 0.55, 0]),
    box(0.36, 0.34, 0.6, [0, 1.27, 0]),
    box(0.03, 0.3, 0.1, [0.2, 1.4, -0.12])          // the little flag
  );
}

function leafyTree() {
  const canopy = new THREE.IcosahedronGeometry(1.7, 0);
  canopy.scale(1, 1.15, 1);
  return named('tree',
    solid(new THREE.CylinderGeometry(0.16, 0.24, 2.3, 6), [0, 1.15, 0]),
    solid(canopy, [0, 3.5, 0])
  );
}

function pineTree() {
  return named('pine',
    solid(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), [0, 0.6, 0]),
    solid(new THREE.ConeGeometry(1.5, 3.2, 7), [0, 2.6, 0]),
    solid(new THREE.ConeGeometry(1.1, 2.4, 7), [0, 4.1, 0], [0, 0.4, 0])
  );
}

function bush() {
  return named('bush', solid(new THREE.DodecahedronGeometry(0.75, 0), [0, 0.6, 0]));
}

function shed() {
  const w = 2.6, h = 2.1, d = 2.2;
  const doorLines = lines([
    ...rect(0.9, 1.7),
    [[-0.45, -0.85, 0], [0.45, 0.85, 0]]              // the Z brace, sort of
  ]);
  doorLines.position.set(0, 0.85, d / 2 + 0.02);
  return named('shed',
    box(w, h, d, [0, h / 2, 0]),
    box(w + 0.4, 0.1, d + 0.5, [0, h + 0.18, 0], [-0.16, 0, 0]),
    doorLines
  );
}

function fence() {
  const parts = [];
  const Z = -12, X = 13, POST = 0.12, H = 1.3;
  const post = (x, z) => parts.push(box(POST, H, POST, [x, H / 2, z]));
  // back run
  for (let x = -X; x <= X; x += 2) post(x, Z);
  parts.push(box(X * 2, 0.08, 0.05, [0, 0.45, Z]));
  parts.push(box(X * 2, 0.08, 0.05, [0, 1.05, Z]));
  // side runs, from the back corners up to level with the house front
  for (const x of [-X, X]) {
    for (let z = Z + 2; z <= 4; z += 2) post(x, z);
    const len = 4 - Z;
    parts.push(box(0.05, 0.08, len, [x, 0.45, Z + len / 2]));
    parts.push(box(0.05, 0.08, len, [x, 1.05, Z + len / 2]));
  }
  return named('fence', ...parts);
}

function at(obj, x, z, rotY = 0) {
  obj.position.x = x;
  obj.position.z = z;
  obj.rotation.y = rotY;
  return obj;
}

/* ─── everything ────────────────────────────── */

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // distant lines fade into the dark, which does most of the depth work
  scene.fog = new THREE.Fog(0x000000, 16, 46);

  // The cams sit out on the diagonals, so props go off the house's
  // sides (not its corners) and stay within ~9m. Anywhere else and
  // they end up blocking a cam's view of the house.
  scene.add(
    ground(),
    house(),
    path(),
    fence(),
    at(mailbox(), 0.1, 8.6),
    at(leafyTree(), -6.8, -0.5),
    at(pineTree(), 7.4, -1.2),
    at(bush(), 2.3, 4.1),
    at(bush(), 3.5, 3.9),
    at(shed(), 1.0, -8.2)
  );
  return scene;
}
