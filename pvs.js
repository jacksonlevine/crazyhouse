/* ============================================================
   crazyhouse: per-cam culling ("PVS", potentially visible set).

   The cams never move, so we can work out once, at the start, what
   each one can actually see, and skip drawing everything else. For
   every cam we draw the house once in "ID colours" (every named thing
   in its own flat colour, every door open so nothing hides behind one)
   into a small hidden picture, read back which colours showed up, and
   remember them. From then on, things a cam can't see move to
   CULL_LAYER: that cam skips them, but lights still see them, so their
   shadows stay put.

   Old indoor games (Quake, Half-Life) did the same with their maps.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

/* roots: the house and yard (not ghoul1 or the EMP, which come and go).
   cams: the CAMS list. Returns { apply(i), always(obj) }:
   apply(camIndex) culls for that cam, apply(null) shows everything;
   always(obj) never culls obj's group again (for anomaly code that
   moves something somewhere new). */
export function buildPVS(renderer, scene, roots, cams, cullLayer, roomAt = null) {
  // a unit is the nearest named group above each drawable thing
  const units = [], index = new Map(), probes = new Map();
  for (const root of roots) root.traverse(o => {
    if (!(o.isMesh || o.isLine)) return;
    // a probe (the mirror) isn't culled, but can ask whether the cam sees it
    if (o.userData.pvsProbe) { probes.set(o, units.length); units.push({ items: [o], probe: true }); return; }
    if ((o.layers.mask & 7) !== 1) return;                             // layer 0, not glass or ghoul1 (other layers are fine)
    let u = o;
    while (u.parent && !u.name && u !== root) u = u.parent;
    if (!index.has(u)) { index.set(u, units.length); units.push({ items: [], shown: true, always: false }); }
    units[index.get(u)].items.push(o);
  });
  // which room each unit is in (by the middle of its first piece), so the
  // swaying bulb can ask whether the cam sees anything of the laundry
  const ball = new THREE.Sphere();
  for (const u of units) {
    const o = u.items[0];
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    ball.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    const r = roomAt ? roomAt(ball.center.x, ball.center.z) : null;
    u.room = ball.radius < 8 && r ? r.name : null;                     // walls and floors span rooms: no room
  }

  // ---- the ID pass: swap in flat colours, open every door, hide the rest,
  // then draw each view and read back which colours showed up
  const mats = new Map();
  const idMat = (i, side) => {
    const key = i + '/' + side;
    if (!mats.has(key)) {
      const c = new THREE.Color().setRGB(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0, THREE.LinearSRGBColorSpace);
      mats.set(key, new THREE.MeshBasicMaterial({ color: c, side, fog: false, toneMapped: false }));
    }
    return mats.get(key);
  };
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 600);
  // views: [{ pos, look, fov, aspect }]; returns a Set of unit numbers per view
  function idPass(views, W, H) {
    const undo = [], inUnit = new Set();
    units.forEach((u, i) => u.items.forEach(o => {
      inUnit.add(o);
      const mask = o.layers.mask;
      undo.push(() => { o.layers.mask = mask; });
      o.layers.enable(0);                                              // culled or not, everything takes part
      if (o.isLine) { undo.push(() => { o.visible = true; }); o.visible = false; return; }
      const was = o.material, side = (Array.isArray(was) ? was[0] : was).side;
      undo.push(() => { o.material = was; });
      o.material = idMat(i, side);
      if (u.probe) {                                                  // no mirror drawing
        const obr = o.onBeforeRender;
        undo.push(() => { o.onBeforeRender = obr; });
        o.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
      }
    }));
    scene.traverse(o => {                                                   // sprites, stars, anything else: out of the way
      if ((o.isSprite || o.isPoints || o.isMesh || o.isLine) && !inUnit.has(o) && o.visible) {
        undo.push(() => { o.visible = true; }); o.visible = false;
      }
    });
    const doors = [], moved = scene.userData.moved;
    scene.traverse(o => { if (o.userData.setOpen) doors.push([o, o.userData.open]); });
    doors.forEach(([o]) => o.userData.setOpen(1));
    const fog = scene.fog, auto = renderer.shadowMap.autoUpdate, need = renderer.shadowMap.needsUpdate, was = renderer.getRenderTarget();
    scene.fog = null;
    renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;

    const target = new THREE.WebGLRenderTarget(W, H), pixels = new Uint8Array(W * H * 4);
    const out = views.map(v => {
      cam.position.set(...v.pos);
      cam.fov = v.fov;
      cam.aspect = v.aspect || 16 / 9;
      cam.updateProjectionMatrix();
      cam.lookAt(...v.look);
      cam.updateMatrixWorld();
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
      const set = new Set();
      for (let p = 0; p < pixels.length; p += 4) {
        const id = pixels[p] + (pixels[p + 1] << 8);
        if (id) set.add(id - 1);
      }
      return set;
    });
    renderer.setRenderTarget(was);
    target.dispose();

    // ---- put everything back
    undo.reverse().forEach(f => f());
    doors.forEach(([o, open]) => o.userData.setOpen(open));
    scene.userData.moved = moved;                                     // nothing really moved
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = auto;
    renderer.shadowMap.needsUpdate = need;
    return out;
  }
  const seen = idPass(cams, 480, 270);

  const show = (u, on) => {
    if (u.shown === on) return;
    u.shown = on;
    for (const o of u.items) {
      if (on) { o.layers.enable(0); o.layers.disable(cullLayer); }
      else { o.layers.disable(0); o.layers.enable(cullLayer); }
    }
  };
  const roomsIn = set => new Set([...set].map(k => units[k].room).filter(Boolean));
  let current = null, currentRooms = null, currentKey = 'all';        // what we're culling to
  const use = (key, set) => {
    if (key === currentKey) return;
    currentKey = key;
    mode = !set ? 'all' : key.startsWith('cam') ? 'cam' : 'rooms';
    current = set;
    currentRooms = set ? roomsIn(set) : null;
    units.forEach((u, k) => { if (!u.probe) show(u, !set || u.always || set.has(k)); });
  };

  /* First person: what can be seen from anywhere in each room. From a
     grid of spots in the room we look four ways (wide), and keep
     everything that showed up. That's dear to work out (a few hundred
     little pictures), so it's done a few at a time over the first
     frames in first person; until a room's done, nothing's culled there. */
  const roomSeen = new Map(), todo = [];
  let mode = 'all';
  return {
    apply(i) {
      if (i === null || i === undefined) use('all', null);
      else use('cam' + i, seen[i]);
    },
    // first person: cull to what can be seen from these rooms (names);
    // nothing if any of them hasn't been worked out yet
    applyRooms(names) {
      if (!names.length || names.some(n => !roomSeen.has(n))) return use('all', null);
      const key = names.slice().sort().join('+');
      if (key === currentKey) return;
      const set = new Set();
      for (const n of names) for (const k of roomSeen.get(n)) set.add(k);
      use(key, set);
    },
    // points: { roomName: [[x, y, z], ...] } (eye height)
    planRooms(points) {
      for (const [name, list] of Object.entries(points)) {
        if (roomSeen.has(name) || todo.some(t => t.name === name)) continue;
        const views = [];
        for (const p of list) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]])
          views.push({ pos: p, look: [p[0] + dx, p[1], p[2] + dz], fov: 100, aspect: 1 });
        todo.push({ name, views, set: new Set() });
      }
    },
    // work through up to n views of the plan; true while there's more to do
    stepRooms(n = 8) {
      if (!todo.length) return false;
      const job = todo[0], batch = job.views.splice(0, n);
      for (const set of idPass(batch, 192, 192)) for (const k of set) job.set.add(k);
      if (!job.views.length) { roomSeen.set(job.name, job.set); todo.shift(); currentKey = null; }
      return todo.length > 0;
    },
    // 'cam' (culling for a cam), 'rooms' (first person, by room) or 'all'
    mode: () => mode,
    // does the cam see this probe / anything in this room? null if we're not
    // culling for a cam (room culling is too rough for a probe), so the asker decides
    sees: probe => mode === 'cam' ? current.has(probes.get(probe)) : null,
    seesRoom: name => currentRooms ? currentRooms.has(name) : null,
    always(obj) {
      let u = obj;
      while (u && !index.has(u)) u = u.parent;
      if (u) { units[index.get(u)].always = true; show(units[index.get(u)], true); }
    },
    stats: () => ({ cams: seen.map(s => `${s.size}/${units.length}`), rooms: [...roomSeen].map(([n, s]) => `${n} ${s.size}/${units.length}`) })
  };
}
