/* ============================================================
   crazyhouse: ghoul1.

   A tall, thin figure with long hair and a wide grin. He walks a
   loop through the house, and whenever he's in a room that has a
   cam, his head turns to stare straight into it. All the way
   around if it has to.

   Same style as the house: black faces, white edges. The hair is
   white strands over a black curtain, so it hides what's behind it.

   Sizes are in feet. His feet are at y = 0 in his own space, he
   faces +z, and the scene puts him on the floor.
   ============================================================ */

import * as THREE from '../vendor/three-r186/three.module.js';
import { X, Z, FLOOR, FILL, EDGE, solid, lines, roomAt } from './world.js?v=4';

/* The loop he walks, in blueprint pixels (same as world.js), through
   the doorways and around the furniture. It's smoothed into a curve,
   and the curve is checked to stay at least ~0.8 ft from every wall
   and piece of furniture. If you change it, re-run that check (see
   README). */
const ROUTE = [
  [215, 700], [230, 606], [330, 606], [440, 610],                 // foyer, out through the hall
  [560, 645], [582, 560], [585, 390], [660, 385], [790, 400],      // living room, past the sofa and table
  [1135, 402], [1135, 612], [830, 612],                            // round the kitchen island
  [770, 655], [770, 760], [845, 780],                              // past the stove, in the master door
  [1010, 835], [1116, 868], [1116, 965],                           // down the side of the bed
  [1112, 862], [960, 852], [880, 880], [855, 925],                 // back round the foot of it
  [812, 935], [700, 945], [608, 945],                              // through the laundry
  [530, 930], [478, 862], [475, 800],                              // through the bathroom
  [475, 700], [380, 662], [340, 612], [240, 630]                   // back up the hall to the foyer
];

/* A smooth curve through the route would bow outward on the long
   straights. Adding a point just after and just before each corner
   keeps the straights straight and only rounds off the corners. */
function pinCorners(route, d = 22) {
  const out = [];
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    out.push(a);
    if (len > d * 3) {
      out.push([a[0] + dx / len * d, a[1] + dy / len * d]);
      out.push([b[0] - dx / len * d, b[1] - dy / len * d]);
    }
  }
  return out;
}

const SPEED = 1.7;            // feet per second, a slow walk
const STRIDE = 2.2;           // feet per full step cycle
const HEAD_TURN = 2.2;        // how fast his head swings round to a cam (higher = snappier)

const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });

/* ─── a seeded random, so his hair is the same every time ─── */
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/* ─── the head ──────────────────────────────── */

const HEAD = { rx: 0.4, ry: 0.48, rz: 0.42 };

// A point on the front of the head, from face coordinates (u across, v up).
function onFace(u, v, lift = 1.03) {
  const { rx, ry, rz } = HEAD;
  const k = 1 - (u / rx) ** 2 - (v / ry) ** 2;
  return [u * lift, v * lift, rz * Math.sqrt(Math.max(k, 0)) * lift];
}

function face() {
  const pairs = [];
  const poly = pts => { for (let i = 0; i < pts.length - 1; i++) pairs.push([pts[i], pts[i + 1]]); };

  // wide staring eyes
  for (const side of [-1, 1]) {
    const ring = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 * Math.PI * 2;
      ring.push(onFace(side * 0.14 + Math.cos(t) * 0.07, 0.08 + Math.sin(t) * 0.085));
    }
    poly(ring);
  }

  // the grin: a crescent that turns up at the ends, with a row of teeth
  const W = 0.25;
  const top = u => -0.2 + 1.1 * u * u;
  const bottom = u => top(u) - 0.09 * (1 - (u / W) ** 2);
  const n = 20;
  const upper = [], lower = [], middle = [];
  for (let i = 0; i <= n; i++) {
    const u = -W + (2 * W) * i / n;
    upper.push(onFace(u, top(u)));
    lower.push(onFace(u, bottom(u)));
    middle.push(onFace(u, (top(u) + bottom(u)) / 2));
  }
  poly(upper); poly(lower); poly(middle);
  for (let i = 2; i <= n - 2; i += 2) {
    const u = -W + (2 * W) * i / n;
    pairs.push([onFace(u, top(u)), onFace(u, bottom(u))]);
  }

  const g = new THREE.Group();
  g.add(lines(pairs));
  // tiny pinprick pupils
  for (const side of [-1, 1]) {
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), WHITE);
    pupil.position.set(...onFace(side * 0.14, 0.07, 1.05));
    g.add(pupil);
  }
  return g;
}

