/* ============================================================
   crazyhouse: the world.

   The house started out built straight off blueprint.png, and
   it's free to drift from it now. Every plan coordinate in this
   file is still a PIXEL on that image, so you can open it in any
   image editor, hover a spot, and find the same numbers here. X() and Z() turn pixels into feet (27.42 px per
   foot, taken from the plan's 42' and 34' dimensions). Heights
   are in feet.

   Every solid is a lit grey surface with dark ink edges. Real
   lights (a lamp in each room, a streetlight, faint moonlight) cast
   real shadows, so light only reaches what it can actually see:
   through doorways, out of windows, into the yard.

   Walls are extruded from their elevation, so windows are real
   holes and doorways are real gaps. Where two walls meet at a
   corner, both ends are cut on the diagonal (a mitre) so no
   stray seam lines show up on the faces.

   Top-level pieces have a .name (sofa, bed, door-front, ...) so
   later code can grab one with scene.getObjectByName() and mess
   with it.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

/* ─── units ─────────────────────────────────── */

const K = 27.42;                          // blueprint pixels per foot
export const X = px => (px - 680.5) / K;         // blueprint x → feet (house centred on 0)
export const Z = py => (py - 620.5) / K;         // blueprint y → feet

export const FLOOR = 2.5;                 // main floor, feet above the yard
export const CEIL = FLOOR + 8;            // 8' ceilings
const SLAB = 0.4;                         // ceiling thickness
const EAVE = CEIL + SLAB;                 // where the roofs start
const DOOR_H = 6.8;

/* Which room is where, as blueprint rectangles [x0, x1, y0, y1], and
   which cam (by its name in main.js) covers it. First match wins.
   The hall where the stairs used to be counts as the living room. */
export const ROOMS = [
  { name: 'patio',          cam: 'patio',          rects: [[738, 1256, 0, 345]] },
  { name: 'foyer',          cam: 'foyer',          rects: [[105, 295, 482, 814]] },
  { name: 'living room',    cam: 'living room',    rects: [[295, 790, 154, 806], [790, 807, 715, 806]] },
  { name: 'kitchen',        cam: 'kitchen',        rects: [[790, 1256, 345, 715]] },
  { name: 'master bedroom', cam: 'master bedroom', rects: [[807, 1256, 715, 1087]] },
  { name: 'bathroom',       cam: 'bathroom',       rects: [[295, 605, 806, 1087]] },
  { name: 'laundry',        cam: 'laundry',        rects: [[605, 807, 806, 1087]] }
];

export function roomAt(x, z) {
  const px = x * K + 680.5, py = z * K + 620.5;
  for (const r of ROOMS) {
    if (r.rects.some(([x0, x1, y0, y1]) => px >= x0 && px <= x1 && py >= y0 && py <= y1)) return r;
  }
  return null;
}

/* ─── materials ─────────────────────────────── */

/* A surface that light falls on. Grey only, so the picture stays
   black and white. Faces are pushed back a hair so their own edges
   draw on top cleanly. */
export function surface(color, roughness = 0.9, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
}

/* Flat colours, no texture images, so it costs nothing extra to draw. */
const metal = (color, rough = 0.45) => {
  const m = surface(color, rough);
  m.metalness = 0.35;
  return m;
};

export const MAT = {
  wall:      surface(0xd8cdb8),          // warm off-white paint
  ceiling:   surface(0xe9e4da),
  floor:     surface(0x86603d, 0.7),     // wood floorboards
  roof:      surface(0x3a3d42),          // dark slate shingles
  door:      surface(0x7a5232, 0.7),     // stained wood
  frontDoor: surface(0x7c2a24, 0.6),     // red front door
  furniture: surface(0x8a6440, 0.75),    // default: wood
  dark:      surface(0x2b2b2d),          // black stools, stove, lamp bases
  soft:      surface(0xece9e2),          // linens, white things
  porcelain: surface(0xf2f1ec, 0.25),    // toilet, sink, shower
  appliance: surface(0xe6e6e3, 0.4),     // washer, dryer
  steel:     metal(0xb9bec2),            // fridge
  cabinet:   surface(0x76866f, 0.7),     // sage kitchen cabinets
  sofa:      surface(0x4c5b70),          // blue-grey fabric
  armchair:  surface(0x3e5a45),          // bottle green
  mustard:   surface(0x9c7a36),          // tub chairs
  brick:     surface(0x7b3d2f),          // hearth
  wood:      surface(0x8b6b4a, 0.85),    // weathered porch decking
  ground:    surface(0x355f2a, 1),       // grass
  concrete:  surface(0x9a968d, 0.95),
  bark:      surface(0x4a3626, 1),
  leaves:    surface(0x2f5a2b, 1),
  pine:      surface(0x24432a, 1),
  pole:      metal(0x2e3832, 0.6),       // streetlight, dark green paint
  trim:      surface(0xefede6, 0.6),     // white window frames
  track:     metal(0x6b6f72, 0.5),       // sliding door frames
  // faint see-through glass. Unlit on purpose: lit glass shows every lamp
  // as a hard white dot. It reflects a snapshot of what's around it instead
  // (captureReflections), so this colour is just the slight dark tint.
  glass:     new THREE.MeshBasicMaterial({
    color: 0x10161b, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
    combine: THREE.MixOperation, reflectivity: 0.45
  }),
  basin:     (() => {                     // the inside of the kitchen sink
    const m = surface(0xa7adb1, 0.3, THREE.BackSide);
    m.metalness = 0.35;
    return m;
  })(),
  glow:      new THREE.MeshBasicMaterial({ color: 0xfff0d4 })   // lampshades, bulbs: they ARE the light
};

// dark ink edges: they vanish into the dark, and outline whatever's lit
export const EDGE  = new THREE.LineBasicMaterial({ color: 0x0b0b0b });

/* ─── building blocks ───────────────────────── */

// A solid: a lit surface with an ink outline.
export function solid(geo, [x, y, z] = [0, 0, 0], rot, mat = MAT.furniture) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), EDGE));
  g.position.set(x, y, z);
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  return g;
}

function named(name, ...parts) {
  const g = new THREE.Group();
  g.name = name;
  g.add(...parts);
  return g;
}

// Loose lines from a list of [a, b] point pairs (feet).
export function lines(pairs, mat = EDGE) {
  const pts = pairs.flat().map(p => new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// Rewrite every vertex of a geometry through fn(x, y, z) → [x, y, z].
function remap(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [a, b, c] = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, a, b, c);
  }
  p.needsUpdate = true;
  outwardFaces(geo);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* Some remaps mirror the geometry (swapping two axes), which turns
   it inside out. Light and shadows care which way faces point, so
   if the shape's volume comes out negative, flip every triangle. */
function outwardFaces(geo) {
  const p = geo.attributes.position;
  if (geo.index) return;
  let vol = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol >= 0) return;
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = a.array[(i + 1) * n + k];
        a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k];
        a.array[(i + 2) * n + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}

/* A box from blueprint pixels (x0..x1, y0..y1) and heights h0..h1.
   Heights are above the main floor unless you pass base = 0. */
function block(x0, x1, y0, y1, h1, h0 = 0, base = FLOOR) {
  const w = X(x1) - X(x0), d = Z(y1) - Z(y0), h = h1 - h0;
  return solid(new THREE.BoxGeometry(w, h, d),
    [(X(x0) + X(x1)) / 2, base + h0 + h / 2, (Z(y0) + Z(y1)) / 2]);
}

