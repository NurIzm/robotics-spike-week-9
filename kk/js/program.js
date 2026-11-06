// The program view: blocks on the left, the working model on the right, the four tasks on top.
(function () {
  const RA = window.RA;
  const { $, $$ } = RA;

  const PORT_F = '<value name="PORT"><shadow type="flippermotor_multiple-port-selector"><field name="field_flippermotor_multiple-port-selector">F</field></shadow></value>';
  const turn = (dir, next) => `<block type="flippermotor_motorTurnForDirection"><field name="DIRECTION">${dir}</field><field name="UNIT">seconds</field>${PORT_F}`
    + `<value name="VALUE"><shadow type="math_number"><field name="NUM">0.2</field></shadow></value>${next ? `<next>${next}</next>` : ''}</block>`;
  const BEEP = '<block type="flippersound_beepForTime"><value name="NOTE"><shadow type="note"><field name="NOTE">60</field></shadow></value>'
    + '<value name="DURATION"><shadow type="math_number"><field name="NUM">0.2</field></shadow></value></block>';
  const PICTURE = (next) => '<block type="flipperlight_lightDisplayImageOn"><value name="MATRIX"><shadow type="matrix"><field name="MATRIX">0101001010000001000101110</field></shadow></value>'
    + `<next><block type="control_wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">2</field></shadow></value><next>${next}</next></block></next></block>`;
  const AUTO_XML = `<xml><block type="flipperevents_whenProgramStarts" x="48" y="60"><next>${turn('counterclockwise', PICTURE(turn('clockwise', BEEP)))}</next></block></xml>`;

  const TASKS = [
    { title: 'Қолды сына', xml: () => RA.SOLUTION_XML, ready: 'Іске қосу батырмасын бас, сосын хабтың сол жақ батырмасын басып ұста да, жібер.',
      goal: 'Бағдарламаны іске қос. Хабтың сол жақ батырмасы қолды қысады, бірақ батырманы жібергенде қол қысулы күйінде қалады. Қол ашылуы үшін жетіспейтін блокты қос.',
      hint: 'Үшінші ішкі бағдарламаға біріншідегідей блок керек: F сағат тілімен 0.2 секунд айналдыру.' },
    { title: 'Текше\u00adлерді тасы', xml: () => RA.SOLUTION_XML, limit: 120, ready: '«Қолды сына» тапсырмасындағы бағдарламаны іске қос. Таймер бірінші текшені алғанда басталады.',
      goal: '2 минутта алты текшені тасы. Бір-бірден, А аймағынан Б аймағына.',
      hint: 'Сақинаны текшенің ортасына әкел, E пернесімен қолды түсір, пробелді басып ұста, Q пернесімен көтер. Б аймағының үстінде пробелді жібер.' },
    { title: 'Мұнара құрас\u00adтыр', xml: () => RA.SOLUTION_XML, limit: 180, ready: '«Қолды сына» тапсырмасындағы бағдарламаны іске қос. Таймер бірінші текшені алғанда басталады.',
      goal: '3 минутта Б аймағында текшелерді бірінің үстіне бірін барынша көп қой. Үш текшелі мұнара есептеледі. Құлап қалды ма? Қайта құрастыр.',
      hint: 'Қолды мұнарадан жоғары көтер, сақинаны үстіңгі текшеге әкел де, тек сосын жібер. Текше 40 %-дан аз бөлігімен тірелсе, сырғып түседі. Текшені түбіне дейін түсірсең, алдымен қолды Q пернесімен көтер, тек сосын әрі апар.' },
    { title: 'Қол өзі', xml: () => AUTO_XML, ready: 'Батырмалы екі ішкі бағдарламаны палитраға сүйреп апар, олар мұнда керек емес. Сосын іске қос та, хабқа тиме.',
      goal: 'Қол батырмасыз, бағдарлама бойынша жұмыс істейді. Іске қосқанда ол қысылады, хабта сурет жанады, 2 секундтан кейін қол ашылады да, сигнал естіледі.',
      hint: 'Алдымен «… батырма … кезде» ішкі бағдарламаларын палитраға апар. Сосын бәрін «бағдарлама іске қосылғанда» блогының астына жина. Сағат тіліне қарсы қол қысылады, сағат тілімен ашылады. Сурет «Жарық» бөлімінде, күту «Басқару» бөлімінде, сигнал «Дыбыс» бөлімінде.' },
  ];
  const AUTO_STEPS = ['Қол қысылды', 'Сурет', '2 секунд үзіліс', 'Қол ашылды', 'Дыбыс сигналы'];
  const AUTO_MISSING = ['Қол қысылмады: F моторы сағат тіліне қарсы айналуы керек.', 'Қол қысылғаннан кейін сурет жанбады.', 'Қол ашылмады.', 'Қол ашылмады.', 'Қол ашылғаннан кейін сигнал болмады.'];
  const CLOSED = -60, OPEN = -20, PAUSE = [1700, 3000], WATCH_MS = 1200;

  const MOVES = { ArrowLeft: '-x', KeyA: '-x', ArrowRight: '+x', KeyD: '+x', ArrowUp: '-z', KeyW: '-z', ArrowDown: '+z', KeyS: '+z', KeyQ: '+y', PageUp: '+y', KeyE: '-y', PageDown: '-y' };

  let root, sim, bl, vm, split;
  let task = 0;
  const round = { endsAt: 0, over: false, passed: false, best: 0, left: 0 };       // endsAt stays 0 until the first brick is taken
  const release = { pressed: false, low: 0, at: 0 };                // task 1 watches one press and release
  let auto = null;                                                  // task 4 watches one run
  let spaceHeld = false;
  const held = new Set();

  const say = (text, kind) => {
    const s = $('#task-status');
    s.textContent = text;
    s.dataset.kind = kind || '';
  };

  const solved = (i, text) => {
    say(text, 'ok');
    RA.toast(text, 'ok');
    const done = RA.store.get('program.tasks', {});
    if (done[i]) return;
    done[i] = true;
    RA.store.set('program.tasks', done);
    paintTabs();
    if (TASKS.every((t, n) => done[n])) RA.progress.mark('program');
  };

  const paintTabs = () => {
    const done = RA.store.get('program.tasks', {});
    $$('.tasks__tab').forEach((b, i) => {
      b.setAttribute('aria-pressed', i === task);
      b.classList.toggle('is-done', !!done[i]);
    });
  };

  const paintAuto = () => {
    $$('#task-steps li').forEach((li, i) => li.classList.toggle('is-on', !!auto && i < auto.step));
  };

  const newRound = () => {
    Object.assign(round, { endsAt: 0, over: false, passed: false, best: 0, left: TASKS[task].limit || 0 });
    Object.assign(release, { pressed: false, low: 0, at: 0 });
    auto = null;
    paintAuto();
    say(TASKS[task].ready);
  };

  const select = (i) => {
    task = i;
    RA.store.set('program.task', i);
    const t = TASKS[i];
    $('#task-goal').textContent = t.goal;
    $('#task-hint').textContent = t.hint;
    $('#task-hint').hidden = true;
    $('#task-hint-btn').setAttribute('aria-expanded', 'false');
    $('#task-steps').hidden = i !== 3;
    $('#prog-hud').hidden = !t.limit;
    paintTabs();
    vm.stop();
    sim.resetTable();
    newRound();
  };

  const clock = (sec) => {
    const s = Math.ceil(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // Timed tasks count what lies in zone B, not what was once there.
  const timed = (t) => {
    const count = task === 1 ? sim.countB() : sim.towerHeight();
    round.best = Math.max(round.best, count);
    if (!round.over) {
      round.left = round.endsAt ? Math.max(0, round.endsAt - sim.time) : t.limit;
      if (task === 1 && count === 6) {
        round.over = true;
        solved(1, `Алты текшенің бәрі Б аймағында! ${clock(round.left)} қалды.`);
      } else if (task === 2 && count >= 3 && !round.passed) {
        round.passed = true;
        solved(2, 'Үш текшелі мұнара тұр! Уақыт біткенше биіктете бер.');
      }
      if (!round.over && round.endsAt && !round.left) {
        round.over = true;
        if (task === 2 && round.passed) say(`Уақыт бітті. Ең биік мұнара: ${round.best}.`, 'ok');
        else say(task === 1 ? `Уақыт бітті: Б аймағында ${count} текше, ал керегі 6. «Үстелді қалпына келтіру» батырмасын басып, қайта байқап көр.` : 'Уақыт бітті, үш текшелі мұнара жоқ. «Үстелді қалпына келтіру» батырмасын басып, қайта байқап көр.', 'warn');
      }
    }
    $('#hud-time').textContent = clock(round.left);
    $('#hud-count').textContent = task === 1 ? `Б аймағында ${count} / 6` : `мұнара: ${count}`;
    $('#prog-hud').classList.toggle('is-low', !round.over && round.endsAt > 0 && round.left < 15);
  };

  const watchRelease = () => {
    const pos = sim.motor.pos;
    if (release.pressed) release.low = Math.min(release.low, pos);
    if (!release.at) return;
    if (release.low < -30 && pos > OPEN) {
      release.at = 0;
      if (task === 0) solved(0, 'Тамаша: батырманы жібергенде қол ашылады.');
    } else if (performance.now() - release.at > WATCH_MS) {
      release.at = 0;
      if (task && release.low >= -30) return;
      const text = release.low < -30 ? 'Қол қысулы күйінде қалды. «сол жақ батырма жіберілген кезде» блогының астына мотор блогын қос.' : 'Қол қысылмады. Екінші ішкі бағдарламаны тексер: F порты және қуат -100.';
      say(text, 'warn');
      RA.toast(text, 'warn');
    }
  };

  const watchAuto = () => {
    if (!auto) return;
    const pos = sim.motor.pos, a = auto;
    if (a.step === 0 && pos < CLOSED && sim.motor.closing) { a.step = 1; a.closed = pos; }
    if (a.step === 2) a.closed = Math.min(a.closed, pos);
    if (a.step === 2 && pos > a.closed + 8) {
      const pause = performance.now() - a.at;
      if (pause < PAUSE[0] || pause > PAUSE[1]) {
        auto = null;
        return say(pause < PAUSE[0] ? 'Қол тым ерте ашылды: 2 секунд үзіліс керек.' : 'Үзіліс 2 секундтан ұзақ болды.', 'warn');
      }
      a.step = 3;
    }
    if (a.step === 3 && pos > OPEN) a.step = 4;
    paintAuto();
  };

  const tick = () => {
    const m = sim.hw.motor;
    [['#read-angle', m.position], ['#read-speed', m.speedPct], ['#read-power', m.powerPct]].forEach(([sel, v]) => {
      const el = $(sel), text = String(v).replace('-', '−');
      if (el.textContent !== text) el.textContent = text;
    });
    const t = TASKS[task];
    if (task < 3) watchRelease();
    if (t.limit) timed(t);
    if (task === 3) watchAuto();
  };

  const play = () => {
    sim.hw.sound.unlock();
    vm.start();
  };
  const toggle = () => { if (vm.running) vm.stop(); else play(); };

  const onRun = (running) => {
    root.classList.toggle('is-running', running);
    if (task !== 3) return;
    if (running) {
      auto = { step: 0, at: 0, closed: 0, early: false };
      sim.motor.closing = false;        // a hand left closed by the last run does not count
      paintAuto();
      say('Қолды бақылап тұрмын. Нәтижені білу үшін тоқтату батырмасын бас.');
    } else if (auto) {
      const a = auto;
      auto = null;
      if (a.step < AUTO_STEPS.length) say(a.early ? 'Алдымен қол қысылады, сосын сурет жанады.' : AUTO_MISSING[a.step], 'warn');
    }
  };

  const leds = [];
  const onHw = (e) => {
    vm.dispatch(e);
    if (e.type === 'center') toggle();
    if (e.type === 'display') {
      e.px.forEach((v, i) => { leds[i].style.opacity = v / 100; });
      if (auto && e.px.some((v) => v > 0)) {
        if (auto.step === 0) auto.early = true;
        if (auto.step === 1) { auto.step = 2; auto.at = performance.now(); paintAuto(); }
      }
    }
    if (e.type === 'light') $('#hub-center').style.setProperty('--light', e.css);
    if (e.type === 'grab' && TASKS[task].limit && !round.endsAt && !round.over) {
      round.endsAt = sim.time + TASKS[task].limit;
      say('Уақыт басталды!');
    }
    if (e.type === 'topple' && task === 2 && !round.over) say('Құлады! Қайта құрастыр.', 'warn');
    if (e.type === 'beep' && auto && auto.step === 4) {
      auto.step = 5;
      paintAuto();
      if (auto.touched) say('Қол тапсырманы орындады, бірақ батырмаларға тиюге болмайды. Оларсыз тағы бір рет іске қос.', 'warn');
      else solved(3, 'Қол бәрін өзі, сенің бағдарламаң бойынша жасады. Бұл — «Бағдарлама» сатысы. Автономия үшін оған тағы датчик керек.');
      auto = null;
    }
    if (e.type === 'button') {
      $('#hub-' + e.side).classList.toggle('is-pressed', e.state === 'pressed');
      if (auto) auto.touched = true;
      if (!vm.running) {
        const noHat = !bl.workspace.getTopBlocks(false).some((b) => b.type === 'flipperevents_whenButton');
        if (e.state === 'pressed') RA.toast(task < 3 && noHat ? 'Бағдарламада «сол жақ батырма … кезде» блогы жоқ. «Шешімін көрсету» батырмасын бас.' : 'Бағдарлама іске қосылмаған. Дөңгелек іске қосу батырмасын бас.');
      } else if (task < 3 && e.side === 'left') {
        if (e.state === 'pressed') Object.assign(release, { pressed: true, low: sim.motor.pos, at: 0, t0: performance.now() });
        else if (release.pressed) {
          const quick = performance.now() - release.t0 < 300;
          Object.assign(release, { pressed: false, at: quick ? 0 : performance.now() });
          if (quick && !task) say('Батырманы ұстап тұру керек: бас, бір секунд күт те, жібер.', 'warn');
        }
      }
    }
  };

  // Text fields, menus and dialogs own the keyboard while they are open.
  const typing = () => {
    const a = document.activeElement;
    return (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || Blockly.WidgetDiv.isVisible()
      || !!Blockly.DropDownDiv.owner_ || !!$('dialog[open]');
  };
  const steer = () => {
    ['x', 'y', 'z'].forEach((k) => { sim.input[k] = held.has('+' + k) - held.has('-' + k); });
  };
  const letGo = () => {
    spaceHeld = false;
    held.clear();
    steer();
    sim.press('left', false);
    sim.press('right', false);
  };
  const onKey = (e) => {
    const down = e.type === 'keydown';
    if (e.code === 'Space') {
      if (!down) {
        if (spaceHeld) { e.preventDefault(); spaceHeld = false; sim.press('left', false); }
        return;
      }
      if (spaceHeld) return e.preventDefault();
      // A control focused from the keyboard keeps its own Space. Pointer clicks blur, see wire().
      const a = document.activeElement;
      if (typing() || (a !== document.body && a.matches('a, button, [tabindex]') && a.id !== 'hub-left')) return;
      e.preventDefault();
      spaceHeld = true;
      sim.press('left', true);
      return;
    }
    const move = MOVES[e.code];
    if (!move) return;
    if (down && (typing() || e.ctrlKey || e.metaKey || e.altKey || document.activeElement === split)) return;
    e.preventDefault();
    if (down) held.add(move); else held.delete(move);
    steer();
  };

  const setSplit = (pct) => {
    // The left panel keeps room beside the palette for the tools and the run buttons.
    const w = root.clientWidth, min = ((bl.workspace.getMetrics().absoluteLeft + 345) / w) * 100, max = 100 - (320 / w) * 100;
    pct = Math.min(max, Math.max(min, pct));
    root.style.setProperty('--split', pct + '%');
    return pct;
  };

  const build = () => {
    const tabs = $('#task-tabs');
    TASKS.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tasks__tab';
      b.innerHTML = '<span class="tasks__pin" aria-hidden="true"></span><span class="tasks__name"></span>';
      b.lastChild.textContent = t.title;
      b.onclick = () => { if (i !== task) select(i); };
      tabs.append(b);
    });
    $('#task-steps').innerHTML = AUTO_STEPS.map((s) => `<li>${s}</li>`).join('');
    const box = $('#hub-leds');
    for (let i = 0; i < 25; i++) leds.push(box.appendChild(document.createElement('i')));
  };

  const wire = () => {
    $('#task-hint-btn').onclick = (e) => {
      const hint = $('#task-hint');
      hint.hidden = !hint.hidden;
      e.currentTarget.setAttribute('aria-expanded', !hint.hidden);
    };
    $('#task-solution').onclick = () => {
      Blockly.confirm('Бағдарламаңды дайын шешіммен ауыстырасың ба? Сенің блоктарың жоғалады.', (ok) => {
        if (!ok) return;
        vm.stop();
        bl.load(TASKS[task].xml());
        say('Шешім жүктелді. Іске қосу батырмасын бас та, тексер.');
      });
    };
    $('#task-reset').onclick = () => {
      vm.stop();
      sim.resetTable();
      newRound();
    };
    $('#task-restart').onclick = () => {
      Blockly.confirm('Қайтадан бастайсың ба? Бастапқы бағдарлама қайтады, тапсырмалардың белгілері мен тест нәтижесі өшеді.', (ok) => {
        if (!ok) return;
        RA.store.remove(['done', 'program.tasks', 'program.xml', 'program.task', 'lessonQuiz', 'examples.seen']);
        location.reload();
      });
    };
    $('#prog-play').onclick = play;
    $('#prog-stop').onclick = () => vm.stop();
    $('#hub-center').onclick = toggle;
    $('#hub-shake').onclick = () => sim.shake();

    $('#prog-tools').onclick = (e) => {
      const b = e.target.closest('[data-tool]'), ws = bl.workspace;
      if (!b) return;
      ({ fit: () => { ws.zoomToFit(); ws.setScale(ws.scale * 0.75); ws.scrollCenter(); }, out: () => ws.zoomCenter(-1), in: () => ws.zoomCenter(1), undo: () => ws.undo(false), redo: () => ws.undo(true) })[b.dataset.tool]();
    };

    ['left', 'right'].forEach((side) => {
      const b = $('#hub-' + side);
      b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); sim.press(side, true); });
      ['pointerup', 'pointercancel'].forEach((n) => b.addEventListener(n, () => sim.press(side, false)));
    });
    $$('#prog-pad [data-move]').forEach((b) => {
      const off = () => { held.delete(b.dataset.move); steer(); };
      b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); held.add(b.dataset.move); steer(); });
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
    });

    // A click leaves focus on the control, and then Space would press it instead of the hub's button.
    root.addEventListener('click', (e) => {
      const a = document.activeElement;
      if (e.detail && a && a !== document.body && !typing()) a.blur();
    });

    split = $('#prog-split');
    split.addEventListener('pointerdown', (e) => {
      split.setPointerCapture(e.pointerId);
      split.classList.add('is-moving');
    });
    split.addEventListener('pointermove', (e) => {
      if (!split.classList.contains('is-moving')) return;
      const r = root.getBoundingClientRect();
      RA.store.set('program.split', setSplit(((e.clientX - r.left) / r.width) * 100));
    });
    ['pointerup', 'pointercancel'].forEach((n) => split.addEventListener(n, () => split.classList.remove('is-moving')));
    split.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const now = parseFloat(root.style.getPropertyValue('--split')) || 58;
      RA.store.set('program.split', setSplit(now + (e.key === 'ArrowLeft' ? -2 : 2)));
    });
  };

  RA.view('program', {
    init(el) {
      root = $('#prog', el);
      build();
      sim = RA.createSim($('#prog-stage'));
      const saved = RA.store.get('program.split', 0);
      if (saved) root.style.setProperty('--split', saved + '%');
      const host = $('#prog-blockly');
      bl = RA.createBlocks(host, { onChange: () => RA.store.set('program.xml', bl.save()) });
      const m = bl.workspace.getMetrics();
      if (m.viewWidth < 440 || m.viewHeight < 680) bl.workspace.setScale(0.65);        // a small panel still shows the stacks whole
      const stored = RA.store.get('program.xml', null);
      try { bl.load(stored || RA.STARTER_XML); } catch (e) { bl.load(RA.STARTER_XML); }
      root.style.setProperty('--palette', bl.workspace.getMetrics().absoluteLeft + 'px');
      new ResizeObserver(() => { if (RA.current === 'program') Blockly.svgResize(bl.workspace); }).observe(host);

      vm = RA.createVM(bl.workspace, sim.hw, { onState: onRun });
      sim.hw.onEvent(onHw);
      sim.onTick = tick;
      wire();
      select(Math.min(RA.store.get('program.task', 0), TASKS.length - 1));
      RA.program = { sim, bl, vm, round, select };          // the QA script and the console reach the live objects here
    },
    enter() {
      Blockly.svgResize(bl.workspace);
      sim.start();
      addEventListener('keydown', onKey);
      addEventListener('keyup', onKey);
      addEventListener('blur', letGo);
    },
    leave() {
      vm.stop();
      sim.stop();
      letGo();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', letGo);
      Blockly.hideChaff();
      Blockly.DropDownDiv.hideWithoutAnimation();
      // Delete on another view must not eat the block that was last selected here.
      if (Blockly.selected) Blockly.selected.unselect();
    },
  });
})();
