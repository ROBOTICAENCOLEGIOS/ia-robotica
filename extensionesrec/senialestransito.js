/**
 * IA: Señales de Tránsito - RoboticaEnColegios R.E.C.
 * Clasifica señales viales con Teachable Machine (modelo online en GitHub CDN).
 * Cámara centralizada vía window.RECCamera (recCamera.js).
 * NOTA: mirror=false para que los textos de las señales (ej: STOP) no se inviertan.
 */
(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Debe ejecutarse en modo unsandboxed.');
  }

  const _REC_CAMERA_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? window.location.origin + '/ia-robotica/extensionesrec/recCamera.js'
    : 'https://cdn.jsdelivr.net/gh/ROBOTICAENCOLEGIOS/ia-robotica@main/extensionesrec/recCamera.js';

  class IASenalesTransito {
    constructor() {
      this.model        = null;
      this.prediction   = "LISTO: CARGA EL MODELO";
      this.confidence   = 0;
      this.stabilityMs  = 0;
      this.currentLabel = "NADA";
      this.lastTimestamp = Date.now();
      this._running     = false;
    }

    _addScript(src) {
      return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        document.head.appendChild(s);
      });
    }

    async _ensureCamera() {
      if (!window.RECCamera) await this._addScript(_REC_CAMERA_URL);
    }

    async _ensureLibs() {
      if (!window.tf) {
        await this._addScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js");
      }
      if (!window.tmImage) {
        await this._addScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js");
      }
    }

    getInfo() {
      return {
        id: 'iaSenalesTransitoV7',
        name: 'IA Señales de Tránsito',
        color1: '#EAB308',
        blocks: [
          { opcode: 'loadFiles', blockType: Scratch.BlockType.COMMAND, text: '☁️ CARGAR MODELO ONLINE' },
          {
            opcode: 'encenderCamara',
            blockType: Scratch.BlockType.COMMAND,
            text: '📷 encender cámara en modo: [MODO]',
            arguments: { MODO: { type: Scratch.ArgumentType.STRING, menu: 'MODO_CAMARA' } }
          },
          { opcode: 'stop', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA' },
          "---",
          { opcode: 'getCamaraX', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada X de la cámara' },
          { opcode: 'getCamaraY', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada Y de la cámara' },
          "---",
          { opcode: 'getSignal', blockType: Scratch.BlockType.REPORTER, text: 'señal detectada' },
          { opcode: 'getConf',   blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          {
            opcode: 'isStable',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿ve [SIG] al [CONF]% por [TIME] seg?',
            arguments: {
              SIG:  { type: Scratch.ArgumentType.STRING, menu: 'SIGN_MENU' },
              CONF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 80 },
              TIME: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.8 }
            }
          }
        ],
        menus: {
          MODO_CAMARA: {
            items: ['FLOTANTE FIJA', 'FLOTANTE ARRASTRABLE', 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)']
          },
          SIGN_MENU: {
            items: ['AVANZAR', 'RETROCEDER', 'STOP', 'DESPACIO', 'IZQUIERDA', 'DERECHA']
          }
        }
      };
    }

    async loadFiles() {
      await this._ensureLibs();
      const base = "https://cdn.jsdelivr.net/gh/ROBOTICAENCOLEGIOS/ia-robotica@main/extensionesrec/modelo_transito/";
      try {
        this.prediction = "DESCARGANDO CEREBRO...";
        this.model = await window.tmImage.load(base + "model.json", base + "metadata.json");
        this.prediction = "MODELO CARGADO OK";
      } catch (err) {
        this.prediction = "ERROR AL DESCARGAR";
        console.error("IA Señales: error cargando modelo →", err);
      }
    }

    async encenderCamara(args) {
      if (window.RECCamera && window.RECCamera.video) return;
      await this._ensureCamera();
      await this._ensureLibs();
      // mirror=false: los textos de señales (STOP, etc.) no deben invertirse
      const video = await window.RECCamera.start(args.MODO, '#EAB308', false);
      if (video) {
        this._running = true;
        this.lastTimestamp = Date.now();
        this._loop();
      }
    }

    stop() {
      this._running = false;
      if (window.RECCamera) window.RECCamera.stop();
      this.prediction   = "CÁMARA APAGADA";
      this.confidence   = 0;
      this.stabilityMs  = 0;
      this.currentLabel = "NADA";
      // Liberar modelo Teachable Machine y tensores de TF residuales
      if (this.model && typeof this.model.dispose === 'function') {
        try { this.model.dispose(); } catch (e) {}
        this.model = null;
      }
      try { if (window.tf) window.tf.disposeVariables(); } catch (e) {}
    }

    async _loop() {
      const cam = window.RECCamera;
      if (!this._running || !cam || !cam.video) return;
      const v = cam.video;

      if (this.model && v.readyState >= 2) {
        try {
          const now = Date.now();
          const dt  = now - this.lastTimestamp;
          this.lastTimestamp = now;

          const preds = await this.model.predict(v);
          preds.sort((a, b) => b.probability - a.probability);
          const top = preds[0];
          this.confidence = Math.round(top.probability * 100);

          const label = (top.className.toUpperCase() === "FONDO" || this.confidence < 35)
            ? "NADA"
            : top.className.toUpperCase();

          if (label === this.currentLabel && label !== "NADA") {
            this.stabilityMs += dt;
          } else {
            this.currentLabel = label;
            this.stabilityMs  = 0;
          }
          this.prediction = label;
        } catch (e) {}
      }
      requestAnimationFrame(() => this._loop());
    }

    getCamaraX() { return window.RECCamera ? Math.round(window.RECCamera.camaraX) : 0; }
    getCamaraY() { return window.RECCamera ? Math.round(window.RECCamera.camaraY) : 0; }
    getSignal()  { return this.prediction; }
    getConf()    { return this.confidence; }
    isStable(args) {
      return (this.prediction === args.SIG.toUpperCase() &&
              this.confidence >= args.CONF &&
              this.stabilityMs >= (args.TIME * 1000));
    }
  }

  Scratch.extensions.register(new IASenalesTransito());
})(Scratch);