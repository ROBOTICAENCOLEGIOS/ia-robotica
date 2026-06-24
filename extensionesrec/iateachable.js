/**
 * IA: Teachable Machine - Hito 6 Laboratorio REC
 * Clasifica imágenes con modelos de Google Teachable Machine.
 * Carga diferida + menús dinámicos con las clases del modelo entrenado.
 * Arquitectura clonada de iaobjetos.js.
 */

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Debe ejecutarse en modo unsandboxed.');
  }

  class IATeachableREC {
    constructor() {
      this.video         = null;
      this.model         = null;
      this._predicting   = false;
      this.modelLabels   = ['ESPERANDO MODELO'];
      this.detectedClass = "NADA";
      this.confidence    = 0;
    }

    _loadScript(url) {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    async _ensureLibs() {
      if (!window.tf) {
        await this._loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js");
      }
      if (!window.tmImage) {
        await this._loadScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js");
      }
    }

    _getDynamicLabels() {
      return this.modelLabels.length > 0 ? this.modelLabels : ['ESPERANDO MODELO'];
    }

    getInfo() {
      return {
        id: 'iaTeachableREC',
        name: 'IA: Teachable Machine',
        color1: '#8B5CF6',
        blocks: [
          { opcode: 'cargarArchivosLocales', blockType: Scratch.BlockType.COMMAND, text: '📁 CARGAR ARCHIVOS LOCALES (.json y .bin)' },
          {
            opcode: 'cargarDesdeURL',
            blockType: Scratch.BlockType.COMMAND,
            text: '🌐 CARGAR MODELO DESDE URL [LINK]',
            arguments: {
              LINK: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://teachablemachine.withgoogle.com/models/XXXXX/' }
            }
          },
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
          { opcode: 'getClass',      blockType: Scratch.BlockType.REPORTER, text: 'clase detectada' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          {
            opcode: 'isClass',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿ve la clase [CLASE]?',
            arguments: {
              CLASE: { type: Scratch.ArgumentType.STRING, menu: 'DYNAMIC_CLASSES' }
            }
          },
          { opcode: 'getLabels', blockType: Scratch.BlockType.REPORTER, text: 'lista de clases entrenadas' }
        ],
        menus: {
          DYNAMIC_CLASSES: {
            items: '_getDynamicLabels'
          }
        }
      };
    }

    async cargarArchivosLocales() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.json,.bin';
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          const modelFile    = files.find(f => f.name === 'model.json');
          const metadataFile = files.find(f => f.name === 'metadata.json');
          const weightsFile  = files.find(f => f.name.endsWith('.bin'));
          if (!modelFile || !metadataFile || !weightsFile) {
            console.error('IA Teachable: seleccioná model.json, metadata.json y el archivo .bin');
            resolve();
            return;
          }
          try {
            await this._ensureLibs();
            this.model = await window.tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
            this.modelLabels = this.model.getClassLabels().map(l => l.toUpperCase());
          } catch (err) {
            console.error('IA Teachable: error cargando archivos →', err);
          }
          resolve();
        };
        input.click();
      });
    }

    async cargarDesdeURL(args) {
      let url = args.LINK.trim();
      if (!url.endsWith('/')) url += '/';
      try {
        await this._ensureLibs();
        this.model = await window.tmImage.load(url + 'model.json', url + 'metadata.json');
        this.modelLabels = this.model.getClassLabels().map(l => l.toUpperCase());
      } catch (err) {
        console.error('IA Teachable: error cargando URL →', err);
      }
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
          position: 'fixed', zIndex: '1000', border: '3px solid #8B5CF6',
          borderRadius: '10px', left: '400px', top: '10px', width: '160px',
          pointerEvents: 'none', transform: 'scaleX(-1)'
        });
        document.body.appendChild(this.video);
        this._loop();
      } catch (err) {
        console.error("IA Teachable: sin acceso a cámara →", err);
      }
    }

    detenerCamara() {
      if (this.video) {
        this.video.srcObject.getTracks().forEach(t => t.stop());
        this.video.remove();
        this.video = null;
      }
      this.detectedClass = "NADA";
      this.confidence    = 0;
      this._predicting   = false;
    }

    setVideoPos(args)  { if (this.video) { this.video.style.left = args.X + 'px'; this.video.style.top = args.Y + 'px'; } }
    setVideoSize(args) { if (this.video) { this.video.style.width = (480 * (args.SIZE / 100)) + 'px'; } }

    async _loop() {
      if (!this.video) return;

      if (this.model && this.video.readyState >= 2 && !this._predicting) {
        this._predicting = true;
        try {
          const predictions = await this.model.predict(this.video);
          if (predictions && predictions.length > 0) {
            const top = predictions.sort((a, b) => b.probability - a.probability)[0];
            if (top.probability >= 0.4) {
              this.detectedClass = top.className.toUpperCase();
              this.confidence    = Math.round(top.probability * 100);
            } else {
              this.detectedClass = "NADA";
              this.confidence    = 0;
            }
          }
        } catch (e) {
          // Error silencioso frame a frame
        }
        this._predicting = false;
      }

      requestAnimationFrame(() => this._loop());
    }

    getClass()      { return this.detectedClass; }
    getConfidence() { return this.confidence; }
    isClass(args)   { return this.detectedClass === args.CLASE; }
    getLabels()     { return this.modelLabels.join(', '); }
  }

  Scratch.extensions.register(new IATeachableREC());
})(Scratch);
