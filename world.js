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
  liner:     surface(0xf0efe9, 0.6, THREE.BackSide),   // inside the fridge (drawn inside out)
  drum:      (() => {                     // washer tub, dryer drum
    const m = surface(0x9aa0a4, 0.4, THREE.DoubleSide);
    m.metalness = 0.35;
    return m;
  })(),
  basin:     (() => {                     // the kitchen sink bowls, seen from above and from under the sink
    const m = surface(0xa7adb1, 0.3, THREE.DoubleSide);
    m.metalness = 0.35;
    return m;
  })(),
  // 90s colours, for clothes, cushions, the bathmat
  flannel:   surface(0x8b2e2a),          // red
  denim:     surface(0x3d5a80),
  hunter:    surface(0x2f4a35),          // hunter green
  plum:      surface(0x5d3a6b),
  teal:      surface(0x1f7a7a, 0.6),
  cream:     surface(0xd9cfb8),
  mauve:     surface(0x9c6b7a, 1),       // fuzzy bathmat
  brass:     metal(0xb8963e, 0.35),      // shower frame, knobs
  chrome:    metal(0xd0d4d8, 0.25),      // taps, stools, closet rods
  rose:      surface(0x8f5f63, 0.9),     // dusty rose chaise
  counter:   surface(0xcfc6b2, 0.6),     // almond laminate countertops
  cabShelf:  surface(0xcdb98f, 0.8),     // pale wood inside the cabinets
  cabInside: surface(0xd8c7a3, 0.8, THREE.BackSide),   // cabinet insides (drawn inside out)
  firebrick: surface(0x4a2a1e, 1, THREE.BackSide),     // inside the wood stove
  log:       new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 1, emissive: 0xff5a14, emissiveIntensity: 0.12 }),
  ember:     new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 1, emissive: 0xff4a10, emissiveIntensity: 1.1 }),
  porcelainBoth: surface(0xf2f1ec, 0.25, THREE.DoubleSide),   // the toilet bowl, seen inside and out
  bowl:      surface(0xf2f1ec, 0.25, THREE.BackSide),         // the bathroom sink, drawn inside out
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

// Paint a part now and keep that colour (paint() skips it).
function tint(obj, mat) {
  obj.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial && !o.userData.keep) { o.material = mat; o.userData.keep = true; } });
  return obj;
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
  add('h', 661, 669, [1063, 1237], [1072, 1237], [door(1078, 1162)]);                           // pantry, north: door, clear of the counter
  add('h', 780, 789, [1072, 1237], [1063, 1237]);                                               // pantry, south

  return named('walls', ...W);
}

/* ─── doors ─────────────────────────────────── */

/* A door leaf. Hinge at blueprint (hx, hy), latch edge at (ex, ey)
   when shut. It swings toward the point (tx, ty), and starts open
   `open` degrees. setOpen(1) is 90°. lite = { panes, rows } puts a
   window in the top half. */
function leaf(name, hx, hy, ex, ey, open = 0, tx = 680, ty = 620, lite = null) {
  const x0 = X(hx), z0 = Z(hy), dx = X(ex) - x0, dz = Z(ey) - z0;
  const w = Math.hypot(dx, dz), h = DOOR_H - 0.01;     // fills the opening, no double edge
  const th = Math.atan2(dz, dx);
  const sign = Math.sign(Math.sin(Math.atan2(Z(ty) - z0, X(tx) - x0) - th)) || 1;
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
  openable(g, t => { g.rotation.y = -(th + sign * t * Math.PI / 2); });
  g.userData.setOpen(open / 90);
  return g;
}

/* Gives a moving part setOpen(t), 0 shut to 1 open (anything between
   works), so anomalies can open things:
     scene.getObjectByName('fridge-door').userData.setOpen(1)
   userData.open says where it is now. move(t) does the moving. */
function openable(g, move) {
  const box = new THREE.Box3();
  g.userData.setOpen = t => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    move(t);
    g.userData.open = t;
    // tell main.js what moved, so lamps near it redraw their shadows
    let root = g;
    while (root.parent) root = root.parent;
    if (root !== g) (root.userData.moved ||= []).push(box.setFromObject(g).getCenter(new THREE.Vector3()));
  };
  g.userData.setOpen(0);
  return g;
}

function doors() {
  return named('doors',
    // flush with the outside face, so from the yard it reads as one door
    leaf('door-front', 107, 600, 107, 695, 0, 680, 620, { panes: 2, rows: 2 }),
    slidingDoor(),
    leaf('door-master', 811, 733, 811, 804, 75, 900, 733),
    coatClosetDoors(),
    // pantry door, standing partly open into the pantry
    leaf('door-pantry', 1080, 665, 1160, 665, 55, 1120, 720),
    accordionDoor()
  );
}

/* The storage closet's folding door, facing the couch: three panels
   hinged together on a track. Shut, it's nearly flat across the
   doorway; open, it folds out toward the couch at the west end.
     scene.getObjectByName('door-closet').userData.setOpen(0.5) */
function accordionDoor() {
  const x0 = X(325), x1 = X(409), z = Z(735.5), N = 3;
  const SHUT = 6 * Math.PI / 180, OPEN = 78 * Math.PI / 180;
  const p = (x1 - x0) / (N * Math.cos(SHUT)), h = DOOR_H - 0.12;
  const panels = [];
  for (let i = 0; i < N; i++) {
    const geo = new THREE.BoxGeometry(p, h, 0.08);
    geo.translate(p / 2, h / 2, 0);                       // hinged on its left edge
    const panel = solid(geo, [0, FLOOR + 0.06, 0]);
    if (i === N - 1) panel.add(tint(solid(new THREE.BoxGeometry(0.05, 0.45, 0.16), [p - 0.14, 3.1, 0]), MAT.dark));   // pull
    panels.push(panel);
  }
  const g = named('door-closet', ...panels);
  g.userData.movesParts = true;
  return openable(g, t => {
    const th = SHUT + (OPEN - SHUT) * t, du = p * Math.cos(th), dz = p * Math.sin(th);
    panels.forEach((panel, i) => {
      const out = i % 2 === 0;                            // out toward the couch, then back
      panel.position.x = x0 + i * du;
      panel.position.z = out ? z : z - dz;
      panel.rotation.y = out ? th : -th;
    });
  });
}

/* The coat closet's sliding doors: two panels on two tracks, like real
   bypass closet doors. The room-side one slides over the other.
     scene.getObjectByName('door-coat-closet').userData.setOpen(1) */
function coatClosetDoors() {
  const h = DOOR_H - 0.12, y = FLOOR + 0.04;
  const panel = (px0, px1, py0, py1, pullAt) => {
    const g = new THREE.Group();
    g.add(solid(new THREE.BoxGeometry(X(px1) - X(px0), h, Z(py1) - Z(py0)),
      [(X(px0) + X(px1)) / 2, y + h / 2, (Z(py0) + Z(py1)) / 2]));
    g.add(tint(solid(new THREE.BoxGeometry(0.06, 0.5, 0.03), [X(pullAt), y + 3.2, Z(py1) + 0.015]), MAT.dark));   // finger pull
    return g;
  };
  const back = panel(141, 217, 559, 561.6, 147);          // closet-side track
  const front = panel(208, 284, 562.4, 565, 278);         // room-side track, slides over
  const track = tint(block(141, 284, 559, 565, DOOR_H, DOOR_H - 0.08), MAT.track);
  const slide = X(141) - X(208);
  const g = named('door-coat-closet', back, front, track);
  g.userData.movesParts = true;
  return openable(g, t => { front.position.x = slide * t; });
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

/* An end table: a top, a shelf underneath with a couple of magazines
   on it, and four square legs. */
function endTable(name, x0, x1, y0, y1, h) {
  const leg = (x, y) => block(x, x + 3, y, y + 3, h - 0.08);
  return named(name,
    block(x0, x1, y0, y1, h, h - 0.08),                                       // top
    block(x0 + 3, x1 - 3, y0 + 3, y1 - 3, 0.62, 0.55),                         // shelf
    leg(x0 + 1, y0 + 1), leg(x1 - 4, y0 + 1), leg(x0 + 1, y1 - 4), leg(x1 - 4, y1 - 4),
    tint(solid(new THREE.BoxGeometry(0.75, 0.04, 0.95), [X(x0 + 20), FLOOR + 0.64, Z(y0 + 22)], [0, 0.2, 0]), MAT.cream),   // magazines
    tint(solid(new THREE.BoxGeometry(0.72, 0.04, 0.92), [X(x0 + 21), FLOOR + 0.68, Z(y0 + 21)], [0, -0.1, 0]), MAT.flannel));
}

// a folded newspaper lying on the table (its front page is a tiny picture)
function newspaper(cx, cy) {
  const m = surface(0xe3dfd2, 0.9);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e3dfd2'; g.fillRect(0, 0, 96, 64);
    g.fillStyle = '#2a2a2a'; g.fillRect(6, 4, 84, 6);                   // the masthead
    g.fillRect(6, 13, 60, 4);                                            // headline
    g.fillStyle = '#9a968c'; g.fillRect(56, 21, 34, 22);                 // a photo
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#7d7a72';
    for (let col = 0; col < 3; col++) {                                  // columns of print
      for (let y = 22; y < 60; y += 3) {
        if (col === 2 && y < 45) continue;
        g.fillRect(6 + col * 26, y, 20 + rand() * 4, 1);
      }
    }
    m.map = new THREE.CanvasTexture(c);
    m.map.colorSpace = THREE.SRGBColorSpace;
  }
  return tint(solid(new THREE.BoxGeometry(1.2, 0.04, 0.8), [X(cx), FLOOR + 2.52, Z(cy)], [0, 0.35, 0]), m);
}

