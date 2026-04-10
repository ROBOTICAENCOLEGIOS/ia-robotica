// @turbowarp-force-unsandboxed

(function (Scratch) {
    'use strict';

    // Validación de seguridad: Asegura que la extensión se ejecute fuera del sandbox
    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Modo Unsandboxed requerido');
    }

    /**
     * Clase principal de la extensión IASenalesTransito
     * Diseñada bajo la arquitectura estándar de extensiones para Scratch/TurboWarp.
     */
    class IASenalesTransito {
        /**
         * Constructor: Inicialización del estado interno y persistencia de datos.
         */
        constructor() {
            this.prediction = "NADA";
            this.confidence = 0;
        }

        /**
         * Manifiesto de la extensión: Define la identidad, el nombre y la interfaz de bloques.
         * @returns {Object} Configuración técnica de la extensión.
         */
        getInfo() {
            return {
                id: 'IASenalesTransito',
                name: 'Señales de Tránsito',
                blocks: [
                    {
                        opcode: 'getPrediction',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'predicción'
                    },
                    {
                        opcode: 'getConfidence',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'confianza'
                    }
                ]
            };
        }

        /**
         * Métodos de acceso (Getters) para los reporteros de Scratch.
         */

        // Retorna el valor actual de la predicción detectada
        getPrediction() {
            return this.prediction;
        }

        // Retorna el nivel de confianza del modelo de IA
        getConfidence() {
            return this.confidence;
        }
    }

    /**
     * Instanciación y registro de la extensión en el ecosistema de Scratch.
     */
    Scratch.extensions.register(new IASenalesTransito());

})(Scratch);
