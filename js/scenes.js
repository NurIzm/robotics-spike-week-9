// Six real manipulators as short looping stories. Each entry is facts, one phase table and build(root, stage) => apply(pose, time).
// The table is the only source for motion and captions: a row holds the pose reached at its end, a row with text opens a caption step.
(function () {
  const RA = window.RA;
  const PI = Math.PI;
  const { lerp, clamp, smoothstep } = THREE.MathUtils;
  const UP = new THREE.Vector3(0, 1, 0);
  const NEG_Y = new THREE.Vector3(0, -1, 0);
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);

  const mats = {};
  const mat = (color, o) => {
    const key = color + (o ? JSON.stringify(o) : '');
    return mats[key] || (mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.38, envMapIntensity: 0.5 }, o)));
  };

  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // Collects shapes and merges them per material, so a rigid part costs one draw call per colour.
  function kit(parent) {
    const sets = new Map();
    const k = {
      geo(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        g = (g.index ? g.toNonIndexed() : g).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
        if (!sets.has(m)) sets.set(m, []);
        sets.get(m).push(g);
        return k;
      },
      box: (w, h, d, m, x, y, z, rx, ry, rz) => k.geo(new THREE.RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.14), m, x, y, z, rx, ry, rz),
      bar: (w, h, d, m, x, y, z, rx, ry, rz) => k.geo(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz), // sharp and cheap, for trusses and slats
      cyl: (r, h, m, x, y, z, axis, r2 = r) => k.geo(new THREE.CylinderGeometry(r, r2, h, 20), m, x, y, z, axis === 'z' ? PI / 2 : 0, 0, axis === 'x' ? -PI / 2 : 0),
      done() {
        sets.forEach((list, m) => {
          const mesh = new THREE.Mesh(list.length > 1 ? THREE.BufferGeometryUtils.mergeGeometries(list) : list[0], m);
          mesh.castShadow = mesh.receiveShadow = true;
          parent.add(mesh);
        });
        return parent;
      },
    };
    return k;
  }

  const extrude = (shape, depth, bevel = 0.1, segs = 10) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: segs }).translate(0, 0, -depth / 2);
  const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

  // The colour comes from CSS and only shadows are drawn, so there is no horizon and no floor edge.
  function ground(root, opacity = 0.2) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(300, 8).rotateX(-PI / 2), new THREE.ShadowMaterial({ opacity }));
    m.receiveShadow = true;
    root.add(m);
  }

  // A round-ended link: the silhouette that reads as "robot arm" from the back of a classroom.
  function linkGeo(len, r1, r2, width) {
    const th = Math.acos((r1 - r2) / len), s = new THREE.Shape();
    s.absarc(0, 0, r1, th, 2 * PI - th, false);
    s.absarc(len, 0, r2, -th, th, false);
    return extrude(s, width, 0.14, 14);
  }

  // Yaw base, shoulder, elbow, wrist, with analytic two-link IK in the vertical plane. The tool points along its local +X.
  function makeArm(o) {
    const g = new THREE.Group(), yaw = group(g), up = group(yaw, 0, o.h), fore = group(up, o.l1), wrist = group(fore, o.l2), tool = group(wrist);
    if (o.skin) o.skin({ g, yaw, up, fore, wrist, tool });
    else {
      const B = mat(o.color), D = mat(o.dark || '#2b333b'), r = o.r;
      if (o.base !== false) kit(g).cyl(r * 1.7, r * 0.5, D, 0, r * 0.25, 0).done();
      const top = o.h - r * 0.75; // the shoulder sits on the column, its joint cap stays fully visible
      kit(yaw).cyl(r * 1.15, top, B, 0, top / 2, 0, null, r * 1.4).done();
      kit(up).geo(linkGeo(o.l1, r, r * 0.72, r * 1.05), B).cyl(r * 0.6, r * 1.3, D, 0, 0, 0, 'z').cyl(r * 0.44, r * 1.3, D, o.l1, 0, 0, 'z').done();
      kit(fore).geo(linkGeo(o.l2, r * 0.72, r * 0.42, r * 0.8), B).box(r * 1.5, r * 1.3, r * 0.9, D, -r * 0.8, 0, 0).done();
      kit(wrist).cyl(r * 0.3, r * 0.95, D, 0, 0, 0, 'z').done();
      kit(tool).cyl(r * 0.34, r * 0.7, D, r * 0.35, 0, 0, 'x').done();
    }
    return {
      group: g, tool,
      // Target in the parent's coordinates. A tool pointing down keeps its heading in the world, like a real wrist roll joint.
      reach(x, y, z, pitch = -PI / 2, twist = 0) {
        x -= g.position.x; y -= g.position.y; z -= g.position.z;
        const a = Math.atan2(-z, x), R = Math.hypot(x, z) - o.tool * Math.cos(pitch), H = y - o.h - o.tool * Math.sin(pitch);
        const d = clamp(Math.hypot(R, H), Math.abs(o.l1 - o.l2) + 0.01, o.l1 + o.l2 - 0.01);
        const e = Math.acos(clamp((d * d - o.l1 * o.l1 - o.l2 * o.l2) / (2 * o.l1 * o.l2), -1, 1));
        const s = Math.atan2(H, R) + Math.atan2(o.l2 * Math.sin(e), o.l1 + o.l2 * Math.cos(e));
        yaw.rotation.y = a;
        up.rotation.z = s;
        fore.rotation.z = -e;
        wrist.rotation.z = pitch - s + e;
        tool.rotation.x = twist - a * Math.sin(pitch);
      },
    };
  }

  // Translucent sensor cone with its apex at the sensor. Same look in every scene: blue means "the robot is looking".
  function beam(parent, radius, color = '#00adc4') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, 1, 32, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    parent.add(m);
    const dir = vec(0, 0, 0);
    return (from, to, opacity) => {
      m.visible = opacity > 0.01;
      if (!m.visible) return;
      dir.subVectors(to, from);
      m.position.copy(from);
      m.scale.y = dir.length();
      m.quaternion.setFromUnitVectors(NEG_Y, dir.normalize());
      m.material.opacity = opacity * 0.34;
    };
  }

  // Sparks, puffs of air, thruster gas. Positions are a pure function of time, so seeking and looping stay exact.
  function spray(parent, n, color, size, opts = {}) {
    const { speed = 12, gravity = -30, life = 0.7, dir = vec(0, 1, 0), spread = 1 } = opts;
    const seeds = Array.from({ length: n }, () => [Math.random(), Math.random() - 0.5, Math.random(), Math.random() - 0.5]);
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', pos),
      new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    parent.add(pts);
    return (on, t, o) => {
      pts.visible = on;
      if (!on) return;
      seeds.forEach(([p, a, b, c], i) => {
        const age = ((t / life + p) % 1) * life, sp = speed * (0.5 + b * 0.8);
        pos.setXYZ(i, o.x + (dir.x + a * spread) * sp * age, o.y + (dir.y + b * 0.3) * sp * age + gravity * age * age / 2, o.z + (dir.z + c * spread) * sp * age);
      });
      pos.needsUpdate = true;
    };
  }

  // Crisp text inside the scene, for the few numbers a still frame has to carry.
  function canvasSprite(parent, w, h, scale, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(scale, scale * h / w, 1);
    parent.add(s);
    return s;
  }
  function label(parent, text, x, y, z, scale, ink = '#10202a', paper = '#ffffff') {
    const s = canvasSprite(parent, 512, 128, scale, (g) => {
      g.fillStyle = paper;
      g.beginPath();
      g.roundRect(4, 12, 504, 104, 30);
      g.fill();
      g.fillStyle = ink;
      g.font = '800 62px "Golos Text", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    });
    s.position.set(x, y, z);
    return s;
  }
  // A ring marker that always faces the camera. Two kinds: a thick "yes" ring, and a thin "no" ring with a slash.
  function marker(parent, color, no) {
    return canvasSprite(parent, 128, 128, 5, (g) => {
      g.strokeStyle = color;
      g.lineWidth = no ? 8 : 14;
      g.beginPath();
      g.arc(64, 64, 52, 0, 2 * PI);
      if (no) { g.moveTo(28, 28); g.lineTo(100, 100); }
      g.stroke();
    });
  }

  // A cylinder stretched between two points each frame: people's limbs, instrument shafts.
  function limb(parent, m, r) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12).translate(0, 0.5, 0), m);
    mesh.castShadow = true;
    parent.add(mesh);
    const dir = vec(0, 0, 0);
    return (a, b) => {
      dir.subVectors(b, a);
      mesh.position.copy(a);
      mesh.scale.y = dir.length();
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    };
  }
  // Elbow of a two-equal-segment arm, bent towards the pole direction.
  function elbow(s, h, len, pole) {
    const d = Math.min(s.distanceTo(h), 2 * len - 0.01), dir = h.clone().sub(s).normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return s.clone().addScaledVector(dir, d / 2).addScaledVector(perp, Math.sqrt(len * len - d * d / 4));
  }

  /* ---------- 1. Car factory: fingers ---------- */

  function factory(root) {
    ground(root);
    const Y = mat('#fed920'), D = mat('#2b333b'), A = mat('#01adc4'), M = mat('#c92e85'), K = mat('#16151a'), G = mat('#aab2b8'), W = mat('#eceded');
    const k = kit(root);
    k.box(190, 0.7, 1, D, 0, 2.1, 4).box(190, 0.7, 1, D, 0, 2.1, -4);
    for (let x = -93; x <= 93; x += 3) k.cyl(0.55, 7.4, G, x, 2.1, 0, 'z');
    for (let x = -90; x <= 90; x += 15) k.box(1.2, 1.9, 9, D, x, 0.95, 0);
    k.box(190, 0.06, 0.8, Y, 0, 0.03, 40);
    // Bench that holds the doors.
    k.box(33, 1, 3.4, M, -35, 4.5, 12);
    [-49, -21].forEach((x) => k.box(1.6, 4, 3, M, x, 2, 12));

    // Side profile of the shell. The holes go right through, so the shell reads as hollow.
    const body = new THREE.Shape();
    body.moveTo(-12.4, 2.2);
    body.absarc(-7.6, 2.2, 2.6, PI, 0, true);
    body.absarc(7.6, 2.2, 2.6, PI, 0, true);
    body.lineTo(12.4, 2.2);
    body.lineTo(12.7, 3.8);
    body.quadraticCurveTo(12.5, 4.9, 10.8, 5.1);
    body.lineTo(5.8, 5.6);
    body.lineTo(2.4, 8.6);
    body.lineTo(-5.4, 8.6);
    body.lineTo(-8.6, 5.9);
    body.lineTo(-11.6, 5.7);
    body.quadraticCurveTo(-12.7, 5.6, -12.7, 4.6);
    body.closePath();
    const DOOR = [[-0.4, 2.9], [4.6, 2.9], [4.6, 5.2], [2, 7.9], [-0.4, 7.9]];
    body.holes.push(poly(DOOR), poly([[-1.2, 5.4], [-1.2, 7.9], [-4.9, 7.9], [-7, 5.6]]));
    const car = group(root);
    car.position.y = 1;
    kit(car).geo(extrude(body, 9.6, 0.16, 10), A)
      .geo(extrude(poly([[-6.9, 2.7], [5, 2.7], [5, 5.3], [2.2, 8.2], [-5.1, 8.2], [-7.4, 5.6]]), 9.2, 0, 4), K)
      .box(21, 0.7, 7, D, 0, 1.9, 0).done();

    // A door's origin is the middle of its top edge. White, so the carried part stands out against the blue shell.
    const doorShape = poly(DOOR.map(([x, y]) => [x - 2.1, y - 7.9]));
    doorShape.holes.push(poly([[-2, -2.6], [1.9, -2.6], [-0.1, -0.5], [-2, -0.5]]));
    const doorKit = (kt, x, y, z) => kt.geo(extrude(doorShape, 0.36, 0.05, 4), W, x, y, z).box(1.2, 0.3, 0.3, K, x + 1.4, y - 3.1, z + 0.28);
    const door = group(root);
    doorKit(kit(door), 0, 0, 0).done();
    doorKit(k, -34.4, 10, 12);
    doorKit(k, -42.8, 10, 12);
    k.done();

    const a = makeArm({ l1: 13, l2: 13, h: 6.5, r: 2.3, tool: 3.6, color: '#fed920' });
    a.group.position.set(-9, 0, 24);
    root.add(a.group);
    // Two fingers squeeze the door by its side edges, the way Roboruka squeezes a brick.
    kit(a.tool).box(1.6, 10, 2.6, D, 1.5, 0, 0).box(1.2, 1.5, 1.2, K, 1.4, 0, 2).cyl(0.45, 0.5, A, 2.2, 0, 2, 'x').done();
    const fingers = [-1, 1].map((sgn) => kit(group(a.tool)).box(6.2, 0.8, 1.7, K, 5.3, 0, 0.34).box(3, 0.24, 1.5, M, 6.8, -sgn * 0.46, 0.34).done());
    const look = beam(root, 4);

    const b = makeArm({ l1: 13, l2: 13, h: 6.5, r: 2.3, tool: 5, color: '#fed920' });
    b.group.position.set(12, 0, -21);
    root.add(b.group);
    // C-shaped weld gun: the frame goes round the far side of the rail, two electrodes squeeze it.
    kit(b.tool).box(2, 2.2, 3, D, 1.4, 0, -1).box(7.2, 1, 1, K, 4.8, 0, -3.4).box(1, 1, 3.8, K, 8, 0, -1.9)
      .cyl(0.3, 2.2, G, 3.3, 0, 0, 'x', 0.42).cyl(0.3, 1.2, G, 7.2, 0, 0, 'x').done();
    const weld = spray(root, 90, '#ff8a00', 0.8, { speed: 16 });

    const RAIL = [-3.6, -1, 1.6], IDLE = vec(17, 19, -10), RAIL_Y = 9.3;
    const tip = vec(0, 0, 0), from = vec(0, 0, 0), to = vec(0, 0, 0);
    return (s, t) => {
      car.position.x = s.car;
      a.reach(s.x, s.y, s.z);
      fingers.forEach((f, i) => { f.position.y = (i ? 1 : -1) * lerp(4.2, 3.12, s.grip); });
      if (s.hold < 0.5) door.position.set(-26, 10, 12);
      else if (s.hold < 1.5) door.position.set(s.x, s.y, s.z);
      else door.position.set(s.car + 2.1, 8.9, 5.35);
      look(from.set(s.x, s.y + 1.2, s.z + 2), to.set(s.x, s.y - 4, s.z), s.scan);

      // Three welds along the roof rail: move, press, sparks, next point.
      // ponytail: the gun's lower prong passes through the pillar on the far side, hidden from the default camera. Lift between welds if anyone orbits there.
      const u = s.weld * 3, n = Math.min(2, Math.floor(u)), f = u - n;
      const x = n ? lerp(RAIL[n - 1], RAIL[n], smoothstep(f, 0, 0.5)) : RAIL[0];
      const press = u > 0 && u < 3 && f > 0.5;
      tip.set(lerp(IDLE.x, x + s.car, s.gun), lerp(IDLE.y, RAIL_Y + (press ? 0 : 1.6), s.gun), lerp(IDLE.z, -5, s.gun));
      b.reach(tip.x, tip.y, tip.z);
      weld(press, t, from.set(tip.x, RAIL_Y + 0.4, -5));
    };
  }

  /* ---------- 2. Warehouse: suction cups ---------- */

  function warehouse(root) {
    ground(root);
    const D = mat('#2b333b'), G = mat('#aab2b8'), Y = mat('#fed920'), CARD = mat('#c9985a'), TAPE = mat('#ecd09a'), WOOD = mat('#d5b078', { roughness: 0.7 }), K = mat('#16151a');
    const parcel = (parent, x, y, z) => {
      const g = group(parent, x, y, z);
      kit(g).box(7, 5, 7, CARD, 0, 0, 0).bar(1.5, 0.04, 7.02, TAPE, 0, 2.5, 0).bar(1.5, 5.02, 0.04, TAPE, 0, 0, 3.5)
        .bar(2.4, 1.6, 0.05, mat('#ffffff'), 2, 0.7, 3.5).done();
      return g;
    };

    const k = kit(root);
    // Conveyor comes in from outside the frame and ends at the pick point.
    k.box(90, 0.8, 1, D, -58, 5.6, 4.6).box(90, 0.8, 1, D, -58, 5.6, -4.6);
    for (let x = -100; x <= -14; x += 2.4) k.cyl(0.6, 9, G, x, 5.8, 0, 'z');
    for (let x = -90; x <= -18; x += 18) k.box(1.2, 5.4, 9.6, D, x, 2.7, 0);
    // Camera on a post, far enough back that the tool never meets it.
    k.box(1.4, 26, 1.4, D, -17, 13, -14).box(1.4, 1.4, 5, D, -17, 25.4, -12).box(2.6, 2.2, 2.6, K, -17, 24.6, -9.8).cyl(0.8, 0.7, mat('#00adc4'), -17, 23.4, -8.8, null, 0.8);
    // Pallet: boards on three runners.
    const PX = 19, PZ = 2;
    [-6.4, 0, 6.4].forEach((dz) => k.bar(16, 1, 2, WOOD, PX, 0.5, PZ + dz));
    for (let dx = -7; dx <= 7; dx += 3.5) k.bar(2.6, 0.5, 16, WOOD, PX + dx, 1.25, PZ);
    k.box(190, 0.06, 0.8, Y, 0, 0.03, 24).done();

    // Five parcels are already on the pallet. The sixth is the one this story carries.
    const slot = (i) => vec(PX + (i % 2 ? 3.7 : -3.7), 1.5 + 2.5 + 5 * (i >> 2), PZ + ((i >> 1) % 2 ? 3.7 : -3.7));
    for (let i = 0; i < 5; i++) { const p = slot(i); parcel(root, p.x, p.y, p.z); }
    const SLOT = slot(5), belt = [14, 25, 36, 47, 58].map((d) => parcel(root, -17 - d, 8.9, 0));

    const a = makeArm({ l1: 14, l2: 14, h: 8, r: 2.5, tool: 5.2, color: '#c92e85' });
    a.group.position.set(0, 0, -9);
    root.add(a.group);
    // The tool is a plate with four bellows cups. The cups are soft, so they squash when the air leaves.
    kit(a.tool).box(1, 8, 8, D, 1.6, 0, 0).box(1.4, 1.4, 4, Y, 2.6, 0, 0).done();
    const cups = group(a.tool, 2.2, 0, 0);
    const cup = kit(cups), R = mat('#16151a', { roughness: 0.7 }), Sk = mat('#ff8a00', { roughness: 0.6 });
    [[-2.3, -2.3], [-2.3, 2.3], [2.3, -2.3], [2.3, 2.3]].forEach(([y, z]) => {
      cup.cyl(0.8, 1.2, R, 0.6, y, z, 'x', 0.6).cyl(1.5, 0.9, Sk, 1.6, y, z, 'x', 0.8).cyl(1.5, 0.5, R, 2.75, y, z, 'x', 1.6);
    });
    cup.done();

    const look = beam(root, 5.2);
    const air = spray(root, 44, '#00adc4', 0.9, { speed: 20, gravity: 0, life: 0.5, spread: 0.3 });
    const held = parcel(root, 0, 0, 0);
    // Sweep around the base in a circle: a straight line would pass through the robot's own axis.
    const B = a.group.position, polar = (x, z) => [Math.atan2(z - B.z, x - B.x), Math.hypot(x - B.x, z - B.z)];
    const P0 = polar(-17, 0), P1 = polar(SLOT.x, SLOT.z), tmp = vec(0, 0, 0), to = vec(-17, 11, 0), from = vec(-17, 23.2, -8.6);
    return (s, t) => {
      const ang = lerp(P0[0], P1[0], s.a), rad = lerp(P0[1], P1[1], s.a);
      const x = B.x + rad * Math.cos(ang), z = B.z + rad * Math.sin(ang);
      const squash = 0.82 * s.vac;
      a.reach(x, s.y - squash * 1.5, z); // the plate sinks by what the cups lose, so the lips stay on the lid
      cups.scale.x = 1 - squash * 0.5;
      belt.forEach((p, i) => { p.position.x = -17 - i * 11 - (1 - s.belt) * 14; });
      belt[0].visible = s.hold < 0.5;
      held.visible = s.hold >= 0.5;
      if (s.hold < 1.5) held.position.set(x, s.y - 2.5, z);
      else held.position.copy(SLOT);
      look(from, to, s.scan);
      air(s.pump > 0.05 && s.pump < 0.95, t, tmp.set(x, s.y + 3.4, z));
    };
  }

  /* ---------- 3. Surgery training: tiny jaws, the doctor moves 5, the jaws move 1 ---------- */

  function surgery(root, stage) {
    ground(root);
    const SCALE = 5; // motion scale 5:1, the hand path below is literally the tip path times this number
    const ZOOM = 4 / 3; // world units per unit of the tiny world on the big screen: 40 wide screen, 30 wide view
    const W = mat('#eceded'), A = mat('#01adc4'), D = mat('#2b333b'), G = mat('#aab2b8'), Y = mat('#fed920'), K = mat('#16151a'), M = mat('#c92e85');
    const SCRUB = mat('#2f9e8f'), SKIN = mat('#e8b58e'), CLOTH = mat('#3fa7a0', { roughness: 0.8 });

    // The tiny world is its own scene, filmed by the small camera and shown on the big screen.
    const micro = new THREE.Scene();
    micro.background = new THREE.Color('#f2aeb6');
    micro.environment = stage.scene.environment;
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-4, 20, 10);
    micro.add(sun);
    const eye = new THREE.PerspectiveCamera(26, 5 / 3, 1, 120);
    eye.position.set(0, 32, 22.4);
    eye.lookAt(0, 0, 0);
    const rt = new THREE.WebGLRenderTarget(800, 480, { samples: 4 });

    const mk = kit(micro);
    mk.box(60, 1, 44, mat('#ee8f9e', { roughness: 0.6 }), 0, -0.5, 0).box(11, 0.3, 7.4, W, 0, 0, 0.6).cyl(0.5, 1.1, Y, -1.2, 0.55, 0).cyl(0.5, 1.1, Y, 1.2, 0.55, 0);
    mk.bar(2.4, 0.1, 0.22, K, 0, 0.16, 3.2).bar(0.14, 0.1, 0.7, K, -1.2, 0.16, 3.2).bar(0.14, 0.1, 0.7, K, 1.2, 0.16, 3.2).done();
    label(micro, 'щипцы: 1 см', 0, 0.1, 5.8, 6.4).material.depthTest = false;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.3, 12, 32).rotateX(PI / 2), M);
    micro.add(ring);

    function instrument(px, py, pz) {
      const wrist = group(micro), shaft = limb(micro, G, 0.34);
      kit(wrist).cyl(0.42, 0.9, A, 0, 0, 0, 'z').done();
      const jaws = [-1, 1].map((sgn) => {
        const j = group(wrist);
        kit(j).box(0.36, 2, 0.6, K, sgn * 0.02, -1, 0).done();
        return j;
      });
      const P = vec(px, py, pz);
      return (x, y, z, open) => {
        wrist.position.set(x, y + 1.9, z);
        shaft(P, wrist.position);
        jaws.forEach((j, i) => { j.rotation.z = (i ? 1 : -1) * lerp(0.04, 0.5, open); });
      };
    }
    const right = instrument(16, 19, -14), left = instrument(-16, 19, -14);

    const k = kit(root);
    // Big screen with the film from inside, on a stand.
    k.box(41.6, 25.6, 1.4, K, 4, 34, -18).box(3, 22, 2, D, 4, 11, -19).box(14, 1, 8, D, 4, 0.5, -19);
    // Console: the doctor's head goes into the viewer, the hands stay free underneath.
    k.box(6, 11, 13, W, -3.4, 5.5, 3).box(18, 3.4, 11, W, -12.4, 22.5, 3).box(6, 11, 6, W, -5.4, 15, 3);
    k.box(6, 1, 13, D, -3.4, 11.2, 3).box(4, 2, 4, K, -20.4, 21.6, 1.6);
    // Doctor: everything that does not move.
    const DX = -31.4;
    k.cyl(2.6, 0.8, D, DX, 9.2, 3).cyl(0.5, 8, G, DX, 4.8, 3).cyl(3, 0.5, D, DX, 0.25, 3);
    k.cyl(2.2, 10, SCRUB, DX, 15.2, 3, null, 2.6).cyl(2.1, 1.6, SCRUB, DX + 0.4, 19.6, 3).geo(new THREE.SphereGeometry(2.1, 18, 12).scale(1, 0.75, 1.1), SCRUB, DX + 0.4, 20.4, 3);
    k.cyl(1.4, 7.5, SCRUB, DX + 2.5, 9.4, 4.8, 'x').cyl(1.4, 7.5, SCRUB, DX + 2.5, 9.4, 1.2, 'x').cyl(1.2, 8, SCRUB, DX + 5.6, 5, 4.8).cyl(1.2, 8, SCRUB, DX + 5.6, 5, 1.2);
    k.box(5, 1.2, 2.6, K, DX + 6.6, 0.6, 4.8).box(5, 1.2, 2.6, K, DX + 6.6, 0.6, 1.2);
    k.cyl(1, 2, SKIN, DX + 2.8, 21.6, 3, 'x');
    k.geo(new THREE.SphereGeometry(2.4, 20, 14), SKIN, DX + 5, 23.2, 3).geo(new THREE.SphereGeometry(2.56, 20, 14, 0, 2 * PI, 0, 1.5).rotateZ(0.3), A, DX + 5, 23.5, 3);
    // Table with a training dummy under a cloth.
    k.cyl(2.4, 8, G, 29, 4, 8).cyl(5, 0.6, D, 29, 0.3, 8).box(30, 1.2, 9, D, 29, 8.6, 8).box(30, 2.2, 10, CLOTH, 29, 10, 8);
    k.geo(new THREE.SphereGeometry(5.4, 20, 14).scale(2.2, 0.6, 0.85), CLOTH, 27, 11, 8);
    k.box(4, 1.4, 6, W, 40, 11.6, 8).geo(new THREE.SphereGeometry(2.1, 18, 12), SKIN, 40, 13.6, 8);
    // Cable from the console to the robot: the doctor is not at the table at all.
    k.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([vec(0, 0.4, 7), vec(8, 0.4, 16), vec(30, 0.4, 16), vec(38, 0.4, -2)]), 40, 0.4, 6), D);
    k.done();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ map: rt.texture }));
    screen.position.set(4, 34, -17.2);
    root.add(screen);

    const cart = group(root, 40, 0, -5);
    kit(cart).box(10, 2, 9, D, 0, 1, 0).box(5, 27, 5, W, 0, 15, 0).box(19, 3, 4, W, -8, 28, 0).done();
    // Three arms: two instruments and the camera.
    const arms = [[-14, 8], [-9, 12], [-4, 8]].map(([x, reach]) => {
      const g = group(cart, x, 26.5, 0);
      kit(g).box(2, 7, 2, W, 0, -3.5, 2).box(1.8, 1.8, reach - 1, A, 0, -7, 2 + reach / 2).cyl(0.34, 11, G, 0, -12, 2 + reach, null, 0.2).done();
      return g;
    });

    // The arms that move, each with the master grip in its hand.
    const upL = limb(root, SCRUB, 1.1), foreL = limb(root, SKIN, 0.9), upR = limb(root, SCRUB, 1.1), foreR = limb(root, SKIN, 0.9);
    const handL = group(root), handR = group(root);
    [handL, handR].forEach((h) => kit(h).geo(new THREE.SphereGeometry(1.5, 16, 12), SKIN).cyl(0.5, 3.4, A, 0.6, 0.4, 0, 'z').done());

    // Rulers at one scale, the hand here and the picture on the screen, so 5 to 1 is visible at a glance.
    const HX = -24, HY = 11, RW = 2.4 * SCALE * ZOOM;
    const r = kit(root);
    r.bar(RW, 0.6, 0.6, Y, HX + RW / 2, HY - 3.6, 8.5).bar(0.6, 2, 0.6, Y, HX, HY - 3.6, 8.5).bar(0.6, 2, 0.6, Y, HX + RW, HY - 3.6, 8.5).done();
    label(root, 'рука: 5 см', HX + RW / 2, HY - 7, 8.5, 15);

    const SL = vec(DX + 0.4, 19.4, 6), SR = vec(DX + 0.4, 19.4, 0), H = vec(0, 0, 6), HL = vec(HX + 3, HY + 1, 0), POLE = vec(-0.35, -0.7, 0.6), POLE2 = vec(-0.35, -0.7, -0.6);
    return (s) => {
      left(-6, 0.5, 1, 0.3);
      right(s.tx, s.ty, 0, s.jaw);
      if (s.hold < 0.5) ring.position.set(-1.2, 0.35, 0);
      else if (s.hold < 1.5) ring.position.set(s.tx - 1.1, s.ty, 0);
      else ring.position.set(1.2, 0.35, 0);
      arms.forEach((g, i) => { g.rotation.x = (s.tx - 1.1) * 0.006 * (i - 1); });
      // The doctor's hand: exactly five times the tip path, the screen just shows it at the same scale.
      H.x = HX + (s.tx + 0.1) * SCALE * ZOOM;
      H.y = HY + (s.ty - 0.35) * SCALE * ZOOM;
      handR.position.copy(H);
      const e = elbow(SL, H, 11.8, POLE);
      upR(SL, e); foreR(e, H);
      handL.position.copy(HL);
      const e2 = elbow(SR, HL, 11.8, POLE2);
      upL(SR, e2); foreL(e2, HL);
      const gl = stage.renderer;
      gl.setRenderTarget(rt);
      gl.render(micro, eye);
      gl.setRenderTarget(null);
    };
  }

  /* ---------- 4. Space: Canadarm2 and snare wires ---------- */

  function gridTexture(base, line, n) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      const p = i * 128 / n;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 128); g.moveTo(0, p); g.lineTo(128, p); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Fixed seed: the same planet and the same stars every time.
  function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  function earthTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d'), rnd = seeded(7);
    g.fillStyle = '#1b6fd0';
    g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = '#3f9a5a';
    for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(rnd() * 1024, rnd() * 1024, 40 + rnd() * 90, 20 + rnd() * 50, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 150; i++) { g.beginPath(); g.ellipse(rnd() * 1024, rnd() * 1024, 14 + rnd() * 70, 3 + rnd() * 12, rnd() * 0.5, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function space(root) {
    const W = mat('#eceded'), G = mat('#aab2b8'), D = mat('#3b444d'), GOLD = mat('#e0b23c', { metalness: 0.5, roughness: 0.35 }), BLUE = mat('#0a7bb3'), Y = mat('#fed920'), K = mat('#16151a');
    const PANEL = new THREE.MeshStandardMaterial({ map: gridTexture('#123a78', '#3f7fd0', 4), roughness: 0.35, metalness: 0.2 });
    const FAN = mat('#123a78', { roughness: 0.4, metalness: 0.2 });

    const starPos = [], rnd = seeded(11);
    for (let i = 0; i < 500; i++) starPos.push((rnd() - 0.5) * 900, rnd() * 420 - 90, -260 - rnd() * 200);
    root.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false })));

    // Only a cap of the planet is ever in view, so it gets all the triangles. The map is laid flat on it, then scrolled: the ground runs under the station.
    const capGeo = (r) => new THREE.SphereGeometry(r, 96, 32, 0, 2 * PI, 0, 0.8).translate(0, -490, -80);
    const cap = capGeo(460), map = earthTexture(), P = cap.attributes.position;
    for (let i = 0; i < P.count; i++) cap.attributes.uv.setXY(i, P.getX(i) / 220, P.getZ(i) / 220);
    root.add(new THREE.Mesh(cap, new THREE.MeshStandardMaterial({ map, roughness: 0.7 })));
    root.add(new THREE.Mesh(capGeo(464), new THREE.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.18, depthWrite: false })));

    const k = kit(root);
    // Truss, built from plain boxes because there are many.
    const TZ = -10, TY = 20;
    k.bar(108, 0.5, 0.5, G, -46, TY + 1.8, TZ + 1.8).bar(108, 0.5, 0.5, G, -46, TY + 1.8, TZ - 1.8).bar(108, 0.5, 0.5, G, -46, TY - 1.8, TZ + 1.8).bar(108, 0.5, 0.5, G, -46, TY - 1.8, TZ - 1.8);
    for (let x = -100; x <= 8; x += 4) {
      k.bar(0.4, 3.6, 0.4, G, x, TY, TZ + 1.8).bar(0.4, 3.6, 0.4, G, x, TY, TZ - 1.8).bar(0.4, 0.4, 3.6, G, x, TY + 1.8, TZ).bar(0.4, 0.4, 3.6, G, x, TY - 1.8, TZ);
      if (x < 8) k.bar(5.4, 0.3, 0.3, G, x + 2, TY, TZ + 1.8, 0, 0, 0.73).bar(5.4, 0.3, 0.3, G, x + 2, TY + 1.8, TZ, 0, 0.73, 0);
    }
    // Solar wings: the big dark sails everyone recognises.
    [-66, -44].forEach((x) => {
      [1, -1].forEach((sgn) => {
        k.bar(0.6, 46, 0.6, GOLD, x, TY + sgn * 24, TZ);
        k.geo(new THREE.BoxGeometry(9, 42, 0.3), PANEL, x - 5, TY + sgn * 25, TZ).geo(new THREE.BoxGeometry(9, 42, 0.3), PANEL, x + 5, TY + sgn * 25, TZ);
      });
    });
    // Modules under the truss. The white cylinder ends in the port the ship is brought to.
    const MY = 8, MZ = TZ;
    k.cyl(5, 34, W, -13, MY, MZ, 'x').cyl(5.4, 0.8, G, -22, MY, MZ, 'x').cyl(5.4, 0.8, G, -6, MY, MZ, 'x').cyl(5.4, 0.8, G, 3.6, MY, MZ, 'x');
    k.cyl(3.2, 11, W, -10, 14, MZ).cyl(3.3, 1.6, D, 4.8, MY, MZ, 'x');
    k.done();

    // Canadarm2: long white booms, joint collars, a wide-open cup at the end.
    const LEE = 7.6;
    const arm = makeArm({ l1: 19, l2: 19, h: 3.4, tool: LEE, skin({ g, yaw, up, fore, wrist, tool }) {
      kit(g).cyl(2, 1.6, D, 0, 0.8, 0).done();
      kit(yaw).cyl(1.6, 3.4, W, 0, 1.7, 0).cyl(1.8, 3.6, BLUE, 0, 3.4, 0, 'z').done();
      kit(up).cyl(1.15, 19, W, 9.5, 0, 0, 'x').cyl(1.4, 1.4, BLUE, 1.6, 0, 0, 'x').cyl(1.4, 1.4, BLUE, 17.6, 0, 0, 'x').cyl(1.9, 3.4, BLUE, 19, 0, 0, 'z').done();
      kit(fore).cyl(1.15, 19, W, 9.5, 0, 0, 'x').cyl(1.4, 1.4, BLUE, 1.6, 0, 0, 'x').cyl(1.4, 1.4, BLUE, 17.6, 0, 0, 'x').done();
      kit(wrist).cyl(1.7, 3.2, BLUE, 0, 0, 0, 'z').done();
      kit(tool).cyl(1.6, 2.2, W, 1.1, 0, 0, 'x').cyl(0.6, 1.3, K, 1, 2.3, 0, 'x').done();
    } });
    arm.group.position.set(-3, TY + 2.2, TZ);
    root.add(arm.group);
    // Latching end effector: a see-through cup so the three snare wires stay visible.
    const CUP = mat('#eceded', { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 5.4, 28, 1, true).rotateZ(-PI / 2).translate(4.9, 0, 0), CUP);
    arm.tool.add(cup);
    kit(arm.tool).geo(new THREE.TorusGeometry(3.7, 0.36, 10, 32).rotateY(PI / 2), BLUE, 2.2, 0, 0).geo(new THREE.TorusGeometry(3.7, 0.46, 10, 32).rotateY(PI / 2), BLUE, 7.6, 0, 0).done();
    const snare = group(arm.tool, 6.2, 0, 0), wires = [0, 1, 2].map(() => kit(group(snare)).cyl(0.22, 6.6, Y, 0, 0, 0, 'z').done());

    // Cargo ship with a pin on top for the arm, and two round sun fans.
    const ship = group(root);
    const sk = kit(ship);
    sk.cyl(3.6, 10, W, -1, 0, 0, 'x').cyl(3.7, 0.5, G, -2.8, 0, 0, 'x').cyl(3.7, 0.5, G, 1.8, 0, 0, 'x');
    sk.cyl(2.6, 1.6, W, -6.8, 0, 0, 'x', 3.6).cyl(2.3, 0.8, D, -7.8, 0, 0, 'x');
    sk.cyl(3.8, 3.8, GOLD, 5.8, 0, 0, 'x').cyl(1.3, 1.8, D, 8.4, 0, 0, 'x', 0.6);
    sk.cyl(0.3, 7, G, 5.8, 7, 0).cyl(0.3, 7, G, 5.8, -7, 0);
    sk.geo(new THREE.CircleGeometry(6.4, 28), FAN, 5.8, 13.6, 0.25).geo(new THREE.CircleGeometry(6.4, 28), FAN, 5.8, -13.6, 0.25);
    sk.geo(new THREE.CylinderGeometry(6.5, 6.5, 0.2, 28).rotateX(PI / 2), GOLD, 5.8, 13.6, 0.05).geo(new THREE.CylinderGeometry(6.5, 6.5, 0.2, 28).rotateX(PI / 2), GOLD, 5.8, -13.6, 0.05);
    for (let i = 0; i < 6; i++) [13.6, -13.6].forEach((y) => sk.bar(12.6, 0.14, 0.1, GOLD, 5.8, y, 0.32, 0, 0, i * PI / 6));
    // Grapple fixture: the pin the wires close around.
    sk.box(3.4, 0.6, 3.4, D, -2.5, 3.8, 0).cyl(0.42, 2.2, Y, -2.5, 4.9, 0).geo(new THREE.SphereGeometry(0.6, 12, 8), Y, -2.5, 6, 0).done();
    const PIN = vec(-2.5, 5.4, 0); // grip point in ship coordinates

    const puff = spray(root, 26, '#ffffff', 0.6, { speed: 9, gravity: 0, life: 0.8, dir: vec(1, 0, 0), spread: 0.4 });
    const look = beam(root, 4.6);
    const from = vec(0, 0, 0), to = vec(0, 0, 0), o = vec(0, 0, 0);
    return (s, t) => {
      map.offset.x = t * 0.012;
      arm.reach(s.x, s.y, s.z);
      if (s.hold > 0.5) ship.position.set(s.x - PIN.x, s.y - PIN.y, s.z);
      else ship.position.set(s.sx, s.sy, s.sz);
      // The wires start as a wide triangle and tighten around the pin while the ring turns.
      snare.rotation.x = s.snare * 1.3;
      wires.forEach((w, i) => {
        const a = i * 2 * PI / 3, d = lerp(3, 0.62, s.snare);
        w.position.set(0, Math.cos(a) * d, Math.sin(a) * d);
        w.rotation.x = -a;
      });
      look(from.set(s.x, s.y + 8, s.z), to.set(ship.position.x + PIN.x, ship.position.y + PIN.y, ship.position.z), s.scan);
      puff(s.hold < 0.5 && s.thrust > 0.1, t, o.set(ship.position.x + 9, ship.position.y, ship.position.z));
    };
  }

  /* ---------- 5. Orchard: soft fingers ---------- */

  const RIPE = [6.5, 15.8, 5.6]; // the apple this story picks, also used by the phase table

  function appleGeo(r) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = -PI / 2 + i / 14 * PI, x = r * Math.cos(a);
      pts.push(new THREE.Vector2(Math.max(x, 0.001), r * 0.92 * Math.sin(a) - Math.sign(Math.sin(a)) * r * 0.24 * Math.exp(-((x / (r * 0.42)) ** 2))));
    }
    return new THREE.LatheGeometry(pts, 16);
  }

  function farm(root) {
    ground(root, 0.18);
    const LEAF = mat('#3f9d4a', { flatShading: true, roughness: 0.6 }), LEAF2 = mat('#57b552', { flatShading: true, roughness: 0.6 }), BARK = mat('#7a5a3c', { roughness: 0.7 });
    const RED = mat('#d8232f', { roughness: 0.3 }), GREEN = mat('#a4dc3e', { roughness: 0.3 }), W = mat('#eceded'), A = mat('#01adc4'), D = mat('#2b333b'), K = mat('#16151a'), WOOD = mat('#d5b078', { roughness: 0.7 });
    const SOFT = mat('#fed920', { roughness: 0.55 }), STEM = mat('#6b4a2c', { roughness: 0.7 });

    // Tree: three chunky lobes, apples on the side facing the robot.
    const TX = 16, TZ = -3;
    const k = kit(root);
    k.cyl(1.5, 13, BARK, TX, 6.5, TZ, null, 2.2);
    k.geo(new THREE.IcosahedronGeometry(13, 1), LEAF, TX, 19, TZ).geo(new THREE.IcosahedronGeometry(9, 1), LEAF2, TX + 9, 15, TZ + 3).geo(new THREE.IcosahedronGeometry(9.5, 1), LEAF2, TX - 7, 25, TZ - 2);
    // Cart.
    k.box(19, 3, 12, A, -14, 3.8, 6).box(15, 0.7, 10, W, -14, 5.6, 6);
    [[-20, 12.4], [-8, 12.4], [-20, -0.4], [-8, -0.4]].forEach(([x, z]) => k.cyl(2.3, 1.8, K, x, 2.3, z, 'z').cyl(1.1, 2, W, x, 2.3, z, 'z'));
    // Crate on the cart.
    k.bar(10, 0.5, 8, WOOD, -9.4, 6.2, 8);
    [[-9.4, 4.2], [-9.4, 11.8]].forEach(([x, z]) => k.bar(10, 3, 0.5, WOOD, x, 7.7, z));
    [-14.2, -4.6].forEach((x) => k.bar(0.5, 3, 8, WOOD, x, 7.7, 8));
    // Camera mast.
    k.box(1, 15, 1, D, -19, 13, 11).box(4, 1.7, 2, K, -18.4, 21, 11).cyl(0.65, 0.6, A, -16.6, 21, 11.6, 'x').cyl(0.65, 0.6, A, -16.6, 21, 10.2, 'x');

    const geoA = appleGeo(1.9);
    const other = [[11.4, 23.6, 8.5, RED], [4.8, 23.6, 2.1, GREEN], [13.4, 15.7, 9.5, GREEN], [8.1, 10.4, 3.2, RED], [18.6, 20.3, 9.8, RED], [11.4, 29.6, 3.3, GREEN], [17.3, 11.7, 8, GREEN]];
    other.forEach(([x, y, z, m]) => k.geo(appleGeo(1.9), m, x, y, z, 0.3, 0, 0.3).cyl(0.14, 1, STEM, x, y + 2, z));
    k.done();
    const marks = other.map(([x, y, z, m]) => {
      const q = marker(root, m === RED ? '#fed920' : '#ffffff', m !== RED);
      q.position.set(x, y, z + 2);
      q.material.depthTest = false;
      return q;
    });
    const yes = marker(root, '#fed920');
    yes.position.set(RIPE[0], RIPE[1], RIPE[2] + 2);
    yes.material.depthTest = false;

    const apple = group(root);
    kit(apple).geo(geoA, RED).cyl(0.14, 1, STEM, 0, 2, 0).done();

    const a = makeArm({ l1: 11, l2: 11, h: 3, r: 1.8, tool: 3.9, color: '#eceded', dark: '#01788c', base: false });
    a.group.position.set(-16, 5.9, 3);
    root.add(a.group);

    // Four silicone fingers. Each is a chain of soft segments, so it curls around the fruit instead of pinching it.
    kit(a.tool).cyl(1.5, 1.2, D, 1.3, 0, 0, 'x').done();
    const fingers = [0, 1, 2, 3].map((i) => {
      const spin = group(a.tool);
      spin.rotation.x = i * PI / 2 + PI / 4;
      const chain = [];
      let p = group(spin, 1.8, 1.2, 0);
      for (let j = 0; j < 4; j++) {
        kit(p).box(1.32, 0.95, 1.5 - j * 0.14, SOFT, 0.71, 0, 0).done();
        chain.push(p);
        p = group(p, 1.42);
      }
      return chain;
    });

    const look = beam(root, 15), from = vec(-16.2, 21, 11), to = vec(0, 0, 0);
    return (s, t) => {
      const sway = Math.sin(t * 1.4) * 5;
      look(from, to.set(RIPE[0] + 4 + sway, 19 + sway, 3), s.scan);
      a.reach(s.x, s.y, s.z, s.p, s.tw);
      // Closed pose: joint angles that lay the chain on a circle around the apple.
      fingers.forEach((chain) => chain.forEach((g, j) => { g.rotation.z = j ? lerp(-0.2, -0.6, s.grip) : lerp(1.15, 0.735, s.grip); }));
      marks.forEach((m) => { m.visible = s.mark > 0.5; });
      yes.visible = s.aim > 0.5;
      if (s.hold < 0.5) { apple.position.set(...RIPE); apple.rotation.set(0.3, 0, 0.3); }
      else if (s.hold < 1.5) { apple.position.set(s.x, s.y, s.z); apple.rotation.set(0.3 + s.tw, 0, 0.3); }
      else apple.position.set(-9.4, 8.4, 8);
    };
  }

  /* ---------- 6. Bomb squad: a tracked robot with a claw ---------- */

  function rescue(root) {
    ground(root, 0.18);
    const K = mat('#16151a'), D = mat('#2b333b'), Y = mat('#fed920'), A = mat('#01adc4'), G = mat('#aab2b8'), M = mat('#c92e85'), W = mat('#eceded'), STEEL = mat('#7d8a94', { metalness: 0.4, roughness: 0.4 });
    const CONE = mat('#ff6a13'), CONC = mat('#c4cbd0', { roughness: 0.8 });
    const k = kit(root);
    // Road markings and a cordon that keeps people out.
    for (let x = -120; x <= 120; x += 12) k.bar(7, 0.05, 0.9, W, x, 0.03, -11);
    k.bar(260, 0.05, 0.6, W, 0, 0.03, 15).bar(260, 0.05, 0.6, W, 0, 0.03, -28);
    [[-36, -24], [-36, -8], [-36, 8]].forEach(([x, z]) => k.cyl(0.2, 3.2, K, x, 1.6, z).cyl(0.9, 0.5, K, x, 0.25, z));
    k.bar(0.1, 0.6, 32, Y, -36, 2.8, -8);
    [[-36, 13], [-36, -29], [-30, 21]].forEach(([x, z]) => k.geo(new THREE.ConeGeometry(1.5, 4, 14), CONE, x, 2, z).bar(3.2, 0.4, 3.2, K, x, 0.2, z));
    // Containment vessel: a thick steel tub on a trailer.
    const VX = 31;
    k.box(13, 1.4, 13, D, VX, 1.8, 0).cyl(1.3, 1, K, VX - 4.6, 1.3, 7, 'z').cyl(1.3, 1, K, VX + 4.6, 1.3, 7, 'z').cyl(1.3, 1, K, VX - 4.6, 1.3, -7, 'z').cyl(1.3, 1, K, VX + 4.6, 1.3, -7, 'z');
    k.geo(new THREE.CylinderGeometry(5.6, 5.6, 7, 28, 1, true), STEEL, VX, 6, 0).geo(new THREE.CylinderGeometry(4.8, 4.8, 7, 28, 1, true), K, VX, 6, 0);
    k.geo(new THREE.TorusGeometry(5.2, 0.46, 10, 32).rotateX(PI / 2), Y, VX, 9.5, 0).cyl(5, 0.3, K, VX, 3, 0);
    // Operator post, far beyond the cordon, behind a concrete block.
    k.box(10, 5, 2.4, CONC, -60, 2.5, -32).bar(10, 0.7, 2.5, Y, -60, 4.2, -32);
    k.cyl(0.14, 13, G, -66, 6.5, -35).geo(new THREE.SphereGeometry(0.5, 10, 8), M, -66, 13.2, -35);
    k.done();

    const op = group(root, -60, 0, -35.4);
    kit(op).cyl(1, 4, K, 0, 2, 0.7).cyl(1, 4, K, 0, 2, -0.7).cyl(1.8, 5.6, A, 0, 6.6, 0, null, 1.5)
      .geo(new THREE.SphereGeometry(1.5, 16, 12), mat('#e8b58e'), 0, 10.4, 0).geo(new THREE.SphereGeometry(1.62, 16, 12, 0, 2 * PI, 0, 1.6), Y, 0, 10.5, 0)
      .box(3.6, 2.4, 0.5, K, 1.2, 7.4, 2.4, -0.7).cyl(0.55, 4, A, 1.2, 7.8, 1.6, 'z').cyl(0.55, 4, A, -1.2, 7.8, 1.6, 'z').done();

    // Tracked chassis. Length along X, the arm sits at the front. Raised by a cleat's height: the floor is only a shadow and hides nothing.
    const robot = group(root, 0, 0.15);
    const r = kit(robot);
    const L = 11, R = 1.9;
    const stadium = (rad) => {
      const s = new THREE.Shape();
      s.absarc(-L / 2, 0, rad, PI / 2, 3 * PI / 2, false);
      s.absarc(L / 2, 0, rad, -PI / 2, PI / 2, false);
      return s;
    };
    const belt = stadium(R);
    belt.holes.push(stadium(R - 0.42));
    [-3.9, 3.9].forEach((z) => {
      r.geo(extrude(belt, 1.9, 0.05, 12), K, 0, R, z);
      [-L / 2, -L / 4 + 1, 1, L / 2].forEach((x) => r.cyl(1.4, 1.5, Y, x, R, z, 'z').cyl(0.5, 1.7, D, x, R, z, 'z'));
    });
    r.box(14, 3, 6, D, 0, 3.8, 0).box(9, 0.5, 5, Y, -2, 5.5, 0).done();
    // Rubber cleats run around the belt, so the track looks driven.
    const cleats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.3, 2), K, 52);
    cleats.castShadow = true;
    cleats.frustumCulled = false;
    robot.add(cleats);
    const PER = 2 * L + 2 * PI * R, dummy = new THREE.Object3D();
    const setCleats = (off) => {
      for (let i = 0; i < 26; i++) {
        let u = ((i / 26) * PER + off) % PER;
        if (u < 0) u += PER;
        let x, y, a;
        if (u < L) { x = L / 2 - u; y = 0; a = 0; }
        else if (u < L + PI * R) { a = (u - L) / R; x = -L / 2 - Math.sin(a) * R; y = R - Math.cos(a) * R; a = -a; }
        else if (u < 2 * L + PI * R) { x = -L / 2 + (u - L - PI * R); y = 2 * R; a = PI; }
        else { a = (u - 2 * L - PI * R) / R; x = L / 2 + Math.sin(a) * R; y = R + Math.cos(a) * R; a = PI - a; }
        [-3.9, 3.9].forEach((z, n) => {
          dummy.position.set(x, y, z);
          dummy.rotation.z = a;
          dummy.updateMatrix();
          cleats.setMatrixAt(i * 2 + n, dummy.matrix);
        });
      }
      cleats.instanceMatrix.needsUpdate = true;
    };
    kit(robot).box(0.7, 7, 0.7, D, -5.4, 8.5, -2).box(2.8, 1.5, 1.8, K, -4.8, 12.4, -2).cyl(0.5, 0.5, A, -3.2, 12.4, -1.5, 'x').cyl(0.5, 0.5, A, -3.2, 12.4, -2.5, 'x')
      .cyl(0.07, 8, G, -6.4, 9.6, 2).geo(new THREE.SphereGeometry(0.3, 8, 6), M, -6.4, 13.6, 2).done();

    const a = makeArm({ l1: 9.5, l2: 9.5, h: 1.4, r: 1.3, tool: 5.2, color: '#01adc4', base: false });
    a.group.position.set(3.5, 5.2, 0);
    robot.add(a.group);
    // Claw: two hooked jaws that close across the handle, with a camera on the wrist.
    kit(a.tool).box(1.6, 1.8, 3, D, 1.4, 0, 0).box(0.9, 1.1, 0.9, K, 1.4, 1.6, 0).cyl(0.34, 0.3, A, 2, 1.6, 0, 'x').done();
    const HOOK = [[0, 0], [1.5, 0.95], [3, 1.15], [4.5, 0.25], [4.7, -0.3], [4, -0.22], [3, 0.3], [1.5, 0.2], [0, -0.55]];
    const jaws = [-1, 1].map((sgn) => {
      const j = group(a.tool, 2.2, 0, sgn * 0.75);
      kit(j).geo(extrude(poly(HOOK.map(([u, v]) => [u, sgn * v])), 1.3, 0.06, 2).rotateX(PI / 2), Y).done();
      return j;
    });

    // The suspicious suitcase, with a handle on top. Origin at the bottom.
    const bag = group(root);
    kit(bag).box(6.4, 4.4, 2.4, M, 0, 2.2, 0).box(6.6, 0.3, 2.5, K, 0, 2.2, 0).box(2.4, 0.3, 0.4, K, 0, 5.1, 0).box(0.3, 0.9, 0.4, K, -1.1, 4.7, 0).box(0.3, 0.9, 0.4, K, 1.1, 4.7, 0).done();

    const look = beam(root, 3.8);
    const pulses = [0, 1, 2, 3, 4].map(() => marker(root, '#00adc4'));
    const BX = 8, HOME = vec(-66, 13, -35), from = vec(0, 0, 0), to = vec(0, 0, 0);
    return (s, t) => {
      robot.position.x = s.rx;
      setCleats(s.rx);
      a.reach(s.x, s.y, 0);
      jaws.forEach((j, i) => { j.rotation.y = (i ? -1 : 1) * lerp(0.55, 0, s.grip); });
      const wx = s.rx + s.x, wy = s.y;
      if (s.hold < 0.5) bag.position.set(BX, 0, 0);
      else if (s.hold < 1.5) bag.position.set(wx, wy - 5.1, 0);
      else bag.position.set(VX, lerp(wy - 5.1, 3.1, Math.min(1, (s.hold - 2) ** 2)), 0); // released: falls into the tub
      look(from.set(wx, wy + 3.2, 1.6), to.set(BX, 1, 0), s.scan);
      // Radio pulses travel from the operator to the robot: the whole story is remote control.
      pulses.forEach((p, i) => {
        const k2 = (t * 0.22 + i / 5) % 1;
        p.position.set(lerp(HOME.x, s.rx - 6, k2), lerp(HOME.y, 13, k2) + Math.sin(k2 * PI) * 7, lerp(HOME.z, 2, k2));
        p.scale.setScalar(lerp(3, 6, k2));
        p.material.opacity = Math.sin(k2 * PI);
      });
    };
  }

  /* ---------- The six stories ---------- */

  RA.SCENES = [
    {
      id: 'factory', title: 'Автозавод', tag: 'пальцы', bg: 'linear-gradient(#f6f8fa, #dfe7ec)',
      camera: [42, 52, 106], target: [-12, 9, 4], poster: 8.6,
      where: 'Цех, где собирают кузова машин.',
      does: 'Один робот берёт дверь и ставит её на кузов. Другой сваривает металл точками, в одном кузове их тысячи.',
      grip: 'Пальцевый захват', how: 'Два пальца сжимают дверь с двух сторон и держат её трением.',
      sensors: 'Камеры находят деталь и следят за зазором между дверью и кузовом.',
      level: 1, auto: 'Работает по программе, без пульта. Люди настраивают роботов и следят за линией.',
      common: 'Та же работа, что у Роборуки: сжать, перенести, разжать.',
      start: { car: -96, x: -26, y: 18, z: 12, grip: 0, hold: 0, scan: 0, gun: 0, weld: 0 },
      phases: [
        { s: 2.8, text: 'Кузов приезжает на пост', car: 0 },
        { s: 1.5, text: 'Камера находит дверь', scan: 1 },
        { s: 1.2, text: 'Пальцы сжимают дверь', y: 10, scan: 0 },
        { s: 0.7, grip: 1, hold: 1 },
        { s: 1, text: 'Рука несёт дверь к кузову', y: 15 },
        { s: 2.4, x: 2.1, z: 10 },
        { s: 1, y: 8.9, scan: 1 },
        { s: 1.4, text: 'Дверь встаёт на место', z: 5.35 },
        { s: 0.6, grip: 0, hold: 2, scan: 0 },
        { s: 1, y: 17 },
        { s: 1, text: 'Второй робот варит кузов', gun: 1, x: -8, z: 12 },
        { s: 3.3, weld: 1, linear: true },
        { s: 0.7, gun: 0 },
        { s: 2.6, text: 'Кузов едет дальше', car: 110, x: -26, y: 18 },
      ],
      build: factory,
    },
    {
      id: 'warehouse', title: 'Склад', tag: 'присоски', bg: 'linear-gradient(#fbf6ec, #eadfca)',
      camera: [44, 50, 98], target: [-1, 10, 1], poster: 9,
      where: 'Склад и сортировочный центр.',
      does: 'Снимает коробки с конвейера и ставит их на поддон ровными рядами.',
      grip: 'Вакуумный захват', how: 'Мягкая присоска садится на коробку, насос откачивает из неё воздух. Воздух снаружи прижимает коробку к присоске.',
      sensors: 'Камера находит коробку. Датчик вакуума проверяет, держится ли она.',
      level: 1, auto: 'Работает по программе, камера подсказывает, где лежит коробка. Люди следят за линией.',
      common: 'Цикл тот же: взял, перенёс, отпустил. Вместо шин работают присоски.',
      start: { belt: 0, a: 0.5, y: 19, vac: 0, pump: 0, scan: 0, hold: 0 },
      phases: [
        { s: 2.4, text: 'Коробка едет по конвейеру', belt: 1 },
        { s: 1.3, text: 'Камера измеряет коробку', scan: 1 },
        { s: 1.2, text: 'Присоски садятся на крышку', scan: 0, a: 0 },
        { s: 1, y: 11.4 },
        { s: 1.2, text: 'Насос откачивает воздух', vac: 1, pump: 1, hold: 1 },
        { s: 1, text: 'Рука несёт коробку на поддон', y: 19 },
        { s: 2.6, a: 1 },
        { s: 1.1, y: 11.5 },
        { s: 1, text: 'Воздух вернулся, коробка стоит', vac: 0, hold: 2 },
        { s: 1, y: 19 },
        { s: 1.4, a: 0.5 },
      ],
      build: warehouse,
    },
    {
      id: 'surgery', title: 'Хирургия', tag: 'щипцы', bg: 'linear-gradient(#eefaf7, #cfe9e3)',
      camera: [4, 32, 166], target: [6, 20, 0], poster: 7,
      where: 'Операционная. Здесь врач тренируется на манекене.',
      does: 'Врач двигает рукояти за пультом. Робот повторяет это тонкими инструментами через маленькие разрезы.',
      grip: 'Щипцы на запястье', how: 'Крошечные щипцы на тонком стержне. Запястье у них гнётся, как у человека.',
      sensors: 'Маленькая 3D-камера показывает всё крупно. При настройке 5:1 рука идёт на 5 см, щипцы на 1 см, а дрожание руки сглаживается.',
      level: 0, auto: 'Автономии нет. Врач управляет каждым движением, сам робот ничего не делает.',
      common: 'Как с кнопкой на хабе: пока человек не скомандует, рука не двинется.',
      start: { tx: -0.1, ty: 1.45, jaw: 1, hold: 0 },
      phases: [
        { s: 1.8, text: 'Врач смотрит на экран' },
        { s: 1.4, text: 'Щипцы берут кольцо', ty: 0.35 },
        { s: 0.7, jaw: 0, hold: 1 },
        { s: 1.2, ty: 1.45 },
        { s: 3.4, text: 'Рука идёт на 5 см, щипцы на 1 см', tx: 2.3 },
        { s: 1.2, text: 'Кольцо надето на штырёк', ty: 0.35 },
        { s: 0.7, jaw: 1, hold: 2 },
        { s: 1.2, ty: 1.45 },
        { s: 1.2 },
      ],
      build: surgery,
    },
    {
      id: 'space', title: 'Космос', tag: 'тросы', bg: 'radial-gradient(120% 90% at 50% 100%, #123a6b, #05101f 60%, #02060e)',
      camera: [8, 18, 160], target: [2, 14, 0], poster: 11,
      where: 'Международная космическая станция, на орбите вокруг Земли.',
      does: 'Канадарм2 ловит грузовой корабль и подводит к станции. Длина руки 17 м, шарниров 7.',
      grip: 'Захват с тросами', how: 'В открытом стакане на конце руки три троса. Они затягиваются вокруг штыря на корабле.',
      sensors: 'Четыре цветные камеры, датчики положения шарниров и датчики силы.',
      level: 0, auto: 'Ручное управление. Корабль ловит астронавт на станции, потом рукой управляют с Земли.',
      common: 'Принцип тот же: открытый захват подводят к грузу и смыкают. Только вместо шин тросы.',
      start: { sx: 74, sy: -6, sz: 26, x: 18, y: 36, z: -6, snare: 0, hold: 0, scan: 0, thrust: 1 },
      phases: [
        { s: 3.6, text: 'Грузовой корабль подлетает', sx: 34, sy: 5, sz: 0, thrust: 0 },
        { s: 2.6, text: 'Рука тянется к штырю', x: 31.5, y: 22, z: 0, scan: 1 },
        { s: 1.4, y: 10.4, scan: 0 },
        { s: 1.4, text: 'Тросы затягиваются', snare: 1, hold: 1 },
        { s: 4, text: 'Рука ведёт корабль к станции', x: 26, y: 15, z: -10 },
        { s: 2, x: 11.6, y: 13.4 },
        { s: 2.2, text: 'Корабль у станции' },
      ],
      build: space,
    },
    {
      id: 'farm', title: 'Ферма', tag: 'мягкие пальцы', bg: 'linear-gradient(#e9f7d8, #c7e6a4)',
      camera: [-8, 32, 136], target: [-1, 16, 0], poster: 7.4,
      where: 'Яблоневый сад. Такие роботы пока проходят испытания.',
      does: 'Находит спелые яблоки, снимает их с ветки и кладёт в ящик. Зелёные оставляет дозревать.',
      grip: 'Мягкий захват', how: 'Гибкие пальцы работают от сжатого воздуха и обнимают яблоко, чтобы не помять его.',
      sensors: 'Камера с нейросетью находит яблоки и ветки, а по цвету понимает, спелое ли яблоко.',
      level: 2, auto: 'Робот сам решает, какое яблоко взять. А ездить по саду без человека пока только учится.',
      common: 'Шины Роборуки тоже мягкие: резина держит кубик трением и не даёт ему выскользнуть.',
      start: { x: -3, y: 13, z: 4.6, p: 0, tw: 0, grip: 0, hold: 0, scan: 0, mark: 0, aim: 0 },
      phases: [
        { s: 2.4, text: 'Камера осматривает дерево', scan: 1 },
        { s: 1.8, text: 'Красное берём, зелёное оставляем', mark: 1, aim: 1, scan: 0 },
        { s: 1.6, x: RIPE[0] - 5.2, y: RIPE[1], z: RIPE[2] - 0.6, mark: 0 },
        { s: 1.2, text: 'Мягкие пальцы обнимают яблоко', x: RIPE[0], z: RIPE[2], aim: 0 },
        { s: 1.1, grip: 1, hold: 1 },
        { s: 1.3, text: 'Поворот, и яблоко снято', tw: 1.4 },
        { s: 1, x: RIPE[0] - 5.2, z: RIPE[2] - 0.6 },
        { s: 2.6, text: 'Рука кладёт яблоко в ящик', x: -9.4, y: 13.4, z: 8, p: -PI / 2, tw: 0 },
        { s: 0.9, y: 9 },
        { s: 0.8, grip: 0, hold: 2 },
        { s: 1.2, y: 13.4 },
        { s: 1.4, x: -3, y: 13, z: 4.6, p: 0 },
      ],
      build: farm,
    },
    {
      id: 'rescue', title: 'Спасатели', tag: 'клешня', bg: 'linear-gradient(#eef1f4, #d3dae0)',
      camera: [58, 64, 130], target: [-7, 8, -6], poster: 11.2,
      where: 'Там, где нашли подозрительный предмет и подходить людям опасно.',
      does: 'Подъезжает к предмету, берёт его клешнёй и увозит в прочный контейнер.',
      grip: 'Клешня', how: 'Две жёсткие челюсти сжимаются и держат ручку. Гусеницы довозят руку куда нужно.',
      sensors: 'Несколько камер, одна прямо на захвате. Оператор видит всё на экране.',
      level: 0, auto: 'Ручное управление издалека: оператор ведёт робота джойстиком по радио или кабелю.',
      common: 'Клешня сжимается, как пальцы Роборуки. Разница в том, что человек смотрит через камеру.',
      start: { rx: -26, x: 6, y: 13, grip: 0, hold: 0, scan: 0 },
      phases: [
        { s: 3.2, text: 'Оператор ведёт робота по радио', rx: -4 },
        { s: 1.8, text: 'Камера на захвате видит сумку', x: 12, y: 12, scan: 1 },
        { s: 1.4, text: 'Клешня берёт сумку', y: 5.1, scan: 0 },
        { s: 0.8, grip: 1, hold: 1 },
        { s: 1.3, text: 'Робот везёт сумку к контейнеру', x: 9, y: 15.4 },
        { s: 3, rx: 16.5 },
        { s: 1.1, text: 'Сумка в прочном контейнере', x: 14.5 },
        { s: 0.6, grip: 0, hold: 2 },
        { s: 0.6, hold: 3 },
        { s: 3.2, text: 'Робот уезжает, опасность позади', rx: -26, x: 6, y: 13 },
      ],
      build: rescue,
    },
  ];
})();
