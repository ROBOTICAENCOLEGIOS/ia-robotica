// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';

  // Validación de seguridad para modo unsandboxed
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Modo Unsandboxed requerido');
  }

  class IAVisionRECPro {
    constructor(runtime) {
      // Inicialización de propiedades y referencia al runtime
      this.runtime = runtime;
      this.video = null;
      this.status = "Apagado";
      this.handsDetected = 0;
      this.isPinching = false;
    }

    // Define los metadatos y la estructura de los bloques
    getInfo() {
      return {
        id: 'IAVisionRECPro',
        name: 'Visión IA Pro',
        blocks: [
          {
            opcode: 'getStatus',
            blockType: 'reporter',
            text: 'estado de la IA'
          },
          {
            opcode: 'getHandsDetected',
            blockType: 'reporter',
            text: 'manos detectadas'
          },
          {
            opcode: 'getIsPinching',
            blockType: 'Boolean',
            text: '¿pellizcando?'
          }
        ]
      };
    }

    // Retorna el valor actual de la propiedad status
    getStatus() {
      return this.status;
    }

    // Retorna el valor actual de manos detectadas
    getHandsDetected() {
      return this.handsDetected;
    }

    // Retorna el estado booleano del gesto de pellizco
    getIsPinching() {
      return !!this.isPinching;
    }
  }

  // Registro de la extensión en el entorno
  Scratch.extensions.register(new IAVisionRECPro(Scratch.runtime));
})(Scratch);