// a small cobalt bud vase with one flower in it
function budVase(cx, cy) {
  const x = X(cx), z = Z(cy), y = FLOOR + 2.5;
  const vase = new THREE.LatheGeometry([[0.07, 0], [0.12, 0.08], [0.11, 0.22], [0.04, 0.38], [0.035, 0.5], [0.05, 0.54]]
    .map(([r, h]) => new THREE.Vector2(r, h)), 16);
  const petals = [0, 1, 2, 3, 4].map(i => {
    const a = i / 5 * Math.PI * 2, p = new THREE.SphereGeometry(0.055, 6, 4);
    p.scale(1, 0.35, 0.6);
    return tint(solid(p, [x + Math.cos(a) * 0.06, y + 1.02, z + Math.sin(a) * 0.06], [0, -a, 0.3]), MAT.flannel);
  });
  const leaf = new THREE.SphereGeometry(0.08, 6, 4);
  leaf.scale(1, 0.2, 0.4);
  return [
    tint(solid(vase, [x, y, z]), surface(0x2f4f9a, 0.25)),
    tint(solid(new THREE.CylinderGeometry(0.01, 0.012, 0.55, 5), [x, y + 0.75, z], [0, 0, 0.05]), MAT.leaves),
    tint(solid(leaf, [x + 0.06, y + 0.72, z], [0, 0, -0.5]), MAT.leaves),
    ...petals,
    tint(solid(new THREE.SphereGeometry(0.035, 6, 4), [x, y + 1.03, z]), MAT.mustard)
  ];
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
    block(659, 666, 579, 586, 2.35), block(724, 731, 579, 586, 2.35),
    newspaper(718, 488),
    ...budVase(690, 532)
  );
  return named('living-room',
    sofa(),
    rug(),
    named('armchair', at(armchair, 650, 262, -45)),
    endTable('side-table', 555, 598, 193, 237, 2),
    table,
    named('dining-chairs',
      at(chair(), 644, 492, 90), at(chair(), 644, 555, 90),
      at(chair(), 746, 492, -90), at(chair(), 746, 555, -90),
      at(chair(), 695, 443, 0), at(chair(), 695, 602, 180)
    ),
    woodStove(),
    fire(),
    named('post', block(511, 522, 568, 579, 8)),
    pillarLamp()
  );
}

/* The sectional: a skirted base, separate seat and back cushions,
   square arms at both ends, and a couple of throw pillows. */
function sofa() {
  const seat = 1.45, base = 0.85, backTop = 2.65, lean = 0.12;
  const cushion = (x0, x1, y0, y1) => block(x0 + 1, x1 - 1, y0 + 1, y1 - 1, seat, base);   // small gaps so each one reads
  // a back cushion resting on the seat, leaning back a touch
  const backCushion = (x0, x1, y0, y1, alongWall) => {
    const w = X(x1) - X(x0), d = Z(y1) - Z(y0), h = backTop - seat;
    return solid(new THREE.BoxGeometry(w, h, d), [(X(x0) + X(x1)) / 2, FLOOR + seat + h / 2, (Z(y0) + Z(y1)) / 2],
      alongWall ? [0, 0, lean] : [lean, 0, 0]);
  };
  // a square arm
  const arm = (x0, x1, y0, y1) => [block(x0, x1, y0, y1, 2.25)];
  const pillow = (cx, cy, mat, rot) => tint(solid(new THREE.BoxGeometry(0.75, 0.75, 0.22), [X(cx), FLOOR + seat + 0.42, Z(cy)], rot), mat);
  return named('sofa',
    block(342, 405, 318, 535, base), block(405, 530, 478, 535, base),       // skirted base
    block(322, 342, 300, 555, 2.7), block(342, 548, 535, 555, 2.7),         // back frame
    cushion(342, 405, 318, 398), cushion(342, 405, 398, 478), cushion(342, 405, 478, 535),
    cushion(405, 467, 478, 535), cushion(467, 530, 478, 535),
    backCushion(342, 360, 320, 397, true), backCushion(342, 360, 399, 476, true), backCushion(342, 360, 478, 533, true),
    backCushion(362, 445, 517, 535, false), backCushion(447, 529, 517, 535, false),
    ...arm(322, 405, 300, 318, true), ...arm(530, 548, 478, 535, false),
    pillow(368, 336, MAT.flannel, [0, Math.PI / 2 - 0.3, 0.25]),
    pillow(382, 508, MAT.mustard, [0.25, 0.5, 0]));
}

/* A casual 90s rug in front of the sofa, 4' x 6', sitting a bit crooked:
   oatmeal with a sage border, a thin rust stripe and a little woven
   speckle, and slightly messy fringe on the two short ends. The pattern is one small picture drawn when the
   game starts, no image files. */
function rug() {
  const W = X(550) - X(440), D = Z(470) - Z(305);
  const top = surface(0xffffff, 1);
  if (typeof document !== 'undefined') top.map = rugPattern();
  const r = tint(solid(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), [0, 0.015, 0], null, top), top);
  // fringe: each tassel a slightly different length, bent a little, some splayed
  let seed = 17;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fringe = [];
  for (let x = -W / 2 + 0.08; x < W / 2 - 0.05; x += 0.09) {
    for (const end of [-1, 1]) {
      const z = end * D / 2, len = 0.2 + rand() * 0.14, bend = (rand() - 0.5) * 0.12, mid = len * (0.4 + rand() * 0.3);
      const a = [x, 0.01, z], b = [x + bend * 0.4, 0.01, z + end * mid], c = [x + bend, 0.01, z + end * len];
      fringe.push([a, b], [b, c]);
    }
  }
  const g = named('rug', r, lines(fringe, new THREE.LineBasicMaterial({ color: 0xb8a984 })));
  g.position.set(X(485), FLOOR, Z(387.5));
  g.rotation.y = 0.14;                       // kicked a little crooked, the way rugs end up
  return g;
}

function rugPattern() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 240;                         // the rug's shape, 4 by 6
  const g = c.getContext('2d');
  const band = (inset, fill) => { g.fillStyle = fill; g.fillRect(inset, inset, 160 - inset * 2, 240 - inset * 2); };
  band(0, '#5f6f55');                      // sage border
  band(15, '#c9b791');                     // oatmeal
  band(21, '#8a4034');                     // rust stripe
  band(23, '#c9b791');
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2200; i++) {         // woven speckle
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    g.fillRect(rand() * 160, rand() * 240, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* The wood stove: a hollow iron box on legs, firebrick inside, a
   window in its door, on a brick hearth. */
const STOVE = { x0: X(603), x1: X(690), zf: Z(740), zb: Z(796), y0: FLOOR + 0.35, y1: FLOOR + 2.3, s: 0.1,
  win: [X(618), X(675), FLOOR + 0.75, FLOOR + 1.95] };
function woodStove() {
  const { x0, x1, zf, zb, y0, y1, s, win } = STOVE;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, w = x1 - x0, h = y1 - y0;
  const box = (bw, bh, bd, x, y, z) => solid(new THREE.BoxGeometry(bw, bh, bd), [x, y, z]);
  const face = new THREE.Shape();
  face.moveTo(x0, y0); face.lineTo(x1, y0); face.lineTo(x1, y1); face.lineTo(x0, y1);
  const hole = new THREE.Path();
  hole.moveTo(win[0], win[2]); hole.lineTo(win[1], win[2]); hole.lineTo(win[1], win[3]); hole.lineTo(win[0], win[3]);
  face.holes.push(hole);
  return named('wood-stove',
    block(588, 706, 722, 806, 0.12),                                         // brick hearth (first: painted brick)
    solid(new THREE.ExtrudeGeometry(face, { depth: s, bevelEnabled: false }).translate(0, 0, zf)),   // front, with the window
    box(s, h, zb - zf - s, x0 + s / 2, y0 + h / 2, (zf + s + zb) / 2),
    box(s, h, zb - zf - s, x1 - s / 2, y0 + h / 2, (zf + s + zb) / 2),
    box(w - 2 * s, h, s, cx, y0 + h / 2, zb - s / 2),
    box(w - 2 * s, s, zb - zf - 2 * s, cx, y0 + s / 2, (zf + s + zb - s) / 2),
    box(w, s, zb - zf, cx, y1 + s / 2, cz),                                  // top
    tint(box(w - 2 * s - 0.02, h - s - 0.02, zb - zf - 2 * s - 0.02, cx, y0 + s + (h - s) / 2, cz), MAT.firebrick),
    block(606, 614, 790, 796, 0.35), block(679, 687, 790, 796, 0.35),         // legs
    block(606, 614, 740, 746, 0.35), block(679, 687, 740, 746, 0.35),
    round(646, 780, 0.28, 8, 2.4, 6));                                      // stovepipe to the ceiling
}

/* The fire: crossed logs on a bed of coals inside the stove, glowing
   softly and breathing a little brighter and dimmer. A small light
   inside lights the firebrick, and a soft orange spotlight with no
   shadows, aimed out through the window, warms the room. (Shadows cost a
   texture slot in every material and the card only has 16; the 13
   shadowed lights use most of them. Aimed away from the wall behind the
   stove, it can't leak into the bathroom.) FIRE is how bright. */
const FIRE = 4;
function fire() {
  const { x0, x1, zf, zb, y0, s, win: [wx0, wx1, wy0, wy1] } = STOVE;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, floor = y0 + s + 0.38, b = 0.12;    // on a grate, up where the window shows it
  const log = (len, x, y, z, turn, r = 0.17) => {
    const geo = new THREE.CylinderGeometry(r, r + 0.02, len, 8);
    geo.rotateZ(Math.PI / 2);
    return tint(solid(geo, [x, y, z], [0, turn, 0]), MAT.log);
  };
  const coal = (x, z, r) => {
    const geo = new THREE.DodecahedronGeometry(r, 0);
    geo.scale(1, 0.45, 1);
    return tint(solid(geo, [x, floor + r * 0.3, z]), MAT.ember);
  };
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0 - 2 * b, wy1 - wy0 - 2 * b),
    new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.25, depthWrite: false }));
  glass.position.set((wx0 + wx1) / 2, (wy0 + wy1) / 2, zf - 0.04);
  glass.layers.set(GLASS_LAYER);
  glass.userData.keep = glass.userData.noShadow = true;
  const inside = new THREE.PointLight(0xff6a20, 0.9, 2.0, 2);              // lights the firebrick, nothing else
  inside.position.set(cx, floor + 0.9, cz);
  const room = new THREE.SpotLight(0xff8c3a, FIRE, 16, 1.05, 0.8, 2);
  room.name = 'fire-light';
  room.position.set(cx, FLOOR + 1.3, zf - 0.4);
  room.target.position.set(cx, FLOOR + 0.5, zf - 8);
  const g = named('fire',
    paneFrame((u, y, w) => [u, y, zf - w], wx0, wx1, wy0, wy1, 0.04, { border: b, depth: 0.08, mat: MAT.dark }),
    tint(solid(new THREE.BoxGeometry(0.08, 0.35, 0.1), [wx1 - 0.2, (wy0 + wy1) / 2, zf - 0.12]), MAT.dark),   // door handle
    glass,
    // the grate: four iron bars on two feet
    ...[-0.45, -0.15, 0.15, 0.45].map(z => tint(solid(new THREE.BoxGeometry(2.2, 0.05, 0.05), [cx, floor - 0.03, cz + z]), MAT.dark)),
    ...[-0.9, 0.9].map(x => tint(solid(new THREE.BoxGeometry(0.06, 0.38, 1.0), [cx + x, floor - 0.22, cz]), MAT.dark)),
    ...[[-0.8, -0.3, 0.16], [-0.3, 0.25, 0.2], [0.35, -0.2, 0.18], [0.85, 0.3, 0.15], [0.1, 0.45, 0.14], [-0.6, 0.4, 0.13], [0.6, -0.45, 0.14]]
      .map(([x, z, r]) => coal(cx + x, cz + z, r)),
    log(1.9, cx, floor + 0.22, cz, 0.45),                                   // two logs crossed,
    log(1.9, cx, floor + 0.5, cz, -0.45),                                   // one on the other
    log(1.4, cx, floor + 0.36, cz + 0.55, 0.05, 0.14),                      // and one at the back
    inside, room, room.target);
  let t = 0;
  g.userData.tick = dt => {
    t += dt;
    const f = 1 + 0.08 * Math.sin(t * 2.1) + 0.06 * Math.sin(t * 5.3 + 1) + 0.04 * Math.sin(t * 9.7 + 2);
    room.intensity = FIRE * f;
    inside.intensity = 0.9 * f;
    MAT.ember.emissiveIntensity = 1.1 * f;
    MAT.log.emissiveIntensity = 0.12 * f;
  };
  return g;
}

