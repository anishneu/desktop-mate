// Floating emote next to the head: "!", "♥", "zzz", "~", "!?", "MEOW!", "💢".
(function () {
  const COLORS = { zzz: 0x8a74d6, '~': 0x8a74d6, 'MEOW!': 0xe8402a };

  class FxLayer {
    constructor(parent) {
      this.text = new PIXI.Text('', {
        fontFamily: 'Segoe UI, Segoe UI Emoji, sans-serif',
        fontSize: 26,
        fontWeight: '700',
        fill: 0xff6f9c,
        stroke: 0xffffff,
        strokeThickness: 5,
      });
      this.text.anchor.set(0.5, 1);
      this.text.visible = false;
      parent.addChild(this.text);
      this.current = null;
    }

    // headTop: y of the top of the head in the parent's space
    update(fx, headTop, T) {
      if (fx !== this.current) {
        this.current = fx;
        this.text.text = fx || '';
        this.text.style.fill = COLORS[fx] ?? 0xff6f9c;
      }
      this.text.visible = !!fx;
      if (!fx) return;
      const rise = fx === 'zzz' ? (T * 0.8) % 1 : 0;
      this.text.position.set(52 + rise * 12, headTop + 10 - rise * 30 + Math.sin(T * 5) * 2);
      this.text.alpha = 1 - rise;
    }
  }

  window.DM = Object.assign(window.DM || {}, { FxLayer });
})();
