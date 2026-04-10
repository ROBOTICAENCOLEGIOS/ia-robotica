// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';
  class VozATexto {
    constructor() {
      this.result = "";
      this.isListening = false;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        this.rec = new SR();
        this.rec.lang = 'es-ES';
        this.rec.onresult = (e) => { this.result = e.results[0][0].transcript.toLowerCase(); };
        this.rec.onend = () => { this.isListening = false; };
      }
    }

    getInfo() {
      return {
        id: 'vozatextorec',
        name: 'Voz a Texto',
        color1: '#8E44AD',
        blocks: [
          { opcode: 'escuchar', blockType: Scratch.BlockType.COMMAND, text: 'Escuchar voz' },
          { opcode: 'getVoz', blockType: Scratch.BlockType.REPORTER, text: 'Texto escuchado' }
        ]
      };
    }

    escuchar() { if (this.rec) { this.isListening = true; this.rec.start(); } }
    getVoz() { return this.result; }
  }
  Scratch.extensions.register(new VozATexto());
})(Scratch);