/* Long hair: strands from the crown, over the skull, then falling
   past the shoulders. Leaves a gap at the front for the face.
   Built around the head's centre. */
function hair() {
  const rand = seeded(1312);
  const { rx, ry, rz } = HEAD;
  const strands = [];
  const N = 34;
  for (let k = 0; k < N; k++) {
    const phi = THREE.MathUtils.degToRad(-150 + 300 * k / (N - 1));   // 0 = straight back
    const sx = Math.sin(phi), sz = -Math.cos(phi);
    const pts = [];
    // over the skull
    for (const latDeg of [82, 65, 45, 25, 5, -12]) {
      const lat = THREE.MathUtils.degToRad(latDeg);
      pts.push([rx * 1.06 * Math.cos(lat) * sx, ry * 1.06 * Math.sin(lat), rz * 1.06 * Math.cos(lat) * sz]);
    }
    // then down past the shoulders, flaring out over them
    const len = 2.25 + 0.55 * (1 + Math.cos(phi)) / 2 + (rand() - 0.5) * 0.25;
    const startR = Math.cos(THREE.MathUtils.degToRad(-12)) * 1.06;
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const drop = 0.12 + (len - 0.12) * f;
      const flare = THREE.MathUtils.smoothstep(drop, 0.1, 0.95);
      const r = THREE.MathUtils.lerp(startR, 2.15, flare);
      const wob = (rand() - 0.5) * 0.06;
      pts.push([(rx * r + wob) * sx, -ry * 0.25 - drop, (rz * r * 0.9 + wob) * sz]);
    }
    strands.push(pts);
  }

  // black curtain between neighbouring strands, so the hair hides what's behind it
  const pos = [];
  for (let k = 0; k < strands.length - 1; k++) {
    const a = strands[k], b = strands[k + 1];
    for (let i = 0; i < a.length - 1; i++) {
      pos.push(...a[i], ...b[i], ...a[i + 1], ...a[i + 1], ...b[i], ...b[i + 1]);
    }
  }
  const curtainGeo = new THREE.BufferGeometry();
  curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

  const pairs = [];
  for (const s of strands) for (let i = 0; i < s.length - 1; i++) pairs.push([s[i], s[i + 1]]);

  const g = new THREE.Group();
  g.add(new THREE.Mesh(curtainGeo, FILL), lines(pairs));
  return g;
}

/* ─── the body ──────────────────────────────── */

const HIP = 3.2, SHOULDER = 5.25, NECK_TOP = 5.72, HEAD_Y = 0.45;

function limb(w, len, d) {
  // a box hanging down from its pivot
  return solid(new THREE.BoxGeometry(w, len, d), [0, -len / 2, 0]);
}

