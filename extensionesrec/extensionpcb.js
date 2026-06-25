/**
TurboWarp / Scratch 3 Custom Extension � REC PCB1 ARDUINO v2.0 (GOLDEN BACKUP)
Web Serial API @ 115200 baud. Verde Militar & Bloques Musicales. */ (function (Scratch) { 'use strict';

if (!Scratch.extensions.unsandboxed) {
  throw new Error('Esta extension debe ejecutarse sin sandbox (unsandboxed) para acceder al puerto serial.');
}

class RecPcb1Arduino { constructor(runtime) { this.runtime = runtime; this.port = null; this._activePort = null; this.encoder = new TextEncoder(); this.decoder = new TextDecoder(); this._rxRemainder = ''; this._lineWaiters = []; this._readLoopRunning = false; this._serialQueue = Promise.resolve();
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
      { func: 'connectRobot', blockType: Scratch.BlockType.BUTTON, text: 'Conectar Robot', callFunc: this.connectRobot.bind(this) },
      { opcode: 'checkConnection', blockType: Scratch.BlockType.REPORTER, text: 'Check Connection' },
      '---',
      {
        opcode: 'moveForward',
        blockType: Scratch.BlockType.COMMAND,
        text: 'Mover motor [SIDE] hacia ADELANTE a [PCT]%',
        arguments: { 
          SIDE: { type: Scratch.ArgumentType.STRING, menu: 'motorSide', defaultValue: 'IZQ' }, 
          PCT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 } 
        }
      },
      {
        opcode: 'moveBackward',
        blockType: Scratch.BlockType.COMMAND,
        text: 'Mover motor [SIDE] hacia ATRAS a [PCT]%',
        arguments: { 
          SIDE: { type: Scratch.ArgumentType.STRING, menu: 'motorSide', defaultValue: 'IZQ' }, 
          PCT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 } 
        }
      },
      {
        opcode: 'stopMotor',
        blockType: Scratch.BlockType.COMMAND,
        text: 'Detener motor [WHICH]',
        arguments: { 
          WHICH: { type: Scratch.ArgumentType.STRING, menu: 'stopWhich', defaultValue: 'AMBOS' } 
        }
      },
      '---',
      {
        opcode: 'lightOn',
        blockType: Scratch.BlockType.COMMAND,
        text: 'Encender Luz [LED] en color [COLOR]',
        arguments: { 
          LED: { type: Scratch.ArgumentType.STRING, menu: 'ledWhich', defaultValue: 'TODAS' }, 
          COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ff0000' } 
        }
      },
      { 
        opcode: 'lightOff', 
        blockType: Scratch.BlockType.COMMAND, 
        text: 'Apagar Luz [LED]', 
        arguments: { 
          LED: { type: Scratch.ArgumentType.STRING, menu: 'ledWhich', defaultValue: 'TODAS' } 
        } 
      },
      {
        opcode: 'playNote',
        blockType: Scratch.BlockType.COMMAND,
        text: 'Tocar nota [NOTE] por [MS] ms',
        arguments: { 
          NOTE: { type: Scratch.ArgumentType.NUMBER, menu: 'musicalNotes', defaultValue: 262 }, 
          MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 500 } 
        }
      },
      '---',
      {
        opcode: 'getDHT',
        blockType: Scratch.BlockType.REPORTER,
        text: 'Obtener [TIPO]',
        arguments: { 
          TIPO: { type: Scratch.ArgumentType.STRING, menu: 'dhtMenu', defaultValue: 'TEMP' } 
        }
      },
      { opcode: 'distanceCm', blockType: Scratch.BlockType.REPORTER, text: 'Distancia en cm' },
      { opcode: 'lineDetected', blockType: Scratch.BlockType.BOOLEAN, text: 'Detecta linea' },
      '---',
      { opcode: 'restaurarFirmware', blockType: Scratch.BlockType.COMMAND, text: 'Restaurar firmware original 🔄' }
    ],
    menus: {
      motorSide: { items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }] },
      stopWhich: { items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }, { text: 'AMBOS', value: 'AMBOS' }] },
      ledWhich: { items: ['1', '2', 'TODAS'] },
      dhtMenu: { items: [{ text: 'Temperatura (C)', value: 'TEMP' }, { text: 'Humedad (%)', value: 'HUM' }] },
      musicalNotes: {
        items: [
          { text: 'DO (C4)', value: '262' }, { text: 'RE (D4)', value: '294' }, { text: 'MI (E4)', value: '330' },
          { text: 'FA (F4)', value: '349' }, { text: 'SOL (G4)', value: '392' }, { text: 'LA (A4)', value: '440' },
          { text: 'SI (B4)', value: '494' }, { text: 'DO (C5)', value: '523' }
        ]
      }
    }
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
    this._startReadLoop();
  } catch (e) { 
    console.error("Error al conectar:", e);
    this._activePort = null; 
  }
}