// Something round, centred on blueprint pixel (cx, cy). r is in feet.
function round(cx, cy, r, h1, h0 = 0, segs = 12, rTop = r) {
  const h = h1 - h0;
  return solid(new THREE.CylinderGeometry(rTop, r, h, segs), [X(cx), FLOOR + h0 + h / 2, Z(cy)]);
}

// A flat slab from a blueprint polygon, with optional holes, between heights y0..y1.
function slab(outline, holes, y0, y1) {
  const v = ([px, py]) => new THREE.Vector2(X(px), Z(py));
  const shape = new THREE.Shape(outline.map(v));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  return solid(remap(geo, (x, y, z) => [x, y0 + z, y]));
}

// Rectangle outline in the plane of a wall, for mirrors and glass.
function rectOn(P, u0, u1, y0, y1) {
  return [[P(u0, y0), P(u1, y0)], [P(u1, y0), P(u1, y1)], [P(u1, y1), P(u0, y1)], [P(u0, y1), P(u0, y0)]];
}

/* ─── glass ─────────────────────────────────── */

export const GLASS_LAYER = 2;

/* A frame for windows and mirrors, inside an opening. place(u, y, w)
   maps along-the-opening, height and depth to the world (same as
   walls). It's ONE solid: a rectangle with a hole per pane, so the bars
   between panes come free. panes across, rows up. Kept parts aren't
   repainted. */
function paneFrame(place, u0, u1, y0, y1, w, { panes = 1, rows = 1, border = 0.14, bar = 0.08, depth = 0.12, mat = MAT.trim } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(u0, y0); shape.lineTo(u1, y0); shape.lineTo(u1, y1); shape.lineTo(u0, y1);
  const across = (u1 - u0 - border * 2 - bar * (panes - 1)) / panes;
  const up = (y1 - y0 - border * 2 - bar * (rows - 1)) / rows;
  for (let k = 0; k < panes; k++) for (let r = 0; r < rows; r++) {
    const a = u0 + border + k * (across + bar), b = a + across;
    const c = y0 + border + r * (up + bar), d = c + up;
    const hole = new THREE.Path();
    hole.moveTo(a, c); hole.lineTo(b, c); hole.lineTo(b, d); hole.lineTo(a, d);
    shape.holes.push(hole);
  }
  const geo = remap(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
    (u, y, d) => place(u, y, w - depth / 2 + d));
  const frame = solid(geo, [0, 0, 0], null, mat);
  frame.traverse(o => { if (o.isMesh) o.userData.keep = true; });
  return frame;
}

/* A window frame with its glass. The glass is one sheet behind all the
   panes, so each window costs only a couple of draws. */
function glazing(place, u0, u1, y0, y1, w, opts = {}) {
  const b = opts.border ?? 0.14;
  const geo = new THREE.PlaneGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) < 0 ? u0 + b : u1 - b, y = pos.getY(i) < 0 ? y0 + b : y1 - b;
    pos.setXYZ(i, ...place(u, y, w));
  }
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(geo, MAT.glass);
  glass.layers.set(GLASS_LAYER);       // see-through, so it mustn't hide ghoul1 (ghost.js skips this layer)
  glass.userData.keep = true;
  glass.userData.noShadow = true;
  glass.userData.reflect = true;       // gets its own reflection snapshot (captureReflections)
  const g = new THREE.Group();
  g.add(paneFrame(place, u0, u1, y0, y1, w, opts), glass);
  return g;
}

/* Window reflections. Once, at the start, each pane of glass takes a
   tiny six-way snapshot from where it sits, and then faintly reflects
   it. So a window shows the room right around it from inside, and the
   yard and sky from outside. One snapshot each and then it costs
   nothing; the reflections just don't move. (Needs a renderer, so
   main.js calls it.) */
export function captureReflections(renderer, scene) {
  scene.updateMatrixWorld(true);
  const panes = [];
  scene.traverse(o => { if (o.userData.reflect) panes.push(o); });
  // no sky: blown up in a reflection, each star turns into a white block
  const heavens = scene.getObjectByName('heavens');
  if (heavens) heavens.visible = false;
  for (const glass of panes) {
    glass.geometry.computeBoundingSphere();
    const target = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const snap = new THREE.CubeCamera(0.2, 600, target);      // sees layer 0 only: no glass, no ghoul1
    snap.position.copy(glass.geometry.boundingSphere.center).applyMatrix4(glass.matrixWorld);
    snap.updateMatrixWorld(true);
    snap.update(renderer, scene);
    glass.material = MAT.glass.clone();
    glass.material.envMap = target.texture;
  }
  if (heavens) heavens.visible = true;
}

/* A real mirror. While a cam can see it, the scene is drawn a second
   time from the cam's reflection, into a picture the mirror shows (the
   same trick as three.js's Reflector). It costs nothing while no cam is
   looking at it. ghoul1 lives on a layer the reflection doesn't draw,
   so he has no reflection. Like a vampire. */
