/**
 * IA: Visión REC Pro - RoboticaEnColegios R.E.C.
 * Detección de manos y rostros con MediaPipe.
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

  class IAVisionRECPro {
    constructor() {
      this.status        = "Apagado";
      this.facesDetected = 0;
      this.handsDetected = 0;
      this.isPinching    = false;
      this.indexX        = 0;
      this.indexY        = 0;
      this._running      = false;
      this._hands        = null;
      this._faceMesh     = null;
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

    getInfo() {
      return {
        id: 'iaVisionRECPro',
        name: 'IA: Visión REC Pro',
        color1: '#FF5733',
        blocks: [
          {
            opcode: 'encenderCamara',
            blockType: Scratch.BlockType.COMMAND,
            text: '📷 encender cámara en modo: [MODO]',
            arguments: { MODO: { type: Scratch.ArgumentType.STRING, menu: 'MODO_CAMARA' } }
          },
          { opcode: 'detenerIA',  blockType: Scratch.BlockType.COMMAND,  text: '❌ APAGAR cámara e IA' },
          { opcode: 'getStatus',  blockType: Scratch.BlockType.REPORTER, text: 'estado de la IA' },
          "---",
          { opcode: 'getCamaraX', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada X de la cámara' },
          { opcode: 'getCamaraY', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada Y de la cámara' },
          "---",
          { opcode: 'getFaces',   blockType: Scratch.BlockType.REPORTER, text: 'cantidad de rostros' },
          { opcode: 'getHands',   blockType: Scratch.BlockType.REPORTER, text: 'cantidad de manos' },
          { opcode: 'getPinch',   blockType: Scratch.BlockType.BOOLEAN,  text: '¿dedos pellizcando?' },
          { opcode: 'getIndexX',  blockType: Scratch.BlockType.REPORTER, text: 'posición X dedo índice' },
          { opcode: 'getIndexY',  blockType: Scratch.BlockType.REPORTER, text: 'posición Y dedo índice' }
        ],
        menus: {
          MODO_CAMARA: {
            items: ['FLOTANTE FIJA', 'FLOTANTE ARRASTRABLE', 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)']
          }
        }
      };
    }

    async encenderCamara(args) {
      if (window.RECCamera && window.RECCamera.video) return;
      this.status = "Cargando IA...";

      await this._ensureCamera();

      // Cargar MediaPipe Hands y FaceMesh (sin camera_utils: ya no lo necesitamos)
      if (!window.Hands)    await this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
      if (!window.FaceMesh) await this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");

      // Inicializar modelos
      this._hands = new window.Hands({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
      });
      this._faceMesh = new window.FaceMesh({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
      });

      this._hands.setOptions({ maxNumHands: 6, modelComplexity: 1, minDetectionConfidence: 0.5 });
      this._faceMesh.setOptions({ maxNumFaces: 6, refineLandmarks: true, minDetectionConfidence: 0.5 });

      this._hands.onResults((results) => {
        this.handsDetected = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        if (this.handsDetected > 0) {
          const h    = results.multiHandLandmarks[0];
          const dist = Math.hypot(h[4].x - h[8].x, h[4].y - h[8].y);
          this.isPinching = dist < 0.08;
          this.indexX = (0.5 - h[8].x) * 480;
          this.indexY = (0.5 - h[8].y) * 360;
        } else {
          this.isPinching = false;
        }
      });

      this._faceMesh.onResults((results) => {
        this.facesDetected = results.multiFaceLandmarks ? results.multiFaceLandmarks.length : 0;
      });

      const video = await window.RECCamera.start(args.MODO, '#FF5733');
      if (video) {
        this._running = true;
        this._startLoop();
        this.status = "Listo para detectar";
      } else {
        this.status = "Error: Sin cámara";
      }
    }

    _startLoop() {
      const loop = async () => {
        if (!this._running || !window.RECCamera || !window.RECCamera.video) return;
        const v = window.RECCamera.video;
        if (v.readyState >= 2 && this._hands && this._faceMesh) {
          try {
            await this._hands.send({ image: v });
            await this._faceMesh.send({ image: v });
          } catch (e) {}
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    detenerIA() {
      this._running = false;
      // Liberar solucionadores MediaPipe (WASM + memoria GPU/CPU)
      try { if (this._hands)    this._hands.close();    } catch (e) {}
      try { if (this._faceMesh) this._faceMesh.close(); } catch (e) {}
      this._hands    = null;
      this._faceMesh = null;
      if (window.RECCamera) window.RECCamera.stop();
      this.status        = "Apagado";
      this.facesDetected = 0;
      this.handsDetected = 0;
      this.isPinching    = false;
      this.indexX        = 0;
      this.indexY        = 0;
    }

    getCamaraX()  { return window.RECCamera ? Math.round(window.RECCamera.camaraX) : 0; }
    getCamaraY()  { return window.RECCamera ? Math.round(window.RECCamera.camaraY) : 0; }
    getStatus()   { return this.status; }
    getFaces()    { return this.facesDetected; }
    getHands()    { return this.handsDetected; }
    getPinch()    { return this.isPinching; }
    getIndexX()   { return Math.round(this.indexX); }
    getIndexY()   { return Math.round(this.indexY); }
  }

  Scratch.extensions.register(new IAVisionRECPro());
})(Scratch);