async _disconnect() {
  this._readLoopRunning = false;
  if (this._activePort) { try { await this._activePort.close(); } catch (_) {} this._activePort = null; }
  this._lastMotorValue = { IZQ: null, DER: null };
}

_enqueueSerial(task) { const next = this._serialQueue.then(() => task()); this._serialQueue = next.catch(() => {}); return next; }

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
    if (timeoutMs > 0) { w.timer = setTimeout(() => {
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
        try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (value && value.byteLength) this._feedBytes(value); }
        } finally { reader.releaseLock(); }
      }
    } catch (_) {} finally { this._readLoopRunning = false; }
  };
  run();
}

_feedBytes(u8) {
  this._rxRemainder += this.decoder.decode(u8, { stream: true });
  let idx;
  while ((idx = this._rxRemainder.indexOf('\n')) >= 0) {
    const line = this._rxRemainder.slice(0, idx).replace(/\r$/, '').trim();
    this._rxRemainder = this._rxRemainder.slice(idx + 1);
    if (line) this._dispatchLine(line);
  }
}

_dispatchLine(line) {
  for (let i = 0; i < this._lineWaiters.length; i++) {
    const w = this._lineWaiters[i];
    if (w.predicate(line)) { this._lineWaiters.splice(i, 1); w.resolve(line); return; }
  }
}

