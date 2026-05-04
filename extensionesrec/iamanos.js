/**
 * IA: Vision REC Pro - VERSION LIMPIA SIN ACENTOS
 * Soluciona el problema de variables que no actualizan.
 */

(function (Scratch) {
  'use strict';

  class IAVisionRECPro {
    constructor() {
      this.video = null;
      this.model = null;
      this.status = "Apagado";
      this.faceCount = 0;
      this.handCount = 0;
      this.isPinching = false;
      this.indexX = 0;
      this.indexY = 0;
      this.videoX = 10;
      this.videoY = 10;
      this.videoSize = 40;
    }

    getInfo() {
      return {
        id: 'iaVisionRECPro',
        name: 'IA: Vision REC Pro',
        color1: '#FF5733',
        blocks: [
          { opcode: 'iniciarIA', blockType: Scratch.BlockType.COMMAND, text: '1. ENCENDER camara e IA' },
          { opcode: 'detenerIA', blockType: Scratch.BlockType.COMMAND, text: '2. APAGAR camara' },
          { opcode: 'getStatus', blockType: Scratch.BlockType.REPORTER, text: 'Estado de la IA' },
          "---",
          {
            opcode: 'setVideoPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Mover camara a x: [X] y: [Y]',
            arguments: { X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } }
          },
          {
            opcode: 'setVideoSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Tamano de camara al [PCT] %',
            arguments: { PCT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 } }
          },
          "---",
          { opcode: 'getFaces', blockType: Scratch.BlockType.REPORTER, text: 'cantidad de rostros' },
          { opcode: 'getHands', blockType: Scratch.BlockType.REPORTER, text: 'cantidad de manos' },
          { opcode: 'getPinch', blockType: Scratch.BlockType.BOOLEAN, text: 'dedos pellizcando?' },
          { opcode: 'getIndexX', blockType: Scratch.BlockType.REPORTER, text: 'posicion X dedo indice' },
          { opcode: 'getIndexY', blockType: Scratch.BlockType.REPORTER, text: 'posicion Y dedo indice' }
        ]
      };
    }

    async iniciarIA() {
      if (this.video) return;
      this.status = "Cargando cerebro...";

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        this.video = document.createElement('video');
        this.video.srcObject = stream;
        this.video.setAttribute('autoplay', '');
        this.video.setAttribute('playsinline', '');

        Object.assign(this.video.style, {
          position: 'fixed', zIndex: '1000', border: '3px solid #FF5733',
          borderRadius: '10px', left: '10px', top: '10px', width: '240px',
          pointerEvents: 'none', transform: 'scaleX(-1)' // Espejo para que sea intuitivo
        });
        document.body.appendChild(this.video);

        // Forzar carga de modelos si no están listos
        const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
        const faceDetection = new window.FaceDetection({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`});

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceDetection.setOptions({
          model: 'short_range',
          minDetectionConfidence: 0.5
        });

        this.model = { hands, faceDetection };
        this.status = "Activo";
        this.detectLoop();

      } catch (err) {
        console.error('Error al iniciar IA:', err);
        this.status = "Error: " + err.message;
      }
    }

    detenerIA() {
      if (this.video && this.video.srcObject) {
        this.video.srcObject.getTracks().forEach(track => track.stop());
        document.body.removeChild(this.video);
        this.video = null;
      }
      this.model = null;
      this.status = "Apagado";
      this.faceCount = 0;
      this.handCount = 0;
      this.isPinching = false;
      this.indexX = 0;
      this.indexY = 0;
    }

    async detectLoop() {
      if (!this.video || !this.model) return;

      const resultsHands = await this.model.hands.send({image: this.video});
      const resultsFace = await this.model.faceDetection.send({image: this.video});

      // Actualizar manos
      this.handCount = resultsHands.multiHandLandmarks ? resultsHands.multiHandLandmarks.length : 0;
      this.isPinching = false;
      this.indexX = 0;
      this.indexY = 0;

      if (resultsHands.multiHandLandmarks) {
        for (const landmarks of resultsHands.multiHandLandmarks) {
          // Detectar pellizco (pulgar e índice)
          const thumb = landmarks[4];
          const index = landmarks[8];
          const distance = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
          if (distance < 0.05) this.isPinching = true;

          // Actualizar posición del índice
          this.indexX = Math.round(index.x * 100);
          this.indexY = Math.round(index.y * 100);
        }
      }

      // Actualizar rostros
      this.faceCount = resultsFace.detections ? resultsFace.detections.length : 0;

      requestAnimationFrame(() => this.detectLoop());
    }

    getStatus() {
      return this.status;
    }

    getFaces() {
      return this.faceCount;
    }

    getHands() {
      return this.handCount;
    }

    getPinch() {
      return this.isPinching;
    }

    getIndexX() {
      return this.indexX;
    }

    getIndexY() {
      return this.indexY;
    }

    setVideoPos(args) {
      this.videoX = args.X;
      this.videoY = args.Y;
      if (this.video) {
        this.video.style.left = this.videoX + 'px';
        this.video.style.top = this.videoY + 'px';
      }
    }

    setVideoSize(args) {
      this.videoSize = args.PCT;
      if (this.video) {
        const width = 480 * (this.videoSize / 100);
        this.video.style.width = width + 'px';
      }
    }
  }

  Scratch.extensions.register(new IAVisionRECPro());
})(Scratch);
