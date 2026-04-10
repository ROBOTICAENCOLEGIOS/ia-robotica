// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';

  class IASenalesTransito {
    constructor() {
      this.model = null;
      this.prediction = "ESPERANDO LIBRERÍAS...";
      this.confidence = 0;
      this.video = null;
      this.stabilityMs = 0;
      this.currentLabel = "NADA";
      this.lastTimestamp = Date.now();
      this._init();
    }

    async _init() {
      try {
        await this._addScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js");
        await this._addScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js");
        this.prediction = "LISTO: CARGA EL MODELO";
      } catch (e) { this.prediction = "ERROR DE LIBRERÍAS"; }
    }

    _addScript(src) {
      return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        document.head.appendChild(s);
      });
    }

    getInfo() {
      return {
        id: 'iaSenalesTransitoV7',
        name: 'IA Señales de Tránsito',
        color1: '#EAB308',
        blocks: [
          { opcode: 'loadFiles', blockType: Scratch.BlockType.COMMAND, text: '📁 CARGAR MODELO' },
          { opcode: 'start', blockType: Scratch.BlockType.COMMAND, text: '📷 ENCENDER CÁMARA' },
          { opcode: 'stop', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA' },
          { opcode: 'getSignal', blockType: Scratch.BlockType.REPORTER, text: 'señal detectada' },
          { opcode: 'getConf', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' }
        ]
      };
    }

    async loadFiles() {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        const m = files.find(f => f.name.includes('model.json'));
        const w = files.find(f => f.name.includes('weights.bin'));
        const d = files.find(f => f.name.includes('metadata.json'));
        if (m && w && d) {
          this.model = await tmImage.loadFromFiles(m, w, d);
          this.prediction = "MODELO CARGADO";
        }
      };
      input.click();
    }

    async start() {
      if (this.video) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.setAttribute('autoplay', '');
      Object.assign(this.video.style, { position: 'fixed', width: '160px', zIndex: '1000', borderRadius: '8px', top: '10px', left: '10px' });
      document.body.appendChild(this.video);
      this._loop();
    }

    stop() {
      if (this.video) {
        this.video.srcObject.getTracks().forEach(t => t.stop());
        this.video.remove();
        this.video = null;
      }
    }

    async _loop() {
      if (!this.video) return;
      if (this.model && this.video.readyState >= 2) {
        const preds = await this.model.predict(this.video);
        preds.sort((a, b) => b.probability - a.probability);
        this.confidence = Math.round(preds[0].probability * 100);
        this.prediction = this.confidence > 35 ? preds[0].className.toUpperCase() : "NADA";
      }
      requestAnimationFrame(() => this._loop());
    }

    getSignal() { return this.prediction; }
    getConf() { return this.confidence; }
  }

  Scratch.extensions.register(new IASenalesTransito());
})(Scratch);