export function createGhoul() {
  const root = new THREE.Group();
  root.name = 'ghoul1';
  const body = new THREE.Group();
  root.add(body);

  // legs
  const legs = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, HIP, 0);
    pivot.add(limb(0.3, HIP - 0.15, 0.34));
    pivot.add(solid(new THREE.BoxGeometry(0.32, 0.15, 0.62), [0, -HIP + 0.075, 0.12]));   // foot
    body.add(pivot);
    return pivot;
  });

  // hips + torso (a squashed hexagon, flat at the front)
  body.add(solid(new THREE.BoxGeometry(0.78, 0.4, 0.44), [0, HIP, 0]));
  const torsoGeo = new THREE.CylinderGeometry(0.52, 0.36, SHOULDER - HIP, 6);
  torsoGeo.rotateY(Math.PI / 6);
  torsoGeo.scale(1, 1, 0.62);
  body.add(solid(torsoGeo, [0, (HIP + SHOULDER) / 2, 0]));

  // long arms with long fingers, reaching past his knees
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.64, SHOULDER - 0.08, 0);
    const len = 2.9;
    pivot.add(limb(0.2, len, 0.22));
    pivot.add(solid(new THREE.BoxGeometry(0.22, 0.36, 0.1), [0, -len - 0.16, 0]));     // hand
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const x = -0.08 + f * 0.053;
      fingers.push([[x, -len - 0.32, 0], [x * 1.4, -len - 0.82, 0.03]]);
    }
    pivot.add(lines(fingers));
    body.add(pivot);
    return pivot;
  });

  // neck
  body.add(solid(new THREE.CylinderGeometry(0.1, 0.13, NECK_TOP - SHOULDER + 0.1, 6), [0, (SHOULDER + NECK_TOP) / 2, 0]));

  // head: yaw (turns, takes the hair with it) → pitch (nods, face only)
  const headYaw = new THREE.Group();
  headYaw.position.y = NECK_TOP;
  body.add(headYaw);
  const headPitch = new THREE.Group();
  headPitch.position.y = HEAD_Y;
  headYaw.add(headPitch);

  const skullGeo = new THREE.SphereGeometry(1, 10, 8);
  skullGeo.scale(HEAD.rx, HEAD.ry, HEAD.rz);
  headPitch.add(new THREE.Mesh(skullGeo, FILL));   // no facet lines, so the face reads clean
  headPitch.add(face());

  const hairGroup = hair();
  hairGroup.position.y = HEAD_Y;
  headYaw.add(hairGroup);

  /* ─── walking ─── */
  const curve = new THREE.CatmullRomCurve3(
    pinCorners(ROUTE).map(([px, py]) => new THREE.Vector3(X(px), FLOOR, Z(py))), true, 'centripetal');
  const length = curve.getLength();

  let dist = 0;                 // feet walked along the loop
  let bodyYaw = null;
  let yaw = 0, pitch = 0;       // head, relative to the body
  const here = new THREE.Vector3(), tangent = new THREE.Vector3();
  const headWorld = new THREE.Vector3();

  function turnToward(current, target, rate, dt) {
    let d = target - current;
    d = Math.atan2(Math.sin(d), Math.cos(d));           // shortest way round
    return current + d * (1 - Math.exp(-rate * dt));
  }

  /* camFor(name) → [x, y, z] of that cam, or null. */
  function update(dt, camFor) {
    if (!api.paused) dist = (dist + SPEED * dt) % length;
    const u = dist / length;
    curve.getPointAt(u, here);
    curve.getTangentAt(u, tangent);

    // body: on the path, turning smoothly to face where he's going
    const want = Math.atan2(tangent.x, tangent.z);
    bodyYaw = bodyYaw === null ? want : turnToward(bodyYaw, want, 4, dt);
    root.position.copy(here);
    root.rotation.y = bodyYaw;

    // stride
    const phase = dist / STRIDE * Math.PI * 2;
    const swing = Math.sin(phase);
    legs[0].rotation.x = swing * 0.3;
    legs[1].rotation.x = -swing * 0.3;
    arms[0].rotation.x = -swing * 0.22;
    arms[1].rotation.x = swing * 0.22;
    body.position.y = Math.abs(Math.cos(phase)) * 0.07;

    // head: stare at this room's cam, if it has one
    const room = roomAt(here.x, here.z);
    const cam = room && room.cam ? camFor(room.cam) : null;
    let wantYaw = 0, wantPitch = 0;
    if (cam) {
      headPitch.getWorldPosition(headWorld);
      const dx = cam[0] - headWorld.x, dy = cam[1] - headWorld.y, dz = cam[2] - headWorld.z;
      wantYaw = Math.atan2(dx, dz) - bodyYaw;
      wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    yaw = turnToward(yaw, wantYaw, HEAD_TURN, dt);
    pitch = turnToward(pitch, wantPitch, HEAD_TURN, dt);
    headYaw.rotation.y = yaw;
    headPitch.rotation.x = -pitch;

    return room ? room.name : null;
  }

  // Drop him at the closest point on his loop to blueprint pixel (px, py).
  function jumpTo(px, py) {
    const target = new THREE.Vector3(X(px), FLOOR, Z(py));
    let best = Infinity;
    for (let i = 0; i < 1000; i++) {
      const d = curve.getPointAt(i / 1000).distanceTo(target);
      if (d < best) { best = d; dist = i / 1000 * length; }
    }
    bodyYaw = null;
  }

  // paused: stops him walking (his head still turns). Handy with ?debug.
  const api = { object: root, update, jumpTo, paused: false, curve, route: ROUTE };
  return api;
}
