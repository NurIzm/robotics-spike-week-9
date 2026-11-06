// The lesson: comparison of arms, degrees of freedom, scrollytelling, build stepper, quiz.
// Two 3D stages at most, each built on first sight and running only while it is on screen.
(function () {
  const RA = window.RA, T = THREE, { $, $$ } = RA;
  const live = !RA.reducedMotion;
  const DEG = Math.PI / 180;

  const PAIRS = {
    shoulder: ['Иық пен негіз', 'бүкіл қолды ұстап тұрады.'],
    elbow: ['Шынтақ пен шарнир', 'қолды ортасынан бүгеді.'],
    wrist: ['Білезік пен шарнир', 'қол басын немесе қармауышты затқа қарай бұрады.'],
    hand: ['Қол басы мен қармауыш', 'затты алып, ұстап тұрады.'],
    muscle: ['Бұлшықет пен моторлар', 'күш беріп, қолды қозғайды.'],
    nerve: ['Жүйке мен сымдар', 'командаларды жеткізіп, жауапты кері әкеледі.'],
    brain: ['Ми мен контроллер', 'шешім қабылдайды.'],
  };

  // The last pick stays lit: on a touch screen, or with the teacher talking, there is no hover to hold.
  function initPairs(root) {
    const box = $('#les-pair', root), cap = $('#les-pair-cap', box);
    const show = (id) => {
      $$('[data-pair]', box).forEach((el) => el.classList.toggle('is-on', el.dataset.pair === id));
      cap.innerHTML = `<b>${PAIRS[id][0]}</b> ${PAIRS[id][1]}`;
    };
    const pick = (e) => { const el = e.target.closest('[data-pair]'); if (el) show(el.dataset.pair); };
    box.addEventListener('pointerover', pick);
    box.addEventListener('focusin', pick);
    show('hand');
  }

  /* ---------- Degrees of freedom ---------- */
  const LINK = [130, 104, 74], BASE = [320, 372], HOME = [-24, 62, 44], LIMIT = [80, 130, 100], TOP = 386;
  const NOTES = ['', 'Бір еркіндік дәрежесі. Қолдың ұшы тек доға бойымен жүреді.', 'Екі еркіндік дәрежесі. Енді ұшы тұтас аймаққа жетеді.', 'Үш еркіндік дәрежесі. Аймақ кеңірек, ал затқа әртүрлі бұрышпен жақындауға болады.'];

  const joints = (a) => {
    let x = BASE[0], y = BASE[1], th = 0;
    const pts = [[x, y]];
    a.forEach((d, i) => {
      th += d * DEG;
      x += LINK[i] * Math.sin(th);
      y -= LINK[i] * Math.cos(th);
      pts.push([x, y]);
    });
    return pts;
  };

  function initDof(root) {
    const box = $('#les-dof', root), sliders = $$('[data-joint]', box), rings = $$('#les-dof-joints circle', box);
    const armPath = $('#les-dof-arm', box), tip = $('#les-dof-tip', box), reachPath = $('#les-dof-reach', box), note = $('#les-dof-note', box);
    const angles = HOME.slice();
    let n = 1;

    // Every tip position for the working joints, as one path of round dots. The locked joints stay at home.
    const reach = () => {
      const step = [3, 7, 12][n - 1];
      let d = '';
      const walk = (i, a) => {
        if (i === n) {
          const [x, y] = joints(a).pop();
          if (y < TOP) d += `M${Math.round(x)} ${Math.round(y)}h0`;
          return;
        }
        for (let v = -LIMIT[i]; v <= LIMIT[i]; v += step) { a[i] = v; walk(i + 1, a); }
      };
      walk(0, HOME.slice());
      reachPath.setAttribute('d', d);
      reachPath.style.strokeWidth = [7, 13, 21][n - 1];
    };
    const draw = () => {
      const pts = joints(angles);
      armPath.setAttribute('d', 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L'));
      rings.forEach((c, i) => { c.setAttribute('cx', pts[i][0]); c.setAttribute('cy', pts[i][1]); c.classList.toggle('is-on', i < n); });
      tip.setAttribute('cx', pts[3][0]);
      tip.setAttribute('cy', pts[3][1]);
    };
    const setCount = (count) => {
      n = count;
      sliders.forEach((s, i) => {
        s.disabled = i >= n;
        if (i >= n) { angles[i] = HOME[i]; s.value = HOME[i]; }
      });
      note.textContent = NOTES[n];
      reach();
      draw();
    };
    sliders.forEach((s, i) => {
      s.value = HOME[i];
      s.addEventListener('input', () => { angles[i] = +s.value; draw(); });
    });
    box.addEventListener('change', (e) => { if (e.target.name === 'les-dof-n') setCount(+e.target.value); });
    setCount(1);
  }

  /* ---------- 3D helpers ---------- */
  function shadowCatcher() {
    const m = new T.Mesh(new T.PlaneGeometry(240, 240), new T.ShadowMaterial({ opacity: 0.16 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.02;
    m.receiveShadow = true;
    return m;
  }

  // A 2×4 brick, long side along X, standing on the table.
  function makeBrick() {
    const mat = new T.MeshStandardMaterial({ color: '#fed920', roughness: 0.35, envMapIntensity: 0.35 });   // the kit's plastic
    const g = new T.Group(), stud = new T.CylinderGeometry(0.3, 0.3, 0.2, 14);
    g.add(new T.Mesh(new T.RoundedBoxGeometry(4, 2.4, 2, 2, 0.06), mat));
    for (const x of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-0.5, 0.5]) {
      const s = new T.Mesh(stud, mat);
      s.position.set(x, 1.3, z);
      g.add(s);
    }
    g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
    g.position.y = 1.2;
    return g;
  }

  /* ---------- Scrollytelling ---------- */
  const BRICK_W = 2;
  const FACE = [0, 0, 0, 0, 0, 0, 100, 0, 100, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 100, 0, 100, 100, 100, 0];
  // aim: what the camera looks at; size: half of the view at that point, in modules.
  const SHOTS = {
    intro: { aim: [8.5, 2.5, 0], az: 0.62, el: 0.5, size: 18 },
    hub: { aim: [-5.5, 3.5, 1], az: -0.32, el: 0.62, size: 7.4, part: 'hub', lit: true },
    frames: { aim: [5.5, 3.5, 0], az: 0.42, el: 0.5, size: 7.4, part: 'frames' },
    motor: { aim: [15, 3.8, 0], az: 0.62, el: 0.72, size: 5.6, part: 'motor', swing: true },
    linkage: { aim: [20, -0.4, 0], az: 0.62, el: 0.86, size: 8.6, part: 'linkage', lever: true, flip: true },
    fingers: { aim: [21, 1.6, 0], az: 0.8, el: 0.72, size: 7.6, part: 'fingerA', brick: true },
    cable: { aim: [3.6, 5, 0], az: -0.42, el: 0.74, size: 10, part: 'cable', pulse: true },
  };
  // The ribbon's centre line, as in robot.js, for the signals that run along it.
  const CABLE = [[-3.2, 7.5, 0.92], [-3.3, 8.2, 0.85], [-2.4, 8.85, 0.65], [0, 9.2, 0.25], [2.3, 9.6, 0], [4.1, 9.4, 0], [5, 8.4, 0], [5.1, 6.9, 0], [4, 5.4, 0], [2.5, 4.4, 0], [2.1, 3.1, 0],
    [2.6, 1.9, 0], [4.2, 1.2, 0], [6.5, 1.18, 0], [8.4, 1.4, 0], [9.9, 2.3, 0], [10.6, 3.2, 0], [11.3, 3.5, 0]];
  const PULSES = 5;

  function makePulses() {
    const curve = new T.CatmullRomCurve3(CABLE.map((p) => new T.Vector3(...p)), false, 'centripetal');
    const ball = new T.SphereGeometry(0.24, 12, 8), g = new T.Group();
    const dots = ['#c92e85', '#00788c'].flatMap((color, back) => {
      const mat = new T.MeshBasicMaterial({ color });
      return Array.from({ length: PULSES }, (_, i) => {
        const m = new T.Mesh(ball, mat);
        g.add(m);
        return { m, u: (i + back / 2) / PULSES, back };
      });
    });
    g.place = (t) => dots.forEach((d) => {
      const u = (d.u + t * 0.09) % 1;
      curve.getPointAt(d.back ? 1 - u : u, d.m.position);
    });
    g.place(0);
    return g;
  }

  function makeStory(root, flow) {
    const stage = RA.stage($('#les-story-stage', root), { fov: 20, controls: false, maxDpr: 1.5 });
    const arm = RA.createRoboarm(), brick = makeBrick(), pulses = makePulses();
    stage.scene.add(arm.group, brick, pulses, shadowCatcher());
    const hold = arm.angleForGap(BRICK_W);
    arm.setAngle(hold);
    brick.position.x = arm.gripPoint.position.x;
    arm.setAngle(0);

    const tan = Math.tan((stage.camera.fov * DEG) / 2);
    const range = $('#les-grip-range', root), lever = $('#les-lever', root);
    const eye = new T.Vector3(), aim = new T.Vector3(), wantEye = new T.Vector3(), wantAim = new T.Vector3();
    const fingerB = [];
    arm.parts.fingerB.traverse((m) => { if (m.userData.base) fingerB.push(m); });
    let shot = SHOTS.intro, angle = 0, lift = 0, flip = 0, since = 0, snap = true, touched = false;
    range.addEventListener('input', () => { touched = true; });

    flow.go = (name) => {
      shot = SHOTS[name];
      since = 0;
      arm.highlight(shot.part || null);
      arm.setMatrix(shot.lit ? FACE : null);
      arm.setCenterLight(shot.lit ? '#00adc4' : null);
      fingerB.forEach((m) => { if (m.userData.pale) { m.material = m.userData.pale; m.userData.pale = null; } });
    };
    flow.go(flow.step);

    stage.frame((dt, t) => {
      since += dt;
      const k = snap || !live ? 1 : 1 - Math.exp(-dt * 3.4);
      snap = false;
      const dist = shot.size / (tan * Math.min(1, stage.camera.aspect));
      wantAim.set(...shot.aim);
      wantEye.set(Math.sin(shot.az) * Math.cos(shot.el), Math.sin(shot.el), Math.cos(shot.az) * Math.cos(shot.el)).multiplyScalar(dist).add(wantAim);
      eye.lerp(wantEye, k);
      aim.lerp(wantAim, k);
      stage.camera.position.copy(eye);
      stage.camera.lookAt(aim);

      let goal = 0, up = 0;
      if (shot.swing && live) goal = -45 - 40 * Math.sin(t * 1.3);
      if (shot.lever) {
        // The slider moves by itself until someone takes it, so the class sees what it does.
        if (live && !touched) range.value = 45 - 45 * Math.cos(t * 0.9);
        goal = -range.value;
        lever.style.setProperty('--a', 26 - (52 * range.value) / 90);
      }
      if (shot.brick) {
        goal = hold;
        if (live && since > 1.6) up = 2.6 * (1 - Math.cos((since - 1.6) * 1.2)) / 2;
      }
      angle += (goal - angle) * Math.min(1, k * 2);
      arm.setAngle(angle);
      lift += (up - lift) * Math.min(1, k * 2);
      arm.group.position.y = lift;
      brick.position.y = 1.2 + lift;
      // The levers sit under the motor: turn the model over, as the official instructions do, so the light stays on them.
      flip += ((shot.flip ? 1 : 0) - flip) * k;
      arm.group.rotation.x = flip * Math.PI;
      brick.visible = !!shot.brick && flip < 0.02;
      pulses.visible = !!shot.pulse && flip < 0.02;
      if (shot.pulse && live) pulses.place(t);
      arm.update(dt);
      // ponytail: highlight() takes one part and this step shows both fingers, so finger B is put back in its own colours through robot.js internals. Drop this if highlight() ever takes a list.
      if (shot.brick) fingerB.forEach((m) => { if (m.material !== m.userData.base) { m.userData.pale = m.material; m.material = m.userData.base; } });
    });
    return stage;
  }

  function initFlow(root) {
    const steps = $$('.les-step', root), flow = { step: 'intro', go() {} };
    steps[0].classList.add('is-now');
    // A line a little under the middle of the screen: on a phone the model covers the top.
    const io = new IntersectionObserver((list) => list.forEach((e) => {
      if (!e.isIntersecting) return;
      steps.forEach((s) => s.classList.toggle('is-now', s === e.target));
      flow.step = e.target.dataset.step;
      flow.go(flow.step);
    }), { rootMargin: '-60% 0px -39% 0px' });
    steps.forEach((s) => io.observe(s));
    return flow;
  }

  /* ---------- Build stepper ---------- */
  // What each stage must keep in view along the arm: centre and half-width, in modules.
  const VIEWS = [[-5, 12], [0.5, 13], [6.5, 19.5], [9, 23], [9, 23], [9, 23], [6.5, 20]], WIDE = [9.5, 31];

  function makeBuild(root) {
    const stage = RA.stage($('#les-build-stage', root), { fov: 20, maxDpr: 1.5, camera: [38, 42, 92], target: [6, 2, 0] });
    const arm = RA.createRoboarm();
    stage.scene.add(arm.group, shadowCatcher());
    const c = stage.controls, tan = Math.tan((stage.camera.fov * DEG) / 2);
    if (c) {
      c.enableZoom = false;      // the wheel must keep scrolling the page
      stage.renderer.domElement.style.touchAction = 'pan-y';
    }
    const rail = $('#les-rail', root), prev = $('#les-stage-prev', root), next = $('#les-stage-next', root), explode = $('#les-explode', root);
    const last = arm.STAGES.length - 1, plays = live && !!stage.renderer;
    rail.innerHTML = arm.STAGES.map((s, i) => {
      const [a, b] = s.steps.split('-').map(Number), n = (b || a) - a + 1, range = s.steps.replace('-', '–');
      return `<li style="flex:${n} 1 0"><button type="button" data-stage="${i}" aria-label="${i + 1}-кезең: ${s.title}, ${range}-${n > 1 ? 'қадамдар' : 'қадам'}">${'<i></i>'.repeat(n)}</button><span>${range}</span></li>`;
    }).join('');
    const items = [...rail.children];
    let n = 0, tween = 1, spread = 0, half = VIEWS[0][1], snap = true;

    const show = (i, animate) => {
      n = i;
      tween = animate && plays ? 0 : 1;
      arm.setBuildStage(n, tween);
      const s = arm.STAGES[n];
      $('#les-stage-n', root).textContent = `${n + 1}-кезең, барлығы ${last + 1}.`;
      $('#les-stage-steps', root).textContent = `Қолданбадағы ${s.steps.replace('-', '–')}-${s.steps.includes('-') ? 'қадамдар' : 'қадам'}`;
      $('#les-stage-title', root).textContent = s.title;
      $('#les-stage-text', root).textContent = s.text;
      $('#les-stage-parts', root).textContent = s.parts;
      items.forEach((li, k) => {
        li.classList.toggle('is-done', k < n);
        li.classList.toggle('is-now', k === n);
        if (k === n) li.firstChild.setAttribute('aria-current', 'step');
        else li.firstChild.removeAttribute('aria-current');
      });
      prev.disabled = n === 0;
      next.disabled = n === last;
    };
    const unpack = (v) => { spread = v; explode.value = v * 100; arm.setExplode(v); };

    rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-stage]');
      if (b) { unpack(0); show(+b.dataset.stage, true); }
    });
    prev.addEventListener('click', () => { unpack(0); show(n - 1, true); });
    next.addEventListener('click', () => { unpack(0); show(n + 1, true); });
    // Taking a model apart starts from the whole model.
    explode.addEventListener('input', () => {
      if (n !== last) show(last, false);
      spread = explode.value / 100;
      arm.setExplode(spread);
    });
    show(0, false);

    stage.frame((dt) => {
      if (tween < 1) {
        tween = Math.min(1, tween + dt / 0.9);
        arm.setBuildStage(n, tween);
      }
      if (c) {
        const k = snap || !live ? 1 : 1 - Math.exp(-dt * 3), [x, w] = VIEWS[n];
        const dx = (x + (WIDE[0] - x) * spread - c.target.x) * k;
        snap = false;
        half += (w + (WIDE[1] - w) * spread - half) * k;
        c.target.x += dx;
        stage.camera.position.x += dx;
        stage.camera.position.sub(c.target).setLength(Math.max(half / stage.camera.aspect, half * 0.56) / tan).add(c.target);
      }
      arm.update(dt);
    });
    return stage;
  }

  /* ---------- Quiz ---------- */
  const QUIZ = [
    { q: 'Манипулятордың қай бөлігі бұлшықет сияқты жұмыс істейді?', a: ['Сымдар', 'Моторлар', 'Шарнирлер'], ok: 1, why: 'Моторлар күш беріп, қолды қозғайды. Сымдар жүйкеге, ал шарнирлер буынға ұқсайды.' },
    { q: 'Шикі жұмыртқаларды тасу керек. Қай қармауыш ең қолайлы?', a: ['Жұмсақ', 'Магнитті', 'Қатты саусақтар'], ok: 0, why: 'Жұмсақ саусақтар жұмыртқаны құшақтап, абайлап ұстайды. Магнит жұмыртқаны тартпайды, ал қатты саусақтар оны сындырып алуы мүмкін.' },
    { q: 'Робот-қолдың саусақтарындағы резеңке шина неге керек?', a: ['Модель жүре алуы үшін', 'Саусақтар ауырырақ болуы үшін', 'Резеңке үйкеліс береді, текше сырғымайды'], ok: 2, why: 'Мұнда шиналар дөңгелек ретінде жұмыс істемейді. Резеңке текшеге жабысып, оны ұстап тұрады.' },
    { q: 'Робот-қолдың неше еркіндік дәрежесі бар?', a: ['Бір', 'Үш', 'Жеті'], ok: 0, why: 'Жалғыз мотор саусақтарды тек қысады және ашады. Қалғанын адамның қолы істейді.' },
    { q: 'Фермадағы робот піскен алманы камерамен өзі тауып, үзіп алды. Бұл қалай аталады?', a: ['Қолмен басқару', 'Автономия', 'Датчиксіз бағдарлама'], ok: 1, why: 'Робот датчикпен өзі қарап, қай алманы алатынын өзі шешті. Бұл — автономия.' },
  ];
  const VERDICT = ['Сабаққа қайта оралып, тағы бір рет байқап көр.', 'Сабаққа қайта оралып, тағы бір рет байқап көр.', 'Жаман емес. Қате кеткен бөлімдерге қайта оралып, тағы бір рет байқап көр.', 'Жақсы. Аз ғана қалды.', 'Тамаша, бәрі дерлік дұрыс.', 'Тамаша, бәрі дұрыс.'];

  function initQuiz(root) {
    const box = $('#les-quiz-box', root), pins = $('#les-quiz-pins', root), lastLine = $('#les-quiz-last', root);
    let i = 0, marks = [];
    const paintPins = () => {
      pins.innerHTML = QUIZ.map((q, k) => `<i class="${k in marks ? (marks[k] ? 'is-right' : 'is-wrong') : k === i ? 'is-now' : ''}"></i>`).join('');
      pins.setAttribute('aria-label', `${QUIZ.length} сұрақтан ${marks.filter(Boolean).length} дұрыс жауап`);
    };
    const paintLast = () => {
      const past = RA.store.get('lessonQuiz', null);
      lastLine.textContent = past ? `Алдыңғы нәтиже: ${past.total} сұрақтан ${past.score}` : '';
    };
    const ask = () => {
      const q = QUIZ[i];
      box.innerHTML = `<div class="les-quiz__ask"><p class="les-quiz__q">${q.q}</p><p class="les-quiz__why" aria-live="polite"></p><div class="les-quiz__foot"></div></div>
        <div class="les-opts">${q.a.map((a, k) => `<button type="button" class="les-opt" data-a="${k}">${a}</button>`).join('')}</div>`;
      paintLast();
      paintPins();
    };
    const answer = (k) => {
      const q = QUIZ[i], right = k === q.ok;
      marks[i] = right;
      $$('.les-opt', box).forEach((b, n) => {
        b.disabled = true;
        if (n === q.ok) b.classList.add('is-right');
        else if (n === k) b.classList.add('is-wrong');
      });
      $('.les-quiz__why', box).innerHTML = `<b>${right ? 'Дұрыс.' : 'Олай емес.'}</b> ${q.why}`;
      $('.les-quiz__foot', box).innerHTML = `<button type="button" class="btn" data-next>${i < QUIZ.length - 1 ? 'Келесі сұрақ' : 'Нәтижені көру'}</button>`;
      $('[data-next]', box).focus({ preventScroll: true });
      paintPins();
    };
    const finish = () => {
      const score = marks.filter(Boolean).length;
      RA.store.set('lessonQuiz', { score, total: QUIZ.length });
      RA.progress.mark('lesson');
      lastLine.textContent = '';
      box.innerHTML = `<div class="les-quiz__end"><p class="les-quiz__score">${score} / ${QUIZ.length}</p><p class="les-quiz__q">${VERDICT[score]}</p>
        <div class="les-quiz__foot"><a class="btn" href="#examples">Әрі қарай: өмірде</a><button type="button" class="btn" data-again>Қайта өту</button></div></div>`;
      paintPins();
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a) answer(+b.dataset.a);
      else if ('next' in b.dataset) { i += 1; if (i < QUIZ.length) ask(); else finish(); }
      else if ('again' in b.dataset) { i = 0; marks = []; ask(); }
    });
    ask();
  }

  /* ---------- View ---------- */
  let active = false;
  const syncs = [];

  // Builds its 3D on first sight, then runs only while it is both on screen and in the current view.
  function watch(el, make) {
    let stage = null, seen = false;
    const sync = () => {
      if (seen && active && !stage) stage = make();
      if (!stage) return;
      if (seen && active) stage.start();
      else stage.stop();
    };
    // The top bar covers the first 64px, and a box that merely touches the edge still counts: hence 65.
    new IntersectionObserver((list) => { seen = list[list.length - 1].isIntersecting; sync(); }, { rootMargin: '-65px 0px 0px' }).observe(el);
    syncs.push(sync);
  }

  RA.view('lesson', {
    init(root) {
      initPairs(root);
      initDof(root);
      initQuiz(root);
      const flow = initFlow(root);
      watch($('#les-story-stage', root), () => makeStory(root, flow));
      watch($('#les-build-stage', root), () => makeBuild(root));
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-to]');
        if (b) $('#' + b.dataset.to).scrollIntoView({ behavior: live ? 'smooth' : 'auto' });
      });
      if (live) {
        const io = new IntersectionObserver((list) => list.forEach((e) => e.target.classList.toggle('is-live', e.isIntersecting)));
        $$('[data-anim]', root).forEach((el) => io.observe(el));
      }
    },
    enter() { active = true; syncs.forEach((s) => s()); },
    leave() { active = false; syncs.forEach((s) => s()); },
  });
})();
