/**
 * IA: Emociones Rostro - Hito 4 Laboratorio REC
 * Detecta emociones faciales con face-api.js (@vladmandic).
 * Arquitectura clonada de iamanos.js: carga async de scripts,
 * permisos de cámara, posicionamiento y bucle con requestAnimationFrame.
 */

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Debe ejecutarse en modo unsandboxed.');
  }

  class IAEmocionesREC {
    constructor() {
      this.video       = null;
      this.emotion     = "NADA";
      this.confidence  = 0;
      this.mouthOpen   = false;
      this.modelsReady = false;

      // Carga la librería y luego los pesos (cadena async igual que iamanos.js)
      this._loadScript("https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js")
        .then(() => this._loadModels());
    }

    _loadScript(url) {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    async _loadModels() {
      // Pesos livianos desde el repo original (compatibles con @vladmandic)
      // Nota: faceLandmark64Model no existe; usamos faceLandmark68TinyNet (más liviano)
      const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";
      try {
        const faceapi = window.faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        this.modelsReady = true;
      } catch (e) {
        console.error("IA Emociones: error cargando modelos →", e);
      }
    }

    getInfo() {
      return {
        id: 'iaEmocionesREC',
        name: 'IA: Emociones Rostro',
        color1: '#EC4899',
        blocks: [
          { opcode: 'iniciarCamara', blockType: Scratch.BlockType.COMMAND, text: '📷 ENCENDER CÁMARA' },
          { opcode: 'detenerCamara', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA' },
          {
            opcode: 'setVideoPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Mover cámara a x: [X] y: [Y]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 400 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }
            }
          },
          {
            opcode: 'setVideoSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Tamaño de cámara al [SIZE] %',
            arguments: { SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 } }
          },
          "---",
          { opcode: 'getEmotion',    blockType: Scratch.BlockType.REPORTER, text: 'emoción detectada' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          {
            opcode: 'isEmotion',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿rostro está [EMOCION]?',
            arguments: {
              EMOCION: { type: Scratch.ArgumentType.STRING, menu: 'EMOTION_MENU' }
            }
          },
          { opcode: 'isMouthOpen', blockType: Scratch.BlockType.BOOLEAN, text: '¿boca abierta / grito?' }
        ],
        menus: {
          EMOTION_MENU: {
            items: ['FELIZ', 'TRISTE', 'ENOJADO', 'SORPRENDIDO', 'NEUTRAL']
          }
        }
      };
    }

    async iniciarCamara() {
      if (this.video) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        this.video = document.createElement('video');
        this.video.srcObject = stream;
        this.video.setAttribute('autoplay', '');
        this.video.setAttribute('playsinline', '');
        Object.assign(this.video.style, {
          position: 'fixed', zIndex: '1000', border: '3px solid #EC4899',
          borderRadius: '10px', left: '400px', top: '10px', width: '160px',
          pointerEvents: 'none', transform: 'scaleX(-1)'
        });
        document.body.appendChild(this.video);
        this._loop();
      } catch (err) {
        console.error("IA Emociones: sin acceso a cámara →", err);
      }
    }

    detenerCamara() {
      if (this.video) {
        this.video.srcObject.getTracks().forEach(t => t.stop());
        this.video.remove();
        this.video = null;
      }
      this.emotion    = "NADA";
      this.confidence = 0;
      this.mouthOpen  = false;
    }

    setVideoPos(args)  { if (this.video) { this.video.style.left = args.X + 'px'; this.video.style.top = args.Y + 'px'; } }
    setVideoSize(args) { if (this.video) { this.video.style.width = (480 * (args.SIZE / 100)) + 'px'; } }

    async _loop() {
      if (!this.video) return;
      if (this.modelsReady && this.video.readyState >= 2) {
        try {
          const faceapi = window.faceapi;
          const detections = await faceapi
            .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks(true)   // true = usar modelo tiny de 68 puntos
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const det = detections[0];

            // Mapeo inglés → español (fearful y disgusted se fusionan)
            const emotionMap = {
              happy:     'FELIZ',
              sad:       'TRISTE',
              angry:     'ENOJADO',
              disgusted: 'ENOJADO',
              fearful:   'SORPRENDIDO',
              surprised: 'SORPRENDIDO',
              neutral:   'NEUTRAL'
            };

            const entries = Object.entries(det.expressions).sort((a, b) => b[1] - a[1]);
            const [topKey, topVal] = entries[0];
            if (topVal >= 0.35) {
              this.emotion    = emotionMap[topKey] || 'NEUTRAL';
              this.confidence = Math.round(topVal * 100);
            } else {
              this.emotion    = 'NADA';
              this.confidence = 0;
            }

            // Boca abierta: distancia euclidiana entre punto 62 (labio sup. interno)
            // y punto 66 (labio inf. interno) del modelo de 68 landmarks.
            // Umbral calibrado a 12px sobre frame 480×360.
            const pts = det.landmarks.positions;
            if (pts && pts.length >= 68) {
              const upper = pts[62];
              const lower = pts[66];
              const dist  = Math.sqrt(
                Math.pow(upper.x - lower.x, 2) +
                Math.pow(upper.y - lower.y, 2)
              );
              this.mouthOpen = dist > 12;
            }

          } else {
            this.emotion    = 'NADA';
            this.confidence = 0;
            this.mouthOpen  = false;
          }
        } catch (e) {
          // Error silencioso frame a frame para no saturar la consola
        }
      }
      requestAnimationFrame(() => this._loop());
    }

    getEmotion()    { return this.emotion; }
    getConfidence() { return this.confidence; }
    isEmotion(args) { return this.emotion === args.EMOCION; }
    isMouthOpen()   { return this.mouthOpen; }
  }

  Scratch.extensions.register(new IAEmocionesREC());
})(Scratch);