/* A little old-timey sconce on the pillar by the sofa: a brass backplate
   with curls, and a flared cup of Tiffany glass pointing up like a
   gaudy torch, with a flame-shaped bulb in it. Its light has no shadows
   (no texture slots left) and only reaches across the sofa. */
function pillarLamp() {
  const x = X(516.5), z = Z(568), y = FLOOR + 5.1;
  const brass = (geo, p, rot) => tint(solid(geo, p, rot), MAT.brass);
  const curl = (dx) => {
    const c = new THREE.TorusGeometry(0.07, 0.014, 4, 12, Math.PI * 1.6);
    c.rotateY(Math.PI / 2);
    return brass(c, [x + dx, y - 0.12, z - 0.24]);
  };
  // the cup: muted pieces of glass in dark lead, a tiny picture drawn at start
  const cup = new THREE.CylinderGeometry(0.24, 0.06, 0.32, 24, 1, true);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  if (typeof document !== 'undefined') glassMat.map = leadedGlass(); else glassMat.color.set(0x8a6a32);
  glassMat.color.multiplyScalar(1.3);                                        // lit from inside
  const aura = halo(1.4);
  if (aura.material) { aura.material.color.set(0xffc27a).multiplyScalar(1.6); aura.scale.set(1.4, 1.4, 1); }   // a warm haze round the glass,
  aura.position.set(x, y + 0.28, z - 0.8);                                   // just in front of it, so the cup doesn't hide it
  const bulb = new THREE.SphereGeometry(0.05, 10, 8);
  bulb.scale(1, 2.2, 1);
  // its light: a wide soft spot down onto the sofa (a plain bulb this close
  // to the pillar would just blow the pillar out)
  const light = new THREE.SpotLight(LAMP_COLOR, 17, 14, 1.2, 0.9, 2);
  light.name = 'lamp-pillar-light';
  light.position.set(x, y + 0.3, z - 0.5);
  light.target.position.set(X(440), FLOOR + 1.2, Z(440));
  return named('lamp-pillar',
    brass(new THREE.BoxGeometry(0.2, 0.45, 0.04), [x, y, z - 0.02]),                  // backplate
    brass(new THREE.BoxGeometry(0.03, 0.03, 0.36), [x, y - 0.02, z - 0.2]),           // arm
    curl(-0.05), curl(0.05),
    brass(new THREE.ConeGeometry(0.035, 0.14, 8).rotateX(Math.PI), [x, y - 0.19, z - 0.4]),   // drop finial
    brass(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 8), [x, y + 0.03, z - 0.4]),    // collar
    solid(cup, [x, y + 0.24, z - 0.4], null, glassMat),
    glow(bulb, x, y + 0.24, z - 0.4),
    aura, light, light.target);
}

// Tiffany glass: three rows of irregular pieces in muted colours, thick dark lead between
function leadedGlass() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const colours = ['#8a6a32', '#5d6b3f', '#7a3f2c', '#46566a', '#9a8350', '#6b4a5a', '#7d7445'];
  let seed = 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [[0, 18, 8], [18, 38, 11], [38, 58, 14]];                 // bottom to top: y0, y1, pieces
  for (const [y0, y1, n] of rows) {
    let x = 0;
    const cuts = Array.from({ length: n }, (_, i) => (i + 0.3 + rand() * 0.4) * 256 / n);
    cuts.push(256 + cuts[0]);
    for (let i = 0; i < n; i++) {
      const a = cuts[i], b = cuts[i + 1], lean = (rand() - 0.5) * 8;
      g.fillStyle = colours[Math.floor(rand() * colours.length)];
      g.beginPath();
      for (const dx of [0, -256]) {                                         // wraps round the cup
        g.moveTo(a + dx, 64 - y0); g.lineTo(b + dx, 64 - y0); g.lineTo(b + dx + lean, 64 - y1); g.lineTo(a + dx + lean, 64 - y1); g.closePath();
      }
      g.fill();
      g.strokeStyle = '#17110c'; g.lineWidth = 3; g.stroke();
      x = b;
    }
  }
  g.fillStyle = '#2a2016';
  g.fillRect(0, 0, 256, 6);                                                  // the rim
  g.fillRect(0, 62, 256, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* A 90s counter stool: chrome base, post and foot ring, a coloured
   seat, and a little chrome hoop for a back. Faces +z. */
function stool(seatMat) {
  const ring = new THREE.TorusGeometry(0.4, 0.03, 6, 20);
  ring.rotateX(Math.PI / 2);
  return tint(new THREE.Group().add(
    solid(new THREE.CylinderGeometry(0.5, 0.56, 0.06, 16), [0, 0.03, 0]),
    solid(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), [0, 1.3, 0]),
    solid(ring, [0, 0.95, 0]),
    solid(new THREE.BoxGeometry(0.8, 0.03, 0.03), [0, 0.95, 0]),
    solid(new THREE.BoxGeometry(0.03, 0.03, 0.8), [0, 0.95, 0]),
    tint(solid(new THREE.CylinderGeometry(0.6, 0.5, 0.2, 16), [0, 2.65, 0]), seatMat),
    solid(new THREE.TorusGeometry(0.32, 0.035, 6, 14, Math.PI), [0, 2.78, -0.45])), MAT.chrome);
}

function kitchen() {
  return named('kitchen',
    cabinets('island', { along: 'x', a0: 868, a1: 1087, back: Z(470), front: Z(565), splits: [941, 1014],
      stuff: islandStuff }, tint(block(866, 1089, 468, 567, 3, 2.85), MAT.counter)),
    cooktop(),
    named('stools', at(stool(MAT.teal), 902, 452), at(stool(MAT.plum), 947, 452), at(stool(MAT.teal), 993, 452), at(stool(MAT.plum), 1047, 452)),
    // the east counter's top has a hole cut in it for the sink
    cabinets('counter-east', { along: 'z', a0: 364, a1: 660, back: X(1237), front: X(1183), splits: [438, 585],
      open: [1], stuff: sinkStuff },
      tint(slab([[1181, 364], [1237, 364], [1237, 660], [1181, 660]],
        [[[1189, 475], [1225, 475], [1225, 547], [1189, 547]]], FLOOR + 2.85, FLOOR + 3), MAT.counter)),
    sink(),
    cabinets('counter-south', { along: 'x', a0: 807, a1: 980, back: Z(715), front: Z(660), splits: [865, 922],
      stuff: counterStuff }, tint(block(807, 980, 658, 715, 3, 2.85), MAT.counter)),
    fridge(),
    named('pantry-shelves', shelving(1190, 1237, 669, 780), shelving(1072, 1187, 748, 780))
  );
}

/* Base cabinets along a run: a hollow box with a pale inside, a shelf
   in each section (not where `open` says, like under the sink), and
   doors that swing, one per section or a pair if it's wide. Each door is
   named 'cabinet-door-<run>-<n>' and has setOpen(t) like the others.
   The run goes along x or z between blueprint a0..a1, from the back
   (feet) to the front (feet), split into sections at `splits` (px).
   stuff(box, sections) adds whatever's kept inside. */
