// @shards unsandboxed
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
      this.posX = 10;
      this.posY = 10;
      this._init();
    }

    async _init() {
      try {
        await this._addScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js");
        await this._addScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js");
        this.prediction = "LISTO: CARGA EL MODELO";
      } catch (e) {
        this.prediction = "ERROR DE LIBRERÍAS";
      }
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
        name: 'REC - IA Señales de Tránsito',
        color1: '#EAB308',
        blocks: [
          { opcode: 'loadFiles', blockType: Scratch.BlockType.COMMAND, text: '🌐 CARGAR MODELO DE TRÁNSITO' },
          { opcode: 'start', blockType: Scratch.BlockType.COMMAND, text: '📷 ENCENDER CÁMARA' },
          { opcode: 'stop', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA' },
          { 
            opcode: 'setPos', 
            blockType: Scratch.BlockType.COMMAND, 
            text: 'ubicar cámara en x: [X] y: [Y]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }
            }
          },
          "---",
          { opcode: 'getSignal', blockType: Scratch.BlockType.REPORTER, text: 'señal detectada' },
          { opcode: 'getConf', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          { 
            opcode: 'isStable', 
            blockType: Scratch.BlockType.BOOLEAN, 
            text: '¿ve [SIG] al [CONF]% por [TIME] seg?',
            arguments: {
                SIG: { type: Scratch.ArgumentType.STRING, menu: 'SIGN_MENU' },
                CONF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 80 },
                TIME: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.8 }
            }
          }
        ],
        menus: {
          SIGN_MENU: { 
            // Lista de clases actualizada
            items: ['AVANZAR', 'RETROCEDER', 'STOP', 'DESPACIO', 'IZQUIERDA', 'DERECHA'] 
          }
        }
      };
    }

    async loadFiles() {
      try {
        this.prediction = "DESCARGANDO MODELO...";
        const URL = "https://roboticaencolegios.github.io/ia-robotica/modelo_transito/";
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        this.model = await tmImage.load(modelURL, metadataURL);
        this.prediction = "MODELO CARGADO OK";
      } catch (err) { 
        this.prediction = "ERROR DE RED O CORS"; 
        console.error(err);
      }
    }

    async start() {
      if (!this.video) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          this.video = document.createElement('video');
          this.video.srcObject = stream;
          this.video.setAttribute('autoplay', '');
          this.video.setAttribute('playsinline', '');
          Object.assign(this.video.style, {
            position: 'fixed', width: '160px', zIndex: '1000', 
            borderRadius: '8px', border: '3px solid #EAB308',
            top: this.posY + 'px', left: this.posX + 'px'
          });
          document.body.appendChild(this.video);
        } catch (e) { this.prediction = "ERROR CÁMARA"; }
      }
      this._loop();
    }

    stop() {
      if (this.video) {
        const stream = this.video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        this.video.remove();
        this.video = null;
        this.prediction = "CÁMARA APAGADA";
      }
    }

    setPos(args) {
      this.posX = args.X;
      this.posY = args.Y;
      if (this.video) {
        this.video.style.left = this.posX + 'px';
        this.video.style.top = this.posY + 'px';
      }
    }

    async _loop() {
      if (!this.video) return;
      if (this.model && this.video.readyState >= 2) {
        const now = Date.now();
        const dt = now - this.lastTimestamp;
        this.lastTimestamp = now;

        const preds = await this.model.predict(this.video);
        preds.sort((a, b) => b.probability - a.probability);
        const top = preds[0];
        
        this.confidence = Math.round(top.probability * 100);
        
        // Lógica de detección: Filtra FONDO y baja confianza
        let label = (top.className.toUpperCase() === "FONDO" || this.confidence < 35) ? "NADA" : top.className.toUpperCase();
        
        // Manejo de estabilidad de la señal
        if (label === this.currentLabel && label !== "NADA") {
          this.stabilityMs += dt;
        } else {
          this.currentLabel = label;
          this.stabilityMs = 0;
        }
        this.prediction = label;
      }
      requestAnimationFrame(() => this._loop());
    }

    getSignal() { return this.prediction; }
    getConf() { return this.confidence; }
    isStable(args) {
      return (this.prediction === args.SIG.toUpperCase() && 
              this.confidence >= args.CONF && 
              this.stabilityMs >= (args.TIME * 1000));
    }
  }

  const inst = new IASenalesTransito();
  Scratch.extensions.register(inst);
})(Scratch);