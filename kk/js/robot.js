// «Роборука»: a procedural LEGO SPIKE Prime model and its mechanism.
// 1 unit = 1 LEGO module (8 mm). +X runs from hub to gripper, +Y is up, +Z faces the viewer, Y=0 is the table.
// Geometry and materials are built once; each createRoboarm() only adds meshes and its own state.
(function () {
  const RA = window.RA;
  const T = THREE;
  const { mergeGeometries, toCreasedNormals } = T.BufferGeometryUtils;
  const Q = Math.PI / 2, TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = T.MathUtils.clamp;
  const smooth = (t) => t * t * (3 - 2 * t);
  const polar = (a, r = 1) => [Math.cos(a) * r, Math.sin(a) * r];

  // The mechanism, measured on the official thumbnail. In-plane angles run from +X towards +Z, finger pose as in the thumbnail.
  const AXIS_X = 17.5, PIVOT_Z = 2, TYRE_R = 1.65, GRIP_TRAVEL = 90, OPEN_GAP = 9;
  const LEG1 = 18 * DEG, LEG2 = LEG1 + 53.13 * DEG, BRICK = LEG2 - Q;    // the 1×7 liftarm's real 4-4 bend; a + hole sets the brick square to the leg
  const d1 = polar(LEG1), d2 = polar(LEG2), db = polar(BRICK);
  const hole = (n) => (n >= 4 ? [d1[0] * (6 - n), d1[1] * (6 - n)] : [2 * d1[0] + (4 - n) * d2[0], 2 * d1[1] + (4 - n) * d2[1]]);   // liftarm holes 1 (tip)..7, 6 is the pivot
  const AXLE = hole(1), TYRE = [AXLE[0] + 2 * db[0], AXLE[1] + 2 * db[1]];
  const TYRE_L = Math.hypot(TYRE[0], TYRE[1]), TYRE_A = Math.atan2(TYRE[1], TYRE[0]);
  const thetaForGap = (gap) => Math.asin((gap / 2 + TYRE_R - PIVOT_Z) / TYRE_L) - TYRE_A;   // finger turn from the thumbnail pose, + opens
  const THETA_OPEN = thetaForGap(OPEN_GAP), THETA_CLOSED = thetaForGap(0);
  // ponytail: linear rotor-to-finger map, the real four-bar is slightly curved. Solve the linkage if rotor degrees must match a real hub exactly.
  const thetaAt = (deg) => THETA_OPEN + (THETA_CLOSED - THETA_OPEN) * (-deg / GRIP_TRAVEL);
  const LINK_L = 2.15, LED_X = -6.25, LED_PITCH = 0.84;

  const PARTS = [
    { id: 'hub', name: 'Хаб', role: 'Ми: бағдарламаны сақтап, моторды басқарады' },
    { id: 'frames', name: 'Рамалар', role: 'Қаңқа және тұтқа: моторды ұстайды, қолды солардан ұстап алады' },
    { id: 'motor', name: 'Мотор', role: 'Бұлшықет: хабтың командасымен білікті бұрады' },
    { id: 'linkage', name: 'Иінтіректер', role: 'Беріліс: мотордың бұрылуын саусақтардың қозғалысына айналдырады' },
    { id: 'fingerA', name: 'Бірінші саусақ', role: 'Қармауыш: затты резеңке шинамен қысады' },
    { id: 'fingerB', name: 'Екінші саусақ', role: 'Қармауыш: біріншісіне қарсы қозғалып, затты қысып ұстайды' },
    { id: 'cable', name: 'Кабель', role: 'Жүйке: командаларды F портынан моторға жеткізеді' },
  ];
  const STAGES = [
    { id: 'hub', title: 'Хаб пен штифттер', steps: '1', parts: 'Хаб, 4 қара штифт', text: 'Төрт қара штифтті хабтың бүйіріне, ортаңғы батырма жағынан сал.' },
    { id: 'frames', title: 'Екі рама', steps: '2-5', parts: '2 рама (7×11), сұр жалғағыш, 2 қара штифт', text: 'Рамаларды сұр жалғағышпен біріктір, хабтың штифттеріне кигіз және тағы екі штифт сал: мотор кейін соларға кигізіледі.' },
    { id: 'motor', title: 'Мотор мен иінтірек', steps: '6-10', parts: 'Кабелі бар мотор, 4 қара штифт, сары білік 3, арқалық 5, ақ жалғағыш, беж штифт, қысқа көгілдір арқалық', text: 'Бұл бөлікті бөлек құрастыр: моторға білік пен 2 штифт сал, арқалық 5-ті кигіз, оның ұштарына тағы 2 штифт сал. Қалған үш бөлшектен кривошип құрастырып, оны білікке кигіз. Ол мотормен бірге айналады.' },
    { id: 'fingerA', title: 'Бірінші саусақ', steps: '11-18', parts: 'Дөңгелек дискісі бар шина, 2×4 кірпіш, иілген арқалық, 2 қара диск, 2 білік, беж штифт', text: 'Саусақты құрастырып, оны арқалық 5-тің ұшындағы штифтке кигіз.' },
    { id: 'fingerB', title: 'Екінші саусақ', steps: '19-25', parts: 'Сол бөлшектер, бірақ беж штифтсіз', text: 'Екінші саусақ — біріншісінің айнадағы бейнесі. Оны арқалық 5-тің екінші ұшындағы штифтке кигіз.' },
    { id: 'brace', title: 'Саусақтарды қосу', steps: '26-27', parts: 'Ұзын штифт, H пішінді жалғағыш', text: 'Ұзын штифт пен H пішінді жалғағыш саусақтарды байланыстырады: енді олар бірге қозғалады.' },
    { id: 'final', title: 'Моторды рамаға', steps: '28', parts: 'Құрастырылған қармауыш, мотор кабелі', text: 'Моторды раманың штифттеріне кигіз, ал кабельді F портына қос.' },
  ];
  const HOME = { fingerA: [AXIS_X, 0, -PIVOT_Z], fingerB: [AXIS_X, 0, PIVOT_Z] };
  const EXPLODE = { hub: [-7, 0, 0], frames: [0, 0, 0], motor: [7, 6, 0], linkage: [9, 0, 0], fingerA: [13, 0, -7], fingerB: [13, 0, 7], cable: [-1, 7, 0] };
  const ASSEMBLY = ['motor', 'linkage', 'fingerA', 'fingerB'];   // built apart from the frames until the last stage
  const ASSEMBLY_GAP = 5;
  const PALE = new T.Color('#cddae2');     // deep enough that a white part, like the cable, still stands out when focused
  const RING_OFF = '#ece3bd';

  // Everything merges as plain non-indexed triangles with normals.
  const solid = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const box = (w, h, d, r = 0.05, seg = 1) => solid(new T.RoundedBoxGeometry(w, h, d, seg, r));
  const brick = (w, h, d) => solid(new T.BoxGeometry(w, h, d));
  const cyl = (r, h, seg = 12) => solid(new T.CylinderGeometry(r, r, h, seg));
  const lathe = (pts, seg = 24) => solid(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg));
  const flat = (shape) => solid(new T.ShapeGeometry(shape, 4));
  const disc = (r, seg = 14) => solid(new T.CircleGeometry(r, seg));
  const ring = (a, b, seg = 14) => solid(new T.RingGeometry(a, b, seg));

  // Extruded along +Z from 0 to depth; the bevel stays inside the nominal outline.
  const extrude = (shape, depth, bevel = 0.04, curveSegments = 6) => {
    const g = new T.ExtrudeGeometry(shape, { depth: depth - bevel * 2, curveSegments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 });
    g.translate(0, 0, bevel);
    g.deleteAttribute('uv');
    return toCreasedNormals(g, 0.6);
  };
  // Same, from a plan drawn in the X-Z plane, standing on y0.
  const plan = (shape, y0, h, bevel, curveSegments) => extrude(shape, h, bevel, curveSegments).rotateX(Q).translate(0, y0 + h, 0);

  const rrect = (x0, y0, x1, y1, r) => {
    const s = new T.Shape();
    s.absarc(x1 - r, y0 + r, r, -Q, 0);
    s.absarc(x1 - r, y1 - r, r, 0, Q);
    s.absarc(x0 + r, y1 - r, r, Q, 2 * Q);
    s.absarc(x0 + r, y0 + r, r, 2 * Q, 3 * Q);
    s.closePath();
    return s;
  };
  // Liftarm outline around a centre line; with c it bends at b, round outside and sharp inside.
  const beamShape = (a, b, c, r = 0.49) => {
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const s = new T.Shape();
    s.absarc(a[0], a[1], r, t1 + Q, t1 + 3 * Q);
    if (c) {
      const t2 = Math.atan2(c[1] - b[1], c[0] - b[0]), m = polar((t1 + t2) / 2 + Q, r / Math.cos((t2 - t1) / 2));
      s.absarc(b[0], b[1], r, t1 - Q, t2 - Q);
      s.absarc(c[0], c[1], r, t2 - Q, t2 + Q);
      s.lineTo(b[0] + m[0], b[1] + m[1]);
    } else s.absarc(b[0], b[1], r, t1 - Q, t1 + Q);
    s.closePath();
    return s;
  };
  const addHole = (shape, x, y, r = 0.38) => { const p = new T.Path(); p.absarc(x, y, r, 0, TAU, true); shape.holes.push(p); };
  const crossShape = (r, w) => {
    const s = new T.Shape();
    [[w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w], [-w, -r], [w, -r]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  };
  const cog = (r, root, teeth, skew) => {
    const s = new T.Shape(), step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step + skew * step;
      [[root, -0.5], [root, -0.32], [r, -0.26], [r, 0.26], [root, 0.32], [root, 0.5]].forEach(([q, k]) => {
        const [x, y] = polar(a + k * step * 0.5, q);
        if (i || k > -0.5) s.lineTo(x, y); else s.moveTo(x, y);
      });
    }
    s.closePath();
    return s;
  };

  const FACES = { '+x': [1, 0, 0, 0, Q, 0], '-x': [-1, 0, 0, 0, -Q, 0], '+y': [0, 1, 0, -Q, 0, 0], '-y': [0, -1, 0, Q, 0, 0], '+z': [0, 0, 1, 0, 0, 0], '-z': [0, 0, -1, 0, Math.PI, 0] };

  function buildKit() {
    const plastic = (color, roughness = 0.35) => new T.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.35 });
    // Holes carry a darker tone of their part so they read as depth without ambient occlusion.
    const M = {
      azure: plastic('#01adc4'), magenta: plastic('#c92e85'), yellow: plastic('#fed920'), white: plastic('#eceded'),
      black: plastic('#16151a'), grey: plastic('#a9b0b5'), tan: plastic('#c9b27c'), rubber: plastic('#17171b', 0.75),
      dark: plastic('#2a2d33', 0.6), plate: plastic('#d9dcde', 0.5),
      azureRim: plastic('#018da1', 0.5), azureHole: plastic('#02505e', 0.7),
      magentaRim: plastic('#8f1c5d', 0.5), magentaHole: plastic('#4d0a33', 0.7),
      yellowRim: plastic('#e8bb12', 0.5), yellowHole: plastic('#a87d05', 0.7),
      whiteRim: plastic('#d5d8da', 0.5), whiteHole: plastic('#7f868b', 0.7),
      greyRim: plastic('#7c848a', 0.5), greyHole: plastic('#3d4347', 0.7),
      blackHole: plastic('#050506', 0.8), battery: plastic('#f4ce14'), plug: plastic('#e6e2d6', 0.5),
      led: new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
      ledWindow: new T.MeshBasicMaterial({ color: '#3b4a54' }),
    };

    const RIM = ring(0.27, 0.38), CORE = disc(0.27);
    const dimple = (add, rim, core, x, y, z, face) => {
      const [nx, ny, nz, ...rot] = FACES[face], o = 0.006;
      add(rim, RIM, x + nx * o, y + ny * o, z + nz * o, ...rot);
      add(core, CORE, x + nx * o, y + ny * o, z + nz * o, ...rot);
    };
    const BORE = lathe([[0.38, -0.42], [0.285, -0.42], [0.285, 0.42], [0.38, 0.42]], 14);     // thickness 1, along Y
    const PIN = lathe([[0.24, -1], [0.24, -0.08], [0.31, -0.08], [0.31, 0.08], [0.24, 0.08], [0.24, 1]], 10);     // black Technic pin, length 2

    const piece = (name, part, stage, from, fill) => {
      const lists = new Map();
      fill((mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
        const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(1, 1, 1));
        if (!lists.has(mat)) lists.set(mat, []);
        lists.get(mat).push(g.clone().applyMatrix4(m));
      });
      return { name, part, stage, from, meshes: [...lists].map(([mat, list]) => ({ mat, geo: mergeGeometries(list) })) };
    };

    /* ---------- Hub ---------- */
    const hub = piece('hub', 'hub', 0, [-2, 9, 0], (add) => {
      add(M.yellow, box(11, 7, 3.15, 0.28, 2), -5.5, 3.5, -0.425);
      add(M.white, extrude(rrect(-11, 0, 0, 7, 0.62), 1, 0.1, 4), 0, 0, 1);
      add(M.battery, box(9.4, 5.4, 0.1, 0.04), -5.5, 3.5, -2.03);
      // Corner posts, seats of the buttons, the faint marks on the plate.
      for (const x of [-10.35, -0.65]) for (const y of [0.65, 6.35]) {
        add(M.grey, cyl(0.42, 0.08, 16), x, y, 2.01, Q);
        add(M.greyRim, disc(0.2, 10), x, y, 2.056);
      }
      add(M.plate, flat(rrect(-2.45, 0.8, -0.95, 6.2, 0.74)), 0, 0, 2.004);
      add(M.plate, disc(1.34, 32), -1.7, 3.5, 2.006);
      add(M.grey, ring(0.52, 0.62, 24), -9.6, 5.5, 2.006);
      add(M.white, lathe([[0.52, 0], [0.5, 0.05], [0, 0.05]], 20), -9.6, 5.5, 2, Q);
            add(M.plate, flat(rrect(-10.15, 1.35, -9.05, 2.45, 0.08)), 0, 0, 2.004);
      // Ports: three sockets on each long side, F nearest the +X end of the +Y side.
      for (const x of [-7.6, -5.4, -3.2]) for (const [y, ny] of [[7, 1], [0, -1]]) {
        add(M.dark, brick(1.5, 0.1, 0.5), x, y + ny * 0.02, 1.04);
        add(M.greyHole, brick(1.2, 0.1, 0.18), x, y + ny * 0.05, 1.04);
      }
      // Pin holes along the yellow sides: an L at each end. The hole grid sits one module in from the edges.
      for (const [y, face] of [[7, '+y'], [0, '-y']]) {
        for (const x of [-1, -10]) for (const z of [0.5, -0.5, -1.5]) dimple(add, M.yellowRim, M.yellowHole, x, y, z, face);
        for (const x of [-3, -8]) dimple(add, M.yellowRim, M.yellowHole, x, y, -1.5, face);
        add(M.yellowRim, brick(2.8, 0.03, 0.9), -5.5, y, -1.5);
        for (let i = 0; i < 5; i++) add(M.yellowHole, brick(0.16, 0.05, 0.56), -6.1 + i * 0.3, y, -1.5);
      }
      // Both ends: speaker and pin holes.
      for (const [x, face] of [[0, '+x'], [-11, '-x']]) {
        add(M.dark, disc(0.92, 24), x + (face === '+x' ? 0.006 : -0.006), 3.5, -0.3, 0, face === '+x' ? Q : -Q);
        for (const y of [1.5, 5.5]) for (const z of [1, 0, -1]) dimple(add, M.yellowRim, M.yellowHole, x, y, z, face);
      }
    });
    const hubPins = piece('hubPins', 'frames', 0, [5, 0, 0], (add) => {
      for (const y of [1.5, 5.5]) for (const z of [1, -1]) add(M.black, PIN, 0, y, z, 0, 0, Q);
    });

    /* ---------- Frames ---------- */
    // A 7×11 frame alternates face holes with windows onto the bores that run across the rail.
    const cells = [];
    for (let i = 0; i < 11; i++) for (const y of [0.5, 6.5]) cells.push({ x: i + 0.5, y, face: i % 2 === 0, along: 'x' });
    for (let j = 1; j < 6; j++) for (const x of [0.5, 10.5]) cells.push({ x, y: j + 0.5, face: j % 2 === 0, along: 'y' });
    const frameShape = rrect(0, 0, 11, 7, 0.5);
    const opening = new T.Path();
    [[1.08, 1], [9.92, 1], [10, 1.08], [10, 5.92], [9.92, 6], [1.08, 6], [1, 5.92], [1, 1.08]].forEach(([x, y], i) => (i ? opening.lineTo(x, y) : opening.moveTo(x, y)));
    opening.closePath();
    frameShape.holes.push(opening);
    cells.forEach(({ x, y, face, along }) => {
      if (face) return addHole(frameShape, x, y);
      const w = (along === 'x' ? 0.56 : 0.62) / 2, h = (along === 'x' ? 0.62 : 0.56) / 2, p = new T.Path();
      p.moveTo(x - w, y - h); p.lineTo(x + w, y - h); p.lineTo(x + w, y + h); p.lineTo(x - w, y + h); p.closePath();
      frameShape.holes.push(p);
    });
    const FRAME = extrude(frameShape, 1, 0.045, 7).translate(0, 0, -0.5);
    const PLUG_X = brick(0.54, 0.6, 0.66), PLUG_Y = brick(0.6, 0.54, 0.66);

    const frames = piece('frames', 'frames', 1, [8, 2, 0], (add) => {
      for (const z of [1, -1]) {
        add(M.magenta, FRAME, 0, 0, z);
        cells.forEach(({ x, y, face, along }) => {
          if (face) return add(M.magentaHole, BORE, x, y, z, Q);
          const pinned = x === 0.5 ? y !== 3.5 : x === 10.5 && y === 3.5;       // the pins of the hub and the motor show through these windows
          add(pinned ? M.black : M.magentaHole, along === 'x' ? PLUG_X : PLUG_Y, x, y, z);
          for (const s of [1, -1]) {
            if (along === 'x') dimple(add, M.magentaRim, M.magentaHole, x, y + s * 0.5, z, s > 0 ? '+y' : '-y');
            else dimple(add, M.magentaRim, M.magentaHole, x + s * 0.5, y, z, s > 0 ? '+x' : '-x');
          }
        });
      }
      // Grey connector in the gap; its pins fill two holes of the bottom rails.
      add(M.grey, box(3, 0.92, 0.98, 0.1), 7.5, 0.5, 0);
      for (const x of [6.5, 8.5]) add(M.grey, cyl(0.285, 2.84, 12), x, 0.5, 0, Q);
    });
    const motorPins = piece('motorPins', 'frames', 1, [5, 0, 0], (add) => {
      for (const z of [1, -1]) add(M.black, PIN, 11, 3.5, z, 0, 0, Q);
    });

    /* ---------- Motor ---------- */
    const nose = (y0, h) => {
      const s = new T.Shape();
      s.moveTo(15.2, -1.5);
      s.lineTo(18.4, -1.5);          // absarc only joins from a previous curve, not from a bare moveTo
      s.absarc(18.4, -0.9, 0.6, -Q, 0);
      s.absarc(18.4, 0.9, 0.6, 0, Q);
      s.lineTo(15.2, 1.5);
      s.closePath();
      return plan(s, y0, h, 0.045, 3);
    };
    const motor = piece('motor', 'motor', 2, [0, 9, 0], (add) => {
      add(M.azure, box(4.3, 3, 3, 0.1, 2), 13.15, 3.5, 0);
      add(M.white, nose(2, 1.05));
      add(M.white, nose(3.05, 1.95));
      for (const [z, face] of [[1.5, '+z'], [-1.5, '-z']]) {
        for (const x of [16.5, 18.2]) {
          for (const y of [2.55, 4.45]) dimple(add, M.whiteRim, M.whiteHole, x, y, z, face);
          add(M.whiteRim, brick(0.42, 0.16, 0.01), x, 3.6, z);
        }
        for (const y of [2.5, 4.5]) dimple(add, M.azureRim, M.azureHole, 11.75, y, z, face);
        add(M.azureRim, brick(0.42, 1.1, 0.01), 11.75, 3.5, z);
      }
      dimple(add, M.azureRim, M.azureHole, 11.75, 5, -0.9, '+y');
      add(M.dark, disc(0.28, 12), 11, 3.5, 0, 0, -Q, 0);
    });
    const rotor = piece('rotor', 'motor', 2, [0, 3, 0], (add) => {
      add(M.azureRim, lathe([[1.46, 0], [1.46, 0.06]], 40), 0, 5, 0);
      add(M.azure, lathe([[1.5, 0.06], [1.5, 0.36], [1.42, 0.46], [0, 0.46]], 40), 0, 5, 0);
      for (let i = 0; i < 4; i++) {
        const [x, z] = polar(12 * DEG + i * Q, 0.82);
        add(M.azureHole, disc(0.25, 12), x, 5.465, z, -Q);
      }
      add(M.azureHole, flat(crossShape(0.27, 0.09)), 0, 5.465, 0, -Q);
    });

    /* ---------- Linkage ---------- */
    const beamHoles = (shape, pts) => { pts.forEach(([x, y]) => addHole(shape, x, y)); return shape; };
    const BEAM5 = plan(beamHoles(beamShape([0, -2], [0, 2]), [-2, -1, 0, 1, 2].map((z) => [0, z])), 1, 1, 0.04, 7);
    const beam = piece('beam', 'linkage', 2, [0, -6, 0], (add) => {
      add(M.magenta, BEAM5, AXIS_X);
      for (const z of [-2, -1, 0, 1, 2]) add(M.magentaHole, BORE, AXIS_X, 1.5, z);
      for (const z of [-2, 2]) add(M.black, PIN, AXIS_X, 1, z);
      for (const z of [-1, 1]) add(M.black, PIN, AXIS_X, 2, z);
    });
    const CRANK = plan(beamHoles(beamShape([0, 0], [1, 0]), [[1, 0]]), 0, 1, 0.04, 7);
    const crank = piece('crank', 'linkage', 2, [0, -6, 0], (add) => {
      add(M.azure, CRANK);
      add(M.azureHole, BORE, 1, 0.5, 0);
      add(M.yellow, extrude(crossShape(0.27, 0.09), 3.4, 0, 1).rotateX(Q), 0, 3.5, 0);
      add(M.tan, lathe([[0.24, 0.06], [0.24, 1.9], [0, 1.9]], 10), 1, 0, 0);
    });
    const LINK = plan(beamHoles(beamShape([0, 0], [LINK_L, 0], null, 0.42), [[0, 0], [LINK_L, 0]]), 1.05, 0.9, 0.04, 7);
    const link = piece('link', 'linkage', 2, [0, -6, 0], (add) => add(M.white, LINK));
    // H-shaped connector. Its origin is the long pin in hole 5 of finger B; the opposite corner takes the tan pin of finger A.
    const arm3 = plan(beamHoles(beamShape([-2, 0], [0, 0]), [[-2, 0], [-1, 0], [0, 0]]), -1, 1, 0.04, 7);
    const brace = piece('brace', 'linkage', 5, [0, -7, 0], (add) => {
      for (const z of [0, -4]) {
        add(M.grey, arm3, 0, 0, z);
        for (const x of [0, -1, -2]) add(M.greyHole, BORE, x, -0.5, z);
      }
      add(M.grey, box(0.94, 0.72, 3.2, 0.06), -1, -0.5, -2);
      add(M.black, cyl(0.25, 3, 10), 0, 0.5, 0);
    });

    /* ---------- Fingers ---------- */
    const finger = (name, part, stage, from) => piece(name, part, stage, from, (add) => {
      const armShape = beamShape(hole(7), hole(4), hole(1));
      [1, 2, 3, 4, 5, 6, 7].forEach((n) => addHole(armShape, ...hole(n)));
      add(M.black, plan(armShape, 0, 1, 0.04, 7));
      [2, 3, 4, 5, 6, 7].forEach((n) => add(M.blackHole, BORE, hole(n)[0], 0.5, hole(n)[1]));
      const c = [AXLE[0] + db[0], AXLE[1] + db[1]], at = (u, v) => [c[0] + u * db[0] - v * db[1], c[1] + u * db[1] + v * db[0]];
      add(M.magenta, box(4, 1.2, 2, 0.05), c[0], 1.6, c[1], 0, -BRICK);
      for (const u of [-1.5, -0.5, 0.5, 1.5]) for (const v of [-0.5, 0.5]) {
        const [x, z] = at(u, v);
        add(M.magenta, cyl(0.3, 0.2, 12), x, 2.3, z);
      }
      const dome = lathe([[0.8, 2.2], [0.8, 2.58], [0.95, 2.6], [0.95, 2.84], [0.88, 2.92], [0, 2.92]], 24);
      const axle = extrude(crossShape(0.21, 0.08), 3, 0, 1).rotateX(Q);
      for (const u of [-1, 1]) {
        const [x, z] = at(u, 0);
        add(M.black, dome, x, 0, z);
        add(M.yellow, axle, x, 3.03, z);
      }
      // The tyre lies flat on the table, under the far end of the brick: two staggered rows of tread around a light hub.
      const [tx, tz] = TYRE;
      [0, 0.5].forEach((skew, i) => {
        const s = cog(TYRE_R, TYRE_R - 0.17, 26, skew);
        addHole(s, 0, 0, 1);
        add(M.rubber, plan(s, i * 0.5, 0.5, 0, 1), tx, 0, tz);
      });
      add(M.grey, lathe([[0, 0.2], [0.7, 0.2], [0.82, 0.04], [1.02, 0.04], [1.02, 0.96], [0.82, 0.96], [0.7, 0.8], [0, 0.8]], 24), tx, 0, tz);
    });
    const fingerA = finger('fingerA', 'fingerA', 3, [2, 0, 7]);
    const fingerB = finger('fingerB', 'fingerB', 4, [2, 0, 7]);
    const tanPin = piece('tanPin', 'fingerA', 3, [2, 0, 7], (add) => {
      const [x, z] = hole(7);
      add(M.tan, cyl(0.25, 2.04, 10), x, 0, z);
    });

    /* ---------- Cable ---------- */
    const cable = piece('cable', 'cable', 6, [0, 7, 0], (add) => {
      const pts = [[-3.2, 7.5, 0.92], [-3.3, 8.2, 0.85], [-2.4, 8.85, 0.65], [0, 9.2, 0.25], [2.3, 9.6, 0], [4.1, 9.4, 0], [5, 8.4, 0], [5.1, 6.9, 0], [4, 5.4, 0], [2.5, 4.4, 0], [2.1, 3.1, 0],
        [2.6, 1.9, 0], [4.2, 1.2, 0], [6.5, 1.18, 0], [8.4, 1.4, 0], [9.9, 2.3, 0], [10.6, 3.2, 0], [11.3, 3.5, 0]];
      const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p)), false, 'centripetal');
      const N = 120, W = 0.43, H = 0.045, pos = [], idx = [];
      const t = new T.Vector3(), w = new T.Vector3(), n = new T.Vector3(), p = new T.Vector3();
      for (let i = 0; i <= N; i++) {
        curve.getPointAt(i / N, p);
        curve.getTangentAt(i / N, t);
        w.set(0, 0, 1).addScaledVector(t, -t.z).normalize();
        n.crossVectors(t, w);
        for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) pos.push(p.x + w.x * W * a + n.x * H * b, p.y + w.y * W * a + n.y * H * b, p.z + w.z * W * a + n.z * H * b);
        if (i < N) for (let k = 0; k < 4; k++) {
          const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      add(M.white, toCreasedNormals(g, 0.7));
      add(M.plug, box(1.9, 0.8, 1.2, 0.14, 2), -3.2, 7.36, 0.86);
    });

    /* ---------- Per-instance hub parts share these ---------- */
    const quads = [], order = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = LED_X + (r - 2) * LED_PITCH, y = 3.5 + (c - 2) * LED_PITCH, s = LED_PITCH * 0.33, i = quads.length / 3;
      quads.push(x - s, y - s, 2.012, x + s, y - s, 2.012, x + s, y + s, 2.012, x - s, y + s, 2.012);
      order.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    const pill = (y0, y1) => extrude(rrect(-2.32, y0, -1.08, y1, 0.6), 0.12, 0.03, 4).translate(0, 0, 2);
    const arrow = (y, s) => { const a = new T.Shape(); a.moveTo(-1.95, y); a.lineTo(-1.45, y); a.lineTo(-1.7, y + s * 0.32); a.closePath(); return flat(a); };
    return {
      M,
      pieces: [hub, hubPins, frames, motorPins, motor, rotor, beam, crank, link, fingerA, tanPin, fingerB, brace, cable],
      ledPos: new T.Float32BufferAttribute(quads, 3), ledIndex: order,
      ledWindow: flat(rrect(LED_X - 2.3, 1.2, LED_X + 2.3, 5.8, 0.25)).translate(0, 0, 2.008),
      left: pill(0.9, 3.6), right: pill(3.4, 6.1), arrows: mergeGeometries([arrow(1.55, -1), arrow(5.45, 1)].map((g) => g.translate(0, 0, 2.123))),
      center: lathe([[1, 0], [0.99, 0.2], [0.86, 0.3], [0, 0.32]], 32).rotateX(Q).translate(-1.7, 3.5, 2),
      lightRing: ring(1.04, 1.22, 48).translate(-1.7, 3.5, 2.012),
    };
  }

  let KIT = null;

  RA.createRoboarm = () => {
    const K = KIT || (KIT = buildKit());
    const group = new T.Group();
    const parts = {}, pieces = {}, fade = {}, clones = {};
    PARTS.forEach(({ id }) => { group.add((parts[id] = new T.Group())); fade[id] = 0; clones[id] = new Map(); });
    parts.fingerA.scale.z = -1;       // mirror image of finger B, same geometry

    const mesh = (geo, mat, into) => {
      const m = new T.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      m.userData.base = mat;
      into.add(m);
      return m;
    };
    K.pieces.forEach((p) => {
      const g = new T.Group();
      p.meshes.forEach(({ geo, mat }) => mesh(geo, mat, g));
      parts[p.part].add(g);
      pieces[p.name] = { stage: p.stage, from: new T.Vector3(...p.from), base: new T.Vector3(), group: g };
    });
    parts.cable.traverse((o) => { o.receiveShadow = false; });     // a ribbon this thin only collects shadow acne
    pieces.rotor.base.set(AXIS_X, 0, 0);
    pieces.crank.base.set(AXIS_X, 0, 0);

    // The hub's buttons, ring and LEDs belong to this instance.
    const hubGroup = pieces.hub.group;
    const hubButtons = { left: mesh(K.left, K.M.white, hubGroup), right: mesh(K.right, K.M.white, hubGroup), center: mesh(K.center, K.M.white, hubGroup) };
    mesh(K.arrows, K.M.greyRim, hubGroup);
    const lightMat = new T.MeshBasicMaterial({ color: RING_OFF });
    hubGroup.add(new T.Mesh(K.lightRing, lightMat));
    const ledGeo = new T.BufferGeometry();
    ledGeo.setAttribute('position', K.ledPos);
    ledGeo.setIndex(K.ledIndex);
    ledGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(25 * 4 * 4), 4));
    const led = new T.Mesh(ledGeo, K.M.led);
    led.visible = false;
    led.renderOrder = 1;
    const ledWindow = new T.Mesh(K.ledWindow, K.M.ledWindow);
    ledWindow.visible = false;
    hubGroup.add(ledWindow, led);
    const setMatrix = (arr) => {
      const c = ledGeo.attributes.color;
      let any = false;
      for (let i = 0; i < 25; i++) {
        const a = arr ? clamp(arr[i] || 0, 0, 100) / 100 : 0;
        any = any || a > 0;
        for (let k = 0; k < 4; k++) c.setXYZW(i * 4 + k, 1, 1, 1, a);
      }
      c.needsUpdate = true;
      led.visible = ledWindow.visible = any;
    };
    const setCenterLight = (css) => { lightMat.color.set(css || RING_OFF); };

    const gripPoint = new T.Object3D();
    group.add(gripPoint);

    let angle = 0, buildN = STAGES.length - 1, buildT = 1, exploded = 0, focus = null;

    const setAngle = (deg) => {
      angle = clamp(deg, -GRIP_TRAVEL, 0);
      const th = thetaAt(angle), a = LEG1 + th;
      parts.fingerB.rotation.y = -th;
      parts.fingerA.rotation.y = th;
      gripPoint.position.set(AXIS_X + TYRE_L * Math.cos(TYRE_A + th), 0.5, 0);
      pieces.rotor.group.rotation.y = -angle * DEG;
      const crankAngle = (45 + angle) * DEG;
      pieces.crank.group.rotation.y = -crankAngle;
      // Crank pin -> link -> hole 5 of finger B -> H connector -> hole 7 of finger A.
      const [cx, cz] = polar(crankAngle), [bx, bz] = polar(a);
      const B5 = [AXIS_X + bx, PIVOT_Z + bz], A7 = [AXIS_X - bx, -PIVOT_Z + bz], C = [AXIS_X + cx, cz];
      pieces.link.base.set(B5[0], 0, B5[1]);
      pieces.link.group.rotation.y = -Math.atan2(C[1] - B5[1], C[0] - B5[0]);
      pieces.link.group.scale.x = Math.hypot(C[0] - B5[0], C[1] - B5[1]) / LINK_L;
      pieces.brace.base.set(B5[0], 0, B5[1]);
      pieces.brace.group.rotation.y = Math.atan2(-4, -2) - Math.atan2(A7[1] - B5[1], A7[0] - B5[0]);
      layout();
    };

    const layout = () => {
      const apart = buildN < 6 ? 1 : 1 - smooth(buildT);
      PARTS.forEach(({ id }) => {
        const h = HOME[id] || [0, 0, 0], e = EXPLODE[id];
        parts[id].position.set(h[0] + e[0] * exploded + (ASSEMBLY.includes(id) ? ASSEMBLY_GAP * apart : 0), h[1] + e[1] * exploded, h[2] + e[2] * exploded);
      });
      Object.values(pieces).forEach((p) => {
        p.group.visible = p.stage <= buildN;
        p.group.position.copy(p.base).addScaledVector(p.from, p.stage === buildN ? 1 - smooth(buildT) : 0);
      });
    };

    const paint = (id) => {
      const f = fade[id];
      parts[id].traverse((m) => {
        const base = m.userData.base;
        if (!base) return;
        if (!f) { m.material = base; return; }
        if (!clones[id].has(base)) clones[id].set(base, base.clone());      // private to this instance, so two arms never fade each other
        m.material = clones[id].get(base);
        m.material.color.copy(base.color).lerp(PALE, f * 0.9);
      });
    };

    setAngle(0);
    return {
      group, parts, PARTS, STAGES, GRIP_TRAVEL, gripPoint, hubButtons, setAngle, setMatrix, setCenterLight,
      setGrip: (t) => setAngle(-clamp(t, 0, 1) * GRIP_TRAVEL),
      tipGap: () => 2 * (PIVOT_Z + TYRE_L * Math.sin(TYRE_A + thetaAt(angle)) - TYRE_R),
      angleForGap: (w) => -GRIP_TRAVEL * (THETA_OPEN - thetaForGap(clamp(w, 0, OPEN_GAP))) / (THETA_OPEN - THETA_CLOSED),
      highlight: (id) => { focus = id; },
      setExplode: (t) => { exploded = clamp(t, 0, 1); layout(); },
      setBuildStage: (n, t) => { buildN = clamp(n, 0, STAGES.length - 1); buildT = clamp(t, 0, 1); layout(); },
      update(dt) {
        PARTS.forEach(({ id }) => {
          const goal = focus && focus !== id ? 1 : 0;
          if (fade[id] === goal) return;
          const step = RA.reducedMotion ? 1 : dt * 5;
          fade[id] = goal > fade[id] ? Math.min(goal, fade[id] + step) : Math.max(goal, fade[id] - step);
          paint(id);
        });
      },
    };
  };
})();
