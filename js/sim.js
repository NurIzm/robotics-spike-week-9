// The simulator: a table, six bricks and the hub behind sim.hw, which is all the VM ever touches.
// The real Роборука has no shoulder: motor F only works the fingers and the student's hand carries the rest. Here too.
(function () {
  const RA = window.RA;
  const T = THREE;
  const Q = Math.PI / 2;
  const clamp = T.MathUtils.clamp;
  const overlap = (a, ra, b, rb) => Math.max(0, Math.min(a + ra, b + rb) - Math.max(a - ra, b - rb));
  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const sleep = (sec) => new Promise((res) => setTimeout(res, sec * 1000));

  const STEP = 1 / 120, MAX_FRAME = 1;        // physics runs on real time: a slow PC gets a choppy arm, not a slow one
  const MAX_SPEED = 600, ACCEL = 6000;        // °/s at 100 %, °/s². With this ramp the official 0.2 s opens the whole grip travel
  const STALL_END = 0.4, START_POSE = -45;
  const GRAVITY = 160, SLIDE = 11;            // modules/s², slower than real so a drop can be followed
  const BRICK_W = 2, BRICK_H = 2.4, STUD = 0.2, MIN_LAND = 0.4;
  const REACH = 23;                           // where along the arm the tyres meet a brick: the guide ring shows this spot
  const TYRE_D = 3.3, FINGER_H = 2.9;
  const NUDGE = 1.2;                          // a tyre that comes down this little on a brick pushes it aside instead of stopping
  const KEY_SPEED = 16, HAND_SPEED = 70;      // modules/s
  const HAND = { x: [-19, 5], y: [1, 18], z: [-23, 23], home: [-6.5, 6, 0] };
  const TABLE = { x: 34, z: 33 };
  const ZONES = { A: { x0: 7, x1: 26, z0: 2, z1: 27, colour: '#00788c', letter: 'А' }, B: { x0: 7, x1: 26, z0: -27, z1: -2, colour: '#c92e85', letter: 'Б' } };
  const START = [[12, 5], [21, 5], [12, 14], [21, 14], [12, 23], [21, 23]];
  const COLOURS = ['#e8352e', '#1f6fe0', '#25a84f', '#ff8a1f', '#ffd21f', '#8a4fd8'];
  const ORIENT = { upright: 0, right: 1, upsidedown: 2, left: 3 };
  const SCROLL_MS = 90;
  const FOV = 24, AIM = [3, 3, 0], VIEW = [0.4, 0.74, 0.64], FIT_U = 36, FIT_V = 36;     // half sizes of the play area as the camera sees it

  // Synthesised: the kit's recordings are not ours to ship. Parts are [wave, from Hz, to Hz, seconds]; no wave is a pause.
  const SOUNDS = {
    'Cat Meow 1': [['sawtooth', 430, 800, 0.22], ['sawtooth', 800, 380, 0.4]],
    'Dog Bark 1': [['square', 340, 160, 0.13], [null, 0, 0, 0.07], ['square', 320, 150, 0.17]],
    Laser: [['square', 1800, 180, 0.4]],
    Hello: [['triangle', 300, 430, 0.17], ['triangle', 430, 260, 0.3]],
    Applause: [['noise', 0, 0, 1.2]],
  };

  function createSound(onBeep) {
    let ctx = null, main = null, panner = null, volume = 100, tone = null;
    const effects = { pitch: 0, pan: 0 };
    const voices = new Set();
    const apply = () => {
      if (!ctx) return;
      main.gain.value = (volume / 100) * 0.25;
      panner.pan.value = clamp(effects.pan, -100, 100) / 100;
    };
    const rate = () => 2 ** (clamp(effects.pitch, -360, 360) / 120);     // 10 is one semitone, as in Scratch
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const fade = (at, dur) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.01);
      g.gain.setValueAtTime(1, at + Math.max(0.01, dur - 0.03));
      g.gain.linearRampToValueAtTime(0, at + dur);
      g.connect(main);
      return g;
    };
    const voice = (node, out) => {
      voices.add(node);
      node.onended = () => voices.delete(node);
      node.connect(out);
    };
    const noise = (at, dur) => {
      const n = ctx.createBufferSource();
      n.buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      n.buffer.getChannelData(0).forEach((v, i, a) => { a[i] = (Math.random() - 0.5) * 0.7; });
      voice(n, fade(at, dur));
      n.start(at);
    };
    const osc = (type, f0, f1, at, dur) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0 * rate(), at);
      o.frequency.exponentialRampToValueAtTime(f1 * rate(), at + dur);
      voice(o, fade(at, dur));
      o.start(at);
      o.stop(at + dur);
    };
    const play = (parts) => {
      if (!ctx) return;
      let at = ctx.currentTime;
      parts.forEach(([wave, f0, f1, dur]) => {
        if (wave === 'noise') noise(at, dur);
        else if (wave) osc(wave, f0, f1, at, dur);
        at += dur;
      });
    };
    const silence = () => { voices.forEach((v) => v.stop()); voices.clear(); tone = null; };
    return {
      // Browsers only open audio from a user gesture: Play and the hub's buttons call this.
      unlock() {
        if (!ctx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          ctx = new Ctx();
          main = ctx.createGain();
          panner = ctx.createStereoPanner();
          main.connect(panner).connect(ctx.destination);
          apply();
        }
        ctx.resume();
      },
      beep(midi, sec) {
        onBeep();
        play([['square', hz(midi), hz(midi), Math.max(0.05, sec)]]);
        return sleep(sec);
      },
      beepStart(midi) {
        onBeep();
        if (tone) tone.stop();
        if (!ctx) return;
        tone = ctx.createOscillator();
        tone.type = 'square';
        tone.frequency.value = hz(midi) * rate();
        voice(tone, main);
        tone.start();
      },
      stop: silence,
      play(name, untilDone) {
        const parts = SOUNDS[name] || SOUNDS.Laser;
        play(parts);
        return untilDone ? sleep(parts.reduce((sum, p) => sum + p[3], 0)) : Promise.resolve();
      },
      get volume() { return volume; },
      set volume(v) { volume = clamp(v, 0, 100); apply(); },
      setEffect(name, val) { effects[name] = val; apply(); },
      changeEffect(name, delta) { effects[name] += delta; apply(); },
      clearEffects() { effects.pitch = effects.pan = 0; apply(); },
    };
  }

  // Any alphabet, no font table: the browser draws each letter and its columns are read back for the 5×5 screen.
  function textColumns(text) {
    const SIZE = 12, c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true }), cols = [];
    c.width = SIZE;
    c.height = 7;
    g.font = '7px Arial, sans-serif';
    for (const letter of text) {
      g.clearRect(0, 0, SIZE, 7);
      g.fillText(letter, 1, 6);
      const data = g.getImageData(0, 0, SIZE, 7).data, glyph = [];
      for (let x = 0; x < SIZE; x++) {
        const col = [1, 2, 3, 4, 5].map((y) => data[(y * SIZE + x) * 4 + 3] > 70);
        if (col.some(Boolean)) glyph.push(col);
      }
      cols.push(...(glyph.length ? glyph : [[], []]), []);
    }
    return cols;
  }

  function tableMesh() {
    const S = 14, W = TABLE.x * 2, D = TABLE.z * 2, c = document.createElement('canvas');
    c.width = W * S;
    c.height = D * S;
    const g = c.getContext('2d'), px = (x) => (x + TABLE.x) * S, pz = (z) => (z + TABLE.z) * S;
    g.fillStyle = '#f8fafb';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#e4ebef';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = -32; x < TABLE.x; x += 8) { g.moveTo(px(x), 0); g.lineTo(px(x), c.height); }
    for (let z = -32; z < TABLE.z; z += 8) { g.moveTo(0, pz(z)); g.lineTo(c.width, pz(z)); }
    g.stroke();
    Object.values(ZONES).forEach((o) => {
      const x = px(o.x0), y = pz(o.z0), w = (o.x1 - o.x0) * S, h = (o.z1 - o.z0) * S;
      g.fillStyle = o.colour + '1c';
      g.fillRect(x, y, w, h);
      g.strokeStyle = o.colour;
      g.lineWidth = 5;
      g.setLineDash([26, 16]);
      g.strokeRect(x, y, w, h);
      g.setLineDash([]);
      g.fillStyle = o.colour;
      g.font = `700 ${7 * S}px Unbounded, "Arial Black", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(o.letter, x - 4 * S, y + h / 2);
    });
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 8;
    const top = new T.Mesh(new T.PlaneGeometry(W, D).rotateX(-Q), new T.MeshStandardMaterial({ map, roughness: 0.75, envMapIntensity: 0.5 }));
    top.receiveShadow = true;
    const edge = new T.Mesh(new T.BoxGeometry(W, 1.4, D).translate(0, -0.71, 0), new T.MeshStandardMaterial({ color: '#c7d3da', roughness: 0.7 }));
    return new T.Group().add(top, edge);
  }

  function brickGeometry() {
    const solid = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
    const parts = [solid(new T.RoundedBoxGeometry(4, BRICK_H, BRICK_W, 1, 0.06))];
    for (const x of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-0.5, 0.5]) {
      parts.push(solid(new T.CylinderGeometry(0.3, 0.3, STUD, 12)).translate(x, BRICK_H / 2 + STUD / 2, z));
    }
    return T.BufferGeometryUtils.mergeGeometries(parts);
  }

  RA.createSim = (container) => {
    const stage = RA.stage(container, { fov: FOV, target: AIM, camera: AIM.map((v, i) => v + VIEW[i] * 130), shadowBox: 50 });
    const { scene, camera } = stage;
    const arm = RA.createRoboarm();
    const TRAVEL = arm.GRIP_TRAVEL;

    const guideMat = new T.MeshBasicMaterial({ color: '#00788c', transparent: true, opacity: 0.55, depthWrite: false });
    const stem = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), guideMat);
    const ring = new T.Mesh(new T.RingGeometry(1.15, 1.5, 36).rotateX(-Q), guideMat);
    scene.add(arm.group, tableMesh(), stem, ring);

    const geo = brickGeometry();
    const bricks = COLOURS.map((color) => {
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color, roughness: 0.35, envMapIntensity: 0.35 }));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      return { mesh, axis: new T.Vector3(1, 0, 0), q0: new T.Quaternion() };
    });

    let time = 0, held = null, hold = null, shakeUntil = 0, listener = null;
    const buttons = { left: false, right: false };
    const hand = { x: 0, y: 0, z: 0 }, goal = { x: 0, y: 0, z: 0 }, input = { x: 0, y: 0, z: 0 };
    const emit = (e) => { if (listener) listener(e); };

    /* ---------- Motor F ---------- */
    const M = { pos: START_POSE, vel: 0, want: 0, mode: 'stop', speed: 0, goal: 0, until: 0, raw: false, pressing: 0, zero: 0, def: 75, low: -TRAVEL, done: null };
    const finish = () => { const d = M.done; M.done = null; if (d) d(); };
    // A new command interrupts the old one, whose promise then ends.
    const drive = (mode, o) => { finish(); Object.assign(M, { mode, until: 0, raw: false, pressing: 0 }, o); };
    const driveAsync = (mode, o) => { drive(mode, o); return new Promise((res) => { M.done = res; }); };
    const degS = (pct) => (clamp(pct, -100, 100) * MAX_SPEED) / 100;

    const motorStep = (dt) => {
      if (M.until && time >= M.until) drive('stop', {});
      let want = 0;
      if (M.mode === 'run') want = M.speed;
      if (M.mode === 'to') {
        const left = M.goal - M.pos;
        if (Math.abs(left) < 1.5) { M.pos = clamp(M.goal, M.low, 0); M.vel = 0; drive('stop', {}); }
        else want = Math.sign(left) * Math.min(M.speed, Math.sqrt(2 * ACCEL * Math.abs(left)));
      }
      M.want = want;
      if (want < 0) M.closing = true;
      M.vel += clamp(want - M.vel, -ACCEL * dt, ACCEL * dt);
      const free = M.pos + M.vel * dt, p = clamp(free, M.low, 0);
      if (p !== free) M.vel = 0;
      M.pressing = (p === 0 && want > 0) || (p === M.low && want < 0) ? M.pressing + dt : 0;
      M.pos = p;
      if (M.mode === 'to' && M.pressing >= STALL_END) drive('stop', {});
    };

    /* ---------- Bricks ---------- */
    const riders = (b) => bricks.filter((o) => o.on === b);
    const rides = (o, b) => o === b || (!!o.on && rides(o.on, b));
    const carried = (b) => !!held && rides(b, held);
    const area = (a, b) => overlap(a.x, 2, b.x, 2) * overlap(a.z, a.w / 2, b.z, b.w / 2);
    const shift = (b, dx, dy, dz) => {
      b.x += dx; b.y += dy; b.z += dz;
      riders(b).forEach((o) => shift(o, dx, dy, dz));
    };
    const gripX = () => hand.x + arm.gripPoint.position.x;

    // A tipped brick lands on its side or upside down, so its size across the tyres and its height can change.
    const tip = (b, sx, sz, from) => {
      riders(b).forEach((o) => tip(o, sx, sz));
      b.q0.premultiply(new T.Quaternion().setFromAxisAngle(b.axis, b.spinTo));
      b.axis.set(sz, 0, -sx);
      b.spin = 0;
      b.spinTo = sz ? Q : 2 * Q;
      if (sz) [b.w, b.h] = [b.h, b.w];
      Object.assign(b, { state: 'fall', on: null, skip: from || null, vx: sx * SLIDE, vy: 2, vz: sz * SLIDE });
      b.spinRate = (b.spinTo * GRAVITY) / (b.vy + Math.sqrt(b.vy * b.vy + 2 * GRAVITY * b.y + 1));
      emit({ type: 'topple' });
    };

    const brickBox = (b) => ({ x0: b.x - 2, x1: b.x + 2, y0: b.y, y1: b.y + b.h, z0: b.z - b.w / 2, z1: b.z + b.w / 2 });
    const armBoxes = () => {
      const { x, y, z } = hand, g = arm.tipGap() / 2, tx = gripX();
      const list = [
        { x0: x - 11, x1: x + 11, y0: y, y1: y + 7, z0: z - 2, z1: z + 2 },                  // hub and frames
        { x0: x + 11, x1: x + 19, y0: y + 2, y1: y + 5, z0: z - 1.5, z1: z + 1.5 },          // motor, free space under it
        { x0: x + 16.5, x1: x + 19, y0: y - 1, y1: y + 2, z0: z - 2.5, z1: z + 2.5 },        // levers under the motor head
        { x0: tx - TYRE_D / 2, x1: tx + TYRE_D / 2, y0: y, y1: y + FINGER_H, z0: z + g, z1: z + g + TYRE_D },
        { x0: tx - TYRE_D / 2, x1: tx + TYRE_D / 2, y0: y, y1: y + FINGER_H, z0: z - g - TYRE_D, z1: z - g },
      ];
      if (held) list.push(brickBox(held));
      return list;
    };

    // Whatever the arm runs into moves out of the way; a stacked brick that gets hit brings down all that stands on it.
    const shove = (c, b) => {
      if (b.state !== 'rest' || carried(b)) return;
      const ox = Math.min(c.x1, b.x + 2) - Math.max(c.x0, b.x - 2);
      const oz = Math.min(c.z1, b.z + b.w / 2) - Math.max(c.z0, b.z - b.w / 2);
      const oy = Math.min(c.y1, b.y + b.h) - Math.max(c.y0, b.y);
      if (ox <= 0 || oz <= 0 || oy <= 0.02) return;
      const sx = ox < oz ? (b.x < (c.x0 + c.x1) / 2 ? -1 : 1) : 0, sz = sx ? 0 : b.z < (c.z0 + c.z1) / 2 ? -1 : 1;
      if (b.on) return tip(b, sx, sz);
      riders(b).forEach((o) => tip(o, sx, sz));
      const nx = clamp(b.x + sx * ox, -TABLE.x + 2, TABLE.x - 2), nz = clamp(b.z + sz * oz, -TABLE.z + b.w / 2, TABLE.z - b.w / 2);
      shift(b, nx - b.x, 0, nz - b.z);
    };

    const under = (b, y0) => {
      let best = null;
      bricks.forEach((o) => {
        if (rides(o, b) || o === b.skip || o.state !== 'rest' || !area(o, b) || o.y + o.h > y0 + 0.01) return;
        if (!best || o.y + o.h > best.y + best.h) best = o;
      });
      return best;
    };

    const bricksStep = (dt) => {
      if (held) shift(held, gripX() + hold.x - held.x, hand.y + hold.y - held.y, hand.z + hold.z - held.z);
      bricks.forEach((b) => {
        b.spin = Math.min(b.spinTo, b.spin + b.spinRate * dt);
        if (b.state !== 'fall') return;
        const y0 = b.y;
        b.vy -= GRAVITY * dt;
        const nx = clamp(b.x + b.vx * dt, -TABLE.x + 2, TABLE.x - 2), nz = clamp(b.z + b.vz * dt, -TABLE.z + b.w / 2, TABLE.z - b.w / 2);
        shift(b, nx - b.x, b.vy * dt, nz - b.z);
        const s = under(b, y0), floor = s ? s.y + s.h : 0;
        if (b.y > floor) return;
        shift(b, 0, floor - b.y, 0);
        if (s && area(b, s) < MIN_LAND * 4 * b.w) {
          const dx = b.x - s.x, dz = b.z - s.z, alongX = Math.abs(dx) / 4 > Math.abs(dz) / b.w;
          return tip(b, alongX ? Math.sign(dx) || 1 : 0, alongX ? 0 : Math.sign(dz) || 1, s);
        }
        Object.assign(b, { state: 'rest', on: s, skip: null, vx: 0, vy: 0, vz: 0 });
      });
      const ground = bricks.filter((b) => b.state === 'rest' && !b.on && !carried(b));
      ground.forEach((a) => ground.forEach((b) => { if (a !== b) shove(brickBox(a), b); }));
    };

    /* ---------- Grip ---------- */
    const between = (gap) => bricks.find((b) => !carried(b)
      && Math.min(b.y + b.h, hand.y + 1) - Math.max(b.y, hand.y) > 0.2
      && Math.abs(b.x - gripX()) < 2.2 && Math.abs(b.z - hand.z) + b.w / 2 <= gap / 2 + 0.05);

    const grip = () => {
      if (held) {
        if (M.pos <= M.low + 1) return;
        Object.assign(held, { state: 'fall', vx: 0, vy: 0, vz: 0 });
        held = null;
      }
      const gap = arm.tipGap(), b = between(gap);
      M.low = b ? arm.angleForGap(b.w) : -TRAVEL;
      if (!b) return;
      // The closing tyres push the brick to the middle.
      const room = (gap - b.w) / 2;
      shift(b, 0, 0, clamp(b.z, hand.z - room, hand.z + room) - b.z);
      if (M.pos > M.low + 0.5) return;
      held = b;
      hold = { x: b.x - gripX(), y: b.y - hand.y, z: b.z - hand.z };
      Object.assign(b, { state: 'held', on: null, skip: null });
      emit({ type: 'grab' });
    };

    /* ---------- The hand that carries the arm ---------- */
    // The lowest the hand can go here: the table, or the top of a brick right below any part of the arm.
    const floor = () => {
      let y = HAND.y[0];
      armBoxes().forEach((c) => {
        const drop = hand.y - c.y0;
        y = Math.max(y, drop);
        bricks.forEach((b) => {
          const top = b.y + b.h + STUD;
          if (carried(b) || b.state !== 'rest' || top > c.y0 + 0.01) return;
          const ox = Math.min(c.x1, b.x + 2) - Math.max(c.x0, b.x - 2), oz = Math.min(c.z1, b.z + b.w / 2) - Math.max(c.z0, b.z - b.w / 2);
          if (ox > NUDGE && oz > NUDGE) y = Math.max(y, top + drop);
        });
      });
      return y;
    };

    const moveHand = (dt) => {
      ['x', 'y', 'z'].forEach((k) => { goal[k] = clamp(goal[k] + input[k] * KEY_SPEED * dt, HAND[k][0], HAND[k][1]); });
      const reach = HAND_SPEED * dt;
      hand.x += clamp(goal.x - hand.x, -reach, reach);
      hand.z += clamp(goal.z - hand.z, -reach, reach);
      const y = hand.y + clamp(goal.y - hand.y, -reach, reach);
      if (y < hand.y) {
        const f = floor();
        hand.y = Math.max(y, Math.min(f, hand.y));
        if (hand.y > y) goal.y = hand.y;
      } else hand.y = y;
      armBoxes().forEach((c) => bricks.forEach((b) => shove(c, b)));
    };

    const step = (dt) => {
      time += dt;
      moveHand(dt);
      grip();
      motorStep(dt);
      arm.setAngle(M.pos);
      bricksStep(dt);
    };

    /* ---------- Hub ---------- */
    const screen = new Array(25).fill(0);
    let turn = 0, bright = 100, scrolling = 0;
    const paint = () => {
      const px = new Array(25);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const [y, x] = [[r, c], [c, 4 - r], [4 - r, 4 - c], [4 - c, r]][turn];
        px[y * 5 + x] = (screen[r * 5 + c] * bright) / 100;
      }
      arm.setMatrix(px);
      emit({ type: 'display', px });
    };
    const sound = createSound(() => emit({ type: 'beep' }));
    const display = {
      setImage(arr) { scrolling++; arr.forEach((v, i) => { screen[i] = v; }); paint(); },
      clear() { scrolling++; screen.fill(0); paint(); },
      setPixel(x, y, pct) {
        if (x < 1 || x > 5 || y < 1 || y > 5) return;
        scrolling++;
        screen[(Math.round(y) - 1) * 5 + Math.round(x) - 1] = clamp(pct, 0, 100);
        paint();
      },
      setBrightness(pct) { bright = clamp(pct, 0, 100); paint(); },
      rotate(dir) { turn = (turn + dir + 4) % 4; paint(); },
      setOrientation(name) { turn = ORIENT[name] || 0; paint(); },
      scroll(text) {
        const run = ++scrolling, cols = textColumns(text.toUpperCase());
        return new Promise((done) => {
          let at = -5;
          const next = () => {
            if (run !== scrolling) return done();
            for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) screen[r * 5 + c] = cols[at + c] && cols[at + c][r] ? 100 : 0;
            paint();
            if (++at > cols.length) return done();
            setTimeout(next, SCROLL_MS);
          };
          next();
        });
      },
    };

    const hw = {
      ports: { A: null, B: null, C: null, D: null, E: null, F: 'motor' },
      motor: {
        run(pct, dir) { drive('run', { speed: degS(pct) * dir }); },
        runPower(pct) { drive('run', { speed: degS(pct), raw: true }); },
        stop() { drive('stop', {}); },
        runFor(deg, pct) {
          if (!pct) return Promise.resolve();
          return driveAsync('to', { goal: M.pos + deg * Math.sign(pct), speed: Math.abs(degS(pct)) });
        },
        runForSeconds(sec, pct, dir) { return driveAsync('run', { speed: degS(pct) * dir, until: time + sec }); },
        goTo(deg, mode, pct) {
          const d = wrap(deg) - wrap(M.pos);
          const turnBy = mode === 'clockwise' ? ((d % 360) + 360) % 360 : mode === 'counterclockwise' ? -(((-d % 360) + 360) % 360) : wrap(d);
          return hw.motor.runFor(turnBy, Math.abs(pct));
        },
        get position() { return wrap(Math.round(M.pos)); },
        get relative() { return Math.round(M.pos - M.zero); },
        set relative(v) { M.zero = M.pos - v; },
        get speedPct() { return Math.round(M.vel / 6); },
        get powerPct() { return Math.round(M.pressing && !M.raw ? Math.sign(M.want) * 100 : M.want / 6); },
        get defaultSpeed() { return M.def; },
        set defaultSpeed(v) { M.def = clamp(v, -100, 100); },
      },
      display,
      centerLight(css) { arm.setCenterLight(css); emit({ type: 'light', css }); },
      sound,
      sensors: {
        button: (side) => buttons[side],
        tilted: () => false,                                 // the hand keeps the arm level
        orientationUp: (name) => name === 'rightside',       // the hub stands on its long edge: its right side is up, as in the model
        gesture: (name) => name === 'shake' && time < shakeUntil,
        angle: () => 0,
        resetYaw() {},
      },
      onEvent(fn) { listener = fn; },
      reset() {
        hw.motor.stop();
        bright = 100;
        turn = 0;
        display.clear();
        hw.centerLight(null);
        sound.stop();
        sound.clearEffects();
        sound.volume = 100;
      },
    };

    const press = (side, on) => {
      if (buttons[side] === on) return;
      buttons[side] = on;
      if (on) sound.unlock();
      emit({ type: 'button', side, state: on ? 'pressed' : 'released' });
    };
    const shake = () => {
      shakeUntil = time + 0.5;
      emit({ type: 'gesture', name: 'shake' });
    };

    const resetTable = () => {
      held = null;
      bricks.forEach((b, i) => {
        Object.assign(b, { x: START[i][0], y: 0, z: START[i][1], w: BRICK_W, h: BRICK_H, on: null, skip: null, state: 'rest', vx: 0, vy: 0, vz: 0, spin: 0, spinTo: 0, spinRate: 0 });
        b.q0.identity();
      });
      ['x', 'y', 'z'].forEach((k, i) => { hand[k] = goal[k] = HAND.home[i]; });
      drive('stop', {});
      Object.assign(M, { pos: START_POSE, vel: 0, want: 0, low: -TRAVEL });
      arm.setAngle(M.pos);
      draw();
    };

    /* ---------- Picture ---------- */
    const surface = (x, z) => bricks.reduce((top, b) => {
      const inside = !carried(b) && b.state === 'rest' && Math.abs(b.x - x) < 2 && Math.abs(b.z - z) < b.w / 2;
      return inside ? Math.max(top, b.y + b.h) : top;
    }, 0);
    const draw = () => {
      const left = shakeUntil - time, wobble = left > 0 ? Math.sin(left * 44) * left : 0;
      arm.group.position.set(hand.x, hand.y + wobble * 0.5, hand.z + wobble);
      arm.hubButtons.left.position.z = buttons.left ? -0.08 : 0;
      arm.hubButtons.right.position.z = buttons.right ? -0.08 : 0;
      bricks.forEach((b) => {
        b.mesh.position.set(b.x, b.y + b.h / 2, b.z);
        if (carried(b)) { b.mesh.position.y += wobble * 0.5; b.mesh.position.z += wobble; }
        b.mesh.quaternion.setFromAxisAngle(b.axis, b.spin).multiply(b.q0);
      });
      const x = hand.x + REACH, s = surface(x, hand.z);
      ring.position.set(x, s + 0.04, hand.z);
      stem.position.set(x, s, hand.z);
      stem.scale.y = Math.max(0.01, hand.y + 0.5 - s);
    };

    let last = 0, ticker = 0, seen = null, running = false;
    const tick = () => {
      const now = performance.now();
      let left = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      for (; left > 1e-6; left -= STEP) step(Math.min(left, STEP));
      draw();
      if (sim.onTick) sim.onTick();
      if (stage.size !== seen && stage.controls) {
        seen = stage.size;
        const tan = Math.tan((camera.fov * Math.PI) / 360), d = Math.max(FIT_V, FIT_U / camera.aspect) / tan;
        camera.position.sub(stage.target).setLength(d).add(stage.target);
        stage.controls.minDistance = d * 0.35;
        stage.controls.maxDistance = d * 1.5;
      }
    };
    stage.frame(tick);
    // A resize wipes the canvas; drawing at once keeps the splitter drag from flickering.
    if (stage.renderer) new ResizeObserver(() => { if (running) stage.renderer.render(scene, camera); }).observe(container);

    /* ---------- Pointer on the 3D view ---------- */
    const el = stage.renderer && stage.renderer.domElement;
    if (el) {
      const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), p = new T.Vector3();
      const atPointer = (e) => {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        return ray.ray.intersectPlane(plane, p);
      };
      let pressed = null, drag = null;
      const end = () => {
        if (pressed) press(pressed, false);
        pressed = drag = null;
        stage.controls.enabled = true;
      };
      // Capture phase: this has to decide before OrbitControls starts an orbit.
      container.addEventListener('pointerdown', (e) => {
        if (e.target !== el || e.button !== 0) return;
        const hit = stage.pick(e, [arm.group]);
        if (!hit) return;
        stage.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        if (hit.object === arm.hubButtons.center) emit({ type: 'center' });
        else if (hit.object === arm.hubButtons.left) press((pressed = 'left'), true);
        else if (hit.object === arm.hubButtons.right) press((pressed = 'right'), true);
        else {
          plane.constant = -hit.point.y;
          drag = { x: hand.x - hit.point.x, z: hand.z - hit.point.z };
        }
      }, true);
      el.addEventListener('pointermove', (e) => {
        if (!drag || !atPointer(e)) return;
        goal.x = clamp(p.x + drag.x, HAND.x[0], HAND.x[1]);
        goal.z = clamp(p.z + drag.z, HAND.z[0], HAND.z[1]);
      });
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    const sim = {
      hw, stage, arm, bricks, hand, goal, input, motor: M, press, shake, resetTable, step, draw, onTick: null,
      get time() { return time; },
      get held() { return held; },
      inZone: (b, name) => { const z = ZONES[name]; return b.x > z.x0 && b.x < z.x1 && b.z > z.z0 && b.z < z.z1; },
      // Bricks lying still in zone B, the zone the tasks count.
      countB: () => bricks.filter((b) => b.state === 'rest' && !carried(b) && sim.inZone(b, 'B')).length,
      towerHeight() {
        const level = (b) => {
          if (b.state !== 'rest') return 0;
          if (!b.on) return sim.inZone(b, 'B') ? 1 : 0;
          const n = level(b.on);
          return n && n + 1;
        };
        return Math.max(...bricks.map(level));
      },
      start() {
        running = true;
        last = performance.now();
        stage.start();
        if (!el) ticker = setInterval(tick, 50);        // no WebGL: the blocks and the 2D hub still work
      },
      stop() {
        running = false;
        stage.stop();
        clearInterval(ticker);
      },
    };
    resetTable();
    return sim;
  };
})();
