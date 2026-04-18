// @shards unsandboxed
(function (Scratch) {
  'use strict';
  
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Esta extensión debe ejecutarse sin sandbox (unsandboxed).');
  }

  class IASenalesTransito {
    constructor() {
      this.model = null;
      this.prediction = "ESPERANDO LIBRERÍAS...";
      this.confidence = 0;
      this.video = null;
      this.stream = null;
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
          { opcode: 'loadFiles', blockType: Scratch.BlockType.COMMAND, text: 'CARGAR MODELO DE TRÁNSITO' },
          { opcode: 'start', blockType: Scratch.BlockType.COMMAND, text: 'ENCENDER CÁMARA' },
          { opcode: 'stop', blockType: Scratch.BlockType.COMMAND, text: 'APAGAR CÁMARA' },
          { 
            opcode: 'setPos', 
            blockType: Scratch.BlockType.COMMAND, 
            text: 'ubicar cámara en x: [X] y: [Y]',
            arguments: {
              X: { type: 'number', defaultValue: 10 },
              Y: { type: 'number', defaultValue: 10 }
            }
          },
          '---',
          { opcode: 'getPrediction', blockType: Scratch.BlockType.REPORTER, text: 'señal detectada' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'confianza (%)' }
        ],
      };
    }

    async loadFiles() {
      try {
        this.prediction = "DESCARGANDO MODELO...";
        const URL = "https://roboticaencolegios.github.io/ia-robotica/modelo_transito/";
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        this.model = await tmImage.load(modelURL, metadataURL);
        this.prediction = "MODELO CARGADO";
      } catch (e) {
        this.prediction = "ERROR AL CARGAR MODELO";
        console.error("Error cargando modelo:", e);
      }
    }

    async start() {
      if (!this.model) {
        this.prediction = "CARGA MODELO PRIMERO";
        return;
      }

      try {
        this.prediction = "INICIANDO CÁMARA...";
        
        // Detener stream anterior si existe
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }

        // Solicitar permisos de cámara con opciones específicas
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'environment'
          }
        });

        // Crear elemento video
        this.video = document.createElement('video');
        this.video.srcObject = this.stream;
        this.video.autoplay = true;
        this.video.playsInline = true;
        
        // Esperar a que el video esté listo
        await new Promise((resolve) => {
          this.video.onloadedmetadata = resolve;
        });

        // Iniciar predicción continua
        this.prediction = "CÁMARA ACTIVA";
        this._predictLoop();

      } catch (e) {
        this.prediction = "ERROR CÁMARA";
        console.error("Error iniciando cámara:", e);
      }
    }

    async stop() {
      try {
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        if (this.video) {
          this.video.srcObject = null;
          this.video = null;
        }
        this.prediction = "CÁMARA APAGADA";
        this.currentLabel = "NADA";
      } catch (e) {
        console.error("Error apagando cámara:", e);
      }
    }

    async setPos(args) {
      this.posX = Math.max(0, Math.min(100, args.X || 10));
      this.posY = Math.max(0, Math.min(100, args.Y || 10));
    }

    async _predictLoop() {
      if (!this.video || !this.model || !this.stream) return;

      try {
        const prediction = await this.model.predict(this.video);
        if (prediction && prediction.length > 0) {
          const maxPrediction = prediction.reduce((max, curr) => 
            curr.probability > max.probability ? curr : max
          );
          
          // Solo actualizar si la confianza es significativa
          if (maxPrediction.probability > 0.5) {
            this.currentLabel = maxPrediction.className;
            this.confidence = Math.round(maxPrediction.probability * 100);
          }
        }
      } catch (e) {
        console.error("Error en predicción:", e);
      }

      // Continuar el bucle
      requestAnimationFrame(() => this._predictLoop());
    }

    getPrediction() {
      return this.currentLabel || "NADA";
    }

    getConfidence() {
      return this.confidence || 0;
    }
  }

  Scratch.extensions.register(new IASenalesTransito());
})(Scratch);