function mirror(u0, u1, y0, y1, z) {
  const target = new THREE.WebGLRenderTarget(1024, 576, { type: THREE.HalfFloatType, samples: 4 });
  const textureMatrix = new THREE.Matrix4();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, y1 - y0), new THREE.ShaderMaterial({
    uniforms: { map: { value: target.texture }, textureMatrix: { value: textureMatrix }, tint: { value: new THREE.Color(0xd4dade) } },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 tint;
      varying vec4 vUv;
      void main() {
        gl_FragColor = vec4(texture2DProj(map, vUv).rgb * tint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  mesh.position.set((u0 + u1) / 2, (y0 + y1) / 2, z);
  mesh.rotation.y = Math.PI;                      // facing north, into the room
  mesh.layers.set(GLASS_LAYER);                   // so window snapshots and the ghost pass skip it
  mesh.userData.keep = mesh.userData.noShadow = true;

  const view = new THREE.PerspectiveCamera();
  view.layers.set(0);
  view.layers.enable(GLASS_LAYER);
  const at = new THREE.Vector3(), eye = new THREE.Vector3(), normal = new THREE.Vector3();
  const look = new THREE.Vector3(), aim = new THREE.Vector3(), turn = new THREE.Matrix4();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();

  mesh.onBeforeRender = (renderer, scene, camera) => {
    at.setFromMatrixPosition(mesh.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    turn.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(turn);
    look.subVectors(at, eye);
    if (look.dot(normal) > 0) return;             // looking at its back
    // the camera, mirrored through the glass
    look.reflect(normal).negate().add(at);
    turn.extractRotation(camera.matrixWorld);
    aim.set(0, 0, -1).applyMatrix4(turn).add(eye);
    aim.subVectors(at, aim).reflect(normal).negate().add(at);
    view.position.copy(look);
    view.up.set(0, 1, 0).applyMatrix4(turn).reflect(normal);
    view.lookAt(aim);
    view.far = camera.far;
    view.updateMatrixWorld();
    view.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(view.projectionMatrix).multiply(view.matrixWorldInverse).multiply(mesh.matrixWorld);
    // move the near plane onto the mirror, so the wall and yard behind it don't get drawn
    plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(view.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = view.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;

    mesh.visible = false;
    const was = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;        // the shadows are already drawn this frame
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    renderer.render(scene, view);
    renderer.setRenderTarget(was);
    renderer.shadowMap.autoUpdate = shadows;
    mesh.visible = true;
  };
  return mesh;
}

/* ─── walls ─────────────────────────────────── */

const win  = (from, to, sill, head = 7) => [from, to, sill, head];
const door = (from, to, head = DOOR_H) => [from, to, 0, head];

/* One straight wall.
   dir 'h' runs left-right on the plan, c0..c1 are the rows of its
   two faces (top face = a, bottom face = b).
   dir 'v' runs up-down, c0..c1 are the columns (left face = a,
   right face = b).
   a = [start, end] of face a along the wall, b = the same for face
   b. They only differ at a mitred corner; leave b out otherwise.
   openings: win() / door() ranges along the wall, in pixels. */
function wall(dir, c0, c1, a, b, openings = [], { bottom = FLOOR, top = CEIL } = {}) {
  b = b || a;
  const M = dir === 'h' ? X : Z;          // along the wall
  const N = dir === 'h' ? Z : X;          // across it
  const a0 = M(a[0]), a1 = M(a[1]), b0 = M(b[0]), b1 = M(b[1]);
  const w0 = N(c0), t = N(c1) - N(c0);
  const place = dir === 'h'
    ? (u, y, w) => [u, y, w0 + w]
    : (u, y, w) => [w0 + w, y, u];

  const ops = openings
    .map(o => ({ u0: M(o[0]), u1: M(o[1]), sill: o[2], head: o[3] }))
    .sort((p, q) => p.u0 - q.u0);

  // elevation: doorways are notches in the outline, windows are holes
  const shape = new THREE.Shape();
  shape.moveTo(a0, bottom);
  for (const o of ops) if (o.sill <= 0) {
    shape.lineTo(o.u0, bottom);
    shape.lineTo(o.u0, bottom + o.head);
    shape.lineTo(o.u1, bottom + o.head);
    shape.lineTo(o.u1, bottom);
  }
  shape.lineTo(a1, bottom);
  shape.lineTo(a1, top);
  shape.lineTo(a0, top);
  for (const o of ops) if (o.sill > 0) {
    const hole = new THREE.Path();
    hole.moveTo(o.u0, bottom + o.sill);
    hole.lineTo(o.u1, bottom + o.sill);
    hole.lineTo(o.u1, bottom + o.head);
    hole.lineTo(o.u0, bottom + o.head);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  remap(geo, (u, y, w) => {
    // mitre: slide the end vertices so face b starts/ends where it should
    const f = w / t;
    if (Math.abs(u - a0) < 1e-5) u = a0 + (b0 - a0) * f;
    else if (Math.abs(u - a1) < 1e-5) u = a1 + (b1 - a1) * f;
    return place(u, y, w);
  });

  // a real window in each hole: white frame, bars between panes, glass
  const g = solid(geo);
  for (const o of ops) if (o.sill > 0) {
    const panes = Math.max(1, Math.ceil((o.u1 - o.u0) / 3.2));
    g.add(glazing(place, o.u0, o.u1, bottom + o.sill, bottom + o.head, t / 2, { panes }));
  }
  return g;
}

function walls() {
  const W = [];
  const add = (...args) => W.push(wall(...args));

  // exterior
  add('h', 154, 173, [295, 738], [315, 719], [win(348, 494, 2), win(539, 685, 2)]);            // living room, north
  add('v', 295, 315, [154, 558], [173, 566], [win(211, 429, 2)]);                               // living room, west
  add('v', 719, 738, [173, 364], [154, 345], [win(186, 332, 2)]);                               // living room, east (porch)
  add('h', 345, 364, [738, 1256], [719, 1237], [door(774, 1024), win(1099, 1172, 3)]);          // kitchen, north: patio doors
  add('v', 1237, 1256, [364, 1068], [345, 1087], [win(416, 607, 3.6), win(826, 1016, 2.5)]);    // east: sink + master windows
  add('h', 1068, 1087, [315, 1237], [295, 1256],
    [win(839, 912, 3), win(1087, 1159, 3)]);                                                    // south: master windows (a mirror over the bath sink)
  add('v', 295, 315, [645, 1087], [645, 1068], [win(928, 969, 4.2)]);                           // west of the hall, storage, bath

  // foyer
  add('h', 482, 501, [105, 295], [124, 295]);                                                   // north
  add('v', 105, 124, [482, 814], [501, 794], [door(600, 695)]);                                // west: front door, centred
  add('h', 794, 814, [124, 295], [105, 295], [win(163, 263, 3)]);                               // south
  add('h', 558, 566, [124, 295], [124, 315], [door(141, 284)]);                                 // coat closet front

  // storage, bathroom, laundry (the hall where the stairs were is left open)
  add('h', 731, 740, [315, 428], [315, 419], [door(325, 409)]);                                 // storage, north: accordion door, facing the couch
  add('v', 419, 428, [740, 902], [731, 902]);                                                   // storage, east
  add('h', 853, 861, [315, 419]);                                                               // storage, south
  add('h', 810, 825, [428, 807], null, [door(438, 511)]);                                       // bathroom + laundry, north
  add('v', 605, 614, [825, 1068], null, [door(830, 979)]);                                      // bathroom | laundry

  // master, kitchen, pantry
  add('v', 807, 815, [715, 1068], [724, 1068], [door(732, 805), door(830, 979)]);               // master, west
  add('h', 715, 724, [807, 1063], [815, 1063]);                                                 // kitchen | master
  add('v', 1063, 1072, [661, 789], [669, 780]);                                                 // pantry, west
  add('h', 661, 669, [1063, 1237], [1072, 1237], [door(1104, 1230)]);                           // pantry, north
  add('h', 780, 789, [1072, 1237], [1063, 1237]);                                               // pantry, south

  return named('walls', ...W);
}

/* ─── doors ─────────────────────────────────── */

/* A door leaf. Hinge at blueprint (hx, hy), latch edge at (ex, ey)
   when shut. open = degrees, swinging toward the point (tx, ty).
   lite = { panes, rows } puts a window in the top half. */
function leaf(name, hx, hy, ex, ey, open = 0, tx = 0, ty = 0, lite = null) {
  const x0 = X(hx), z0 = Z(hy), dx = X(ex) - x0, dz = Z(ey) - z0;
  const w = Math.hypot(dx, dz), h = DOOR_H - 0.01;     // fills the opening, no double edge
  let th = Math.atan2(dz, dx);
  if (open) {
    const toward = Math.atan2(Z(ty) - z0, X(tx) - x0);
    th += Math.sign(Math.sin(toward - th)) * open * Math.PI / 180;
  }
  let body = solid(new THREE.BoxGeometry(w, h, 0.15), [w / 2, FLOOR + h / 2, 0]);
  if (lite) {
    // the door with a hole cut in it, and a framed window in the hole
    const m = 0.5, y0 = 3.75, y1 = h - 0.55;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(0, h);
    const hole = new THREE.Path();
    hole.moveTo(m, y0); hole.lineTo(w - m, y0); hole.lineTo(w - m, y1); hole.lineTo(m, y1);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
    geo.translate(0, FLOOR, -0.075);
    body = new THREE.Group();
    body.add(solid(geo), glazing((u, y, d) => [u, y, d], m, w - m, FLOOR + y0, FLOOR + y1, 0,
      { ...lite, border: 0.1, bar: 0.07, depth: 0.17 }));
  }
  const g = named(name,
    body,
    solid(new THREE.BoxGeometry(0.12, 0.12, 0.4), [w - 0.28, FLOOR + 3, 0])      // knob
  );
  g.position.set(x0, 0, z0);
  g.rotation.y = -th;
  return g;
}

function doors() {
  return named('doors',
    // flush with the outside face, so from the yard it reads as one door
    leaf('door-front', 107, 600, 107, 695, 0, 0, 0, { panes: 2, rows: 2 }),
    slidingDoor(),
    leaf('door-master', 811, 733, 811, 804, 75, 900, 733),
    // coat closet bifolds, shut
    block(141, 212, 559, 565, DOOR_H - 0.1),
    block(213, 284, 559, 565, DOOR_H - 0.1),
    lines([[[X(176), FLOOR, Z(562)], [X(176), FLOOR + DOOR_H - 0.1, Z(562)]],
           [[X(248), FLOOR, Z(562)], [X(248), FLOOR + DOOR_H - 0.1, Z(562)]]]),
    // pantry slider, half open, on the kitchen side
    named('door-pantry', block(1104, 1170, 652, 658, DOOR_H - 0.1)),
    accordionDoor()
  );
}

/* The storage closet's accordion door, facing the couch: six narrow
   panels folding in a zigzag along a track. Shut, it's a shallow
   zigzag across the doorway; open, it bunches up at the west end.
   For anomalies:
     scene.getObjectByName('door-closet').userData.setOpen(0.5)
   0 is shut, 1 is open, anything between works. userData.open says
   where it is now. */
function accordionDoor() {
  const x0 = X(325), x1 = X(409), z = Z(735.5), N = 6;
  const SHUT = 12 * Math.PI / 180, OPEN = 80 * Math.PI / 180;
  const p = (x1 - x0) / (N * Math.cos(SHUT)), h = DOOR_H - 0.12;
  const panels = [];
  for (let i = 0; i < N; i++) {
    const geo = new THREE.BoxGeometry(p, h, 0.06);
    geo.translate(p / 2, h / 2, 0);                       // hinged on its left edge
    const panel = solid(geo, [0, FLOOR + 0.06, 0]);
    if (i === N - 1) panel.add(solid(new THREE.BoxGeometry(0.05, 0.45, 0.14), [p - 0.12, 3.1, 0]));   // pull
    panels.push(panel);
  }
  const g = named('door-closet', ...panels);
  g.userData.setOpen = t => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    const th = SHUT + (OPEN - SHUT) * t, du = p * Math.cos(th), dz = p * Math.sin(th);
    panels.forEach((panel, i) => {
      const out = i % 2 === 0;                            // zig, then zag
      panel.position.x = x0 + i * du;
      panel.position.z = z + (out ? -dz : dz) / 2;
      panel.rotation.y = out ? -th : th;
    });
    g.userData.open = t;
    // tell main.js something moved, so nearby lamps redraw their shadows
    let root = g;
    while (root.parent) root = root.parent;
    if (root !== g) root.userData.moved = new THREE.Vector3((x0 + x1) / 2, FLOOR + 3, z);
  };
  g.userData.setOpen(0);
  return g;
}

/* Sliding glass doors onto the patio: two big glass panels in metal
   frames on two tracks, the left one fixed, the right one (with the
   handle) slides in front of it. Plus the tracks along top and bottom. */
function slidingDoor() {
  const z0 = Z(345), t = Z(364) - Z(345);
  const place = (u, y, w) => [u, y, z0 + w];
  const a = X(774), b = X(1024), mid = (a + b) / 2, lap = 0.15;
  const y0 = FLOOR + 0.06, y1 = FLOOR + DOOR_H - 0.06;
  const opts = { panes: 1, border: 0.16, depth: 0.1, mat: MAT.track };
  const handle = solid(new THREE.BoxGeometry(0.06, 0.9, 0.08), [mid + 0.35, FLOOR + 3.4, z0 + t / 2 + 0.2], null, MAT.track);
  handle.traverse(o => { if (o.isMesh) o.userData.keep = true; });
  const tracks = [y0 - 0.04, y1 + 0.04].map(y => {
    const tr = solid(new THREE.BoxGeometry(b - a, 0.08, t * 0.7), [mid, y, z0 + t / 2], null, MAT.track);
    tr.traverse(o => { if (o.isMesh) o.userData.keep = true; });
    return tr;
  });
  return named('door-patio',
    glazing(place, a, mid + lap, y0, y1, t / 2 - 0.08, opts),       // fixed panel, outer track
    glazing(place, mid - lap, b, y0, y1, t / 2 + 0.08, opts),       // sliding panel, inner track
    handle, ...tracks);
}

/* ─── floor, ceilings, roof ─────────────────── */

function shell() {
  const parts = [];

  // foundation: yard level up to the floor, main house + foyer in one piece
  parts.push(named('foundation', slab([
    [295, 154], [738, 154], [738, 345], [1256, 345], [1256, 1087],
    [295, 1087], [295, 814], [105, 814], [105, 482], [295, 482]
  ], [], 0, FLOOR)));

  // ceilings
  parts.push(named('ceiling',
    slab([[295, 154], [1256, 154], [1256, 1087], [295, 1087]], [], CEIL, EAVE),
    slab([[0, 482], [295, 482], [295, 814], [0, 814]], [], CEIL, EAVE)));

  // main roof: ridge runs left-right on the plan, gables at both ends
  const main = gableRoof({ z0: Z(154), z1: Z(1087), x0: X(295) - 1.5, x1: X(1256) + 1.5, over: 1.5 });
  parts.push(named('roof', main.roof,
    gable(Z(154), Z(1087), X(295), X(315), main.ridge),
    gable(Z(154), Z(1087), X(1237), X(1256), main.ridge)));

  // foyer + front porch roof, a smaller gable butting into the main one
  const foyer = gableRoof({ z0: Z(482), z1: Z(814), x0: X(0) - 1, x1: X(295), over: 1 });
  parts.push(named('foyer-roof', foyer.roof, gable(Z(482), Z(814), X(0), X(11), foyer.ridge)));

  return named('shell', ...parts);
}

/* Gable roof with its ridge running along x, between z0 and z1,
   from x0 to x1. Built as one solid with a chevron cross-section
   so the ridge is clean. 6-in-12 pitch. */
function gableRoof({ z0, z1, x0, x1, over, pitch = 0.5, thick = 0.35 }) {
  const zc = (z0 + z1) / 2, half = (z1 - z0) / 2;
  const ridge = EAVE + half * pitch;
  const th = Math.atan(pitch), s = Math.sin(th), c = Math.cos(th);
  const run = (half + over) / c;
  const tz = c * run, ty = ridge - s * run;
  const shape = new THREE.Shape([
    [0, ridge], [tz, ty], [tz + s * thick, ty + c * thick],
    [0, ridge + thick / c], [-tz - s * thick, ty + c * thick], [-tz, ty]
  ].map(([u, y]) => new THREE.Vector2(u, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  return { roof: solid(remap(geo, (u, y, w) => [x0 + w, y, zc + u])), ridge };
}

// The triangle of wall under a gable, x0..x1 thick.
function gable(z0, z1, x0, x1, ridge) {
  const zc = (z0 + z1) / 2;
  const shape = new THREE.Shape([
    new THREE.Vector2(z0 - zc, EAVE), new THREE.Vector2(z1 - zc, EAVE), new THREE.Vector2(0, ridge)
  ]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  return solid(remap(geo, (u, y, w) => [x0 + w, y, zc + u]));
}

/* ─── railings ──────────────────────────────── */

// Railing along a line: top rail, end posts, balusters as plain lines.
function rail(dir, at, from, to, h = 3, base = FLOOR) {
  const parts = [];
  const pairs = [];
  if (dir === 'h') {
    parts.push(block(from, to, at - 3, at + 3, h, h - 0.2, base));
    parts.push(block(from, from + 7, at - 4, at + 4, h, 0, base), block(to - 7, to, at - 4, at + 4, h, 0, base));
    for (let x = from + 13; x < to - 9; x += 12) pairs.push([[X(x), base, Z(at)], [X(x), base + h - 0.2, Z(at)]]);
  } else {
    parts.push(block(at - 3, at + 3, from, to, h, h - 0.2, base));
    parts.push(block(at - 4, at + 4, from, from + 7, h, 0, base), block(at - 4, at + 4, to - 7, to, h, 0, base));
    for (let y = from + 13; y < to - 9; y += 12) pairs.push([[X(at), base, Z(y)], [X(at), base + h - 0.2, Z(y)]]);
  }
  parts.push(lines(pairs));
  return named('railing', ...parts);
}

/* ─── furniture, room by room ───────────────── */

// A simple chair facing +z in its own space: seat, back, four legs.
function chair(w = 1.5, seat = 1.5, back = 3) {
  const t = 0.12, l = 0.12, g = new THREE.Group();
  g.add(solid(new THREE.BoxGeometry(w, t, w), [0, seat, 0]));
  g.add(solid(new THREE.BoxGeometry(w, back - seat, t), [0, seat + (back - seat) / 2, -w / 2 + t / 2]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(solid(new THREE.BoxGeometry(l, seat - t / 2, l), [sx * (w / 2 - l), (seat - t / 2) / 2, sz * (w / 2 - l)]));
  }
  return g;
}

// Put something at blueprint (cx, cy) on the floor, facing an angle (degrees, 0 = down the plan).
function at(obj, cx, cy, face = 0, y = FLOOR) {
  obj.position.set(X(cx), y, Z(cy));
  obj.rotation.y = face * Math.PI / 180;
  return obj;
}

function livingRoom() {
  const armchair = new THREE.Group();
  armchair.add(
    solid(new THREE.BoxGeometry(2.6, 1.4, 2.6), [0, 0.7, 0]),
    solid(new THREE.BoxGeometry(2.6, 1.4, 0.55), [0, 2.1, -1.02]),
    solid(new THREE.BoxGeometry(0.5, 0.7, 2.6), [-1.05, 1.75, 0]),
    solid(new THREE.BoxGeometry(0.5, 0.7, 2.6), [1.05, 1.75, 0])
  );
  const table = named('dining-table',
    block(655, 735, 455, 590, 2.5, 2.35),
    block(659, 666, 459, 466, 2.35), block(724, 731, 459, 466, 2.35),
    block(659, 666, 579, 586, 2.35), block(724, 731, 579, 586, 2.35)
  );
  return named('living-room',
    named('sofa',
      block(342, 405, 318, 535, 1.4),           // long seat
      block(405, 530, 478, 535, 1.4),           // return seat
      block(322, 342, 305, 555, 2.7),           // back along the wall
      block(342, 530, 535, 555, 2.7),           // back of the return
      block(342, 405, 300, 318, 2.1)            // arm
    ),
    named('armchair', at(armchair, 650, 262, -45)),
    named('side-table', block(555, 598, 193, 237, 2)),
    table,
    named('dining-chairs',
      at(chair(), 644, 492, 90), at(chair(), 644, 555, 90),
      at(chair(), 746, 492, -90), at(chair(), 746, 555, -90),
      at(chair(), 695, 443, 0), at(chair(), 695, 602, 180)
    ),
    named('wood-stove',
      block(588, 706, 722, 806, 0.12),           // hearth
      block(603, 690, 740, 796, 2.3, 0.35),      // firebox
      block(606, 614, 790, 796, 0.35), block(679, 687, 790, 796, 0.35),
      block(606, 614, 740, 746, 0.35), block(679, 687, 740, 746, 0.35),
      round(646, 752, 0.28, 8, 2.3, 6)           // stovepipe to the ceiling
    ),
    named('post', block(511, 522, 568, 579, 8))
  );
}

function kitchen() {
  const stool = () => solid(new THREE.CylinderGeometry(0.62, 0.5, 2.4, 8), [0, 1.2, 0]);
  const top = FLOOR + 3.01;
  const cooktop = rectOn((u, v) => [u, top, v], X(945), X(1015), Z(508), Z(560));
  return named('kitchen',
    named('island', block(868, 1087, 470, 565, 3), lines(cooktop)),
    named('stools', at(stool(), 902, 452), at(stool(), 947, 452), at(stool(), 993, 452), at(stool(), 1047, 452)),
    // the east counter has a hole cut in it for the sink
    named('counter-east', slab([[1183, 364], [1237, 364], [1237, 660], [1183, 660]],
      [[[1189, 475], [1225, 475], [1225, 547], [1189, 547]]], FLOOR, FLOOR + 3)),
    sink(),
    named('counter-south', block(807, 980, 660, 715, 3)),
    named('fridge', block(980, 1060, 655, 715, 6.3)),
    named('pantry-shelves', block(1190, 1237, 669, 780, 6.5), block(1072, 1190, 748, 780, 6.5))
  );
}

/* A double stainless sink under the east window, with a faucet. Each
   bowl is a box drawn inside out (only its inner faces show), so from
   above it looks like an open basin. A steel rim hides the cut edge. */
function sink() {
  const top = FLOOR + 3, deep = 0.75;
  const bowl = (y0, y1) => {
    const b = block(1191, 1223, y0, y1, 3, 3 - deep);
    b.traverse(o => { if (o.isMesh) { o.material = MAT.basin; o.userData.keep = true; } });
    return b;
  };
  const fx = X(1231), fz = Z(511), spout = 0.78;
  return named('kitchen-sink',
    bowl(477, 510), bowl(513, 545),
    slab([[1187, 473], [1227, 473], [1227, 549], [1187, 549]],
      [[[1191, 477], [1223, 477], [1223, 510], [1191, 510]], [[1191, 513], [1223, 513], [1223, 545], [1191, 545]]],
      top, top + 0.03),
    solid(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 10), [fx, top + 0.06, fz]),               // faucet base
    solid(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), [fx, top + 0.65, fz]),              // riser
    solid(new THREE.BoxGeometry(spout, 0.07, 0.07), [fx - spout / 2, top + 1.2, fz]),           // spout
    solid(new THREE.BoxGeometry(0.07, 0.18, 0.07), [fx - spout + 0.035, top + 1.1, fz]),        // nozzle
    solid(new THREE.BoxGeometry(0.05, 0.05, 0.32), [fx, top + 0.8, fz + 0.18])                  // lever
  );
}

function master() {
  const tub = (cx, cy) => named('tub-chair',
    round(cx, cy, 1.0, 1.4, 0, 12, 1.05),
    block(cx + 10, cx + 25, cy - 24, cy + 24, 2.6));
  const bedTop = FLOOR + 1.92;
  return named('master',
    named('bed',
      block(930, 1065, 893, 1060, 1.9),
      block(925, 1070, 1060, 1068, 3.6),                    // headboard
      block(945, 992, 1022, 1052, 2.3, 1.9),                // pillows
      block(1003, 1050, 1022, 1052, 2.3, 1.9),
      lines([[[X(930), bedTop, Z(985)], [X(1065), bedTop, Z(985)]]])   // turned-down sheet
    ),
    named('nightstands', block(875, 925, 1022, 1068, 2.1), block(1075, 1125, 1022, 1068, 2.1)),
    named('dresser', block(940, 1055, 728, 762, 3)),
    tub(1195, 862), tub(1195, 1002),
    named('round-table', round(1208, 932, 0.7, 1.9, 0, 12))
  );
}

function bathroom() {
  const top = FLOOR + 2.81;
  const basin = rectOn((u, v) => [u, top, v], X(505), X(565), Z(1024), Z(1058));
  const glassN = rectOn((u, y) => [u, y, Z(985)], X(322), X(460), FLOOR + 0.35, FLOOR + 6.6);
  const glassE = rectOn((v, y) => [X(460), y, v], Z(985), Z(1066), FLOOR + 0.35, FLOOR + 6.6);
  // oval bowl: a cylinder squashed front to back
  const bowlGeo = new THREE.CylinderGeometry(0.62, 0.45, 1.35, 14);
  bowlGeo.scale(1, 1, 1.45);
  const bowl = solid(bowlGeo, [X(365), FLOOR + 0.675, Z(903)]);
  return named('bathroom',
    named('toilet', block(338, 392, 861, 877, 2.6, 1.2), bowl),
    named('shower', block(320, 460, 985, 1068, 0.35), lines([...glassN, ...glassE])),
    named('vanity', block(468, 600, 1012, 1068, 2.8), lines(basin)),
    vanityMirror()
  );
}

// a wood-framed mirror on the wall over the bathroom sink
function vanityMirror() {
  const wallZ = Z(1068), u0 = X(492), u1 = X(578), y0 = FLOOR + 3.5, y1 = FLOOR + 6.35, b = 0.16;
  return named('mirror',
    paneFrame((u, y, w) => [u, y, wallZ - w], u0, u1, y0, y1, 0.06, { border: b, depth: 0.12, mat: MAT.furniture }),
    mirror(u0 + b, u1 - b, y0 + b, y1 - b, wallZ - 0.07));
}

function laundry() {
  // round window on the front of each machine
  const porthole = cx => {
    const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.62, 18)), EDGE);
    ring.position.set(X(cx), FLOOR + 1.5, Z(905) + 0.01);
    return ring;
  };
  return named('laundry',
    named('washer', block(620, 680, 848, 905, 3), porthole(650)),
    named('dryer', block(686, 746, 848, 905, 3), porthole(716)),
    named('shelf', block(614, 807, 825, 845, 5.4, 5.2)),
    // walk-in closet shelves + hanging rods
    named('closet-shelves', block(614, 642, 985, 1068, 6.1, 5.9), block(780, 807, 985, 1068, 6.1, 5.9),
      lines([[[X(630), FLOOR + 5.5, Z(985)], [X(630), FLOOR + 5.5, Z(1068)]],
             [[X(792), FLOOR + 5.5, Z(985)], [X(792), FLOOR + 5.5, Z(1068)]]]))
  );
}

function foyer() {
  return named('foyer', named('bench', block(155, 270, 745, 780, 1.6)));
}

/* ─── porches ───────────────────────────────── */

function porches() {
  const parts = [];
  const beamLo = CEIL - 0.8;

  // back porch (top right of the plan)
  parts.push(block(738, 1256, 154, 345, FLOOR, FLOOR - 0.6, 0));                  // deck
  parts.push(block(982, 993, 158, 169, beamLo, 0, 0), block(1241, 1253, 158, 169, beamLo, 0, 0));
  parts.push(block(738, 1256, 154, 173, CEIL, beamLo, 0), block(1237, 1256, 173, 345, CEIL, beamLo, 0));
  parts.push(rail('h', 163, 738, 815), rail('h', 163, 905, 982), rail('h', 163, 993, 1241), rail('v', 1247, 169, 345));
  for (let i = 0; i < 3; i++) {                                                   // steps down to the yard
    parts.push(block(815, 905, 154 - (i + 1) * K, 154 - i * K, FLOOR - 0.625 * (i + 1), 0, 0));
  }
  const table = named('porch-table', round(1167, 250, 1.7, 2.4, 2.25, 16), round(1167, 250, 0.15, 2.25, 0, 6));
  parts.push(table,
    at(chair(), 1167, 202, 0), at(chair(), 1167, 298, 180), at(chair(), 1120, 250, 90), at(chair(), 1214, 250, -90));

  // front porch (far left of the plan)
  parts.push(block(0, 105, 482, 814, FLOOR, FLOOR - 0.6, 0));
  parts.push(block(0, 11, 485, 497, beamLo, 0, 0), block(0, 11, 799, 811, beamLo, 0, 0));
  parts.push(block(0, 11, 482, 814, CEIL, beamLo, 0));
  for (let i = 0; i < 3; i++) {
    parts.push(block(-(i + 1) * K, -i * K, 593, 703, FLOOR - 0.625 * (i + 1), 0, 0));
  }
  return named('porches', ...parts);
}

/* The front porch's lantern, by the door, and a rocking chair. */
function frontPorch(lamps) {
  const wx = X(105), lx = wx - 0.32, ly = FLOOR + 6.3, lz = Z(717);
  const lantern = named('lamp-porch',
    solid(new THREE.BoxGeometry(0.34, 0.08, 0.08), [wx - 0.17, ly + 0.3, lz]),        // bracket
    solid(new THREE.BoxGeometry(0.52, 0.1, 0.52), [lx, ly + 0.4, lz]),                // cap
    solid(new THREE.ConeGeometry(0.2, 0.18, 4), [lx, ly + 0.54, lz], [0, Math.PI / 4, 0]),
    glow(new THREE.BoxGeometry(0.4, 0.64, 0.4), lx, ly, lz),                          // the glass, lit
    solid(new THREE.BoxGeometry(0.46, 0.06, 0.46), [lx, ly - 0.35, lz]),              // base
    bulb(lamps, 'lamp-porch-light', 105 - 0.45 * K, 717, 6.3, 34));
  // its own frame mustn't shadow the lamp inside it
  lantern.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return named('front-porch', lantern, at(rockingChair(), 50, 764, -75, FLOOR));
}

// A wooden rocking chair, facing +z in its own space.
function rockingChair() {
  const W = 1.8, R = 3.2, arc = 0.9, side = W / 2 - 0.1;
  const rocker = sx => {
    const geo = new THREE.TorusGeometry(R, 0.06, 4, 14, arc);
    geo.rotateZ(-Math.PI / 2 - arc / 2);     // middle of the curve at the bottom
    geo.rotateY(Math.PI / 2);                // into the front-back plane
    geo.translate(sx * side, R + 0.06, 0);
    return solid(geo);
  };
  const back = new THREE.Group();            // leans back from the seat
  back.add(
    solid(new THREE.BoxGeometry(0.12, 2.3, 0.12), [-side, 1.15, 0]),
    solid(new THREE.BoxGeometry(0.12, 2.3, 0.12), [side, 1.15, 0]),
    solid(new THREE.BoxGeometry(W, 0.3, 0.1), [0, 2.2, 0]),
    ...[-0.45, -0.15, 0.15, 0.45].map(x => solid(new THREE.BoxGeometry(0.06, 2, 0.06), [x, 1.05, 0])));
  back.position.set(0, 1.55, -0.72);
  back.rotation.x = -0.22;
  const g = named('rocking-chair',
    rocker(-1), rocker(1),
    solid(new THREE.BoxGeometry(W, 0.12, 1.6), [0, 1.55, 0.05]),                       // seat
    ...[-1, 1].flatMap(sx => [
      solid(new THREE.BoxGeometry(0.12, 2.2, 0.12), [sx * side, 1.2, 0.65]),           // front post, up to the arm
      solid(new THREE.BoxGeometry(0.12, 1.45, 0.12), [sx * side, 0.82, -0.7]),         // back leg
      solid(new THREE.BoxGeometry(0.14, 0.08, 1.6), [sx * (W / 2 - 0.05), 2.32, -0.02])  // arm
    ]),
    back);
  return g;
}

/* ─── the yard ──────────────────────────────── */

function ground() {
  // the lawn, wide enough to fade into the night at the edges
  const R = 150;
  const plane = new THREE.Mesh(new THREE.BoxGeometry(R * 2, 0.2, R * 2), MAT.ground);
  plane.position.y = -0.1;
  return named('ground', plane);
}

function path() {
  // paving slabs from the front steps out to the street
  const z = Z(647.5), hw = 2, y = 0.02, x0 = X(-3 * K), x1 = -72;      // lined up with the front door
  const pairs = [[[x0, y, z - hw], [x1, y, z - hw]], [[x0, y, z + hw], [x1, y, z + hw]]];
  for (let x = x0; x >= x1; x -= 4) pairs.push([[x, y, z - hw], [x, y, z + hw]]);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(x0 - x1, 0.04, hw * 2), MAT.concrete);
  walk.position.set((x0 + x1) / 2, 0.005, z);
  return named('path', walk, lines(pairs));
}

function mailbox() {
  return named('mailbox',
    solid(new THREE.BoxGeometry(0.4, 3.6, 0.4), [0, 1.8, 0]),          // post
    solid(new THREE.BoxGeometry(2, 1.1, 1.2), [0, 4.15, 0]),           // box
    solid(new THREE.BoxGeometry(0.33, 1, 0.1), [-0.4, 4.6, 0.66]));    // flag
}

function leafyTree() {
  const canopy = new THREE.IcosahedronGeometry(5.6, 0);
  canopy.scale(1, 1.15, 1);
  return named('tree',
    solid(new THREE.CylinderGeometry(0.5, 0.8, 7.5, 6), [0, 3.75, 0]),
    solid(canopy, [0, 11.5, 0]));
}

function pineTree() {
  return named('pine',
    solid(new THREE.CylinderGeometry(0.4, 0.6, 4, 6), [0, 2, 0]),
    solid(new THREE.ConeGeometry(5, 10.5, 7), [0, 8.5, 0]),
    solid(new THREE.ConeGeometry(3.6, 8, 7), [0, 13.5, 0], [0, 0.4, 0]));
}

function bush() {
  return named('bush', solid(new THREE.DodecahedronGeometry(2.3, 0), [0, 1.9, 0]));
}

function yardAt(obj, x, z) {
  obj.position.set(x, 0, z);
  return obj;
}

/* ─── lights ────────────────────────────────── */

/* Every lamp is two things: a fixture you can see (its shade or bulb
   glows) and a real light that casts shadows. Shadows are worked out
   once at the start and only redrawn near ghoul1 (see main.js), which
   keeps all this affordable. Intensities are by eye; raise or lower
   them to taste. Lamps are warm, the streetlight a little orange, the
   moon a little blue. */

const STREET = [-50, 10];
const LAMP_COLOR = 0xffdcae;                    // warm bulbs (0xffffff for plain white)                       // where the streetlight stands, in feet

function shadowed(light, size = 512, far = 40) {
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = 0.25;
  light.shadow.camera.far = far;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.04;
  light.shadow.radius = 3;                      // soft edges, like real lamp shadows
  light.shadow.autoUpdate = false;              // drawn once, then on demand
  light.shadow.needsUpdate = true;
  return light;
}

// a shadow-casting bulb at blueprint (cx, cy), h feet above the floor
function bulb(lamps, name, cx, cy, h, intensity, dz = 0) {
  const light = shadowed(new THREE.PointLight(LAMP_COLOR, intensity, 0, 2));
  light.name = name;
  light.position.set(X(cx), FLOOR + h, Z(cy) + dz);
  lamps.push(light);
  return light;
}

const glow = (geo, x, y, z) => solid(geo, [x, y, z], null, MAT.glow);
const shadeMat = surface(0x2e2e2e, 0.5, THREE.DoubleSide);   // open metal pendant shades

function floorLamp(lamps, name, cx, cy, intensity) {
  const x = X(cx), z = Z(cy);
  return named(name,
    solid(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 12), [x, FLOOR + 0.04, z]),
    solid(new THREE.CylinderGeometry(0.04, 0.04, 4.9, 6), [x, FLOOR + 2.5, z]),
    glow(new THREE.CylinderGeometry(0.42, 0.7, 0.9, 14), x, FLOOR + 5.4, z),
    bulb(lamps, name + '-light', cx, cy, 5.2, intensity));
}

function tableLamp(lamps, name, cx, cy, top, intensity) {
  const x = X(cx), z = Z(cy);
  const parts = [
    solid(new THREE.CylinderGeometry(0.1, 0.17, 0.7, 8), [x, FLOOR + top + 0.35, z]),
    solid(new THREE.CylinderGeometry(0.3, 0.48, 0.6, 12), [x, FLOOR + top + 0.95, z], null,
      intensity ? MAT.glow : MAT.soft)
  ];
  if (intensity) parts.push(bulb(lamps, name + '-light', cx, cy, top + 0.9, intensity));
  return named(name, ...parts);
}

function pendant(lamps, name, cx, cy, intensity) {
  const x = X(cx), z = Z(cy);
  const shade = new THREE.CylinderGeometry(0.12, 0.75, 0.55, 18, 1, true);
  return named(name,
    lines([[[x, CEIL, z], [x, FLOOR + 6.85, z]]]),                              // cord
    solid(shade, [x, FLOOR + 6.58, z], null, shadeMat),
    glow(new THREE.SphereGeometry(0.15, 10, 8), x, FLOOR + 6.38, z),
    bulb(lamps, name + '-light', cx, cy, 6.2, intensity));
}

function bareBulb(lamps, name, cx, cy, intensity) {
  const x = X(cx), z = Z(cy);
  return named(name,
    lines([[[x, CEIL, z], [x, FLOOR + 7.3, z]]]),
    glow(new THREE.SphereGeometry(0.13, 10, 8), x, FLOOR + 7.18, z),
    bulb(lamps, name + '-light', cx, cy, 6.95, intensity));
}

function roomLamps(lamps) {
  const wallZ = Z(1068), patioZ = Z(345);
  return named('lamps',
    floorLamp(lamps, 'lamp-foyer', 140, 775, 28),
    tableLamp(lamps, 'lamp-living', 576, 215, 2, 20),
    pendant(lamps, 'lamp-dining', 695, 522, 36),
    pendant(lamps, 'lamp-kitchen', 978, 517, 36),
    tableLamp(lamps, 'lamp-master', 900, 1045, 2.1, 16),
    tableLamp(lamps, 'lamp-master-2', 1100, 1045, 2.1, 14),               // the other nightstand
    // an end table at the north end of the sectional, so the couch gets light
    named('end-table', block(345, 400, 248, 294, 1.9)),
    tableLamp(lamps, 'lamp-sofa', 372, 271, 1.9, 22),
    bareBulb(lamps, 'lamp-laundry', 710, 915, 26),
    // bathroom: a light bar above the mirror
    named('lamp-bathroom',
      glow(new THREE.BoxGeometry(2, 0.18, 0.2), X(535), FLOOR + 6.75, wallZ - 0.12),
      bulb(lamps, 'lamp-bathroom-light', 535, 1068, 6.55, 24, -0.7)),
    // patio: a lantern on the back wall, beside the patio doors
    named('lamp-patio',
      solid(new THREE.BoxGeometry(0.5, 0.75, 0.35), [X(1060), FLOOR + 7, patioZ - 0.2], null, MAT.glow),
      bulb(lamps, 'lamp-patio-light', 1060, 345, 6.8, 48, -0.75))
  );
}

/* A soft halo texture, drawn on a canvas, for the streetlight. (Skipped
   outside a browser, where there's no canvas.) */
function halo(size) {
  if (typeof document === 'undefined') return new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

// The big streetlight by the front walk: pole, arm, head, and a spotlight down on the yard.
function streetlight(lamps) {
  // tall enough to throw light up onto the roof, aimed at the house
  const H = 26, reach = 5;
  const light = shadowed(new THREE.SpotLight(0xffd9a0, 3600, 0, 0.95, 0.8, 2), 1024, 110);
  light.name = 'streetlight-light';
  light.position.set(reach, H - 0.6, 0);
  light.target.position.set(32, 6, -10);
  lamps.push(light);
  const glare = halo(12);
  glare.position.set(reach, H - 0.7, 0);
  return named('streetlight',
    solid(new THREE.CylinderGeometry(0.22, 0.32, H, 8), [0, H / 2, 0], null, MAT.dark),
    solid(new THREE.BoxGeometry(reach, 0.18, 0.18), [reach / 2, H - 0.1, 0], null, MAT.dark),
    solid(new THREE.BoxGeometry(1.6, 0.35, 0.8), [reach, H - 0.25, 0], null, MAT.dark),
    glow(new THREE.BoxGeometry(1.3, 0.06, 0.6), reach, H - 0.45, 0),
    light, light.target, glare);
}

// faint moonlight and a whisper of fill, so the dark isn't completely flat
function sky() {
  const moon = shadowed(new THREE.DirectionalLight(0xb8c8ff, 0.35), 2048, 240);
  moon.name = 'moon';
  moon.position.set(-70, 90, 50);
  const cam = moon.shadow.camera;
  cam.left = cam.bottom = -60;
  cam.right = cam.top = 60;
  cam.near = 1;
  moon.shadow.normalBias = 0.08;
  // faint fill, standing in for light bouncing around: dark corners
  // read as dim, not pitch black
  const fill = new THREE.HemisphereLight(0x8ea0c8, 0x2a2016, 0.08);
  return named('sky', moon, moon.target, fill, heavens(moon.position));
}

/* Stars, a moon and a few drifting clouds. Kept cheap: the stars are
   one draw of ~700 points, the clouds reuse one small soft image, and
   none of it is lit or casts shadows. Only the outside cams really see
   it. */
const SKY_R = 420;

function heavens(moonDir) {
  const g = new THREE.Group();
  g.name = 'heavens';

  // stars: random points on the upper half of a big dome
  const rand = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const az = rand() * Math.PI * 2, el = Math.asin(0.08 + rand() * 0.92);
    pts.push(Math.cos(el) * Math.cos(az) * SKY_R, Math.sin(el) * SKY_R, Math.cos(el) * Math.sin(az) * SKY_R);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85
  })));

  if (typeof document === 'undefined') return g;      // no canvas outside a browser

  // the moon: a pale disc where the moonlight comes from
  const m = moonDir.clone().normalize().multiplyScalar(SKY_R * 0.95);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(0.94), color: 0xe8ecff, fog: false }));
  moon.position.copy(m);
  moon.scale.set(22, 22, 1);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDisc(0), color: 0x6f7fa8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5
  }));
  glowSprite.position.copy(m);
  glowSprite.scale.set(90, 90, 1);
  g.add(glowSprite, moon);

  // clouds: one soft blob image, stretched and reused, drifting slowly
  const cloudTex = cloudImage();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: 0x4a5670, fog: false, transparent: true, opacity: 0.9, depthWrite: false
    }));
    const az = rand() * Math.PI * 2, el = 0.25 + rand() * 0.6;
    c.userData = { az, el, speed: 0.004 + rand() * 0.006 };
    c.scale.set(140 + rand() * 120, 45 + rand() * 30, 1);
    clouds.push(c);
    g.add(c);
  }
  const place = c => {
    const { az, el } = c.userData, r = SKY_R * 0.9;
    c.position.set(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
  };
  clouds.forEach(place);
  g.userData.tick = dt => clouds.forEach(c => { c.userData.az += c.userData.speed * dt; place(c); });
  return g;
}

