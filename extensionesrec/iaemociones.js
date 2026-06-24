/**
 * IA: Emociones Rostro - RoboticaEnColegios R.E.C.
 * Detecta emociones faciales con face-api.js (@vladmandic).
 * Cámara centralizada vía window.RECCamera (recCamera.js).
 */

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Debe ejecutarse en modo unsandboxed.');
  }

  const _REC_CAMERA_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? window.location.origin + '/ia-robotica/extensionesrec/recCamera.js'
    : 'https://cdn.jsdelivr.net/gh/ROBOTICAENCOLEGIOS/ia-robotica@main/extensionesrec/recCamera.js';

  const _MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";

  // Mapeo inglés → español (fearful y disgusted se fusionan)
  const _EMOTION_MAP = {
    happy:     'FELIZ',
    sad:       'TRISTE',
    angry:     'ENOJADO',
    disgusted: 'ENOJADO',
    fearful:   'SORPRENDIDO',
    surprised: 'SORPRENDIDO',
    neutral:   'NEUTRAL'
  };

  class IAEmocionesREC {
    constructor() {
      this.emotion     = "NADA";
      this.confidence  = 0;
      this.mouthOpen   = false;
      this.modelsReady = false;
      this._running    = false;
    }

    _loadScript(url) {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    async _ensureCamera() {
      if (!window.RECCamera) await this._loadScript(_REC_CAMERA_URL);
    }

    async _loadModels() {
      if (this.modelsReady) return;
      if (!window.faceapi) {
        await this._loadScript("https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js");
      }
      try {
        const faceapi = window.faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(_MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(_MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(_MODEL_URL)
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
          {
            opcode: 'encenderCamara',
            blockType: Scratch.BlockType.COMMAND,
            text: '📷 encender cámara en modo: [MODO]',
            arguments: { MODO: { type: Scratch.ArgumentType.STRING, menu: 'MODO_CAMARA' } }
          },
          { opcode: 'detenerCamara', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA' },
          "---",
          { opcode: 'getCamaraX', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada X de la cámara' },
          { opcode: 'getCamaraY', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada Y de la cámara' },
          "---",
          { opcode: 'getEmotion',    blockType: Scratch.BlockType.REPORTER, text: 'emoción detectada' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          {
            opcode: 'isEmotion',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿rostro está [EMOCION]?',
            arguments: { EMOCION: { type: Scratch.ArgumentType.STRING, menu: 'EMOTION_MENU' } }
          },
          { opcode: 'isMouthOpen', blockType: Scratch.BlockType.BOOLEAN, text: '¿boca abierta / grito?' }
        ],
        menus: {
          MODO_CAMARA: {
            items: ['FLOTANTE FIJA', 'FLOTANTE ARRASTRABLE', 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)']
          },
          EMOTION_MENU: {
            items: ['FELIZ', 'TRISTE', 'ENOJADO', 'SORPRENDIDO', 'NEUTRAL']
          }
        }
      };
    }

    async encenderCamara(args) {
      if (window.RECCamera && window.RECCamera.video) return;
      await this._ensureCamera();
      await this._loadModels();
      const video = await window.RECCamera.start(args.MODO, '#EC4899');
      if (video) {
        this._running = true;
        this._loop();
      }
    }

    detenerCamara() {
      this._running = false;
      if (window.RECCamera) window.RECCamera.stop();
      this.emotion    = "NADA";
      this.confidence = 0;
      this.mouthOpen  = false;
      // Liberar pesos de face-api.js y tensores de TF residuales
      try {
        const fa = window.faceapi;
        if (fa) {
          if (fa.nets.tinyFaceDetector.isLoaded)    fa.nets.tinyFaceDetector.dispose();
          if (fa.nets.faceLandmark68TinyNet.isLoaded) fa.nets.faceLandmark68TinyNet.dispose();
          if (fa.nets.faceExpressionNet.isLoaded)   fa.nets.faceExpressionNet.dispose();
        }
      } catch (e) {}
      try { if (window.tf) window.tf.disposeVariables(); } catch (e) {}
      this.modelsReady = false;
    }

    async _loop() {
      const cam = window.RECCamera;
      if (!this._running || !cam || !cam.video) return;
      const v = cam.video;

      if (this.modelsReady && v.readyState >= 2) {
        try {
          const faceapi    = window.faceapi;
          const detections = await faceapi
            .detectAllFaces(v, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks(true)
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const det     = detections[0];
            const entries = Object.entries(det.expressions).sort((a, b) => b[1] - a[1]);
            const [topKey, topVal] = entries[0];
            if (topVal >= 0.35) {
              this.emotion    = _EMOTION_MAP[topKey] || 'NEUTRAL';
              this.confidence = Math.round(topVal * 100);
            } else {
              this.emotion = 'NADA'; this.confidence = 0;
            }
            // Boca abierta: distancia pts 62→66 del modelo de 68 landmarks (umbral 12px)
            const pts = det.landmarks.positions;
            if (pts && pts.length >= 68) {
              const dist = Math.hypot(pts[62].x - pts[66].x, pts[62].y - pts[66].y);
              this.mouthOpen = dist > 12;
            }
          } else {
            this.emotion = 'NADA'; this.confidence = 0; this.mouthOpen = false;
          }
        } catch (e) {}
      }
      requestAnimationFrame(() => this._loop());
    }

    getCamaraX()    { return window.RECCamera ? Math.round(window.RECCamera.camaraX) : 0; }
    getCamaraY()    { return window.RECCamera ? Math.round(window.RECCamera.camaraY) : 0; }
    getEmotion()    { return this.emotion; }
    getConfidence() { return this.confidence; }
    isEmotion(args) { return this.emotion === args.EMOCION; }
    isMouthOpen()   { return this.mouthOpen; }
  }

  Scratch.extensions.register(new IAEmocionesREC());
})(Scratch);