_hexToRgb(hex) {
  let s = String(hex).trim(); if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

async _setMotor(side, value) {
  if (this._lastMotorValue[side] === value) return;
  this._lastMotorValue[side] = value;
  await this._sendLine(`AT+M_${side}=${value}`);
}

async moveForward(args) { await this._setMotor(args.SIDE, Math.round((Math.abs(args.PCT) / 100) * 255)); }
async moveBackward(args) { await this._setMotor(args.SIDE, Math.round((Math.abs(args.PCT) / 100) * 255) * -1); }

async stopMotor(args) {
  if (args.WHICH === 'AMBOS') {
    await this._setMotor('IZQ', 0);
    await this._setMotor('DER', 0);
  } else { 
    await this._setMotor(args.WHICH, 0); 
  }
}

async lightOn(args) { 
  const rgb = this._hexToRgb(args.COLOR); 
  if (args.LED === 'TODAS') {
    await this._sendLine(`AT+LED1=${rgb.r},${rgb.g},${rgb.b}`);
    await this._sendLine(`AT+LED2=${rgb.r},${rgb.g},${rgb.b}`);
  } else {
    await this._sendLine(`AT+LED${args.LED}=${rgb.r},${rgb.g},${rgb.b}`); 
  }
}

async lightOff(args) { 
  if (args.LED === 'TODAS') {
    await this._sendLine(`AT+LED1=0,0,0`);
    await this._sendLine(`AT+LED2=0,0,0`);
  } else {
    await this._sendLine(`AT+LED${args.LED}=0,0,0`); 
  }
}

async playNote(args) { await this._sendLine(`AT+NOTE=${Math.round(args.NOTE)},${Math.max(0, Math.round(args.MS))}`); }

async getDHT(args) {
  if (!this._connected()) return "Error";
  return this._enqueueSerial(async () => {
    const pred = (ln) => ln.includes(',');
    const linePromise = this._waitForLine(pred, 2000)
      .then((ln) => {
        const parts = ln.split(',');
        if (parts[0] === "0" && parts[1] === "0") return "Error Sensor"; 
        return args.TIPO === 'TEMP' ? parseFloat(parts[1]) : parseFloat(parts[0]);
      })
      .catch(() => "Timeout");
    await this._sendLineRaw('AT+DHT');
    return await linePromise;
  });
}

distanceCm() {
  if (!this._connected()) return -1;
  const now = Date.now();
  if (this._distanceLastDisplay != null && now - this._distanceLastMs < this._distanceMinIntervalMs) return Promise.resolve(this._distanceLastDisplay);
  return this._enqueueSerial(async () => {
    const pred = (ln) => /^-?\d+$/.test(ln);
    const linePromise = this._waitForLine(pred, 1500)
      .then((ln) => {
        const raw = parseInt(ln, 10);
        if (raw > 0 && raw < 450) { this._distanceLastGood = raw; return raw; }
        throw new Error();
      }).catch(() => this._distanceLastGood || 999);
    await this._sendLineRaw('AT+DISTANCIA');
    const out = await linePromise;
    this._distanceLastMs = Date.now(); this._distanceLastDisplay = out;
    return out;
  });
}

lineDetected() {
  if (!this._connected()) return false;
  return this._enqueueSerial(async () => {
    const pred = (ln) => ln === '0' || ln === '1';
    const linePromise = this._waitForLine(pred, 1500).then((ln) => ln === '1').catch(() => false);
    await this._sendLineRaw('AT+IR');
    return await linePromise;
  });
}

// Convierte un string Intel HEX en Uint8Array binario (ATmega328P)
_parseIntelHex(hexStr) {
  const segs = []; let maxEnd = 0;
  for (const rec of hexStr.split(/\r?\n/).filter(l => l.startsWith(':'))) {
    const b = rec.slice(1).match(/.{2}/g).map(h => parseInt(h, 16));
    const len = b[0], addr = (b[1] << 8) | b[2], type = b[3];
    if (type === 0x00) { segs.push({ addr, data: b.slice(4, 4 + len) }); maxEnd = Math.max(maxEnd, addr + len); }
    else if (type === 0x01) break;
  }
  const bin = new Uint8Array(maxEnd).fill(0xff);
  for (const { addr, data } of segs) data.forEach((v, i) => (bin[addr + i] = v));
  return bin;
}

// Flashea el binario firmware_rec_blindado.hex directamente al robot vía STK500v1.
// El alumno recupera el modo En Vivo / IA con un solo clic, sin necesidad de Arduino IDE.
async restaurarFirmware() {
  const HEX_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? window.location.origin + '/ia-robotica/firmdata/firmware_rec_blindado.hex'
    : 'https://cdn.jsdelivr.net/gh/ROBOTICAENCOLEGIOS/ia-robotica@main/firmdata/firmware_rec_blindado.hex';

  const log = (m) => console.info('[RestaurarFirmware]', m);
  let port = null, writer = null, looping = false;
  const rxBuf = [], rxWait = [];

  const readByte = (to = 2000) => {
    if (rxBuf.length > 0) return Promise.resolve(rxBuf.shift());
    return new Promise((res, rej) => {
      let fn;
      const t = setTimeout(() => { const i = rxWait.indexOf(fn); if (i >= 0) rxWait.splice(i, 1); rej(new Error('Timeout: bootloader no responde')); }, to);
      fn = (b) => { clearTimeout(t); res(b); };
      rxWait.push(fn);
    });
  };
  const expectOK = async (to = 2000) => {
    const s = await readByte(to), o = await readByte(to);
    if (s !== 0x14 || o !== 0x10) throw new Error('STK500: respuesta inválida 0x' + s.toString(16) + ' 0x' + o.toString(16));
  };
  const send  = async (b) => writer.write(new Uint8Array(b));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const close = async () => {
    looping = false;
    try { writer.releaseLock(); } catch (_) {}
    try { await port.close(); }   catch (_) {}
  };

  try {
    // ── 1. Descargar el binario blindado ─────────────────────────────────
    log('Descargando firmware_rec_blindado.hex...');
    const resp = await fetch(HEX_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('No se pudo obtener el firmware: HTTP ' + resp.status);
    const binary = this._parseIntelHex(await resp.text());
    log('Firmware: ' + binary.length + ' bytes listos para flashear.');

    // ── 2. Abrir puerto y arrancar Optiboot vía DTR ───────────────────────
    log('Esperando selección de puerto COM...');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();

    // Loop de lectura asíncrono
    looping = true;
    (async () => {
      while (looping && port.readable) {
        const reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) for (const b of value) { if (rxWait.length > 0) rxWait.shift()(b); else rxBuf.push(b); }
          }
        } catch (_) { break; } finally { try { reader.releaseLock(); } catch (_) {} }
      }
    })();

    log('Reiniciando Arduino (DTR)...');
    await port.setSignals({ dataTerminalReady: false });
    await sleep(250);
    await port.setSignals({ dataTerminalReady: true });
    await sleep(50);

    // ── 3. Sincronizar con bootloader ─────────────────────────────────────
    log('Sincronizando con Optiboot...');
    rxBuf.length = 0;
    let synced = false;
    for (let i = 0; i < 10 && !synced; i++) {
      await send([0x30, 0x20]);
      try { await expectOK(500); synced = true; } catch (_) { await sleep(50); }
    }
    if (!synced) throw new Error('No se pudo sincronizar con el bootloader.\n→ ¿El cable USB está bien conectado?\n→ ¿Seleccionaste el puerto correcto?');

    // ── 4. Configurar dispositivo ATmega328P ──────────────────────────────
    await send([0x42, 0x86,0x00,0x00,0x01,0x01,0x01,0x01,0x06, 0xff,0xff,0xff,0xff,0x00,0x80,0x04,0x00, 0x00,0x00,0x80,0x00, 0x20]);
    await expectOK();
    await send([0x50, 0x20]); await expectOK();

    // ── 5. Escribir páginas de 128 bytes ─────────────────────────────────
    const PAGE = 128, total = Math.ceil(binary.length / PAGE);
    for (let p = 0; p < total; p++) {
      const off = p * PAGE;
      const chunk = new Uint8Array(PAGE).fill(0xff);
      chunk.set(binary.slice(off, off + PAGE));
      const wa = off / 2;
      log('Página ' + (p + 1) + '/' + total + ' (' + Math.round((p + 1) / total * 100) + '%)...');
      await send([0x55, wa & 0xff, (wa >> 8) & 0xff, 0x20]); await expectOK();
      await send([0x64, 0x00, PAGE, 0x46, ...chunk, 0x20]);   await expectOK(5000);
    }

    // ── 6. Salir del modo programación ────────────────────────────────────
    await send([0x51, 0x20]); await expectOK();
    await close();

    log('✅ Firmware restaurado.');
    alert('✅ Firmware restaurado correctamente.\n\n¡El robot volvió al modo En Vivo / IA!');

  } catch (err) {
    console.error('[RestaurarFirmware]', err);
    try { await close(); } catch (_) {}
    alert('❌ Error al restaurar el firmware:\n\n' + err.message + '\n\nRevisá la consola del navegador para más detalles.');
  }
}
}
Scratch.extensions.register(new RecPcb1Arduino()); })(Scratch);