// a round soft-edged disc (edge = 0 gives a pure glow falloff)
function softDisc(edge) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  if (edge) grad.addColorStop(edge, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// a lumpy soft cloud: a few overlapping blurry circles
function cloudImage() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (const [cx, cy, r] of [[70, 74, 44], [118, 58, 54], [170, 70, 46], [205, 82, 32], [42, 86, 28], [140, 88, 40]]) {
    const grad = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}

/* Give each part of the house its own grey, and switch on shadows:
   every solid casts and catches them, except things that glow. */
function paint(scene) {
  const set = (name, mat) => scene.traverse(o => {
    if (o.name === name) o.traverse(m => { if (m.isMesh && !m.material.isMeshBasicMaterial && !m.userData.keep) m.material = mat; });
  });
  // a group's solids in order, e.g. a tree's trunk then its canopy
  const parts = (name, ...mats) => scene.traverse(o => {
    if (o.name !== name) return;
    o.children.forEach((c, i) => {
      const mat = mats[Math.min(i, mats.length - 1)];
      c.traverse(m => { if (m.isMesh && !m.userData.keep) m.material = mat; });
    });
  });
  set('walls', MAT.wall);
  set('ceiling', MAT.ceiling);
  set('foundation', MAT.floor);
  set('roof', MAT.roof);
  set('foyer-roof', MAT.roof);
  set('doors', MAT.door);
  set('door-front', MAT.frontDoor);
  set('porches', MAT.wood);
  set('sofa', MAT.sofa);
  set('armchair', MAT.armchair);
  set('stools', MAT.dark);
  set('wood-stove', MAT.dark);
  parts('wood-stove', MAT.brick, MAT.dark);              // brick hearth, black iron stove
  set('island', MAT.cabinet);
  set('counter-east', MAT.cabinet);
  set('counter-south', MAT.cabinet);
  set('fridge', MAT.steel);
  set('washer', MAT.appliance);
  set('dryer', MAT.appliance);
  set('bed', MAT.soft);
  parts('bed', MAT.soft, MAT.furniture, MAT.soft);       // linens, wood headboard, pillows
  for (const n of ['toilet', 'shower', 'vanity']) set(n, MAT.porcelain);
  set('tub-chair', MAT.mustard);
  parts('tree', MAT.bark, MAT.leaves);
  parts('pine', MAT.bark, MAT.pine);
  set('bush', MAT.leaves);
  set('streetlight', MAT.pole);
  parts('mailbox', MAT.furniture, MAT.dark, MAT.frontDoor);  // wood post, black box, red flag
  set('door-closet', MAT.trim);                          // white accordion door
  set('kitchen-sink', MAT.steel);
  for (const n of ['lamp-foyer', 'lamp-living', 'lamp-master', 'lamp-master-2', 'lamp-sofa', 'lamp-porch']) set(n, MAT.dark);   // shades keep glowing
  scene.traverse(o => {
    if (!o.isMesh) return;
    const glows = o.material.isMeshBasicMaterial || o.userData.noShadow;
    o.castShadow = !glows;
    o.receiveShadow = !glows;
  });
}

/* ─── everything ────────────────────────────── */

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // the far yard fades into the night
  scene.fog = new THREE.Fog(0x000000, 90, 240);
  const lamps = [];

  scene.add(
    ground(),
    path(),
    shell(),
    walls(),
    doors(),
    porches(),
    livingRoom(),
    kitchen(),
    master(),
    bathroom(),
    laundry(),
    foyer(),
    frontPorch(lamps),
    yardAt(mailbox(), -38, -4.5),
    yardAt(leafyTree(), -28, -22),
    yardAt(pineTree(), 30, 30),
    yardAt(bush(), -28, -12),
    yardAt(bush(), -28, 12),
    yardAt(streetlight(lamps), STREET[0], STREET[1]),
    roomLamps(lamps),
    sky()
  );
  paint(scene);
  scene.userData.lamps = lamps;
  return scene;
}
