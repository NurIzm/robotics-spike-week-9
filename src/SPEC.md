# «Роборука» — lesson platform, build spec

This is the brief written before the build. Where it and the code disagree, the code is right.

The site is for a school robotics lesson (Week 9, "Манипуляторы и автономия", 1 hour, ages ~10-14), taught by a teacher
with a LEGO SPIKE Prime set. All on-screen text is Russian. The teacher projects it in class and students also use it on
school PCs. The teacher's table says: goal "Сформировать у учащихся представление о назначении захватов и манипуляторов в
робототехнике. Сборка робота «Робот рука»", activity type "Сборка и разборка".

The user asked for exactly this, in this order:
1. Start screen: the Роборука model in 3D, centred on the screen.
2. The lesson itself.
3. Examples with animation of how manipulators are used in real life.
4. After the lesson, a program screen. Blocks MUST look like the LEGO SPIKE Prime app (https://spike.legoeducation.com/prime/).
   Program on the left, working 3D model on the right.

## 0. Paths

- The site is the repository root. View fragments: `src/views/{start,lesson,examples,program}.html`. Run `node src/build.js` after
  changing a fragment or `src/index.template.html`: it stitches them into `index.html`. Do not edit `index.html` by hand.
- The reference images (`ref/…`: the official building steps and the app's palettes) are LEGO's, so they stay out of this repository.
  The SPIKE app shows the same things.
- `tests/vm-check.html` checks the block interpreter: open it in a browser, every line must say PASS.

## 1. Hard constraints

- Plain static site, no build step, no npm dependencies at runtime, no framework. Only `vendor/` libs: three.js r159 classic
  build + `vendor/three-addons.js` (THREE.OrbitControls, THREE.RoundedBoxGeometry, THREE.RoomEnvironment,
  THREE.BufferGeometryUtils.mergeGeometries) and scratch-blocks 1.1.227 (global `Blockly`).
- Must run by double-clicking `index.html` (file://). So: classic `<script>` only, no ES modules, no fetch of local files.
  It is also published under a CSP that blocks other hosts: no CDN at runtime, no `eval`, no `new Function`, no `window.alert/confirm/prompt`.
- All code in the global namespace `RA` from `js/core.js`. Each file is one IIFE that adds to `RA` and registers a view with `RA.view`.
- Ponytail rules: laziest thing that works, no speculative abstractions, no classes for one instance, fewest lines. Boring over
  clever. Match the surrounding code style: 2-space indent, semicolons, single quotes, short comments that explain why.
- Must work at 1400×900, 1920×1080, and 1024×768, and stay usable at phone width (~400px): no horizontal page scroll.
  Respect `RA.reducedMotion`: no auto-playing motion beyond what the user starts. Visible keyboard focus.
- Performance matters: school PCs with integrated GPUs. Whole model under ~80k triangles. Merge static meshes per material
  (`mergeGeometries`). Share geometries and materials. No postprocessing.
- Stage loops run only while their view is active: call `stage.start()` in `enter`, `stage.stop()` in `leave`.
- No LEGO logo, no copied LEGO artwork or icons. Draw your own simple SVG icons. The footer of the lesson view carries:
  «LEGO и SPIKE — товарные знаки LEGO Group. Это учебный материал учителя, он не связан с LEGO Group и не одобрен ею.»
- Writing: plain, short, friendly Russian for a 12-year-old. No filler, no emoji, no «стоит отметить», no em-dash asides
  (the dash in a definition like «Манипулятор — это…» is fine, Russian grammar needs it). Every fact must be true: when unsure, leave it out.

## 2. File ownership (edit only your own files)

| Owner | Files |
|---|---|
| model | `js/robot.js`, `js/hero.js`, `css/start.css`, `src/views/start.html` |
| blocks | `js/blocks.js`, `js/vm.js`, `css/blocks.css` |
| examples | `js/scenes.js`, `js/examples.js`, `css/examples.css`, `src/views/examples.html` |
| lesson | `js/lesson.js`, `css/lesson.css`, `src/views/lesson.html` |
| sim | `js/sim.js`, `js/program.js`, `css/program.css`, `src/views/program.html` |

`js/core.js` and `css/style.css` already exist: read them first and reuse them (tokens, `.btn`, `RA.stage`, `RA.toast`, `RA.store`, ...).
Read them instead of re-implementing. Do not edit them. If you need a change, put it in your own CSS or JS.

## 3. Shared runtime (`js/core.js`)

`RA.$`, `RA.$$`, `RA.view(name,{init,enter,leave})` (init runs once on first enter, each gets the view's root element),
`RA.go(name)`, `RA.current`, `RA.store.get/set`, `RA.progress.mark(name)` (lights a yellow pin in the nav),
`RA.toast(text, 'info'|'ok'|'warn')`, `RA.reducedMotion`, `RA.webgl`,
`RA.stage(container, opts)` → `{scene, camera, renderer, controls, target, key, size, frame(fn(dt,t)), start(), stop(), resize(), pick(pointerEvent, objects)}`.
The container must be positioned and sized by CSS. `data-go="lesson"` on any element navigates there.
Views: `start`, `lesson`, `examples`, `program`. Containers are `#view-<name>`; the top bar is 64px (`--topbar-h`).

## 4. The model and its API (`js/robot.js`)

Build `RA.createRoboarm()` procedurally. Study `ref/model_thumbnail_zoom.png` and the steps. This is the actual build, read from the
official instructions.

Units: 1 scene unit = 1 LEGO module = 8 mm. Axes: +X along the arm from hub towards the gripper, +Y up, +Z towards the viewer.
Y=0 is the table: hub, frames and tyres all rest on it, exactly as in the thumbnail. X=0 is the seam between hub and frames.

- **Hub** (SPIKE Prime Large Hub), 11×7×4 modules. X∈[-11,0], Y∈[0,7], Z∈[-2,2]. It stands on its long edge. White face plate on +Z
  (≈1 module thick with rounded corners and four round grey corner posts), yellow body behind it, with Technic pin holes along the
  yellow sides and 3 dark port sockets on each long side (`step00`, `step01`, `step28`).
  With the hub read upright the centre button is at the bottom, so in world space it sits at the +X end of the plate: the hub's "up" is -X and its
  "right" is +Y. On the plate: round centre button with a light ring near the +X end, a pill with left/right arrows crossing it
  (hub left = world -Y, hub right = world +Y), a small round Bluetooth button at the far end, and a 5×5 LED matrix in the middle that is invisible when off.
  Ports: the +Y side holds B, D, F with F nearest the +X end. The -Y side holds A, C, E.
- **Frames**: two magenta 7×11 open Technic frames stacked with a 1-module gap. X∈[0,11], Y∈[0,7], rails 1 module wide, each 1 thick,
  at Z∈[0.5,1.5] and Z∈[-1.5,-0.5]. Pin holes through the faces and along the edges (`step02`, `step03`). Grey pin connector between them,
  black pins at the seam with the hub and at the seam with the motor. The opening is what students hold, like a handle.
- **Medium Angular Motor**: azure housing plus white head. X∈[11,18], Y∈[2,5], Z∈[-1.5,1.5]; azure part X∈[11,15.2], white head X∈[15.2,18], with
  pin holes on its faces (`step06`). Azure round rotor on TOP of the head, axis vertical through X=16.5, Z=0: a disc of radius ≈1.5 with a + axle hole and 4 small holes.
- **Linkage under the head** (steps 6-10, seen flipped there): magenta 1×5 beam across the head along Z at Y∈[1,2] with finger pivots at its ends (Z=±2);
  yellow axle down the rotor axis; a small crank made of a white connector plus a short azure beam at Y∈[0,1], with a tan pin. It turns with the rotor.
  A grey H-shaped connector ties the pivots together below (step 27).
- **Two fingers** (steps 11-25, mirror images), black bent Technic liftarm at Y∈[0,1] from the pivot: first leg outward, then bent forward. At its end a magenta 2×4 brick
  ABOVE the liftarm (Y∈[1,2.2]), long axis continuing the finger, studs on top, two black round discs on the studs with yellow axle tips in their centres, and under the far end of the brick a
  small wheel lying flat: light-grey hub with a black treaded tyre (diameter ≈3.75, thickness ≈1, Y∈[0,1]). Tyres are the gripping surfaces.
  Open: tips spread like the thumbnail, gap ≈9 modules. Closed: tyres touch at Z=0.
- **Cable**: flat white ribbon from port F on the top side near the frame, arcing over the frame, down through the frame opening and into the back of the motor, as in the thumbnail.

Plastic look: MeshStandardMaterial, roughness ~0.35, subtle bevels. Colours sampled from the thumbnail: azure `#01adc4`, magenta `#c92e85`, yellow `#fed920`, white `#eceded`, black `#16151a`, grey `#a9b0b5`, tan `#c9b27c`.
Technic holes must read as real holes with a darker inner ring, at least on the frames and beams. Quality bar: at first glance a student recognises it as the thumbnail.

API (other agents depend on it exactly):

```js
const arm = RA.createRoboarm();    // new instance every call, geometries/materials shared between instances
scene.add(arm.group);
arm.parts                // {hub, frames, motor, linkage, fingerA, fingerB, cable}: THREE.Group each
arm.PARTS                // [{id:'hub', name:'Хаб', role:'Мозг: хранит программу и управляет мотором'}, ...] in that order
arm.GRIP_TRAVEL          // 90: rotor degrees from fully open to fully closed
arm.setAngle(deg)        // rotor angle: 0 = fully open, -GRIP_TRAVEL = fully closed. Turns the rotor, crank and both fingers
arm.setGrip(t)           // sugar: 0 open .. 1 closed
arm.tipGap()             // clear distance between the tyres' inner surfaces at the current angle, in modules
arm.angleForGap(w)       // rotor angle at which the tyres just touch an object w modules wide
arm.gripPoint            // THREE.Object3D at the midpoint between the tyre centres, Y=0.5 (child of arm.group, moves in X with the fingers)
arm.setMatrix(arr|null)  // 25 brightness values 0..100, row by row from the top-left with the hub read upright
arm.setCenterLight(css|null)    // colours the ring around the centre button
arm.hubButtons           // {left, right, center}: meshes for raycasting
arm.highlight(id|null)   // fades everything except that part towards a pale tint; null restores. Animated by update()
arm.setExplode(t)        // 0..1: exploded view, every part moves out along its own direction
arm.STAGES               // [{id, title, steps:'1', parts:'…', text:'…'}, ...] the 7 assembly stages below
arm.setBuildStage(n, t)  // shows stages up to n; stage n (0-based) flies into place as t goes 0..1
arm.update(dt)           // call each frame: ticks fades and tweens
```

Stages: 1 шаг 1: хаб и 4 чёрных штифта. 2 шаги 2-5: две рамки с соединителем, крепим к хабу, ещё 2 штифта. 3 шаги 6-10: мотор, ось, балка 5, кривошип.
4 шаги 11-18: первый палец. 5 шаги 19-25: второй палец. 6 шаги 26-27: длинный штифт и H-образный соединитель. 7 шаг 28: мотор на рамку, кабель в порт F.

Hub LED mapping: because the hub is read upright with the button at the bottom, a picture appears rotated 90° for a viewer in front of the model. That is physically right, keep it.

## 5. Start view (`js/hero.js`, `css/start.css`, `views/start.html`)

Full-window start screen (minus the top bar). The 3D Роборука sits dead centre of the screen and is the largest thing on it, transparent canvas. Slow idle turntable,
fingers open and close gently now and then, drag to orbit. If `RA.reducedMotion`, it stays still until dragged.
Behind or above it, a very large display title «РОБОРУКА». Facts as a small spec strip (these are real): Шагов сборки: 28 · Мотор: 1 · Порт: F · Время: 1 час.
Button «Начать урок» → `data-go="lesson"`. Soft contact shadow under the model. Make it feel like a product reveal, not a template.

## 6. Blocks (`js/blocks.js`, `js/vm.js`, `css/blocks.css`)

The real SPIKE app is a scratch-blocks fork, so the same shapes come for free. Compare with `ref/spike_palette_*.jpg` constantly.

`RA.createBlocks(container, {onChange})` injects the workspace and returns `{workspace, load(xmlText), save(), reset()}`. Use `media:'vendor/media/'`, `sounds:false`, `comments:false`, `trashcan:false`,
`zoom:{controls:false,wheel:true,startScale:.8}`, dotted grid like SPIKE (`colours.workspace` white). Override `Blockly.prompt` and `Blockly.alert`/`Blockly.confirm` with a small in-page dialog (native ones are refused in the published page).
Load `Blockly.ScratchMsgsRu` into `Blockly.Msg` first, then overlay the exact SPIKE wording.

Colours fill / secondary / stroke: Моторы `#0090F5 #0078CC #0062A6`; Движение `#FF4CCD #C80090 #B2248A`; Подсветка `#9B6AF6 #691FF0 #571CC1`; Звук `#C061F1 #8A40AF #642E7F`;
События `#F5C402 #C8A300 #B09400`; Управление `#FFB515 #ECA100 #C98A01`; Датчики `#34CCF1 #00A8C9 #368FA9`; Операторы `#00B94D #00963E #006A2A`; Переменные `#FF8F24 #FF7D00 #C76000`; Мои блоки `#FF5D64 #FF000C #C7222A`.
Font: `"Helvetica Neue", Helvetica, Arial, sans-serif`, 500, white on blocks.

Geometry that SPIKE uses: icon 40×40 in the block's left, thin vertical separator of the secondary colour, then content (`field_image` + `field_vertical_separator` + extension `scratch_extension`, exactly as in smoke.html).
Icons: white shapes with secondary-colour outlines in a 48×48 viewBox. Draw your own simple versions: motor (circle with 4 dots and a plus), move (two overlapping wheels), hub (phone-shaped white body with a 4×4 dot grid and a small button), colour sensor, force sensor, distance sensor (two eyes), play triangle (white, for the start hat).
Sound/Control/Operator blocks have no icon, like in SPIKE (see the catalogue: `[icon]` marks those that do).
Port pickers are round darker-secondary "menu" shadows `A…F`; other dropdowns are rect `field_dropdown`; the direction dropdown shows a circular-arrow image and arrow like SPIKE (try `field_dropdown` image options `{src,width,height,alt}`; fall back to glyphs ↻ ↺).
Use `field_matrix`/`matrix` shadow for the LED picture, `note`/`field_note` for the piano note, `colour_picker`-style dropdown or `field_colour_slider`-free simple dropdown of SPIKE colours for colour pickers, `field_angle` or math_number for the angle.

Toolbox: `<category>` with colours in this order and these names: Моторы, Движение, Подсветка, Звук, События, Управление, Датчики, Операторы, Переменные (`custom="VARIABLE"`), Мои блоки (`custom="PROCEDURE"`), Дополнительные моторы.
`css/blocks.css` restyles `.scratchCategoryMenu` like SPIKE: ~64px wide column, 20px colour bubble, small uppercase labels, selected item in a soft grey rounded tile. Keep the flyout continuous with category headings.

### Block catalogue (types and Russian text are the real ones; `{…}` dropdown, `(…)` value input, `?` boolean suffix)

Keep the same type names. `[stack]` unless noted. Reporters are round, booleans hexagonal, hats are hats.

Моторы (all `[icon]|`): `flippermotor_motorTurnForDirection`: (PORT) запустить {DIRECTION} на (VALUE:1) {UNIT: обороты|градусы|секунды}. `flippermotor_motorGoDirectionToPosition`: (PORT) перейти {самым коротким путём|по часовой|против часовой} в положение (POSITION:0).
`flippermotor_motorStartDirection`: (PORT) запустить мотор {DIRECTION}. `flippermotor_motorStop`: (PORT) остановить мотор. `flippermotor_motorSetSpeed`: (PORT) задать скорость (SPEED:75) %. Reporters `flippermotor_absolutePosition`: (PORT) положение; `flippermotor_speed`: (PORT) скорость.

Движение (`[icon]|`): `flippermove_move`: переместить {↑↓↻↺} на (VALUE:10) {обороты|градусы|секунды|см|дюймы}; `flippermove_startMove`: начать движение {dir}; `flippermove_steer`: переместить (вправо: 30) на (10) {…}; `flippermove_startSteer`: начать движение (вправо: 30);
`flippermove_stopMove`: остановить движение; `flippermove_movementSpeed`: установить скорость движения (50) %; `flippermove_setMovementPair`: установить моторы для движения (A+B); `flippermove_setDistance`: установить поворот одного мотора на (17.5) {см|дюймы}.

Подсветка (`[icon]|`): `flipperlight_lightDisplayImageOnForTime`: включить (MATRIX) на (2) с; `flipperlight_lightDisplayImageOn`: включить (MATRIX); `flipperlight_lightDisplayText`: записать (Hello); `flipperlight_lightDisplayOff`: отключить пиксели;
`flipperlight_lightDisplaySetBrightness`: яркость пикселей на уровне (75) %; `flipperlight_lightDisplaySetPixel`: задать пиксели для (1) , (1) до (100) %; `flipperlight_lightDisplayRotate`: вращать {↻↺}; `flipperlight_lightDisplaySetOrientation`: настроить ориентацию {вертикально|влево|вправо|перевёрнуто};
`flipperlight_centerButtonLight`: установить {colour} для подсветки центральной кнопки; `flipperlight_ultrasonicLightUp`: (PORT) подсветка включена {…}.

Звук: `flippersound_playSoundUntilDone`: воспроизводить звук {Cat Meow 1|…} до завершения; `flippersound_playSound`: включить звук {…}; `flippersound_beepForTime` (`[icon]|`): включить звуковой сигнал (60) на (0.2) с; `flippersound_beep` (`[icon]|`): включить звуковой сигнал (60);
`flippersound_stopSound`: остановить воспроизведение всех звуков; `sound_changeeffectby`: изменить {высота тона|панорамирование влево/вправо} эффект на (10); `sound_seteffectto`: установить эффект {…} в (100); `sound_cleareffects`: убрать звуковые эффекты; `sound_changevolumeby`: изменить громкость на (-10); `sound_setvolumeto`: установить громкость (100) %; `sound_volume` reporter: громкость звука.

События (hats, `[icon]|` unless noted): `flipperevents_whenProgramStarts`: когда запускается подпрограмма; `flipperevents_whenColor`: (PORT) когда цвет {colour}; `flipperevents_whenPressed`: (PORT) когда {нажата|отпущена|…}; `flipperevents_whenDistance`: (PORT) когда {ближе|дальше} (8) {%|см|дюймы};
`flipperevents_whenTilted`: при наклоне {dir}; `flipperevents_whenOrientation`: когда {передняя часть|задняя часть|верх|низ|левая сторона|правая сторона} выше; `flipperevents_whenGesture`: когда {встряхивание|постукивание|двойное постукивание|падение}; `flipperevents_whenButton`: когда кнопка {влево|вправо} нажата, {нажата|отпущена};
`flipperevents_whenTimer` (no icon): когда таймер > (10); `flipperevents_whenCondition` (no icon): когда <boolean>; `event_whenbroadcastreceived` (no icon): когда я получу {сообщение1}; `event_broadcast`: передать (сообщение1); `event_broadcastandwait`: передать (сообщение1) и ждать до конца.

Управление: `control_wait`: ждать (1) секунд; `control_repeat`: повторить (10) раз; `control_forever`: повторять всегда; `control_if`: если <> , то; `control_if_else`: если <> , то … иначе; `control_wait_until`: ждать до <>; `control_repeat_until`: повторять пока не <>; `flippercontrol_stopOtherStacks`: остановить другие подпрограммы; `flippercontrol_stop`: остановить {все|и выйти из программы|эта подпрограмма}.

Датчики (`[icon]|` unless noted): `flippersensors_isColor`: (PORT) цвет {colour} ?; `flippersensors_color`: (PORT) цвет; `flippersensors_isReflectivity`: (PORT) отражённый свет {<|>|=} (50) %?; `flippersensors_reflectivity`: (PORT) отражённый свет; `flippersensors_isPressed`: (PORT) — {нажата|…} ?; `flippersensors_force`: (PORT) давление в {%|Н}; `flippersensors_isDistance`: (PORT) — {ближе|дальше} (15) {%|см|дюймы} ?; `flippersensors_distance`: (PORT) расстояние в {%|см|дюймы};
`flippersensors_isTilted`: Хаб наклонен {dir} ?; `flippersensors_isorientation`: {передняя часть|…} вверх?; `flippersensors_ismotion`: {встряхивание|…} ?; `flippersensors_orientationAxis`: {тангаж|крен|рыскание} угол; `flippersensors_resetYaw`: установить угол рыскания Хаба на 0; `flippersensors_buttonIsPressed`: кнопка {влево|вправо} {нажата|отпущена} ?; `flippersensors_timer` (no icon): таймер; `flippersensors_resetTimer` (no icon): сбросить таймер.

Операторы: `operator_random`: выдать случайное от (1) до (10); `operator_add/subtract/multiply/divide`: ( ) + ( ) etc; `operator_lt/equals/gt`: ( ) < (100) etc; `operator_and`: <> и <>; `operator_or`: <> или <>; `operator_not`: не <>; `flipperoperator_isInBetween`: значение (0) в диапазоне от (-10) до (10) ?; `operator_join`: объединить (apple) (banana); `operator_letter_of`: буква (1) в (apple); `operator_length`: длина (apple); `operator_contains`: (apple) содержит (a) ?; `operator_mod`: ( ) mod ( ); `operator_round`: округлить ( ); `operator_mathop`: {модуль|…} от ( ).

Дополнительные моторы: `flippermoremotor_motorStartPower`: (PORT) запустить мотор с мощностью (100) %; `flippermoremotor_power`: (PORT) мощность; `flippermoremotor_position`: (PORT) относительное положение; `flippermoremotor_motorSetDegreeCounted`: (PORT) настроить относительное положение по (0).
Message overrides for the built-ins (exact SPIKE text): CONTROL_WAIT `ждать %1 секунд`, CONTROL_REPEAT `повторить %1 раз`, CONTROL_FOREVER `повторять всегда`, CONTROL_IF `если %1 , то`, CONTROL_ELSE `иначе`, CONTROL_WAITUNTIL `ждать до %1`, CONTROL_REPEATUNTIL `повторять пока не %1`, OPERATORS_RANDOM `выдать случайное от %1 до %2`, OPERATORS_JOIN `объединить %1 %2`, OPERATORS_LETTEROF `буква %1 в %2`, OPERATORS_LENGTH `длина %1`, OPERATORS_CONTAINS `%1 содержит %2 ?`, OPERATORS_ROUND `округлить %1`, OPERATORS_AND `%1 и %2`, OPERATORS_OR `%1 или %2`, OPERATORS_NOT `не %1`, category buttons `Создать переменную`, `Создать список`, `Создать блок`.

### Official starter program (from LEGO's lesson «Передаем кубик» for this exact model)

Export `RA.STARTER_XML` and `RA.SOLUTION_XML`. Motor port is **F**. Clockwise opens the hand, negative power closes it.

Starter, three stacks side by side with room around them:
1. `flipperevents_whenProgramStarts` → `flippermotor_motorTurnForDirection` port F, clockwise, 0.2, seconds. LEGO comment: «Эта подпрограмма позволяет выполнить однократное разжимание руки в начале.»
2. `flipperevents_whenButton` left, pressed → `flippermoremotor_motorStartPower` port F, -100. «…сжимание руки при нажатии левой кнопки на Хабе.»
3. `flipperevents_whenButton` left, released → nothing. «…разжимание руки при отпускании левой кнопки… но следующий после этого блок отсутствует. Вы должны его добавить!»

Solution: the same with stack 3 → `flippermotor_motorTurnForDirection` port F, clockwise, 0.2, seconds.

### VM (`js/vm.js`)

`RA.createVM(workspace, hw, {onState(running)})` → `{start(), stop(), running, dispatch(evt)}`. Walks the live blocks; no code generation, no eval. Each hat runs as one async thread.
A thread yields often enough that `повторять всегда` with no wait cannot freeze the page (yield via a scheduler that keeps working in a hidden tab: MessageChannel or setTimeout with time slicing, not rAF alone). `stop()` cancels every thread at the next yield and stops motor and sounds.
While a stack runs, glow it (`workspace.glowStack(topId,true)`), and glow the current block like SPIKE. Event hats restart their thread when re-triggered. `flipperevents_whenCondition`, `whenTimer`, tilt, gesture hats are edge-triggered, polled by the scheduler.
Implement every catalogue block. Devices: `hw.ports` says what is plugged in, only F has a motor. A block addressing an empty port (A is the default!) does not crash: `RA.toast('В порту A ничего нет. Мотор Роборуки подключён к порту F.', 'warn')` once per run, then it continues. Same friendly idea for sensors (returns 0/false) and movement blocks («У Роборуки нет ходовых моторов: блок пропущен.»).
Variables, lists, `Мои блоки` (`Создать блок` needs `Blockly.Procedures.externalProcedureDefCallback` with an in-page name dialog; no-argument procedures are enough), broadcasts, timer.

Hardware interface, implemented by the sim agent in `sim.hw`:

```js
hw.ports                      // {A:null,B:null,C:null,D:null,E:null,F:'motor'}
hw.motor.run(speedPct, dir)               // continuous, dir +1 clockwise, -1 counter-clockwise
hw.motor.runPower(pct)                    // signed unregulated power, negative closes the hand
hw.motor.stop()
hw.motor.runFor(deg, speedPct)            // signed degrees, returns Promise: resolves when reached or stalled ≥0.4 s
hw.motor.runForSeconds(sec, speedPct, dir)   // Promise
hw.motor.goTo(deg, mode, speedPct)        // mode 'shortest'|'clockwise'|'counterclockwise', Promise
hw.motor.position                         // getter, -180..179
hw.motor.relative                         // getter, continuous degrees; setter resets it
hw.motor.speedPct, hw.motor.powerPct      // getters, signed
hw.motor.defaultSpeed                     // get/set, 75 by default, set by «задать скорость»
hw.display.setImage(arr25) .clear() .setPixel(x,y,pct) .setBrightness(pct) .rotate(dir) .setOrientation(name)
hw.display.scroll(text)                   // Promise
hw.centerLight(css|null)
hw.sound.beep(midi, sec) (Promise) .beepStart(midi) .stop() .play(name, untilDone) (Promise) .volume (get/set) .setEffect(name,val) .changeEffect(name,delta) .clearEffects()
hw.sensors.button(side)                   // 'left'|'right' → boolean
hw.sensors.tilted(dir), .orientationUp(name), .gesture(name), .angle('pitch'|'roll'|'yaw'), .resetYaw()
hw.onEvent(fn)                            // fn({type:'button',side,state}) and {type:'gesture',name}; the program view wires it to vm.dispatch
hw.reset()                                // called by vm.stop(): power off, display cleared
```

## 7. Simulator and program view (`js/sim.js`, `js/program.js`, `css/program.css`, `views/program.html`)

Layout at desktop: blocks LEFT (~58%), 3D RIGHT, full height under the top bar, no page scroll, draggable splitter (`Blockly.svgResize(workspace)` after moving). Under ~900px: 3D on top, blocks below, page may scroll.
Like the SPIKE app: big round Stop and Play buttons bottom-right of the workspace area, undo/redo and zoom buttons bottom-left. A slim task bar on top of the left side with the 4 tasks.

The real model is held in the hand: there is no shoulder or base motor. Motor F only opens and closes the fingers; the student's hand carries the arm. Keep that truth. The sim is a table seen from the front-top like the thumbnail, with the arm in the air and fully visible.
The student moves the arm like a hand would: arrow keys / WASD on the table plane, Q/E or PageUp/PageDown up and down, on-screen pad for touch, or drag the model. Drag anywhere else orbits the camera, wheel zooms.
A soft vertical guide and ring under the grip point make depth readable. The hub's left button: on-screen button, click on the 3D button, or the Space key (hold). Pointerdown is pressed, pointerup is released. Never hijack keys while typing in a Blockly field.

2D hub panel under the 3D view: 5×5 LED matrix drawn upright, centre button (start/stop), left and right buttons, port F readout (угол, скорость, мощность), and «Встряхнуть» button (fires the gesture).
Physics, lazy but believable: motor with acceleration ramp, max 600°/s at 100%. Position 0 is the open mechanical limit (clockwise stop), -`arm.GRIP_TRAVEL` the closed limit, or `arm.angleForGap(brickWidth)` when a brick is between the tyres: the motor stalls there and speed drops to 0. Start pose -45° so the opening stack visibly does something.
Bricks: six 2×4 LEGO bricks, 2.4 high with studs, bright colours. `held` while the tyres press it; it follows the grip; when the gap exceeds its width it drops under gravity, lands on the table or on top of another brick (overlap ≥ 40%, otherwise it slides off and tips over).

Tasks (from the official lesson; progress with `RA.store`, solved task gets a tick, all done → `RA.progress.mark('program')`):
1. «Испытай руку»: add the missing block so the hand opens on release. Passes when after pressing and releasing the left button the fingers re-open by program. Show a clear prompt if the hand stayed closed after release.
2. «Перенеси кубики»: move all six bricks from zone A to zone B one at a time in 2 minutes. Live timer and counter. Official wording: «Переместите шесть кубиков за 2 минуты.»
3. «Построй башню»: stack as many as possible in 3 minutes on zone B, a tower of 3 passes. If it falls, build it again.
4. «Рука сама»: autonomy without buttons. Program that on start closes the hand, shows a picture on the hub, waits 2 seconds, opens the hand and beeps, with no button presses. Passes when that sequence is observed.
Each task: short goal text, «Подсказка», «Показать решение» (loads an XML, asks in-page before replacing the student's work), «Сбросить стол».
Autosave the workspace with `RA.store`. `sim` exposes `RA.createSim(container)` → `{hw, stage, arm, resetTable(), ...}`.

## 8. Lesson view

Lesson flow, one scrolling page with big type for a projector. `Далее` at the bottom → examples.
1. Header: тема, цель (the teacher's words), что узнаем, 1 час, сборка и разборка.
2. Что такое манипулятор: механическая «рука» робота, a comparison with the human arm (плечо, локоть, запястье, кисть, мышцы, нервы, мозг ↔ основание, шарниры, захват, моторы, провода, контроллер). Make it interactive, hover/tap one side highlights the other. Степени свободы, простым языком.
3. Что такое захват: «кисть» манипулятора, four types as animated cards: пальцевый, вакуумный, магнитный, мягкий. For each: как держит, что берёт, что не берёт. Animated in CSS or SVG, stay small.
4. Из чего состоит наша Роборука: scrollytelling, sticky 3D model, text steps on the side; each step `arm.highlight(id)` and moves the camera: хаб, рамки, мотор, рычаги, пальцы с шинами, кабель. Include why tyres (резина даёт трение, кубик не выскальзывает) and how the lever works.
5. Сборка и разборка: the 3D model with a stage stepper: 7 stages using `arm.setBuildStage`, showing which SPIKE steps they correspond to and the parts, plus a разобрать slider using `arm.setExplode`. Note on tidy disassembly: детали раскладываем по ячейкам. Tell them the instructions are in the SPIKE app: «Модели → Роборука», мотор в порт F.
6. Манипуляторы и автономия: ручное управление → программа → автономия, with our model on the ladder (кнопка на хабе = ручное). Tie to the unit title.
7. Мини-тест: 5 questions with instant explanation, result stored with `RA.store`, `RA.progress.mark('lesson')` at the end.
Footer with the trademark note.

## 9. Examples view

A large 3D canvas with six switchable looping scenes, list of examples beside it. Under the canvas a caption timeline that follows the animation (e.g. «1. Камера находит деталь → 2. Захват опускается → …»). For each: где, что делает, тип захвата, какие датчики, how autonomous it is, and one line «Что общего с Роборукой». Low-poly, clean, clearly readable, same plastic look. One shared `RA.stage`, scenes swap inside it.
1. Автозавод: robot arms take a door/panel from a rack and fit it on a car body on a conveyor, welding sparks. Пальцевый захват.
2. Склад: vacuum gripper takes parcels from a conveyor and stacks them on a pallet.
3. Хирургия: a surgical robot with tiny instruments, the doctor moves big, the instrument moves small. No autonomy: the doctor controls every movement.
4. Космос: Canadarm2 on the ISS captures a cargo ship.
5. Ферма: a soft gripper picks ripe apples only, a camera tells ripe from unripe.
6. Спасатели: a tracked sapper robot picks up a suspicious object while the operator stands far away.
Numbers must be verified with WebSearch (ToolSearch `select:WebSearch`) or left out.

## 10. Visual identity

Bright, toy-engineering, confident. Colours come from the kit itself (tokens in `css/style.css`). The top nav is a Technic beam with pin holes. Reuse that language where it has meaning: holes, pins, modules as units («11 × 7 модулей»), not as decoration everywhere.
Display font Unbounded (restraint: headings only), body Golos Text, numbers/units JetBrains Mono. Avoid: cards everywhere, identical rounded shadows, purple gradients, centred everything, emoji, numbered markers that encode nothing.
Single light theme; do not add dark mode.
