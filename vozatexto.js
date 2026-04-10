// @turbowarp-force-unsandboxed
/**
 * Implementación técnica de la extensión 'Voz a Texto' para TurboWarp/Scratch.
 * Esta extensión utiliza la Web Speech API para transcripción de audio en tiempo real.
 * 
 * Requisitos:
 * - Entorno 'unsandboxed' para acceso a APIs de hardware/navegador.
 * - Navegador compatible con window.SpeechRecognition (Chrome, Edge, Safari).
 */

(function (Scratch) {
  'use strict';

  // Validación de integridad del entorno de ejecución
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Modo Unsandboxed requerido');
  }

  /**
   * Clase principal de la extensión 'Voz a Texto'.
   * @class
   */
  class VozATexto {
    constructor() {
      /**
       * Almacena la última transcripción procesada con éxito.
       * @type {string}
       */
      this.speechResult = "";

      /**
       * Estado de actividad del motor de reconocimiento.
       * @type {boolean}
       */
      this.isListening = false;

      /**
       * Instancia persistente del motor de reconocimiento de voz.
       * @type {SpeechRecognition|null}
       */
      this.recognition = null;
    }

    /**
     * Retorna los metadatos de configuración de la extensión para el runtime de Scratch.
     * @returns {object} Esquema de bloques y metadatos técnicos.
     */
    getInfo() {
      return {
        id: 'vozatesto',
        name: 'Voz a Texto',
        blocks: [
          {
            /**
             * Retorna el valor actual de 'speechResult'.
             */
            opcode: 'getSpeechResult',
            blockType: Scratch.BlockType.REPORTER,
            text: 'resultado de voz'
          },
          {
            /**
             * Retorna el estado booleano de 'isListening'.
             */
            opcode: 'getIsListening',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '¿escuchando voz?'
          },
          {
            /**
             * Invoca el procedimiento de inicio del reconocimiento de voz.
             */
            opcode: 'startSpeechRecognition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'iniciar reconocimiento de voz'
          }
        ]
      };
    }

    /**
     * Inicializa y arranca el motor de reconocimiento de voz.
     * Implementa lógica de control para evitar colisiones de instancias.
     * @returns {void}
     */
    startSpeechRecognition() {
      // Cláusula de guarda para evitar múltiples instancias simultáneas
      if (this.isListening) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.error("Web Speech API no disponible en este navegador.");
        return;
      }

      // Inicialización perezosa (Lazy Initialization) de la instancia de reconocimiento
      if (!this.recognition) {
        this.recognition = new SpeechRecognition();
        
        // Configuración técnica del motor
        this.recognition.lang = 'es-ES';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        // Manejador: Transición de estado a escucha activa
        this.recognition.onstart = () => {
          this.isListening = true;
        };

        /**
         * Manejador de eventos para el procesamiento de resultados asíncronos.
         * Extrae la transcripción del primer set de resultados.
         */
        this.recognition.onresult = (event) => {
          try {
            if (event.results && event.results.length > 0) {
              const transcript = event.results[0][0].transcript;
              this.speechResult = transcript;
            }
          } catch (error) {
            console.error("Fallo crítico al procesar results de Speech API:", error);
          }
        };

        // Manejador: Gestión de excepciones y errores de hardware/API
        this.recognition.onerror = (event) => {
          console.error("Error en el reconocimiento de voz detectado:", event.error);
          this.isListening = false;
        };

        // Manejador: Limpieza de estado al finalizar el ciclo de escucha
        this.recognition.onend = () => {
          this.isListening = false;
        };
      }

      try {
        this.recognition.start();
      } catch (err) {
        console.error("Error al ejecutar el método start() del motor:", err);
        this.isListening = false;
      }
    }

    /**
     * Retorna estrictamente el valor contenido en speechResult.
     * @returns {string} Texto capturado.
     */
    getSpeechResult() {
      return this.speechResult;
    }

    /**
     * Retorna el estado booleano de la escucha activa.
     * @returns {boolean}
     */
    getIsListening() {
      return this.isListening;
    }
  }

  // Registro de la extensión en el ecosistema global de Scratch
  Scratch.extensions.register(new VozATexto());

})(Scratch);