function cabinets(name, { along, a0, a1, back, front, splits = [], open = [], stuff }, ...extra) {
  const A = along === 'x' ? X : Z, A0 = A(a0), L = A(a1) - A0;
  const n = Math.sign(front - back), D = Math.abs(front - back);
  const s = 0.06, H = 2.85, toe = 0.35;
  // a box in run space: u along the run, d from the back toward the front, y up from the floor
  const box = (u0, u1, d0, d1, y0, y1) => {
    const p = [A0 + u0, A0 + u1], q = [back + n * d0, back + n * d1].sort((a, b) => a - b);
    const [xs, zs] = along === 'x' ? [p, q] : [q, p];
    return solid(new THREE.BoxGeometry(xs[1] - xs[0], y1 - y0, zs[1] - zs[0]),
      [(xs[0] + xs[1]) / 2, FLOOR + (y0 + y1) / 2, (zs[0] + zs[1]) / 2]);
  };
  const cuts = [0, ...splits.map(px => A(px) - A0), L];
  const sections = cuts.slice(1).map((u, i) => [cuts[i], u]);
  const parts = [
    box(0, s, 0, D, 0, H), box(L - s, L, 0, D, 0, H),                       // ends
    box(s, L - s, 0, s, toe, H),                                            // back
    box(s, L - s, 0, D - 0.25, 0, toe),                                     // toe kick
    box(s, L - s, D - s, D, H - 0.2, H),                                    // rail under the counter
    tint(box(s, L - s, s, D, toe, toe + s), MAT.cabShelf),                  // floor
    tint(box(s + 0.01, L - s - 0.01, s + 0.01, D - 0.01, toe + s + 0.01, H - 0.01), MAT.cabInside)
  ];
  for (const u of cuts.slice(1, -1)) parts.push(tint(box(u - s / 2, u + s / 2, s, D, toe + s, H - 0.2), MAT.cabShelf));
  sections.forEach(([u0, u1], i) => {
    if (!open.includes(i)) parts.push(tint(box(u0 + s / 2, u1 - s / 2, s, D - 0.1, 1.45, 1.5), MAT.cabShelf));
  });
  // doors
  const axis = along === 'x' ? [1, 0] : [0, 1], out = along === 'x' ? [0, n] : [n, 0];
  let k = 0;
  const door = (hingeU, freeU) => {
    const w = Math.abs(freeU - hingeU) - 0.02, dir = Math.sign(freeU - hingeU);
    const t = [axis[0] * dir, axis[1] * dir];                              // hinge toward the free edge
    const beta = Math.atan2(-t[1], t[0]);
    const sgn = Math.round(out[0] * -t[1] + out[1] * t[0]) || 1;           // which local side faces out
    const y0 = toe + 0.03, y1 = H - 0.22, h = y1 - y0;
    const g = named(`cabinet-door-${name}-${++k}`,
      solid(new THREE.BoxGeometry(w, h, 0.06), [w / 2, FLOOR + y0 + h / 2, sgn * 0.03]),
      solid(new THREE.BoxGeometry(w - 0.3, h - 0.3, 0.025), [w / 2, FLOOR + y0 + h / 2, sgn * 0.072]),   // raised panel
      tint(solid(new THREE.SphereGeometry(0.045, 8, 6), [w - 0.12, FLOOR + y1 - 0.25, sgn * 0.12]), MAT.brass));
    const hx = A0 + hingeU, hd = back + n * D;
    if (along === 'x') g.position.set(hx, 0, hd); else g.position.set(hd, 0, hx);
    return openable(g, v => { g.rotation.y = beta - sgn * v * 1.75; });
  };
  for (const [u0, u1] of sections) {
    if (u1 - u0 > 2.2) { const m = (u0 + u1) / 2; parts.push(door(u0 + 0.01, m), door(u1 - 0.01, m)); }
    else parts.push(door(u0 + 0.01, u1 - 0.01));
  }
  if (stuff) parts.push(...stuff(box, sections, { s, toe, D }));
  return named(name, ...parts, ...extra);
}

// under the sink: the drain pipes, a bucket and some cleaning bottles
function sinkStuff(box, [, [u0, u1]], { toe, s }) {
  const floor = toe + s;
  return [
    // a drain down from each bowl, joined, and back into the wall
    tint(box(4.67, 4.77, 1.05, 1.15, 1.6, 2.25), MAT.soft), tint(box(5.97, 6.07, 1.05, 1.15, 1.6, 2.25), MAT.soft),
    tint(box(4.67, 6.07, 1.05, 1.15, 1.55, 1.65), MAT.soft), tint(box(5.3, 5.4, 0.06, 1.05, 1.55, 1.65), MAT.soft),
    tint(box(u0 + 0.4, u0 + 1.1, 0.9, 1.6, floor, floor + 0.85), MAT.flannel),   // bucket
    tint(box(u1 - 0.9, u1 - 0.7, 1.2, 1.4, floor, floor + 0.65), MAT.teal),      // bottles
    tint(box(u1 - 0.6, u1 - 0.4, 1.0, 1.2, floor, floor + 0.55), MAT.cream)
  ];
}

// in the island: pots on the floor and bowls on the shelves
function islandStuff(box, sections, { toe, s }) {
  const floor = toe + s, out = [];
  sections.forEach(([u0, u1], i) => {
    if (i === 1) return;                                       // under the cooktop: gas pipes, nothing kept
    out.push(tint(box(u0 + 0.3, u0 + 1.2, 0.6, 1.5, floor, floor + 0.6), MAT.steel),
             tint(box(u0 + 1.4, u0 + 2.2, 0.8, 1.6, floor, floor + 0.45), MAT.dark),
             tint(box(u0 + 0.4, u0 + 1.1, 0.8, 1.5, 1.5, 1.8), MAT.cream),
             tint(box(u0 + 1.4, u0 + 2.0, 0.9, 1.5, 1.5, 1.7), MAT.mustard));
  });
  return out;
}

// next to the fridge: stacks of plates, glasses and cans
function counterStuff(box, sections, { toe, s }) {
  const floor = toe + s, out = [];
  sections.forEach(([u0, u1]) => {
    out.push(tint(box(u0 + 0.3, u0 + 1.1, 0.3, 1.1, 1.5, 1.85), MAT.soft),      // plates
             tint(box(u0 + 1.3, u0 + 1.8, 0.4, 0.9, 1.5, 1.95), MAT.cabinet),   // glasses
             tint(box(u0 + 0.3, u0 + 1.6, 0.4, 1.2, floor, floor + 0.5), MAT.denim));   // pans
  });
  return out;
}

/* A gas cooktop set into the island: black top, four burners under
   iron grates, knobs along the cook's side. */
function cooktop() {
  const top = FLOOR + 3, x0 = X(945), x1 = X(1015), z0 = Z(508), z1 = Z(560);
  const cx = (x0 + x1) / 2, w = x1 - x0;
  const rows = [z0 + 0.5, z0 + 1.2], cols = [x0 + w * 0.27, x1 - w * 0.27];
  const bar = (len, alongX, x, z) =>
    solid(new THREE.BoxGeometry(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len), [x, top + 0.14, z]);
  const parts = [solid(new THREE.BoxGeometry(w, 0.05, z1 - z0), [cx, top + 0.025, (z0 + z1) / 2])];
  for (const z of rows) for (const x of cols) {
    parts.push(
      tint(solid(new THREE.CylinderGeometry(0.2, 0.23, 0.06, 12), [x, top + 0.08, z]), MAT.steel),   // burner
      solid(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), [x, top + 0.125, z]),                  // its cap
      bar(0.6, true, x, z), bar(0.6, false, x, z));                                                   // grate over it
  }
  const g0 = z0 + 0.12, g1 = z0 + 1.58, gm = (g0 + g1) / 2;
  parts.push(bar(w - 0.2, true, cx, g0), bar(w - 0.2, true, cx, g1), bar(w - 0.2, true, cx, (rows[0] + rows[1]) / 2),
    bar(g1 - g0, false, x0 + 0.1, gm), bar(g1 - g0, false, x1 - 0.1, gm), bar(g1 - g0, false, cx, gm));
  for (let i = 0; i < 4; i++) {
    parts.push(tint(solid(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), [x0 + w * (0.2 + i * 0.2), top + 0.09, z1 - 0.15]), MAT.steel));
  }
  return named('cooktop', ...parts);
}

/* A top-freezer fridge against the kitchen | master wall, facing the
   kitchen. It's hollow, with shelves, door bins, food and a little
   light inside, and both doors open, for anomalies:
     scene.getObjectByName('fridge-door').userData.setOpen(1)
     scene.getObjectByName('freezer-door').userData.setOpen(1)
   (Wide open, the fridge door reaches ghoul1's path round the island.) */
