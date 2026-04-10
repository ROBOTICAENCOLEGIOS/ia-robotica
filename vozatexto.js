// @turbowarp-force-unsandboxed
(function(Scratch) {
  'use strict';
  if (!Scratch.extensions.unsandboxed) {
    console.warn('Requiere modo unsandboxed para el micrófono');
  }

  class VozATexto {
    constructor() {
      this.speechResult = ""; 
      this.isListening = false;
      this.recognition = null;
      this._setupSpeech();
    }

    getInfo() {
      return {
        id: 'vozTextoREC',
        name: 'Voz a Texto',
        color1: '#2563EB',
        blocks: [
          { opcode: 'startListening', blockType: Scratch.BlockType.COMMAND, text: 'empezar a escuchar voz' },
          { opcode: 'stopListening', blockType: Scratch.BlockType.COMMAND, text: 'detener micrófono' },
          { opcode: 'getLastSpeech', blockType: Scratch.BlockType.REPORTER, text: 'último texto reconocido' }
        ]
      };
    }

    _setupSpeech() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        this.recognition = new SR();
        this.recognition.lang = 'es-ES';
        this.recognition.onstart = () => { this.isListening = true; };
        this.recognition.onresult = (e) => { this.speechResult = e.results[0][0].transcript.toLowerCase(); };
        this.recognition.onend = () => { this.isListening = false; };
      }
    }

    startListening() { if (this.recognition) this.recognition.start(); }
    stopListening() { if (this.recognition) this.recognition.stop(); }
    getLastSpeech() { return this.speechResult; }
  }

  Scratch.extensions.register(new VozATexto());
})(Scratch);
