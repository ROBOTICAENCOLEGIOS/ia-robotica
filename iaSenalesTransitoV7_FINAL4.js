class IASenalesTransitoV7 {
  constructor(runtime) {
    this.runtime = runtime;
    this.model = null;
    this.video = null;
    this.stream = null;
    this.prediction = "INICIANDO...";
    this.currentLabel = "NADA";
    this.posX = 10;
    this.posY = 10;
  }

  getInfo() {
    return {
      id: 'iaSenalesTransitoV7',
      name: 'IA Señales de Tránsito V7',
      color1: '#FF6B6B',
      color2: '#E63946',
      color3: '#D62828',
      blocks: [
        {
          opcode: 'loadModel',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Cargar Modelo IA',
        },
        {
          opcode: 'start',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Encender Cámara',
        },
        {
          opcode: 'stop',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Apagar Cámara',
        },
        {
          opcode: 'setPos',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Posición X:[X] Y:[Y]',
          arguments: {
            X: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 10,
            },
            Y: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 10,
            },
          },
        },
        {
          opcode: 'getPrediction',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Predicción',
        },
        {
          opcode: 'getConfidence',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Confianza',
        },
        {
          opcode: 'getStatus',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Estado',
        },
      ],
    };
  }

  async _addScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async _init() {
    try {
      this.prediction = "CARGANDO LIBRERÍAS...";
      
      await this._addScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js');
      await this._addScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js');

      const URL = "https://roboticaencolegios.github.io/ia-robotica/modelo_transito/";
      const modelURL = URL + "model.json";
      const metadataURL = URL + "metadata.json";
      
      this.prediction = "CARGANDO MODELO...";
      this.model = await tmImage.load(modelURL, metadataURL);
      this.prediction = "MODELO CARGADO";
    } catch (e) {
      this.prediction = "ERROR AL CARGAR MODELO";
      console.error("Error cargando modelo:", e);
    }
  }

  async loadModel() {
    if (!this.model) {
      await this._init();
    }
  }

  // FINAL4: Llamada síncrona directa absoluta - sin ninguna promesa antes
  start() {
    if (!this.model) {
      this.prediction = "CARGA MODELO PRIMERO";
      return;
    }

    this.prediction = "INICIANDO CÁMARA...";
    
    // Detener stream anterior si existe
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    // Llamada directa e inmediata al gesto del usuario
    // SIN AWAIT, SIN ASYNC, SIN THEN ANTES DE LA LLAMADA
    try {
      // Llamada síncrona directa - debe ser la primera operación
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        }
      })
      .then(stream => {
        this.stream = stream;
        // Ejecutar manejo asíncrono después del gesto
        this._handleCameraStreamAsync();
      })
      .catch(e => {
        this.prediction = "ERROR CÁMARA";
        console.error("Error iniciando cámara:", e);
      });
    } catch (e) {
      console.error('Error en getUserMedia:', e);
      this.prediction = "ERROR CÁMARA";
    }
  }

  // Separar completamente la lógica asíncrona
  async _handleCameraStreamAsync() {
    try {
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
      console.error("Error manejando stream:", e);
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
        const topPrediction = prediction[0];
        this.currentLabel = topPrediction.className;
        this.prediction = `${this.currentLabel} (${Math.round(topPrediction.probability * 100)}%)`;
      }
    } catch (e) {
      console.error("Error en predicción:", e);
    }

    // Continuar loop de predicción
    requestAnimationFrame(() => this._predictLoop());
  }

  getPrediction() {
    return this.currentLabel || "NADA";
  }

  getConfidence() {
    // Extraer el porcentaje del string de predicción
    const match = this.prediction.match(/\((\d+)%\)/);
    return match ? parseInt(match[1]) : 0;
  }

  getStatus() {
    return this.prediction || "INICIANDO...";
  }
}

Scratch.extensions.register(new IASenalesTransitoV7());
