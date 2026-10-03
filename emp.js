/* ============================================================
   crazyhouse: the EMP effect.

   fire(room) sets off crackling electric arcs around the edges of
   a room (along the floor, along the ceiling, and sparking up the
   corners) plus a flickering light inside it, for about a second
   and a half. Purely the look; main.js decides what it hits.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { X, Z, FLOOR, CEIL } from './world.js?v=7';

const LENGTH = 1.5;           // seconds the arcs crackle for
const INSET = 0.5;            // feet in from the room's edges, so walls don't hide the arcs
const MAX_VERTS = 12000;

export function createEmp(scene) {
  const positions = new Float32Array(MAX_VERTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false
  });
  const arcs = new THREE.LineSegments(geo, mat);
  arcs.frustumCulled = false;
  arcs.renderOrder = 10;

  // a light that strobes inside the room while it fires (always in the
  // scene at zero, so turning it on doesn't make the browser stall)
  const flash = new THREE.PointLight(0xffffff, 0, 0, 2);

  scene.add(arcs, flash);

  let edges = [];             // [ax, az, bx, bz] in feet
  let corners = [];
  let t = LENGTH;

  function fire(room) {
    edges = [];
    corners = [];
    let cx = 0, cz = 0, n = 0;
    for (const [x0, x1, y0, y1] of room.rects) {
      const a = X(x0) + INSET, b = X(x1) - INSET, c = Z(y0) + INSET, d = Z(y1) - INSET;
      edges.push([a, c, b, c], [b, c, b, d], [b, d, a, d], [a, d, a, c]);
      corners.push([a, c], [b, c], [b, d], [a, d]);
      cx += (a + b) / 2; cz += (c + d) / 2; n++;
    }
    flash.position.set(cx / n, FLOOR + 6.5, cz / n);
    t = 0;
  }

  let count = 0;
  const push = (x, y, z) => {
    if (count >= MAX_VERTS) return;
    positions[count * 3] = x; positions[count * 3 + 1] = y; positions[count * 3 + 2] = z;
    count++;
  };

  // one jagged arc from a to b, kinked at random every half foot or so
  function bolt(ax, ay, az, bx, by, bz, jag) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(2, Math.round(len / 0.45));
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps, end = i === steps;
      const x = ax + (bx - ax) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      const y = ay + (by - ay) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      const z = az + (bz - az) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      push(px, py, pz); push(x, y, z);
      px = x; py = y; pz = z;
    }
  }

  function update(dt) {
    t += dt;
    if (t >= LENGTH) {
      geo.setDrawRange(0, 0);
      flash.intensity = 0;
      return;
    }
    const fade = 1 - t / LENGTH;
    count = 0;
    for (const [ax, az, bx, bz] of edges) {
      // each edge crackles on and off independently
      if (Math.random() < 0.75) bolt(ax, FLOOR + 0.15, az, bx, FLOOR + 0.15, bz, 0.35);
      if (Math.random() < 0.6) bolt(ax, CEIL - 0.15, az, bx, CEIL - 0.15, bz, 0.35);
      if (Math.random() < 0.35) {
        const h = FLOOR + 1 + Math.random() * 5;
        bolt(ax, h, az, bx, h + (Math.random() - 0.5), bz, 0.6);
      }
    }
    for (const [x, z] of corners) {
      if (Math.random() < 0.5) bolt(x, FLOOR + 0.15, z, x, CEIL - 0.15, z, 0.4);
    }
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, count);
    mat.opacity = fade * (0.55 + Math.random() * 0.45);
    flash.intensity = Math.random() < 0.5 ? 60 * fade * Math.random() : 0;
  }

  return { fire, update, get active() { return t < LENGTH; } };
}
