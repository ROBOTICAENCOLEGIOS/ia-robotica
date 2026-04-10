// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';
  class IASenalesTransito {
    constructor() {
      this.model = null;
      this.prediction = "NADA";
      this.confidence = 0;
      this.video = null;
      this._init();
    }

    async _init() {
      const s1 = document.createElement('script'); s1.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js";
      const s2 = document.createElement('script'); s2.src = "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js";
      document.head.appendChild(s1); document.head.appendChild(s2);
    }

    getInfo() {
      return {
        id: 'iasenalestransito',
        name: 'IA Señales Tránsito',
        color1: '#F1C40F',
        blocks: [
          { opcode: 'loadModel', blockType: Scratch.BlockType.COMMAND, text: 'Cargar Modelo (.json/.bin)' },
          { opcode: 'start', blockType: Scratch.BlockType.COMMAND, text: 'Ver por Cámara' },
          { opcode: 'getPrediccion', blockType: Scratch.BlockType.REPORTER, text: 'Señal detectada' }
        ]
      };
    }

    async loadModel() {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        const m = files.find(f => f.name.includes('json'));
        const w = files.find(f => f.name.includes('bin'));
        const d = files.find(f => f.name.includes('metadata'));
        this.model = await tmImage.loadFromFiles(m, w, d);
      };
      input.click();
    }

    async start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.play();
      this._loop();
    }

    async _loop() {
      if (this.model && this.video) {
        const preds = await this.model.predict(this.video);
        preds.sort((a, b) => b.probability - a.probability);
        this.prediction = preds[0].className;
        this.confidence = preds[0].probability;
      }
      requestAnimationFrame(() => this._loop());
    }

    getPrediccion() { return this.prediction; }
  }
  Scratch.extensions.register(new IASenalesTransito());
})(Scratch);
