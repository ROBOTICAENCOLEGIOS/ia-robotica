// @turbowarp-force-unsandboxed
(function (Scratch) {
    'use strict';

    /**
     * Validación de seguridad para asegurar el acceso a Web Serial API.
     * La extensión requiere ejecutarse fuera del entorno restrictivo de Scratch.
     */
    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Esta extensión debe ejecutarse sin sandbox (unsandboxed).');
    }

    class RecPcb1Arduino {
        constructor(runtime) {
            this.runtime = runtime;
            this.port = null;
            this._activePort = null;
            this.encoder = new TextEncoder();
            this.decoder = new TextDecoder();
            this._rxRemainder = '';
            this._lineWaiters = [];
            this._readLoopRunning = false;
            
            // Cola de promesas para evitar conflictos de bloqueo en el flujo de escritura serial
            this._serialQueue = Promise.resolve();
            
            // Propiedades para el procesamiento del sensor de distancia
            this._distanceEma = null;
            this._distanceLastMs = 0;
            this._distanceLastDisplay = null;
            this._distanceMinIntervalMs = 65;
            this._distanceLastGood = null;
            
            // Cache de estado para evitar saturación del bus con comandos redundantes
            this._lastMotorValue = {
                IZQ: null,
                DER: null
            };
        }

        /**
         * Definición de metadatos y bloques de la extensión.
         */
        getInfo() {
            return {
                id: 'RecPcb1Arduino',
                name: 'RecPcb1 Arduino',
                color1: '#008CBA',
                color2: '#007096',
                blocks: [
                    {
                        opcode: 'requestPort',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Conectar Arduino'
                    },
                    {
                        opcode: 'setMotorIZQ',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Motor IZQ PWM [VALOR]',
                        arguments: {
                            VALOR: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0
                            }
                        }
                    },
                    {
                        opcode: 'setMotorDER',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Motor DER PWM [VALOR]',
                        arguments: {
                            VALOR: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0
                            }
                        }
                    },
                    {
                        opcode: 'getDistance',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'Distancia'
                    }
                ]
            };
        }

        /**
         * Solicita y abre la conexión con el dispositivo serie.
         */
        async requestPort() {
            try {
                this.port = await navigator.serial.requestPort();
                await this.port.open({ baudRate: 9600 });
                this._activePort = this.port;
                this._readLoop();
            } catch (e) {
                console.error('Error al solicitar o abrir el puerto:', e);
            }
        }

        /**
         * Bucle de lectura asíncrono para recibir datos del Arduino.
         */
        async _readLoop() {
            if (this._readLoopRunning) return;
            this._readLoopRunning = true;

            while (this.port && this.port.readable) {
                const reader = this.port.readable.getReader();
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const chunk = this.decoder.decode(value, { stream: true });
                        this._processData(chunk);
                    }
                } catch (e) {
                    console.error('Error en el bucle de lectura serial:', e);
                    break;
                } finally {
                    reader.releaseLock();
                }
                
                // Verificar si el puerto sigue disponible antes de reintentar
                if (!this.port || !this.port.readable) break;
            }
            this._readLoopRunning = false;
        }

        /**
         * Envía comandos seriales gestionando la exclusión mutua mediante una cola.
         */
        _writeSerial(command) {
            this._serialQueue = this._serialQueue.then(async () => {
                if (!this._activePort || !this._activePort.writable) return;
                const writer = this._activePort.writable.getWriter();
                try {
                    await writer.write(this.encoder.encode(command + '\n'));
                } catch (e) {
                    console.error('Error en escritura serial:', e);
                } finally {
                    writer.releaseLock();
                }
            });
        }

        /**
         * Procesa los fragmentos de datos, reconstruye líneas e implementa suavizado EMA.
         */
        _processData(chunk) {
            this._rxRemainder += chunk;
            const lines = this._rxRemainder.split(/\r?\n/);
            this._rxRemainder = lines.pop();

            const now = Date.now();
            for (const line of lines) {
                // Protocolo esperado: "D:valor"
                if (line.startsWith('D:')) {
                    const distValue = parseFloat(line.substring(2));
                    if (!isNaN(distValue) && (now - this._distanceLastMs >= this._distanceMinIntervalMs)) {
                        
                        // Implementación de Exponential Moving Average (EMA) para filtrado de ruido
                        const alpha = 0.3; 
                        if (this._distanceEma === null) {
                            this._distanceEma = distValue;
                        } else {
                            this._distanceEma = (alpha * distValue) + (1 - alpha) * this._distanceEma;
                        }

                        this._distanceLastGood = parseFloat(this._distanceEma.toFixed(2));
                        this._distanceLastMs = now;
                    }
                }
            }
        }

        /**
         * Reportero que devuelve la última distancia válida procesada.
         */
        getDistance() {
            return this._distanceLastGood !== null ? this._distanceLastGood : 0;
        }

        /**
         * Control del motor izquierdo con limitación de rango PWM.
         */
        async setMotorIZQ(args) {
            let val = Math.round(args.VALOR);
            val = Math.max(-255, Math.min(255, val)); // Clamping de seguridad
            
            if (this._lastMotorValue.IZQ !== val) {
                this._lastMotorValue.IZQ = val;
                this._writeSerial(`I:${val}`);
            }
        }

        /**
         * Control del motor derecho con limitación de rango PWM.
         */
        async setMotorDER(args) {
            let val = Math.round(args.VALOR);
            val = Math.max(-255, Math.min(255, val)); // Clamping de seguridad
            
            if (this._lastMotorValue.DER !== val) {
                this._lastMotorValue.DER = val;
                this._writeSerial(`D:${val}`);
            }
        }
    }

    // Registro de la extensión en el runtime de Scratch
    Scratch.extensions.register(new RecPcb1Arduino(Scratch.runtime));

})(Scratch);
