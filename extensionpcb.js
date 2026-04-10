// @turbowarp-force-unsandboxed
/**
 * TurboWarp / Scratch 3 Custom Extension — REC PCB1 ARDUINO v1.7.2
 * Web Serial API @ 115200 baud. Verde Militar & Bloques Musicales. 
 */ 
(function (Scratch) { 
    'use strict';

    // Verificación de seguridad unsandboxed
    if (!Scratch.extensions.unsandboxed) {
        console.warn('La extensión REC PCB1 requiere modo unsandboxed. Intentando elevar privilegios...');
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
            this._serialQueue = Promise.resolve();
            this._distanceEma = null;
            this._distanceLastMs = 0;
            this._distanceLastDisplay = null;
            this._distanceMinIntervalMs = 65;
            this._distanceLastGood = null;
            this._lastMotorValue = { IZQ: null, DER: null };
        }

        getInfo() {
            return {
                id: 'recpcb1arduino',
                name: 'REC PCB1 ARDUINO',
                color1: '#4b5320',
                color2: '#3d441a',
                color3: '#2f3514',
                blocks: [
                    { opcode: 'connectRobot', blockType: Scratch.BlockType.COMMAND, text: 'Conectar Robot' },
                    { opcode: 'checkConnection', blockType: Scratch.BlockType.REPORTER, text: 'Check Connection' },
                    '---',
                    { opcode: 'moveForward', blockType: Scratch.BlockType.COMMAND, text: 'Mover motor [SIDE] hacia ADELANTE a [PCT]%', arguments: { SIDE: { type: 'string', menu: 'motorSide' }, PCT: { type: 'number', defaultValue: 50 } } },
                    { opcode: 'moveBackward', blockType: Scratch.BlockType.COMMAND, text: 'Mover motor [SIDE] hacia ATRÁS a [PCT]%', arguments: { SIDE: { type: 'string', menu: 'motorSide' }, PCT: { type: 'number', defaultValue: 50 } } },
                    { opcode: 'stopMotor', blockType: Scratch.BlockType.COMMAND, text: 'Detener motor [WHICH]', arguments: { WHICH: { type: 'string', menu: 'stopWhich' } } },
                    '---',
                    { opcode: 'lightOn', blockType: Scratch.BlockType.COMMAND, text: 'Encender Luz [LED] en color [COLOR]', arguments: { LED: { type: 'string', menu: 'ledWhich' }, COLOR: { type: 'color' } } },
                    { opcode: 'lightOff', blockType: Scratch.BlockType.COMMAND, text: 'Apagar Luz [LED]', arguments: { LED: { type: 'string', menu: 'ledWhich' } } },
                    { opcode: 'playNote', blockType: Scratch.BlockType.COMMAND, text: 'Tocar nota [NOTE] por [MS] ms', arguments: { NOTE: { type: 'number', menu: 'musicalNotes', defaultValue: 262 }, MS: { type: 'number', defaultValue: 500 } } },
                    '---',
                    { opcode: 'distanceCm', blockType: Scratch.BlockType.REPORTER, text: 'Distancia en cm' },
                    { opcode: 'lineDetected', blockType: Scratch.BlockType.BOOLEAN, text: '¿Detecta línea?' },
                ],
                menus: {
                    motorSide: { items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }] },
                    stopWhich: { items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }, { text: 'AMBOS', value: 'AMBOS' }] },
                    ledWhich: { items: ['1', '2', 'TODAS'] },
                    musicalNotes: { items: [
                        { text: 'DO (C4)', value: '262' }, { text: 'RE (D4)', value: '294' }, { text: 'MI (E4)', value: '330' },
                        { text: 'FA (F4)', value: '349' }, { text: 'SOL (G4)', value: '392' }, { text: 'LA (A4)', value: '440' },
                        { text: 'SI (B4)', value: '494' }, { text: 'DO (C5)', value: '523' }
                    ]},
                },
            };
        }

        _connected() { return !!(this._activePort && this._activePort.readable && this._activePort.writable); }
        checkConnection() { return this._connected() ? 'Connected' : 'Disconnected'; }

        async connectRobot() {
            try {
                this.port = await navigator.serial.requestPort();
                await this._disconnect();
                this._activePort = this.port;
                await this._activePort.open({ baudRate: 115200 });
                this._rxRemainder = '';
                this._lineWaiters = [];
                this._startReadLoop();
            } catch (e) { this._activePort = null; }
        }

        async _disconnect() {
            this._readLoopRunning = false;
            if (this._activePort) {
                try { await this._activePort.close(); } catch (_) {}
                this._activePort = null;
            }
        }

        _enqueueSerial(task) {
            const next = this._serialQueue.then(() => task());
            this._serialQueue = next.catch(() => {});
            return next;
        }

        async _sendLineRaw(msg) {
            if (!this._activePort || !this._activePort.writable) return;
            const writer = this._activePort.writable.getWriter();
            try { await writer.write(this.encoder.encode(msg + '\n')); } finally { writer.releaseLock(); }
        }

        async _sendLine(msg) { return this._enqueueSerial(() => this._sendLineRaw(msg)); }

        _waitForLine(predicate, timeoutMs) {
            return new Promise((resolve, reject) => {
                const w = { predicate, resolve, reject };
                this._lineWaiters.push(w);
                if (timeoutMs > 0) {
                    w.timer = setTimeout(() => {
                        const j = this._lineWaiters.indexOf(w);
                        if (j >= 0) this._lineWaiters.splice(j, 1);
                        reject(new Error('Timeout'));
                    }, timeoutMs);
                }
                const origResolve = w.resolve;
                w.resolve = (val) => { if (w.timer) clearTimeout(w.timer); origResolve(val); };
            });
        }

        _startReadLoop() {
            if (this._readLoopRunning || !this._activePort || !this._activePort.readable) return;
            this._readLoopRunning = true;
            const run = async () => {
                try {
                    while (this._activePort && this._readLoopRunning) {
                        const reader = this._activePort.readable.getReader();
                        try {
                            for (;;) {
                                const { value, done } = await reader.read();
                                if (done) break;
                                if (value && value.
