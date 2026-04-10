// @turbowarp-force-unsandboxed
(function(Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Requiere modo unsandboxed para usar el micrófono');
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
          { opcode: 'clearSpeech', blockType: Scratch.BlockType.COMMAND, text: 'limpiar texto reconocido' },
          "---",
          { opcode: 'getLastSpeech', blockType: Scratch.BlockType.REPORTER, text: 'último texto reconocido' },
          { opcode: 'isMicrophoneActive', blockType: Scratch.BlockType.BOOLEAN, text: '¿escuchando?' }
        ]
      };
    }

    _setupSpeech() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        this.recognition = new SR();
        this.recognition.lang = 'es-ES';
        this.recognition.onstart = () => { this.isListening = true; };
        this.recognition.onresult = (e) => { this.speechResult = e.results[e.results.length - 1][0].transcript.toLowerCase().trim(); };
        this.recognition.onerror = () => { this.isListening = false; };
        this.recognition.onend = () => { this.isListening = false; };
      }
    }

    startListening() { if (this.recognition && !this.isListening) try { this.recognition.start(); } catch (e) {} }
    stopListening() { if (this.recognition && this.isListening) this.recognition.stop(); }
    clearSpeech() { this.speechResult = ""; }
    isMicrophoneActive() { return this.isListening; }
    getLastSpeech() { return this.speechResult; }
  }
  Scratch.extensions.register(new VozATexto());
})(Scratch);
