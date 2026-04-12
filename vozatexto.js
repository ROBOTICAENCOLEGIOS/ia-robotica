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
          {
            opcode: 'startListening',
            blockType: Scratch.BlockType.COMMAND,
            text: 'empezar a escuchar voz'
          },
          {
            opcode: 'stopListening',
            blockType: Scratch.BlockType.COMMAND,
            text: 'detener micrófono'
          },
          {
            opcode: 'clearSpeech',
            blockType: Scratch.BlockType.COMMAND,
            text: 'limpiar texto reconocido'
          },
          "---",
          {
            opcode: 'getLastSpeech',
            blockType: Scratch.BlockType.REPORTER,
            text: 'último texto reconocido'
          },
          {
            opcode: 'isMicrophoneActive',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿escuchando?'
          }
        ]
      };
    }

    _setupSpeech() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'es-ES';
        this.recognition.continuous = false; 
        this.recognition.interimResults = false;

        this.recognition.onstart = () => {
          this.isListening = true;
        };

        this.recognition.onresult = (event) => {
          const last = event.results.length - 1;
          const text = event.results[last][0].transcript;
          this.speechResult = text.toLowerCase().trim();
        };

        this.recognition.onerror = () => { this.isListening = false; };
        this.recognition.onend = () => { this.isListening = false; };
      }
    }

    startListening() {
      if (this.recognition && !this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          console.error(e);
        }
      }
    }

    stopListening() {
      if (this.recognition && this.isListening) {
        this.recognition.stop();
      }
    }

    clearSpeech() {
      this.speechResult = "";
    }

    isMicrophoneActive() {
      return this.isListening;
    }

    getLastSpeech() {
      return this.speechResult;
    }
  }

  Scratch.extensions.register(new VozATexto());
})(Scratch);