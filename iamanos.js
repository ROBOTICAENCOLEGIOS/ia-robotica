// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';
  if (!Scratch.extensions.unsandboxed) throw new Error('Modo Unsandboxed requerido');

  class IAVisionRECPro {
    constructor() {
      this.video = null;
      this.status = "Apagado";
      this.handsDetected = 0;
      this.isPinching = false;
      this._loadScripts();
    }

    async _loadScripts() {
      const urls = [
        "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
        "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
      ];
      for (const url of urls) {
        await new Promise(r => { const s = document.createElement('script'); s.src = url; s.onload = r; document.head.appendChild(s); });
      }
    }

    getInfo() {
      return {
        id: 'iavisionrecpro',
        name: 'IA Visión Manos',
        color1: '#FF5733',
        blocks: [
          { opcode: 'iniciarIA', blockType: Scratch.BlockType.COMMAND, text: 'ENCENDER Cámara' },
          { opcode: 'detenerIA', blockType: Scratch.BlockType.COMMAND, text: 'APAGAR Cámara' },
          '---',
          { opcode: 'getHands', blockType: Scratch.BlockType.REPORTER, text: 'Manos detectadas' },
          { opcode: 'getPinch', blockType: Scratch.BlockType.BOOLEAN, text: '¿Pellizcando?' }
        ]
      };
    }

    async iniciarIA() {
      if (this.video) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.play();
      
      const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5 });
      hands.onResults((res) => {
        this.handsDetected = res.multiHandLandmarks ? res.multiHandLandmarks.length : 0;
        if (this.handsDetected > 0) {
          const h = res.multiHandLandmarks[0];
          const dist = Math.sqrt(Math.pow(h[4].x - h[8].x, 2) + Math.pow(h[4].y - h[8].y, 2));
          this.isPinching = dist < 0.08;
        }
      });

      const camera = new window.Camera(this.video, { onFrame: async () => { await hands.send({image: this.video}); }, width: 480, height: 360 });
      camera.start();
      this.status = "Activo";
    }

    detenerIA() { if (this.video) { this.video.srcObject.getTracks().forEach(t => t.stop()); this.video = null; } }
    getHands() { return this.handsDetected; }
    getPinch() { return this.isPinching; }
  }
  Scratch.extensions.register(new IAVisionRECPro());
})(Scratch);
