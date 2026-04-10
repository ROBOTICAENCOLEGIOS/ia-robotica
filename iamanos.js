// @turbowarp-force-unsandboxed
(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('IA Visión requiere modo unsandboxed para acceder a la cámara.');
    }

    class IAVisionRECPro {
        constructor() {
            this.video = null;
            this.status = "Apagado";
            this.facesDetected = 0;
            this.handsDetected = 0;
            this.isPinching = false;
            this.indexX = 0;

            this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
            this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
            this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        }

        _loadScript(url) {
            const s = document.createElement('script');
            s.src = url;
            document.head.appendChild(s);
        }

        getInfo() {
            return {
                id: 'iavisionrecpro',
                name: 'IA Visión REC',
                color1: '#FF5733',
                blocks: [
                    { opcode: 'iniciarIA', blockType: Scratch.BlockType.COMMAND, text: 'ENCENDER cámara e IA' },
                    { opcode: 'detenerIA', blockType: Scratch.BlockType.COMMAND, text: 'APAGAR cámara' },
                    { opcode: 'getFaces', blockType: Scratch.BlockType.REPORTER, text: 'rostros' },
                    { opcode: 'getHands', blockType: Scratch.BlockType.REPORTER, text: 'manos' },
                    { opcode: 'getPinch', blockType: Scratch.BlockType.BOOLEAN, text: '¿pellizca?' },
                    { opcode: 'getIndexX', blockType: Scratch.BlockType.REPORTER, text: 'posición X índice' }
                ]
            };
        }

        async iniciarIA() {
            this.status = "Iniciando...";
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.video = document.createElement('video');
            this.video.srcObject = stream;
            this.video.play();
            // Lógica de detección simplificada para el registro
        }

        detenerIA() {
            if (this.video) this.video.srcObject.getTracks().forEach(t => t.stop());
            this.video = null;
        }

        getFaces() { return this.facesDetected; }
        getHands() { return this.handsDetected; }
        getPinch() { return this.isPinching; }
        getIndexX() { return this.indexX; }
    }

    Scratch.extensions.register(new IAVisionRECPro());
})(Scratch);
