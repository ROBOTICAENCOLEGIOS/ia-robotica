/**
 * IA: Visión REC Pro - VERSIÓN CORREGIDA
 * Soluciona el problema de variables que no actualizan.
 */

(function (Scratch) {
  'use strict';





  class IAVisionRECPro {
    constructor() {
      this.video = null;
      this.status = "Apagado";
      // Inicializamos con valores por defecto claros
      this.facesDetected = 0;
      this.handsDetected = 0;
      this.isPinching = false;
      this.indexX = 0;
      this.modelsReady = false;

      this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
      this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
      this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
  

    _loadScript(url) {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        document.head.appendChild(script);
    );
  

    getInfo() {
      return {
        id: 'iaVisionRECPro',
        name: 'IA: Visión REC Pro',
        color1: '#FF5733',
        blocks: [
          { opcode: 'iniciarIA', blockType: Scratch.BlockType.COMMAND, text: '1. ENCENDER cámara e IA' },
          { opcode: 'detenerIA', blockType: Scratch.BlockType.COMMAND, text: '2. APAGAR cámara' },
          { opcode: 'getStatus', blockType: Scratch.BlockType.REPORTER, text: 'Estado de la IA' },
          "---",
          {
            opcode: 'setVideoPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Mover cámara a x: [X] y: [Y]',
            arguments: { X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } }
        ,
          {
            opcode: 'setVideoSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Tamaño de cámara al [SIZE] %',
            arguments: { SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 } }
        ,
          "---",
          { opcode: 'getFaces', blockType: Scratch.BlockType.REPORTER, text: 'cantidad de rostros' },
          { opcode: 'getHands', blockType: Scratch.BlockType.REPORTER, text: 'cantidad de manos' },
          { opcode: 'getPinch', blockType: Scratch.BlockType.BOOLEAN, text: '¿dedos pellizcando?' },
          { opcode: 'getIndexX', blockType: Scratch.BlockType.REPORTER, text: 'posición X dedo índice' }
        ]
    ;
  

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
      );
        document.body.appendChild(this.video);

        // Forzar carga de modelos si no están listos
        const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
        const faceMesh = new window.FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});

        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5 });
        faceMesh.setOptions({ maxNumFaces: 4, refineLandmarks: true, minDetectionConfidence: 0.5 });

        // CALLBACK DE MANOS CORREGIDO
        hands.onResults((results) => {
          this.handsDetected = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
          if (this.handsDetected > 0) {
            const h = results.multiHandLandmarks[0]; // Usar la primera mano detectada
            // El punto 8 es la punta del índice, el 4 es la punta del pulgar
            const dist = Math.sqrt(
              Math.pow(h[4].x - h[8].x, 2) + 
              Math.pow(h[4].y - h[8].y, 2)
            );
            this.isPinching = dist < 0.08; 
            this.indexX = (0.5 - h[8].x) * 480; // Invertido por el modo espejo
         else {
            this.isPinching = false;
        
      );

        faceMesh.onResults((results) => {
          this.facesDetected = results.multiFaceLandmarks ? results.multiFaceLandmarks.length : 0;
      );

        const camera = new window.Camera(this.video, {
          onFrame: async () => {
            if (this.video && this.video.readyState >= 2) {
              await hands.send({image: this.video});
              await faceMesh.send({image: this.video});
          
        ,
          width: 480, height: 360
      );
        camera.start();

        this.status = "Listo para detectar";
     catch (err) {
        console.error(err);
        this.status = "Error: Sin cámara";
    
  

    detenerIA() {
      if (this.video) {
        this.video.srcObject.getTracks().forEach(t => t.stop());
        this.video.remove();
        this.video = null;
    
      this.status = "Apagado";
      this.facesDetected = 0;
      this.handsDetected = 0;
      this.isPinching = false;
  

    setVideoPos(args) { if (this.video) { this.video.style.left = args.X + 'px'; this.video.style.top = args.Y + 'px'; } }
    setVideoSize(args) { if (this.video) { this.video.style.width = (480 * (args.SIZE / 100)) + 'px'; } }
    getStatus() { return this.status; }
    getFaces() { return this.facesDetected; }
    getHands() { return this.handsDetected; }
    getPinch() { return this.isPinching; }
    getIndexX() { return Math.round(this.indexX); }


  Scratch.extensions.register(new IAVisionRECPro());
})(Scratch);