function fridge() {
  const x0 = X(980), x1 = X(1060), zf = Z(655), zb = Z(715);
  const W = x1 - x0, T = 0.18, cx = (x0 + x1) / 2;
  const front = zf + T, D = zb - front, zc = front + D / 2;
  const H = 6.3, SPLIT = 4.5, s = 0.08;
  const lo = 0.3, hi = SPLIT - 0.07, flo = SPLIT + 0.07, fhi = H - s;      // inside floors and ceilings
  const inW = W - 2 * s, inD = D - s, back = zb - s;
  const box = (w, h, d, x, y, z) => solid(new THREE.BoxGeometry(w, h, d), [x, FLOOR + y, z]);
  const cyl = (r, h, x, y, z) => solid(new THREE.CylinderGeometry(r, r, h, 8), [x, FLOOR + y + h / 2, z]);
  const shelf = y => tint(box(inW - 0.06, 0.04, inD - 0.35, cx, y, back - (inD - 0.35) / 2), MAT.soft);
  const food = z => [                                          // [shape, colour], sitting on whatever's below
    [cyl(0.14, 0.6, cx - 0.15, 1.54, z), MAT.mustard],         // juice
    [box(0.35, 0.75, 0.35, cx - 0.65, 1.54 + 0.375, z), MAT.soft],    // milk
    [box(0.6, 0.25, 0.4, cx + 0.6, 1.54 + 0.125, z), MAT.cabinet],   // leftovers
    [cyl(0.1, 0.45, cx - 0.7, 2.59, z), MAT.frontDoor],         // ketchup
    [cyl(0.15, 0.3, cx - 0.3, 2.59, z), MAT.brick],             // jar
    [box(0.7, 0.3, 0.5, cx + 0.5, 2.59 + 0.15, z), MAT.sofa],
    [box(0.9, 0.2, 0.35, cx - 0.2, 3.54 + 0.1, z), MAT.soft],   // eggs
    [cyl(0.12, 0.7, cx + 0.7, 3.54, z), MAT.cabinet],           // bottle
    [box(0.8, 0.35, 0.6, cx - 0.5, flo + 0.175, z), MAT.soft],  // freezer: ice cream, peas, a pizza
    [box(0.6, 0.2, 0.5, cx + 0.45, flo + 0.1, z), MAT.mustard],
    [box(0.9, 0.12, 0.6, cx, flo + 0.79 + 0.06, z), MAT.sofa]
  ].map(([part, mat]) => tint(part, mat));

  const door = (name, y0, y1, grip, bins) => {
    const h = y1 - y0;
    const g = named(name,
      solid(new THREE.BoxGeometry(W, h, T), [-W / 2, FLOOR + y0 + h / 2, T / 2]),
      tint(solid(new THREE.BoxGeometry(W - 0.3, h - 0.3, 0.03), [-W / 2, FLOOR + y0 + h / 2, T + 0.015]), MAT.soft),
      // handle on standoffs, on the side away from the hinge
      solid(new THREE.BoxGeometry(0.07, grip[1] - grip[0], 0.07), [-W + 0.2, FLOOR + (grip[0] + grip[1]) / 2, -0.15]),
      solid(new THREE.BoxGeometry(0.05, 0.05, 0.12), [-W + 0.2, FLOOR + grip[0] + 0.06, -0.07]),
      solid(new THREE.BoxGeometry(0.05, 0.05, 0.12), [-W + 0.2, FLOOR + grip[1] - 0.06, -0.07]),
      ...bins.flatMap(yb => [
        tint(solid(new THREE.BoxGeometry(W - 0.6, 0.22, 0.03), [-W / 2, FLOOR + yb + 0.11, T + 0.26]), MAT.soft),
        tint(solid(new THREE.BoxGeometry(W - 0.6, 0.03, 0.24), [-W / 2, FLOOR + yb + 0.015, T + 0.15]), MAT.soft),
        tint(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), [-W / 2 - 0.3, FLOOR + yb + 0.23, T + 0.15]), MAT.cabinet),
        tint(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8), [-W / 2 + 0.25, FLOOR + yb + 0.19, T + 0.15]), MAT.frontDoor)
      ]));
    g.position.set(x1, 0, zf);                                  // hinged at its front corner by the pantry wall
    return openable(g, t => { g.rotation.y = -t * 100 * Math.PI / 180; });
  };

  return named('fridge',
    box(s, H, D, x0 + s / 2, H / 2, zc), box(s, H, D, x1 - s / 2, H / 2, zc),           // sides
    box(W, s, D, cx, H - s / 2, zc), box(W, lo, D, cx, lo / 2, zc),                    // top, base
    box(W, H, s, cx, H / 2, zb - s / 2), box(W, flo - hi, D, cx, SPLIT, zc),           // back, between the two
    // white insides, drawn inside out so they only show from in front
    tint(box(inW - 0.04, hi - lo - 0.04, inD - 0.04, cx, (lo + hi) / 2, front + inD / 2), MAT.liner),
    tint(box(inW - 0.04, fhi - flo - 0.04, inD - 0.04, cx, (flo + fhi) / 2, front + inD / 2), MAT.liner),
    shelf(1.5), shelf(2.55), shelf(3.5), shelf(flo + 0.75),
    tint(box(inW - 0.1, 0.9, inD - 0.4, cx, lo + 0.47, back - (inD - 0.4) / 2), MAT.soft),   // crisper
    glow(new THREE.BoxGeometry(0.5, 0.05, 0.2), cx, FLOOR + hi - 0.05, back - 0.4),         // the light
    ...food(back - 0.6),
    door('fridge-door', 0.03, SPLIT - 0.03, [2.6, 4.1], [0.9, 2.1, 3.3]),
    door('freezer-door', SPLIT + 0.03, H - 0.02, [SPLIT + 0.2, SPLIT + 0.95], [5.0]));
}

// Open shelves against a wall: an upright at each end, boards up to h,
// and a few cans and boxes on each board.
function shelving(x0, x1, y0, y1, h = 6.5, boards = 5) {
  const alongX = X(x1) - X(x0) > Z(y1) - Z(y0);
  const parts = alongX
    ? [block(x0, x0 + 3, y0, y1, h), block(x1 - 3, x1, y0, y1, h)]
    : [block(x0, x1, y0, y0 + 3, h), block(x0, x1, y1 - 3, y1, h)];
  let seed = x0 * 7 + y0 * 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const colours = [MAT.mustard, MAT.frontDoor, MAT.cabinet, MAT.soft, MAT.sofa, MAT.brick];
  const mid = alongX ? (Z(y0) + Z(y1)) / 2 : (X(x0) + X(x1)) / 2;
  for (let i = 0; i < boards; i++) {
    const hb = 0.35 + i * (h - 0.41) / (boards - 1);
    parts.push(alongX ? block(x0 + 3, x1 - 3, y0, y1, hb + 0.06, hb) : block(x0, x1, y0 + 3, y1 - 3, hb + 0.06, hb));
    if (i === boards - 1) continue;                       // nothing on the top board
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5 + (rand() - 0.5) * 0.5) / n;
      const along = alongX ? X(x0 + 3) + f * (X(x1 - 3) - X(x0 + 3)) : Z(y0 + 3) + f * (Z(y1 - 3) - Z(y0 + 3));
      const tall = 0.4 + rand() * 0.6, can = rand() < 0.5;
      const ht = can ? tall * 0.7 : tall;
      const y = FLOOR + hb + 0.06 + ht / 2;
      const thing = can
        ? solid(new THREE.CylinderGeometry(0.17, 0.17, ht, 8), alongX ? [along, y, mid] : [mid, y, along])
        : solid(new THREE.BoxGeometry(0.55, ht, 0.2), alongX ? [along, y, mid] : [mid, y, along], alongX ? null : [0, Math.PI / 2, 0]);
      parts.push(tint(thing, colours[Math.floor(rand() * colours.length)]));
    }
  }
  return named('shelving', ...parts);
}

/* A double stainless sink under the east window, with a faucet. Each
   bowl is a box drawn inside out (only its inner faces show), so from
   above it looks like an open basin. A steel rim hides the cut edge. */
function sink() {
  const top = FLOOR + 3, deep = 0.75;
  // an open-topped steel box: from above it's the bowl, from under the sink its outside
  const bowl = (y0, y1) => {
    const b = block(1191, 1223, y0, y1, 3, 3 - deep);
    const geo = b.children[0].geometry, idx = geo.index.array;
    geo.setIndex([...idx.slice(0, 12), ...idx.slice(18)]);       // drop the top face
    return tint(b, MAT.basin);
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
    bookshelf(),
    chaise(),
    named('round-table', round(1206, 846, 0.6, 1.9, 1.84, 14), round(1206, 846, 0.08, 1.84, 0.1, 8), round(1206, 846, 0.35, 0.1, 0, 12),
      tint(block(1196, 1214, 838, 852, 1.98, 1.9), MAT.flannel))          // a book on it
  );
}

/* The bookshelf facing the bed: four shelves of books (a jumble of
   heights and colours, some leaning, some stacked flat), a framed photo,
   and a plant on top. Books are welded together by colour, so it's cheap. */
function bookshelf() {
  const parts = [
    block(940, 943, 728, 762, 5.0), block(1052, 1055, 728, 762, 5.0),       // sides
    block(938, 1057, 727, 764, 5.1, 5.0),                                   // top
    block(943, 1052, 728, 730, 5.0),                                        // back
    block(943, 1052, 730, 762, 0.3)                                         // base
  ];
  const covers = [MAT.flannel, MAT.hunter, MAT.denim, MAT.plum, MAT.mustard, MAT.cream, MAT.brick, MAT.dark, MAT.teal];
  let seed = 21;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const zb = Z(731), x1 = X(1051);
  for (const [i, base] of [0.3, 1.45, 2.6, 3.75].entries()) {
    if (i) parts.push(block(943, 1052, 730, 762, base, base - 0.06));       // the shelf board
    let x = X(944);
    while (x < x1 - 0.1) {
      const r = rand();
      if (r < 0.06 && x < x1 - 0.6) {                                       // a short stack lying flat
        for (let k = 0; k < 3; k++) {
          parts.push(tint(solid(new THREE.BoxGeometry(0.5 - k * 0.04, 0.09, 0.62), [x + 0.26, FLOOR + base + 0.045 + k * 0.09, zb + 0.4]),
            covers[Math.floor(rand() * covers.length)]));
        }
        x += 0.6;
      } else if (r < 0.1 && i === 2 && x < x1 - 0.5) {                      // a framed photo
        parts.push(tint(solid(new THREE.BoxGeometry(0.4, 0.5, 0.04), [x + 0.22, FLOOR + base + 0.25, zb + 0.6], [-0.15, 0, 0]), MAT.brass));
        x += 0.5;
      } else {
        const w = 0.08 + rand() * 0.13, h = 0.6 + rand() * 0.35, d = 0.55 + rand() * 0.2;
        const lean = x > x1 - 0.35 && rand() < 0.6 ? 0.3 : 0;               // the last one leans over
        parts.push(tint(solid(new THREE.BoxGeometry(w, h, d), [x + w / 2 + lean * 0.3, FLOOR + base + h / 2 - lean * 0.05, zb + d / 2 + 0.05], [0, 0, -lean]),
          covers[Math.floor(rand() * covers.length)]));
        x += w + 0.005;
        if (lean) break;
      }
    }
  }
  // a plant on top
  parts.push(tint(round(1030, 745, 0.28, 5.55, 5.1, 10, 0.34), MAT.brick),
    tint(solid(new THREE.IcosahedronGeometry(0.45, 0), [X(1030), FLOOR + 5.85, Z(745)]), MAT.leaves));
  return named('bookshelf', ...parts);
}

