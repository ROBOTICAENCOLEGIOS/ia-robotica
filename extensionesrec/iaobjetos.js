/**
 * IA: Detección de Objetos - RoboticaEnColegios R.E.C.
 * Detecta objetos cotidianos con COCO-SSD (TensorFlow.js).
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

  // Diccionario de traducción COCO → español (80 clases COCO-SSD cubiertas)
  const _OBJ_ES = {
    'person':         'PERSONA',
    'bicycle':        'BICICLETA',
    'car':            'AUTO',
    'motorcycle':     'MOTO',
    'bus':            'COLECTIVO',
    'truck':          'CAMIÓN',
    'cat':            'GATO',
    'dog':            'PERRO',
    'horse':          'CABALLO',
    'sheep':          'OVEJA',
    'cow':            'VACA',
    'bird':           'PÁJARO',
    'bottle':         'BOTELLA',
    'chair':          'SILLA',
    'cup':            'TAZA',
    'book':           'LIBRO',
    'cell phone':     'CELULAR',
    'laptop':         'COMPUTADORA',
    'keyboard':       'TECLADO',
    'mouse':          'MOUSE',
    'tv':             'TELEVISOR',
    'backpack':       'MOCHILA',
    'handbag':        'CARTERA',
    'scissors':       'TIJERA',
    'clock':          'RELOJ',
    'remote':         'CONTROL REMOTO',
    'umbrella':       'PARAGUAS',
    'apple':          'MANZANA',
    'banana':         'BANANA',
    'orange':         'NARANJA',
    'pizza':          'PIZZA',
    'fork':           'TENEDOR',
    'knife':          'CUCHILLO',
    'spoon':          'CUCHARA',
    'bowl':           'TAZÓN',
    'sports ball':    'PELOTA',
    'baseball bat':   'BATE',
    'teddy bear':     'OSO DE PELUCHE',
    'traffic light':  'SEMÁFORO',
    'stop sign':      'SEÑAL STOP',
    'bench':          'BANCO',
    'potted plant':   'PLANTA',
    'vase':           'JARRÓN',
    'toothbrush':     'CEPILLO',
    'suitcase':       'VALIJA',
    'tie':            'CORBATA',
    'skis':           'ESQUÍS',
    'surfboard':      'TABLA DE SURF',
    'tennis racket':  'RAQUETA',
    'wine glass':     'COPA',
    'couch':          'SILLÓN',
    'dining table':   'MESA',
    'toilet':         'BAÑO',
    'bed':            'CAMA',
    'refrigerator':   'HELADERA',
    'oven':           'HORNO',
    'sink':           'PILETA',
    'microwave':      'MICROONDAS',
    'toaster':        'TOSTADORA',
    'airplane':       'AVIÓN',
    'train':          'TREN',
    'boat':           'BARCO',
    'fire hydrant':   'HIDRANTE',
    'parking meter':  'PARQUÍMETRO',
    'elephant':       'ELEFANTE',
    'bear':           'OSO',
    'zebra':          'CEBRA',
    'giraffe':        'JIRAFA',
    'frisbee':        'FRISBEE',
    'snowboard':      'SNOWBOARD',
    'kite':           'BARRILETE',
    'baseball glove': 'GUANTE BÉISBOL',
    'skateboard':     'SKATE',
    'hot dog':        'PANCHO',
    'sandwich':       'SÁNDWICH',
    'carrot':         'ZANAHORIA',
    'broccoli':       'BRÓCOLI',
    'donut':          'ROSQUILLA',
    'cake':           'TORTA',
    'hair drier':     'SECADORA'
  };

  // Supercategorías COCO → taxonomía para el bloque booleano
  const _CAT_MAP = {
    'person':         'PERSONA',
    // ANIMAL
    'bird':           'ANIMAL', 'cat':            'ANIMAL', 'dog':            'ANIMAL',
    'horse':          'ANIMAL', 'sheep':          'ANIMAL', 'cow':            'ANIMAL',
    'elephant':       'ANIMAL', 'bear':           'ANIMAL', 'zebra':          'ANIMAL',
    'giraffe':        'ANIMAL',
    // VEHÍCULO
    'bicycle':        'VEHÍCULO', 'car':           'VEHÍCULO', 'motorcycle':    'VEHÍCULO',
    'airplane':       'VEHÍCULO', 'bus':           'VEHÍCULO', 'train':         'VEHÍCULO',
    'truck':          'VEHÍCULO', 'boat':          'VEHÍCULO',
    // COMIDA (alimentos + bebidas + utensilios)
    'bottle':         'COMIDA', 'wine glass':     'COMIDA', 'cup':            'COMIDA',
    'fork':           'COMIDA', 'knife':          'COMIDA', 'spoon':          'COMIDA',
    'bowl':           'COMIDA', 'banana':         'COMIDA', 'apple':          'COMIDA',
    'sandwich':       'COMIDA', 'orange':         'COMIDA', 'broccoli':       'COMIDA',
    'carrot':         'COMIDA', 'hot dog':        'COMIDA', 'pizza':          'COMIDA',
    'donut':          'COMIDA', 'cake':           'COMIDA',
    // ELECTRÓNICA
    'tv':             'ELECTRÓNICA', 'laptop':        'ELECTRÓNICA', 'mouse':         'ELECTRÓNICA',
    'remote':         'ELECTRÓNICA', 'keyboard':      'ELECTRÓNICA', 'cell phone':    'ELECTRÓNICA',
    'microwave':      'ELECTRÓNICA', 'oven':          'ELECTRÓNICA', 'toaster':       'ELECTRÓNICA',
    'refrigerator':   'ELECTRÓNICA',
    // MUEBLE
    'chair':          'MUEBLE', 'couch':          'MUEBLE', 'potted plant':   'MUEBLE',
    'bed':            'MUEBLE', 'dining table':   'MUEBLE', 'toilet':         'MUEBLE',
    'sink':           'MUEBLE', 'bench':          'MUEBLE',
    // DEPORTE
    'frisbee':        'DEPORTE', 'skis':          'DEPORTE', 'snowboard':      'DEPORTE',
    'sports ball':    'DEPORTE', 'kite':          'DEPORTE', 'baseball bat':   'DEPORTE',
    'baseball glove': 'DEPORTE', 'skateboard':    'DEPORTE', 'surfboard':      'DEPORTE',
    'tennis racket':  'DEPORTE'
  };

  class IAObjetosREC {
    constructor() {
      this.model       = null;
      this.modelReady  = false;
      this._detecting  = false;
      this.object      = "NADA";
      this.confidence  = 0;
      this.posX        = 0;
      this.posY        = 0;
      this._rawClass   = '';
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

    async cargarModelo() {
      if (this.modelReady) return;
      try {
        await this._loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
        await this._loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd");
        this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
        this.modelReady = true;
      } catch (e) {
        console.error("IA Objetos: error cargando COCO-SSD →", e);
      }
    }

    getInfo() {
      return {
        id: 'iaObjetosREC',
        name: 'IA: Detección de Objetos',
        color1: '#F43F5E',
        blocks: [
          { opcode: 'cargarModelo', blockType: Scratch.BlockType.COMMAND, text: '⏳ CARGAR MODELO DE OBJETOS' },
          {
            opcode: 'encenderCamara',
            blockType: Scratch.BlockType.COMMAND,
            text: '📷 encender cámara en modo: [MODO]',
            arguments: { MODO: { type: Scratch.ArgumentType.STRING, menu: 'MODO_CAMARA' } }
          },
          { opcode: 'detenerCamara', blockType: Scratch.BlockType.COMMAND, text: '❌ APAGAR CÁMARA OBJETOS' },
          "---",
          { opcode: 'getCamaraX', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada X de la cámara' },
          { opcode: 'getCamaraY', blockType: Scratch.BlockType.REPORTER, text: '📷 coordenada Y de la cámara' },
          "---",
          { opcode: 'getObject',     blockType: Scratch.BlockType.REPORTER, text: 'objeto detectado' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'exactitud %' },
          {
            opcode: 'isCategory',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿ve categoría [CATEGORIA]?',
            arguments: { CATEGORIA: { type: Scratch.ArgumentType.STRING, menu: 'CATEGORY_MENU' } }
          },
          { opcode: 'getPosX', blockType: Scratch.BlockType.REPORTER, text: 'posición X del objeto' },
          { opcode: 'getPosY', blockType: Scratch.BlockType.REPORTER, text: 'posición Y del objeto' }
        ],
        menus: {
          MODO_CAMARA: {
            items: ['FLOTANTE FIJA', 'FLOTANTE ARRASTRABLE', 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)']
          },
          CATEGORY_MENU: {
            items: ['PERSONA', 'ANIMAL', 'VEH\u00CDCULO', 'COMIDA', 'ELECTR\u00d3NICA', 'MUEBLE', 'DEPORTE']
          }
        }
      };
    }

    async encenderCamara(args) {
      if (window.RECCamera && window.RECCamera.video) return;
      await this._ensureCamera();
      const video = await window.RECCamera.start(args.MODO, '#F43F5E');
      if (video) this._loop();
    }

    detenerCamara() {
      this._detecting = false;
      if (window.RECCamera) window.RECCamera.stop();
      this.object     = "NADA";
      this.confidence = 0;
      this.posX       = 0;
      this.posY       = 0;
      this._rawClass  = '';
      // Anti-crash: liberar modelo y tensores residuales de TensorFlow.js
      if (this.model && typeof this.model.dispose === 'function') {
        try { this.model.dispose(); } catch (e) {}
        this.model = null;
        this.modelReady = false;
      }
      try { if (window.tf) window.tf.disposeVariables(); } catch (e) {}
    }

    async _loop() {
      const cam = window.RECCamera;
      if (!cam || !cam.video) return;

      if (this.modelReady && cam.video.readyState >= 2 && !this._detecting) {
        this._detecting = true;
        try {
          const predictions = await this.model.detect(cam.video);

          if (predictions && predictions.length > 0) {
            const top = predictions.sort((a, b) => b.score - a.score)[0];
            if (top.score >= 0.4) {
              this.object     = _OBJ_ES[top.class] || top.class.toUpperCase();
              this.confidence = Math.round(top.score * 100);
              this._rawClass  = top.class;
              const [bx, by, bw, bh] = top.bbox;
              const cx = bx + bw / 2;
              const cy = by + bh / 2;
              this.posX = Math.round((0.5 - cx / 480) * 480);
              this.posY = Math.round((0.5 - cy / 360) * 360);
            } else {
              this.object = "NADA"; this.confidence = 0;
              this.posX = 0; this.posY = 0; this._rawClass = '';
            }
          } else {
            this.object = "NADA"; this.confidence = 0;
            this.posX = 0; this.posY = 0; this._rawClass = '';
          }
        } catch (e) {}
        this._detecting = false;
      }

      requestAnimationFrame(() => this._loop());
    }

    getCamaraX()    { return window.RECCamera ? Math.round(window.RECCamera.camaraX) : 0; }
    getCamaraY()    { return window.RECCamera ? Math.round(window.RECCamera.camaraY) : 0; }
    getObject()     { return this.object; }
    getConfidence() { return this.confidence; }
    isCategory(args) { return !!this._rawClass && _CAT_MAP[this._rawClass] === args.CATEGORIA; }
    getPosX()       { return this.posX; }
    getPosY()       { return this.posY; }
  }

  Scratch.extensions.register(new IAObjetosREC());
})(Scratch);
