// Start screen: the Роборука as a product reveal. It sits dead centre, the page behind it is plain CSS.
(function () {
  const RA = window.RA;
  const AIM = [7.5, 2.5, 0];                  // the model's middle, shifted for the perspective of the opening view
  const AZIMUTH = 0.6, ELEVATION = 0.52;      // the angle of the official picture
  const REST_GAP = 5.6;                       // and its finger pose
  const INTRO = 1.8, SWEEP = 0.8, TURN = 0.1, BEAT = 8, SQUEEZE = 2.6;      // seconds, radians, rad/s
  const FILL_W = 0.84, FILL_H = 0.8;          // share of the screen the model may take
  // Rough outline of the model, enough to frame it from any side.
  const OUTLINE = [[-11, 0, 2], [-11, 7, 2], [-11, 0, -2], [-11, 7, -2], [5, 10, 0], [19, 5, 1.5], [19, 5, -1.5], [24, 0, 5], [24, 3, 5], [24, 0, -5], [24, 3, -5]];
  const ease = (t) => 1 - (1 - t) ** 3;

  // Soft footprint painted once. Canvas shadows blur in every browser, ctx.filter does not.
  function contactShadow(arm) {
    const S = 12, X0 = -18, Z0 = -14, c = document.createElement('canvas'), OFF = 3000;
    c.width = 52 * S; c.height = 28 * S;
    const g = c.getContext('2d');
    g.shadowOffsetX = OFF;
    g.shadowColor = 'rgba(16, 32, 42, 0.55)';
    const rect = (x0, z0, x1, z1, blur) => {
      g.shadowBlur = blur;
      g.fillRect((x0 - X0) * S - OFF, (z0 - Z0) * S, (x1 - x0) * S, (z1 - z0) * S);
    };
    rect(-11, -2, 11, 2, 26);
    rect(-11, -2, 11, 2, 10);
    rect(11, -1.5, 19, 1.5, 34);
    const x = arm.gripPoint.position.x, z = arm.tipGap() / 2 + 1.6;
    for (const s of [1, -1]) {
      rect(x - 1.4, s * z - 1.4, x + 1.4, s * z + 1.4, 16);
      rect(17.5, Math.min(s * 2, s * z), x, Math.max(s * 2, s * z), 30);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(52, 28), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(X0 + 26, -0.02, Z0 + 14);
    return shadow;
  }

  let stage;

  RA.view('start', {
    init(root) {
      const az = AZIMUTH + (RA.reducedMotion ? 0 : SWEEP);
      const dir = [Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION)];
      stage = RA.stage(RA.$('.hero__stage', root), { fov: 18, target: AIM, camera: dir.map((v, i) => AIM[i] + v * 90) });
      const arm = RA.createRoboarm();
      const rest = arm.angleForGap(REST_GAP);
      arm.setAngle(rest);
      stage.scene.add(arm.group, contactShadow(arm));
      if (!stage.renderer) return;

      // The stage's key light leaves the far side dim, and the turntable shows it.
      const fill = new THREE.DirectionalLight(0xffffff, 1.1);
      fill.position.set(10, 20, -60);
      stage.scene.add(fill);

      const c = stage.controls, aim = new THREE.Vector3(...AIM), foot = RA.$('.hero__foot', root);
      c.enableZoom = false;
      c.autoRotate = !RA.reducedMotion;
      const tan = Math.tan((stage.camera.fov * Math.PI) / 360);
      let intro = RA.reducedMotion ? 0 : 1;
      // The distance at which the model just fills the screen from the side it shows now, so it stays the biggest thing as it turns.
      const distance = () => {
        const az = c.getAzimuthalAngle(), el = Math.PI / 2 - c.getPolarAngle();
        let u = 0, v = 0;
        OUTLINE.forEach(([x, y, z]) => {
          x -= AIM[0]; y -= AIM[1];
          u = Math.max(u, Math.abs(x * Math.cos(az) - z * Math.sin(az)));
          v = Math.max(v, Math.abs(y * Math.cos(el) - (x * Math.sin(az) + z * Math.cos(az)) * Math.sin(el)));
        });
        // On a phone the foot runs edge to edge, so the model must stay clear of it; on wider screens it passes between the corners.
        const fillH = stage.size.w > 640 ? FILL_H : 1 - (2 * (foot.offsetHeight + 44)) / stage.size.h;
        return Math.max(v / fillH, u / (FILL_W * stage.camera.aspect)) / tan;
      };
      stage.frame((dt, t) => {
        const push = 1 + 0.3 * (1 - ease(1 - intro));
        stage.camera.position.sub(aim).setLength(distance() * push).add(aim);
        if (RA.reducedMotion) return;
        // OrbitControls turns per frame; this keeps the speed the same on any screen.
        c.autoRotateSpeed = ((TURN + (3 * SWEEP / INTRO) * intro * intro) * dt * 3600) / (2 * Math.PI);
        if (intro > 0) {
          intro = Math.max(0, intro - dt / INTRO);
          arm.setAngle(-arm.GRIP_TRAVEL + (rest + arm.GRIP_TRAVEL) * ease(1 - intro));
        } else {
          const p = (t % BEAT) / SQUEEZE;       // now and then the hand closes on nothing and opens again
          arm.setAngle(rest + (-arm.GRIP_TRAVEL * 0.8 - rest) * (p < 1 ? Math.sin(p * Math.PI) ** 2 : 0));
        }
      });
    },
    enter() { stage.start(); },
    leave() { stage.stop(); },
  });
})();