/* A chaise lounge under the bedroom window: one long dusty rose seat
   with a sloped, rolled back at the head end, turned legs, a bolster,
   and a throw folded over the foot. */
function chaise() {
  const x0 = X(1172), x1 = X(1232), z0 = Z(870), L = Z(1030) - z0, W = x1 - x0;
  const side = new THREE.Shape();                    // the side profile: v from the head, y up
  side.moveTo(0, 0.35); side.lineTo(L, 0.35); side.lineTo(L, 1.45);
  side.lineTo(1.0, 1.45);
  side.quadraticCurveTo(0.35, 1.5, 0.2, 2.5);        // up the back
  side.quadraticCurveTo(0.12, 2.8, -0.12, 2.62);     // rolled over the top
  side.lineTo(0, 0.35);
  const body = remap(new THREE.ExtrudeGeometry(side, { depth: W, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 }),
    (v, y, d) => [x0 + d, FLOOR + y, z0 + v]);
  const leg = (x, z) => tint(solid(new THREE.CylinderGeometry(0.07, 0.04, 0.35, 8), [x, FLOOR + 0.175, z]), MAT.furniture);
  const bolster = new THREE.CylinderGeometry(0.24, 0.24, W - 0.2, 14);
  bolster.rotateZ(Math.PI / 2);
  return named('chaise',
    tint(solid(body), MAT.rose),
    leg(x0 + 0.15, z0 + 0.15), leg(x1 - 0.15, z0 + 0.15), leg(x0 + 0.15, z0 + L - 0.15), leg(x1 - 0.15, z0 + L - 0.15),
    tint(solid(bolster, [(x0 + x1) / 2, FLOOR + 1.72, z0 + 0.75]), MAT.cream),
    tint(solid(new THREE.BoxGeometry(W + 0.06, 0.08, 0.9), [(x0 + x1) / 2, FLOOR + 1.53, z0 + L - 0.65]), MAT.plum),   // the throw,
    tint(solid(new THREE.BoxGeometry(0.06, 0.65, 0.9), [x0 - 0.06, FLOOR + 1.2, z0 + L - 0.65]), MAT.plum));            // hanging off the side
}

function bathroom() {
  return named('bathroom',
    toilet(),
    named('shower', block(320, 460, 985, 1068, 0.35), showerGlass(), showerhead()),
    vanity(),
    vanityMirror(),
    bathmat()
  );
}

/* The toilet: tank with its lid and a chrome handle, a rounded bowl
   (a lathe: a profile spun round, squashed to an oval), water, the seat,
   and the lid up against the tank. Faces +z. */
function toilet() {
  const cx = X(365), cz = Z(905), S = 1.35;               // bowl centre; bowls are longer than wide
  const profile = [[0.4, 0], [0.36, 0.25], [0.34, 0.6], [0.48, 1.0], [0.62, 1.28], [0.66, 1.38], [0.6, 1.42],
    [0.52, 1.38], [0.36, 1.05], [0.2, 0.86], [0.001, 0.82]].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = new THREE.LatheGeometry(profile, 28);
  bowl.scale(1, 1, S);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20).rotateX(-Math.PI / 2).scale(1, 1, S), surface(0x7d97a0, 0.2));
  water.position.set(cx, FLOOR + 0.93, cz);
  water.userData.keep = true;
  const ellipse = (rx, rz) => {
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
    return sh;
  };
  const ring = ellipse(0.66, 0.66 * S);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, 0.4, 0.4 * S, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const flat = (shape, y, z) => remap(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }),
    (u, v, d) => [cx + u, FLOOR + y + d, z + v]);
  const lidShape = new THREE.Shape();
  lidShape.absellipse(0, 0.64 * S, 0.64, 0.64 * S, 0, Math.PI * 2, false);
  const lid = new THREE.Group();
  lid.add(solid(remap(new THREE.ExtrudeGeometry(lidShape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), (u, v, d) => [u, d, v])));
  lid.position.set(cx, FLOOR + 1.48, cz - 0.66 * S + 0.05);
  lid.rotation.x = -1.62;                                    // up, leaning back on the tank
  return named('toilet',
    block(338, 392, 861, 877, 2.6, 1.45),                    // tank
    block(335, 395, 859, 880, 2.7, 2.6),                     // tank lid
    solid(new THREE.BoxGeometry(0.7, 0.45, 0.35), [cx, FLOOR + 1.25, Z(877) + 0.15]),   // where the tank meets the bowl
    tint(solid(bowl, [cx, FLOOR, cz]), MAT.porcelainBoth),
    water,
    solid(flat(ring, 1.42, cz)),                             // seat
    lid,
    tint(solid(new THREE.BoxGeometry(0.28, 0.05, 0.06), [X(347), FLOOR + 2.4, Z(877) + 0.04]), MAT.chrome));   // flush handle
}

/* The vanity: an oak cabinet with two doors and brass knobs, a cultured
   marble top, an oval sink set into it (drawn inside out, like the
   kitchen sink), and a two-handle chrome faucet. */
function vanity() {
  const top = 2.8, cx = 535, cy = 1036, rx = 25, ry = 17;              // the sink, in blueprint px
  const hole = Array.from({ length: 24 }, (_, i) => {
    const a = i / 24 * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
  const bowl = new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.scale(rx / K, 0.5, ry / K);
  const fz = Z(1061), chrome = (geo, x, y, z) => tint(solid(geo, [x, FLOOR + y, z]), MAT.chrome);
  const knob = x => tint(solid(new THREE.SphereGeometry(0.06, 8, 6), [X(x), FLOOR + 1.9, Z(1010) - 0.05]), MAT.brass);
  return named('vanity',
    slab([[468, 1012], [600, 1012], [600, 1068], [468, 1068]], [hole], FLOOR, FLOOR + top - 0.15),
    block(474, 532, 1010, 1012, 2.45, 0.3), block(538, 594, 1010, 1012, 2.45, 0.3),          // cabinet doors
    knob(522), knob(548),
    tint(slab([[465, 1009], [603, 1009], [603, 1068], [465, 1068]], [hole], FLOOR + top - 0.15, FLOOR + top), MAT.porcelain),
    tint(solid(bowl, [X(cx), FLOOR + top, Z(cy)]), MAT.bowl),
    tint(solid(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 10), [X(cx), FLOOR + top - 0.495, Z(cy)]), MAT.dark),   // drain
    chrome(new THREE.BoxGeometry(0.9, 0.05, 0.18), X(cx), top + 0.025, fz),                // faucet plate
    chrome(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8), X(cx), top + 0.15, fz),
    chrome(new THREE.BoxGeometry(0.07, 0.06, 0.4), X(cx), top + 0.25, fz - 0.2),             // spout
    chrome(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), X(cx) - 0.4, top + 0.12, fz),   // hot
    chrome(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), X(cx) + 0.4, top + 0.12, fz));  // cold
}

/* Frosted glass on the shower, in brass frames. A tiny picture of fine
   grain, drawn when the game starts, gives the surface a light texture
   that catches the bathroom light. */
function showerGlass() {
  const y0 = FLOOR + 0.35, y1 = FLOOR + 6.6, h = y1 - y0, TILE = 1.2;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdde5e8, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.72,
    depthWrite: false, side: THREE.DoubleSide
  });
  if (typeof document !== 'undefined') {
    mat.bumpMap = grain();
    mat.bumpScale = 0.4;
  }
  const pane = (len, x, z, turn) => {
    const geo = new THREE.PlaneGeometry(len, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / TILE, uv.getY(i) * h / TILE);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, (y0 + y1) / 2, z);
    m.rotation.y = turn;
    m.layers.set(GLASS_LAYER);
    m.userData.keep = m.userData.noShadow = true;
    return m;
  };
  const bar = (w, ht, d, x, y, z) => tint(solid(new THREE.BoxGeometry(w, ht, d), [x, y, z]), MAT.brass);
  const n = Z(985), e = X(460), w0 = X(322);
  const ns = Z(987), ne = Z(1066);
  return named('shower-glass',
    pane(e - w0, (w0 + e) / 2, n, 0),
    pane(ne - ns, e, (ns + ne) / 2, Math.PI / 2),
    // frames: posts at the ends and the corner, rails top and bottom
    bar(0.08, h, 0.08, w0, (y0 + y1) / 2, n), bar(0.08, h, 0.08, e, (y0 + y1) / 2, n), bar(0.08, h, 0.08, e, (y0 + y1) / 2, ne),
    bar(e - w0, 0.08, 0.08, (w0 + e) / 2, y1, n), bar(e - w0, 0.06, 0.08, (w0 + e) / 2, y0 + 0.03, n),
    bar(0.08, 0.08, ne - ns, e, y1, (ns + ne) / 2), bar(0.08, 0.06, ne - ns, e, y0 + 0.03, (ns + ne) / 2),
    bar(0.05, 0.8, 0.26, X(442), FLOOR + 3.6, n));                                         // door handle
}

// a tile of fine grain, as heights (it wraps)
function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + rand() * 16;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// chrome shower arm and head on the back wall
function showerhead() {
  const wz = Z(1068), x = X(390);
  const head = new THREE.CylinderGeometry(0.2, 0.1, 0.12, 12);
  head.rotateX(-0.5);
  return tint(new THREE.Group().add(
    solid(new THREE.BoxGeometry(0.06, 0.06, 0.55), [x, FLOOR + 6.35, wz - 0.27]),
    solid(head, [x, FLOOR + 6.28, wz - 0.58])), MAT.chrome);
}

