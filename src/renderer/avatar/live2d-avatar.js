// Live2D avatar via pixi-live2d-display. Authored motions come from the model's
// motion groups (mapped per animation in assets/character.json); the procedural
// pose is layered on top for movement (bob, lean, squash) and for the standard
// Cubism parameters most rigs share (eyes, mouth, body and head angle).
(function () {
  const FORCE = 3; // MotionPriority.FORCE

  class Live2DAvatar {
    constructor(cfg) {
      this.cfg = cfg;
      this.view = new PIXI.Container();
      this.inner = new PIXI.Container(); // squash / lean / flip, pivot at the feet
      this.view.addChild(this.inner);
      this.p = null;
      this.T = 0;
    }

    async load() {
      const { Live2DModel } = PIXI.live2d;
      Live2DModel.registerTicker(PIXI.Ticker);
      const model = await Live2DModel.from(this.cfg.model, { autoInteract: false });
      model.anchor.set(0.5, 1);
      model.scale.set(this.cfg.height / model.height);
      this.inner.addChild(model);
      this.model = model;
      this.fx = new DM.FxLayer(this.view);
      model.internalModel.on('beforeModelUpdate', () => this.applyParams());
    }

    setAnim(name) {
      const m = this.cfg.motions?.[name];
      if (!m) return; // unmapped: the idle group keeps playing under the procedural pose
      this.model.motion(m.group, m.index, FORCE);
      if (m.expression) this.model.expression(m.expression);
    }

    // Runs after motions, blinking and physics, right before the model is drawn.
    applyParams() {
      const p = this.p;
      if (!p) return;
      const core = this.model.internalModel.coreModel;
      if (p.eyes !== null) {
        core.setParameterValueById('ParamEyeLOpen', p.eyes);
        core.setParameterValueById('ParamEyeROpen', p.eyes);
      }
      if (p.mood === 'happy') {
        core.setParameterValueById('ParamEyeLSmile', 1);
        core.setParameterValueById('ParamEyeRSmile', 1);
      }
      if (p.mouth > 0) core.setParameterValueById('ParamMouthOpenY', p.mouth);
      core.addParameterValueById('ParamAngleZ', p.headTilt * 40);
      core.addParameterValueById('ParamBodyAngleZ', (p.legL - p.legR) * 4);
    }

    update(dt, p, s) {
      this.p = p;
      this.T += dt;
      const flip = (s.facing || 1) * (this.cfg.facesLeft ? -1 : 1);
      this.inner.scale.set(flip * (2 - p.squash), p.squash);
      this.inner.rotation = p.lean * flip;
      this.inner.y = (this.cfg.offsetY || 0) + p.bob + p.sit * 20;

      const headY = this.view.y - this.cfg.height * 0.8;
      const far = Math.hypot(s.cursor.x - this.view.x, s.cursor.y - headY) > 900;
      if (far) this.model.focus(this.view.x, headY);
      else this.model.focus(s.cursor.x, s.cursor.y);

      this.fx.update(p.fx, this.inner.y - this.cfg.height, this.T);
    }

    hitTest(x, y) {
      return this.model.getBounds().contains(x, y);
    }
  }

  window.DM = Object.assign(window.DM || {}, { Live2DAvatar });
})();
