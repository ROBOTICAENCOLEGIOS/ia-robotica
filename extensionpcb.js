// @turbowarp-force-unsandboxed
/**
 * TurboWarp / Scratch 3 Custom Extension — REC PCB1 ARDUINO v1.7.2
 * Web Serial API @ 115200 baud. Verde Militar & Bloques Musicales. 
 */ 
(function (Scratch) { 
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Esta extensión requiere modo unsandboxed para acceder al Serial API.');
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

        async connectRobot() {
            try {
                this.port = await navigator.serial.requestPort();
                this._activePort = this.port;
                await this._activePort.open({ baudRate: 115200 });
                this._startReadLoop();
            } catch (e) { console.error(e); }
        }

        _startReadLoop() {
            if (this._readLoopRunning || !this._activePort) return;
            this._readLoopRunning = true;
            const run = async () => {
                const reader = this._activePort.readable.getReader();
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        this._feedBytes(value);
                    }
                } finally { reader.releaseLock(); }
            };
            run();
        }

        _feedBytes(u8) {
            this._rxRemainder += this.decoder.decode(u8, { stream: true });
            let idx;
            while ((idx = this._rxRemainder.indexOf('\n')) >= 0) {
                const line = this._rxRemainder.slice(0, idx).trim();
                this._rxRemainder = this._rxRemainder.slice(idx + 1);
                if (line) this._dispatchLine(line);
            }
        }

        _dispatchLine(line) {
            for (let i = 0; i < this._lineWaiters.length; i++) {
                const w = this._lineWaiters[i];
                if (w.predicate(line)) {
                    this._lineWaiters.splice(i, 1);
                    w.resolve(line);
                    return;
                }
            }
        }

        async _sendLineRaw(msg) {
            if (!this._activePort) return;
            const writer = this._activePort.writable.getWriter();
            await writer.write(this.encoder.encode(msg + '\n'));
            writer.releaseLock();
        }

        async _sendLine(msg) {
            this._serialQueue = this._serialQueue.then(() => this._sendLineRaw(msg));
            return this._serialQueue;
        }

        _waitForLine(predicate, timeout) {
            return new Promise((resolve, reject) => {
                const w = { predicate, resolve, reject };
                this._lineWaiters.push(w);
                setTimeout(() => {
                    const idx = this._lineWaiters.indexOf(w);
                    if (idx >= 0) {
                        this._lineWaiters.splice(idx, 1);
                        reject();
                    }
                }, timeout);
            });
        }

        async moveForward(args) { await this._sendLine(`AT+M_${args.SIDE}=${Math.round(args.PCT * 2.55)}`); }
        async moveBackward(args) { await this._sendLine(`AT+M_${args.SIDE}=-${Math.round(args.PCT * 2.55)}`); }
        async stopMotor(args) { await this._sendLine(args.WHICH === 'AMBOS' ? 'AT+MOTOR=STOP' : `AT+M_${args.WHICH}=0`); }
        async lightOn(args) { 
            const r = parseInt(args.COLOR.slice(1,3), 16);
            const g = parseInt(args.COLOR.slice(3,5), 16);
            const b = parseInt(args.COLOR.slice(5,7), 16);
            await this._sendLine(`AT+LED${args.LED}=${r},${g},${b}`); 
        }
        async lightOff(args) { await this._sendLine(`AT+LED${args.LED}=0,0,0`); }
        async playNote(args) { await this._sendLine(`AT+NOTE=${args.NOTE},${args.MS}`); }
        
        async distanceCm() {
            const p = this._waitForLine(l => /^\d+$/.test(l), 1000).catch(() => "999");
            await this._sendLineRaw('AT+DISTANCIA');
            return await p;
        }
        async lineDetected() {
            const p = this._waitForLine(l => l === "0" || l === "1", 1000).catch(() => "0");
            await this._sendLineRaw('AT+IR');
            return (await p) === "1";
        }
        _connected() { return !!this._activePort; }
        checkConnection() { return this._connected() ? 'Connected' : 'Disconnected'; }
    }

    Scratch.extensions.register(new RecPcb1Arduino(Scratch.runtime));
})(Scratch);