// a fuzzy mauve bathmat with soft rounded corners, in front of the shower
function bathmat() {
  const x0 = X(345), x1 = X(432), z0 = Z(950), z1 = Z(981), r = 0.25;
  const sh = new THREE.Shape();
  sh.moveTo(x0 + r, z0); sh.lineTo(x1 - r, z0); sh.quadraticCurveTo(x1, z0, x1, z0 + r);
  sh.lineTo(x1, z1 - r); sh.quadraticCurveTo(x1, z1, x1 - r, z1); sh.lineTo(x0 + r, z1);
  sh.quadraticCurveTo(x0, z1, x0, z1 - r); sh.lineTo(x0, z0 + r); sh.quadraticCurveTo(x0, z0, x0 + r, z0);
  const geo = remap(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 }),
    (u, v, d) => [u, FLOOR + d + 0.015, v]);
  return named('bathmat', tint(solid(geo), MAT.mauve));
}

// a wood-framed mirror on the wall over the bathroom sink
function vanityMirror() {
  const wallZ = Z(1068), u0 = X(492), u1 = X(578), y0 = FLOOR + 3.5, y1 = FLOOR + 6.35, b = 0.16;
  return named('mirror',
    paneFrame((u, y, w) => [u, y, wallZ - w], u0, u1, y0, y1, 0.06, { border: b, depth: 0.12, mat: MAT.furniture }),
    mirror(u0 + b, u1 - b, y0 + b, y1 - b, wallZ - 0.07));
}

function laundry() {
  return named('laundry',
    washer(620, 680),
    dryer(686, 746),
    named('shelf', block(614, 807, 825, 845, 5.4, 5.2)),
    walkInCloset()
  );
}

/* The walk-in closet: on each side a white shelf on brackets, a chrome
   rod hung under it, clothes on hangers (90s flannel, denim, a long
   coat...), and a few boxes up on the shelf. */
function walkInCloset() {
  const parts = [], hangers = [];
  const looks = [MAT.flannel, MAT.denim, MAT.hunter, MAT.mustard, MAT.plum, MAT.cream, MAT.dark, MAT.teal];
  let seed = 9;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // garment outlines, hanging from the shoulders: shirt, long coat, trousers folded over the bar
  const outline = (half, len, flare) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.15, 0); sh.lineTo(-half, -0.12); sh.lineTo(-half - 0.04, -0.5); sh.lineTo(-half + flare, -len);
    sh.lineTo(half - flare, -len); sh.lineTo(half + 0.04, -0.5); sh.lineTo(half, -0.12); sh.lineTo(0.15, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05);
  };
  const kinds = [() => outline(0.6, 2.3, 0.04), () => outline(0.64, 3.4, -0.06), () => outline(0.4, 1.4, 0.06)];
  const shelfY = 5.95, rodY = 5.55;
  for (const { wall, rod, dir } of [{ wall: 614, rod: 644, dir: 1 }, { wall: 807, rod: 777, dir: -1 }]) {
    const out = wall + dir * 44;                                 // front edge of the shelf
    parts.push(block(Math.min(wall, out), Math.max(wall, out), 985, 1068, shelfY + 0.08, shelfY));
    const rx = X(rod);
    for (const yb of [990, 1027, 1063]) {
      // bracket: a triangle off the wall under the shelf, and a hanger down to the rod
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.35, 0), new THREE.Vector2(0, -0.6)]);
      parts.push(solid(remap(new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }),
        (u, v, d) => [X(wall) + dir * u, FLOOR + shelfY + v, Z(yb) + d - 0.02])));
      parts.push(solid(new THREE.BoxGeometry(0.03, shelfY - rodY, 0.03), [rx, FLOOR + (shelfY + rodY) / 2, Z(yb)]));
    }
    const bar = new THREE.CylinderGeometry(0.04, 0.04, Z(1066) - Z(987), 8);
    bar.rotateX(Math.PI / 2);
    parts.push(tint(solid(bar, [rx, FLOOR + rodY, (Z(987) + Z(1066)) / 2]), MAT.chrome));
    // clothes
    for (let i = 0; i < 9; i++) {
      const z = Z(992) + i * (Z(1061) - Z(992)) / 8 + (rand() - 0.5) * 0.06;
      const top = FLOOR + rodY - 0.12;
      parts.push(tint(solid(kinds[Math.floor(rand() * kinds.length)](), [rx, top, z], [0, (rand() - 0.5) * 0.25, 0]),
        looks[Math.floor(rand() * looks.length)]));
      hangers.push([[rx, FLOOR + rodY + 0.06, z], [rx, top, z]],
        [[rx - 0.6, top - 0.1, z], [rx, top, z]], [[rx, top, z], [rx + 0.6, top - 0.1, z]], [[rx - 0.6, top - 0.1, z], [rx + 0.6, top - 0.1, z]]);
    }
    // boxes up on the shelf
    for (const [yc, w, h, mat] of [[1000, 0.9, 0.45, MAT.cream], [1030, 1.0, 0.35, MAT.denim], [1031, 0.8, 0.3, MAT.flannel], [1055, 0.7, 0.55, MAT.cream]]) {
      parts.push(tint(solid(new THREE.BoxGeometry(1.0, h, w), [X(wall) + dir * 0.75, FLOOR + shelfY + 0.08 + h / 2 + (yc === 1031 ? 0.35 : 0), Z(yc)]), mat));
    }
  }
  return named('closet-shelves', ...parts, lines(hangers, new THREE.LineBasicMaterial({ color: 0x8a8f94 })));
}

/* Old school machines, backed up near the wall: a top-loading washer
   whose lid lifts, and a dryer with a square door on the front. Both
   are hollow with a drum inside, for anomalies:
     scene.getObjectByName('washer-lid').userData.setOpen(1)
     scene.getObjectByName('dryer-door').userData.setOpen(1) */
const MACHINE = { back: 829, front: 886, h: 3, s: 0.08 };

// the box both machines are built in: sides, back, base, and the
// control panel along the back with two knobs
function machine(px0, px1) {
  const { h, s } = MACHINE, zb = Z(MACHINE.back), zf = Z(MACHINE.front);
  const x0 = X(px0), x1 = X(px1), W = x1 - x0, D = zf - zb, cx = (x0 + x1) / 2, zc = (zb + zf) / 2;
  const box = (w, ht, d, x, y, z) => solid(new THREE.BoxGeometry(w, ht, d), [x, FLOOR + y, z]);
  const knob = x => tint(solid(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), [x, FLOOR + h + 0.25, zb + 0.34], [Math.PI / 2, 0, 0]), MAT.dark);
  // (parts just meet, never overlap face to face, so nothing flickers)
  const lo = h - s, sz = zb + (D - s) / 2;
  const parts = [
    box(s, lo, D - s, x0 + s / 2, lo / 2, sz), box(s, lo, D - s, x1 - s / 2, lo / 2, sz),    // sides
    box(W - 2 * s, lo, s, cx, lo / 2, zb + s / 2),                                         // back
    box(W - 2 * s, 0.4, D - 2 * s, cx, 0.2, zc),                                           // base
    box(W, 0.68, 0.3, cx, lo + 0.34, zb + 0.15),                                           // control panel
    knob(cx - 0.6), knob(cx + 0.55)
  ];
  return { parts, box, x0, x1, W, D, cx, zb, zf };
}

function washer(px0, px1) {
  const { h, s } = MACHINE;
  const { parts, box, W, cx, zb, zf } = machine(px0, px1);
  const deckZ0 = zb + 0.3, dd = zf - deckZ0, R = 0.75, dz = deckZ0 + dd / 2;
  // the top deck, with a round hole for the tub
  const deck = new THREE.Shape();
  deck.moveTo(-W / 2, -dd / 2); deck.lineTo(W / 2, -dd / 2); deck.lineTo(W / 2, dd / 2); deck.lineTo(-W / 2, dd / 2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, R, 0, Math.PI * 2, false);
  deck.holes.push(hole);
  const deckGeo = remap(new THREE.ExtrudeGeometry(deck, { depth: s, bevelEnabled: false, curveSegments: 20 }),
    (u, v, d) => [cx + u, FLOOR + h - s + d, dz + v]);
  const tubH = h - s - 0.5;
  const lid = named('washer-lid',
    solid(new THREE.BoxGeometry(W - 0.12, 0.05, dd - 0.06), [0, 0.025, (dd - 0.06) / 2]),
    solid(new THREE.BoxGeometry(0.5, 0.05, 0.07), [0, 0.03, dd - 0.05]));       // lip to lift it by
  lid.position.set(cx, FLOOR + h, deckZ0);
  return named('washer', ...parts,
    box(W, h - s, s, cx, (h - s) / 2, zf - s / 2),                                // front
    solid(deckGeo),
    tint(solid(new THREE.CylinderGeometry(R - 0.03, R - 0.03, tubH, 20, 1, true), [cx, FLOOR + 0.5 + tubH / 2, dz]), MAT.drum),
    tint(solid(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.04, 20), [cx, FLOOR + 0.5, dz]), MAT.drum),
    tint(solid(new THREE.CylinderGeometry(0.12, 0.22, 1.4, 10), [cx, FLOOR + 1.2, dz]), MAT.soft),   // agitator
    openable(lid, t => { lid.rotation.x = -t * 85 * Math.PI / 180; }));
}

