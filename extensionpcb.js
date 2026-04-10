// @turbowarp-force-unsandboxed
(function (Scratch) {
  'use strict';

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
          { opcode: 'checkConnection', blockType: Scratch.BlockType.REPORTER, text: 'Estado Conexión' },
          '---',
          { opcode: 'moveForward', blockType: Scratch.BlockType.COMMAND, text: 'Mover motor [SIDE] ADELANTE al [PCT]%', arguments: { SIDE: { type: 'string', menu: 'motorSide' }, PCT: { type: 'number', defaultValue: 50 } } },
          { opcode: 'moveBackward', blockType: Scratch.BlockType.COMMAND, text: 'Mover motor [SIDE] ATRÁS al [PCT]%', arguments: { SIDE: { type: 'string', menu: 'motorSide' }, PCT: { type: 'number', defaultValue: 50 } } },
          { opcode: 'stopMotor', blockType: Scratch.BlockType.COMMAND, text: 'Detener motor [WHICH]', arguments: { WHICH: { type: 'string', menu: 'stopWhich' } } },
          '---',
          { opcode: 'lightOn', blockType: Scratch.BlockType.COMMAND, text: 'Luz [LED] Color [COLOR]', arguments: { LED: { type: 'string', menu: 'ledWhich' }, COLOR: { type: 'color' } } },
          { opcode: 'lightOff', blockType: Scratch.BlockType.COMMAND, text: 'Apagar Luz [LED]', arguments: { LED: { type: 'string', menu: 'ledWhich' } } },
          '---',
          { opcode: 'distanceCm', blockType: Scratch.BlockType.REPORTER, text: 'Distancia (cm)' },
          { opcode: 'lineDetected', blockType: Scratch.BlockType.BOOLEAN, text: '¿Línea?' }
        ],
        menus: {
          motorSide: { items: [{ text: 'IZQUIERDO', value: 'IZQ' }, { text: 'DERECHO', value: 'DER' }] },
          stopWhich: { items: [{ text: 'IZQUIERDO', value: 'IZQ' }, { text: 'DERECHO', value: 'DER' }, { text: 'AMBOS', value: 'AMBOS' }] },
          ledWhich: { items: ['1', '2', 'TODAS'] }
        }
      };
    }

    _connected() { return !!(this._activePort && this._activePort.readable && this._activePort.writable); }
    checkConnection() { return this._connected() ? 'Conectado' : 'Desconectado'; }

    async connectRobot() {
      try {
        this.port = await navigator.serial.requestPort();
        await this._disconnect();
        this._activePort = this.port;
        await this._activePort.open({ baudRate: 115200 });
        this._rxRemainder = '';
        this._startReadLoop();
      } catch (e) { this._activePort = null; }
    }

    async _disconnect() {
      this._readLoopRunning = false;
      if (this._activePort) { try { await this._activePort.close(); } catch (_) {} this._activePort = null; }
    }

    _enqueueSerial(task) { const next = this._serialQueue.then(() => task()); this._serialQueue = next.catch(() => {}); return next; }
    async _sendLineRaw(msg) { if (!this._activePort || !this._activePort.writable) return; const writer = this._activePort.writable.getWriter(); try { await writer.write(this.encoder.encode(msg + '\n')); } finally { writer.releaseLock(); } }
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
      });
    }

    _startReadLoop() {
      if (this._readLoopRunning || !this._activePort) return;
      this._readLoopRunning = true;
      const run = async () => {
        try {
          while (this._activePort && this._readLoopRunning) {
            const reader = this._activePort.readable.getReader();
            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                this._feedBytes(value);
              }
            } finally { reader.releaseLock(); }
          }
        } catch (_) {}
      };
      run();
    }

    _feedBytes(u8) {
      this._rxRemainder += this.decoder.decode(u8, { stream: true });
      let idx;
      while ((idx = this._rxRemainder.indexOf('\n')) >= 0) {
        const line = this._rxRemainder.slice(0, idx).trim();
        this._rxRemainder = this._rxRemainder.slice(idx + 1);
        for (let i = 0; i < this._lineWaiters.length; i++) {
          if (this._lineWaiters[i].predicate(line)) {
            const w = this._lineWaiters.splice(i, 1)[0];
            if (w.timer) clearTimeout(w.timer);
            w.resolve(line);
            break;
          }
        }
      }
    }

    async moveForward(args) { const s = Math.round((args.PCT / 100) * 255); await this._sendLine(`AT+M_${args.SIDE}=${s}`); }
    async moveBackward(args) { const s = Math.round((args.PCT / 100) * 255) * -1; await this._sendLine(`AT+M_${args.SIDE}=${s}`); }
    async stopMotor(args) { if (args.WHICH === 'AMBOS') await this._sendLine('AT+MOTOR=STOP'); else await this._sendLine(`AT+M_${args.WHICH}=0`); }
    
    async distanceCm() {
      if (!this._connected()) return -1;
      return this._enqueueSerial(async () => {
        const pred = (ln) => /^-?\d+$/.test(ln);
        const linePromise = this._waitForLine(pred, 500).then(ln => parseInt(ln, 10)).catch(() => this._distanceLastGood || 999);
        await this._sendLineRaw('AT+DISTANCIA');
        const res = await linePromise;
        if (res > 2 && res < 450) this._distanceLastGood = res;
        return res;
      });
    }

    async lineDetected() {
      if (!this._connected()) return false;
      return this._enqueueSerial(async () => {
        const linePromise = this._waitForLine(ln => ln === '0' || ln === '1', 500).then(ln => ln === '1').catch(() => false);
        await this._sendLineRaw('AT+IR');
        return await linePromise;
      });
    }
  }
  Scratch.extensions.register(new RecPcb1Arduino(Scratch.runtime));
})(Scratch);