function dryer(px0, px1) {
  const { h, s } = MACHINE;
  const { parts, box, W, D, cx, zb, zf } = machine(px0, px1);
  const DY = 1.6, half = 0.675, R = 0.95;
  // the front, with a square hole for the door
  const face = new THREE.Shape();
  face.moveTo(-W / 2, 0); face.lineTo(W / 2, 0); face.lineTo(W / 2, h); face.lineTo(-W / 2, h);
  const hole = new THREE.Path();
  hole.moveTo(-half, DY - half); hole.lineTo(half, DY - half); hole.lineTo(half, DY + half); hole.lineTo(-half, DY + half);
  face.holes.push(hole);
  const faceGeo = remap(new THREE.ExtrudeGeometry(face, { depth: s, bevelEnabled: false }),
    (u, y, d) => [cx + u, FLOOR + y, zf - s + d]);
  const len = D - 2 * s - 0.05, drumZ = zf - s - len / 2;
  const drum = new THREE.CylinderGeometry(R, R, len, 20, 1, true);
  drum.rotateX(Math.PI / 2);
  const back = new THREE.CylinderGeometry(R, R, 0.04, 20);
  back.rotateX(Math.PI / 2);
  const fins = [0, 2.1, 4.2].map(a => tint(solid(new THREE.BoxGeometry(0.1, 0.16, len * 0.9),
    [cx + Math.sin(a) * (R - 0.08), FLOOR + DY + Math.cos(a) * (R - 0.08), drumZ], [0, 0, -a]), MAT.drum));
  const door = named('dryer-door',
    solid(new THREE.BoxGeometry(1.5, 1.5, 0.1), [0.75, FLOOR + DY, 0.05]),
    solid(new THREE.BoxGeometry(0.08, 0.4, 0.08), [1.36, FLOOR + DY, 0.13]));   // handle
  door.position.set(cx - 0.75, 0, zf);                                         // hinged on its left
  return named('dryer', ...parts,
    box(W, s, D - 0.3 - s, cx, h - s / 2, zb + 0.3 + (D - 0.3 - s) / 2),        // top
    solid(faceGeo),
    tint(solid(drum, [cx, FLOOR + DY, drumZ]), MAT.drum),
    tint(solid(back, [cx, FLOOR + DY, drumZ - len / 2]), MAT.drum),
    ...fins,
    openable(door, t => { door.rotation.y = -t * 100 * Math.PI / 180; }));
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

/* The road out front, running past the house: asphalt, concrete curbs,
   a dashed yellow line down the middle. ROAD is its x range, in feet. */
const ROAD = [-64, -40];
function road() {
  const [x0, x1] = ROAD, cx = (x0 + x1) / 2, len = 300;
  const parts = [
    tint(solid(new THREE.BoxGeometry(x1 - x0, 0.06, len), [cx, 0.03, 0]), surface(0x2b2c2f, 1)),
    tint(solid(new THREE.BoxGeometry(0.6, 0.4, len), [x0 - 0.3, 0.2, 0]), MAT.concrete),
    tint(solid(new THREE.BoxGeometry(0.6, 0.4, len), [x1 + 0.3, 0.2, 0]), MAT.concrete)
  ];
  const yellow = surface(0xc9a227, 0.8);
  for (let z = -145; z <= 145; z += 20) parts.push(tint(solid(new THREE.BoxGeometry(0.35, 0.01, 9), [cx, 0.065, z]), yellow));
  return named('road', ...parts);
}

function path() {
  // paving slabs from the front steps out to the street
  const z = Z(647.5), hw = 2, y = 0.02, x0 = X(-3 * K), x1 = ROAD[1] + 0.6;    // lined up with the front door, out to the curb
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

const STREET = [-38.5, -9];    // on the grass by the curb, beside the mailbox
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

/* A round flush light on the pantry ceiling: a milk glass dome on a
   white base. Its light is a narrow spot straight down with soft edges,
   so it makes a pool on the pantry floor and shelves without shining
   through the walls (no texture slots left for a shadowed one). */
function pantryLight() {
  const x = X(1155), z = Z(724);
  const dome = new THREE.SphereGeometry(0.42, 16, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  dome.scale(1, 0.45, 1);
  const light = new THREE.SpotLight(LAMP_COLOR, 70, 12, 0.34, 0.6, 2);
  light.name = 'lamp-pantry-light';
  light.position.set(x, CEIL - 0.25, z);
  light.target.position.set(x, FLOOR, z);
  return named('lamp-pantry',
    tint(solid(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), [x, CEIL - 0.025, z]), MAT.trim),
    solid(dome, [x, CEIL - 0.05, z], null, MAT.glow),
    light, light.target);
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
    endTable('end-table', 345, 400, 248, 294, 1.9),
    tableLamp(lamps, 'lamp-sofa', 372, 271, 1.9, 22),
    bareBulb(lamps, 'lamp-laundry', 710, 915, 26),
    pantryLight(),
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
  const light = shadowed(new THREE.SpotLight(0xffd9a0, 2200, 0, 0.95, 0.8, 2), 1024, 110);
  light.name = 'streetlight-light';
  light.position.set(reach, H - 0.6, 0);
  light.target.position.set(20.5, 6, 9);        // same spot on the house as ever
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
  const moon = shadowed(new THREE.DirectionalLight(0xb8c8ff, 0.95), 2048, 240);     // soft enough to make the grass glow a little
  moon.name = 'moon';
  moon.position.copy(MOON_DIR);
  const cam = moon.shadow.camera;
  cam.left = cam.bottom = -60;
  cam.right = cam.top = 60;
  cam.near = 1;
  moon.shadow.normalBias = 0.08;
  // faint fill, standing in for light bouncing around: dark corners
  // read as dim, not pitch black
  const fill = new THREE.HemisphereLight(0x8ea0c8, 0x2a2016, 0.08);
  return named('sky', moon, moon.target, fill, heavens());
}

/* Stars, a moon and a few drifting clouds. Kept cheap: the stars are
   one draw of ~700 points, the clouds reuse one small soft image, and
   none of it is lit or casts shadows. Only the outside cams really see
   it. */
const SKY_R = 420;

/* Where the moon hangs: high up, where the moonlight comes from. */
const MOON_DIR = new THREE.Vector3(-70, 90, 50);

function heavens() {
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

  // the moon: a pale disc with a soft glow round it
  const m = MOON_DIR.clone().normalize().multiplyScalar(SKY_R * 0.95);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(0.94), color: 0xf0f2ff, fog: false }));
  moon.position.copy(m);
  moon.scale.set(20, 20, 1);
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
  for (const n of ['toilet', 'shower']) set(n, MAT.porcelain);
  set('vanity', MAT.furniture);                          // oak cabinet (its top and sink keep their own)
  set('closet-shelves', MAT.trim);
  parts('tree', MAT.bark, MAT.leaves);
  parts('pine', MAT.bark, MAT.pine);
  set('bush', MAT.leaves);
  set('streetlight', MAT.pole);
  parts('mailbox', MAT.furniture, MAT.dark, MAT.frontDoor);  // wood post, black box, red flag
  set('door-closet', MAT.trim);                          // white accordion door
  set('kitchen-sink', MAT.steel);
  set('cooktop', MAT.dark);
  for (const n of ['lamp-foyer', 'lamp-living', 'lamp-master', 'lamp-master-2', 'lamp-sofa', 'lamp-porch']) set(n, MAT.dark);   // shades keep glowing
  scene.traverse(o => {
    if (!o.isMesh) return;
    const glows = o.material.isMeshBasicMaterial || o.userData.noShadow;
    o.castShadow = !glows;
    o.receiveShadow = !glows;
  });
}

/* ─── fewer, bigger draws ───────────────────── */

/* Every piece of furniture is lots of little boxes, and the graphics
   card pays for each separate one, in every view and in every shadow.
   So once everything is painted, each named group's parts get welded
   into one mesh per colour, plus one set of ink edges. Names stay, so
   anomaly code can still grab the 'sofa' or the 'bed' and move or hide
   it. Left as they are: named groups inside (they get their own turn),
   lights, window glass and the mirror, the sky, and anything that moves
   its own parts (the folding and sliding closet doors, the fire). A
   door that swings as a whole is welded inside itself, and still swings. */
function bake(scene) {
  const groups = [];
  scene.traverse(o => { if (o.name && !o.isMesh && !o.isLight && !o.userData.tick && !o.userData.movesParts) groups.push(o); });
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  for (const g of groups) {
    g.updateMatrixWorld(true);
    inv.copy(g.matrixWorld).invert();
    const buckets = new Map(), keep = [];
    let parts = 0;
    const walk = node => {
      for (const d of node.children) {
        const solidPart = (d.isMesh || d.isLineSegments) && !d.name && !d.userData.reflect &&
          d.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && !d.children.length;
        if (solidPart) {
          const key = [d.material.uuid, d.layers.mask, d.castShadow, d.receiveShadow, d.isMesh].join();
          if (!buckets.has(key)) buckets.set(key, { first: d, geos: [] });
          rel.multiplyMatrices(inv, d.matrixWorld);
          buckets.get(key).geos.push((d.geometry.index ? d.geometry.toNonIndexed() : d.geometry.clone()).applyMatrix4(rel));
          parts++;
        } else if (!d.name && (d.type === 'Group' || d.type === 'Object3D') && d.children.length &&
                   !d.userData.tick && !d.userData.movesParts) {
          walk(d);                                          // a plain holder: look inside, then drop it
        } else {
          keep.push(d);                                     // leave as it is, where it is
        }
      }
    };
    walk(g);
    if (parts <= buckets.size) continue;                    // nothing to weld
    const out = [];
    for (const { first, geos } of buckets.values()) {
      const merged = weld(geos, first.isMesh);
      const obj = first.isMesh ? new THREE.Mesh(merged, first.material) : new THREE.LineSegments(merged, first.material);
      obj.layers.mask = first.layers.mask;
      obj.castShadow = first.castShadow;
      obj.receiveShadow = first.receiveShadow;
      out.push(obj);
    }
    for (const d of keep) {
      rel.multiplyMatrices(inv, d.matrixWorld);
      rel.decompose(d.position, d.quaternion, d.scale);
    }
    g.clear();
    g.add(...out, ...keep);
  }
}

// join several geometries (already in place) into one
function weld(geos, mesh) {
  const names = mesh ? ['position', 'normal', 'uv', 'color'].filter(n => geos.every(g => g.attributes[n])) : ['position'];
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = geos[0].attributes[n].itemSize;
    const arr = new Float32Array(geos.reduce((t, g) => t + g.attributes[n].count * size, 0));
    let at = 0;
    for (const g of geos) { arr.set(g.attributes[n].array, at); at += g.attributes[n].count * size; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

/* ─── everything ────────────────────────────── */

// weld: false skips bake(), for check-route.mjs (its rays test big welded meshes slowly)
export function buildWorld({ weld = true } = {}) {
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
    road(),
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
  if (weld) bake(scene);
  scene.userData.lamps = lamps;
  return scene;
}
