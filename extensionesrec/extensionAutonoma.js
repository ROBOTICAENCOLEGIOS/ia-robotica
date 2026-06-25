/**
 * Jeep Autónomo - RoboticaEnColegios R.E.C.
 * Programación 100% autónoma: genera código C++ compatible con
 * la librería RoboticaEnColegios.h a partir de bloques Scratch/TurboWarp.
 *
 * ── Arquitectura de compilación local (Opción B — WASM) ──────────────────────
 * Pipeline 100% offline, sin servidor:
 *   1. _WASMCompiler  → avr-gcc 12 (Emscripten) compila C++ → Intel HEX
 *   2. _parseIntelHex → convierte HEX → Uint8Array binario
 *   3. _STK500Flasher → protocolo STK500v1 nativo sobre Web Serial API
 *      (compatible con bootloader Optiboot, Arduino Uno/Nano, ATmega328P)
 *
 * Mapeo de pines internos (encapsulados en firmware_rec_blindado.hex):
 *   Motor IZQ: IN1=6, IN2=7, PWM=5
 *   Motor DER: IN1=8, IN2=9, PWM=10  (+12 compensación de torque)
 *   Ultrasonido: TRIG=2, ECHO=12
 *   IR línea: PIN=3
 *   DHT11: A5
 *   Buzzer: PIN=11
 *   LED1 NeoPixel: PIN=13
 *   LED2 NeoPixel: PIN=4
 */

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 1: Utilidad — Parseo de Intel HEX → binario Uint8Array
// ══════════════════════════════════════════════════════════════════════════════
function _parseIntelHex(hexStr) {
  const records = hexStr.split(/\r?\n/).filter(l => l.startsWith(':'));
  const segments = [];
  let maxEnd = 0;
  for (const rec of records) {
    const b    = rec.slice(1).match(/.{2}/g).map(h => parseInt(h, 16));
    const len  = b[0];
    const addr = (b[1] << 8) | b[2];
    const type = b[3];
    if (type === 0x00) {
      segments.push({ addr, data: b.slice(4, 4 + len) });
      maxEnd = Math.max(maxEnd, addr + len);
    } else if (type === 0x01) break;
  }
  const bin = new Uint8Array(maxEnd).fill(0xff);
  for (const { addr, data } of segments) data.forEach((v, i) => (bin[addr + i] = v));
  return bin;
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 2: Compilador WASM local (avr-gcc via Emscripten)
// ══════════════════════════════════════════════════════════════════════════════
//
// Pipeline planificado (todo en browser, sin servidor):
//   avr-gcc 12 (WASM) → avr-ld → avr-objcopy → Intel HEX
//
// Dependencias a publicar en CDN:
//   • avr-gcc + binutils compilado con Emscripten (~12 MB, cached tras primer uso)
//   • avr-libc headers en filesystem virtual de Emscripten
//   • libRoboticaEnColegios.a: estática precompilada para ATmega328P @ 16MHz
//     (pines de hardware encapsulados — protección de propiedad intelectual REC)
//
// Referencias técnicas:
//   https://emscripten.org/docs/api_reference/preamble.js.html
//   https://github.com/nicowillis/avr-gcc-wasm
//   Flags de compilación: -mmcu=atmega328p -DF_CPU=16000000UL -Os -L/lib -lRoboticaEnColegios
//
class _WASMCompiler {
  static BUNDLE_URL = ''; // CDN URL — se completa cuando el bundle WASM esté publicado

  constructor() {
    this._mod   = null;
    this.loaded = false;
    this.status = 'PENDIENTE';
  }

  async load(onProgress) {
    if (this.loaded) return;
    if (!_WASMCompiler.BUNDLE_URL) {
      this.status = 'WASM_NO_DISPONIBLE';
      throw new Error('WASM_NO_DISPONIBLE');
    }
    onProgress && onProgress('Cargando compilador WASM...');
    // TODO — cuando el bundle esté listo:
    // const resp      = await fetch(_WASMCompiler.BUNDLE_URL);
    // const bytes     = await resp.arrayBuffer();
    // this._mod       = await WebAssembly.instantiate(bytes, { /* imports */ });
    // this.loaded     = true;
    // this.status     = 'LISTO';
    throw new Error('WASM_NO_DISPONIBLE');
  }

  // Compila cppSource y retorna string Intel HEX
  async compile(cppSource, onProgress) {
    if (!this.loaded) throw new Error('WASM_NO_DISPONIBLE');
    onProgress && onProgress('Compilando para ATmega328P...');
    // TODO — invocar avr-gcc en módulo WASM:
    // return this._mod.exports.compile(cppSource, '-mmcu=atmega328p -DF_CPU=16000000UL -Os');
    throw new Error('WASM_NO_DISPONIBLE');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 3: Flasheador STK500v1 — Web Serial API nativa del browser
// ══════════════════════════════════════════════════════════════════════════════
//
// Protocolo STK500v1 compatible con bootloader Optiboot (Arduino Uno R3, Nano)
// Flujo: DTR reset → sync → set device → enter prog mode → flash por páginas → leave
//
class _STK500Flasher {
  // Constantes STK500v1
  static STK_OK             = 0x10;
  static STK_INSYNC         = 0x14;
  static STK_GET_SYNC       = 0x30;
  static STK_SET_DEVICE     = 0x42;
  static STK_ENTER_PROGMODE = 0x50;
  static STK_LEAVE_PROGMODE = 0x51;
  static STK_LOAD_ADDRESS   = 0x55;
  static STK_PROG_PAGE      = 0x64;
  static CRC_EOP            = 0x20;

  // ATmega328P / Optiboot: 128 bytes/página, 115200 baud
  static PAGE_SIZE = 128;
  static BAUD_RATE = 115200;

  constructor() {
    this._port    = null;
    this._writer  = null;
    this._rxBuf   = [];
    this._rxWait  = [];
    this._looping = false;
  }

  // Solicita el puerto USB al usuario (Chrome muestra diálogo de selección)
  // y resetea el Arduino mediante toggle de la señal DTR para activar Optiboot
  async connect(onProgress) {
    onProgress && onProgress('⏳ Esperando selección de puerto COM...');
    this._port = await navigator.serial.requestPort();
    await this._port.open({ baudRate: _STK500Flasher.BAUD_RATE });
    this._writer = this._port.writable.getWriter();
    this._startReadLoop();
    onProgress && onProgress('🔄 Reiniciando Arduino (DTR)...');
    await this._port.setSignals({ dataTerminalReady: false });
    await this._sleep(250);
    await this._port.setSignals({ dataTerminalReady: true });
    await this._sleep(50);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _startReadLoop() {
    this._looping = true;
    const run = async () => {
      while (this._looping && this._port && this._port.readable) {
        const reader = this._port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            for (const byte of value) {
              if (this._rxWait.length > 0) { this._rxWait.shift()(byte); }
              else { this._rxBuf.push(byte); }
            }
          }
        } catch (_) { break; }
        finally { try { reader.releaseLock(); } catch (_) {} }
      }
    };
    run();
  }

  _readByte(timeout = 2000) {
    if (this._rxBuf.length > 0) return Promise.resolve(this._rxBuf.shift());
    return new Promise((resolve, reject) => {
      let resolver;
      const t = setTimeout(() => {
        const i = this._rxWait.indexOf(resolver);
        if (i >= 0) this._rxWait.splice(i, 1);
        reject(new Error('Timeout: el bootloader no responde. ¿Cable USB conectado?'));
      }, timeout);
      resolver = (b) => { clearTimeout(t); resolve(b); };
      this._rxWait.push(resolver);
    });
  }

  async _expectOK(timeout = 2000) {
    const s = await this._readByte(timeout);
    const o = await this._readByte(timeout);
    if (s !== _STK500Flasher.STK_INSYNC || o !== _STK500Flasher.STK_OK) {
      throw new Error(
        `Error de protocolo STK500: ` +
        `0x${s.toString(16).padStart(2,'0')} 0x${o.toString(16).padStart(2,'0')} ` +
        `(esperado 0x14 0x10). ¿Es el puerto correcto?`
      );
    }
  }

  async _write(bytes) { await this._writer.write(new Uint8Array(bytes)); }

  async sync(onProgress) {
    this._rxBuf = [];
    onProgress && onProgress('🔗 Sincronizando con bootloader Optiboot...');
    for (let i = 0; i < 10; i++) {
      await this._write([_STK500Flasher.STK_GET_SYNC, _STK500Flasher.CRC_EOP]);
      try { await this._expectOK(500); return; }
      catch (_) { await this._sleep(50); }
    }
    throw new Error(
      'No se pudo sincronizar con el bootloader.\n' +
      '→ ¿El cable USB está bien conectado?\n' +
      '→ ¿Seleccionaste el puerto correcto?\n' +
      '→ ¿El Arduino está encendido?'
    );
  }

  async enterProgramMode(onProgress) {
    onProgress && onProgress('🔧 Activando modo programación ATmega328P...');
    // Parámetros de dispositivo para ATmega328P
    // Optiboot los ignora en su mayoría, pero son obligatorios en STK500v1
    await this._write([
      _STK500Flasher.STK_SET_DEVICE,
      0x86, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x06,
      0xff, 0xff, 0xff, 0xff, 0x00, 0x80, 0x04, 0x00,
      0x00, 0x00, 0x80, 0x00,
      _STK500Flasher.CRC_EOP
    ]);
    await this._expectOK();
    await this._write([_STK500Flasher.STK_ENTER_PROGMODE, _STK500Flasher.CRC_EOP]);
    await this._expectOK();
  }

  async flashBinary(binary, onProgress) {
    const pageSize   = _STK500Flasher.PAGE_SIZE;
    const totalPages = Math.ceil(binary.length / pageSize);
    let   wordAddr   = 0; // STK500 usa direcciones de WORD (2 bytes)

    for (let page = 0; page < totalPages; page++) {
      const offset = page * pageSize;
      const chunk  = new Uint8Array(pageSize).fill(0xff); // 0xFF = flash borrada
      chunk.set(binary.slice(offset, offset + pageSize));

      const pct = Math.round(((page + 1) / totalPages) * 100);
      onProgress && onProgress(`✍️ Escribiendo página ${page + 1}/${totalPages} (${pct}%)...`);

      // LOAD_ADDRESS: dirección en words, little-endian
      await this._write([
        _STK500Flasher.STK_LOAD_ADDRESS,
        wordAddr & 0xff, (wordAddr >> 8) & 0xff,
        _STK500Flasher.CRC_EOP
      ]);
      await this._expectOK();

      // PROG_PAGE: [CMD] [sizeH=0x00] [sizeL=0x80] ['F'=0x46] [128 bytes] [EOP]
      await this._write([
        _STK500Flasher.STK_PROG_PAGE,
        0x00, pageSize, 0x46,
        ...chunk,
        _STK500Flasher.CRC_EOP
      ]);
      await this._expectOK(5000);

      wordAddr += pageSize / 2; // avanzar puntero de palabra
    }
  }

  async leaveProgramMode(onProgress) {
    onProgress && onProgress('🏁 Finalizando y reiniciando el robot...');
    await this._write([_STK500Flasher.STK_LEAVE_PROGMODE, _STK500Flasher.CRC_EOP]);
    await this._expectOK();
  }

  async close() {
    this._looping = false;
    try { this._writer.releaseLock(); } catch (_) {}
    try { await this._port.close();   } catch (_) {}
    this._port = null;
  }
}

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Debe ejecutarse en modo unsandboxed.');
  }

  class JeepAutonomo {
    constructor() {
      this._codeLines    = [];       // Instrucciones C++ acumuladas durante la ejecución
      this._codigoFinal  = '';       // Último programa compilado, disponible como reporter
      this._log          = [];       // Registro de eventos y errores (máx 20 entradas)
      this._uploadStatus = 'LISTO'; // Estado visible en el bloque reporter
      this._wasm         = new _WASMCompiler(); // Instancia del compilador WASM local
    }

    getInfo() {
      return {
        id: 'jeepAutonomo',
        name: 'Jeep Autónomo',
        color1: '#1a3a1a',
        color2: '#142814',
        color3: '#0e1e0e',
        blocks: [

          // ── HAT: punto de entrada del programa autónomo ──────────────────
          {
            opcode: 'inicio',
            blockType: Scratch.BlockType.HAT,
            text: 'INICIO 🚀',
            isEdgeActivated: false
          },

          // ── MOTORES (homologados con REC PCB1 Arduino) ─────────────────
          '---',
          {
            opcode: 'moveForward',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Mover motor [SIDE] hacia ADELANTE a [PCT]%',
            arguments: {
              SIDE: { type: Scratch.ArgumentType.STRING, menu: 'motorSide', defaultValue: 'IZQ' },
              PCT:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 }
            }
          },
          {
            opcode: 'moveBackward',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Mover motor [SIDE] hacia ATRAS a [PCT]%',
            arguments: {
              SIDE: { type: Scratch.ArgumentType.STRING, menu: 'motorSide', defaultValue: 'IZQ' },
              PCT:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 }
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

          // ── LUCES ────────────────────────────────────────────────────────
          '---',
          {
            opcode: 'encenderLuz',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Luz [LED] → color [COLOR]',
            arguments: {
              LED:   { type: Scratch.ArgumentType.STRING, menu: 'ledMenu', defaultValue: 'TODAS' },
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ff0000' }
            }
          },
          {
            opcode: 'apagarLuz',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Apagar luz [LED]',
            arguments: {
              LED: { type: Scratch.ArgumentType.STRING, menu: 'ledMenu', defaultValue: 'TODAS' }
            }
          },
          {
            opcode: 'tocarNota',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Tocar nota [NOTE] por [MS] ms',
            arguments: {
              NOTE: { type: Scratch.ArgumentType.NUMBER, menu: 'notasMenu', defaultValue: 262 },
              MS:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 500 }
            }
          },

          // ── SENSORES ─────────────────────────────────────────────────────
          '---',
          { opcode: 'distancia',      blockType: Scratch.BlockType.REPORTER, text: 'distancia (cm)' },
          { opcode: 'lineaDetectada', blockType: Scratch.BlockType.BOOLEAN,  text: '¿detecta línea?' },
          {
            opcode: 'getDHT',
            blockType: Scratch.BlockType.REPORTER,
            text: 'leer [TIPO]',
            arguments: { TIPO: { type: Scratch.ArgumentType.STRING, menu: 'dhtMenu', defaultValue: 'TEMP' } }
          },

          // ── GENERADOR C++ ─────────────────────────────────────────────────
          '---',
          { opcode: 'compilar',        blockType: Scratch.BlockType.COMMAND,  text: '⚙️ Compilar programa C++' },
          { opcode: 'copiarCodigo',    blockType: Scratch.BlockType.COMMAND,  text: '📋 Copiar código al portapapeles' },
          { opcode: 'subirAlRobot',    blockType: Scratch.BlockType.COMMAND,  text: '⬆️ Subir al Robot 🚀' },
          { opcode: 'descargarAgente', blockType: Scratch.BlockType.COMMAND,  text: '⬇️ Descargar Compilador (Windows)' },
          '---',
          { opcode: 'getUploadStatus', blockType: Scratch.BlockType.REPORTER, text: '📡 estado de carga' },
          { opcode: 'getLog',          blockType: Scratch.BlockType.REPORTER, text: '🪲 registro de errores' }
        ],

        menus: {
          motorSide: { acceptReporters: false, items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }] },
          stopWhich: { acceptReporters: false, items: [{ text: 'IZQUIERDO / B', value: 'IZQ' }, { text: 'DERECHO / A', value: 'DER' }, { text: 'AMBOS', value: 'AMBOS' }] },
          ledMenu: { acceptReporters: false, items: ['1', '2', 'TODAS'] },
          dhtMenu: {
            acceptReporters: false,
            items: [
              { text: 'Temperatura (°C)', value: 'TEMP' },
              { text: 'Humedad (%)',       value: 'HUM'  }
            ]
          },
          notasMenu: {
            acceptReporters: false,
            items: [
              { text: 'DO (C4)', value: '262' }, { text: 'RE (D4)', value: '294' },
              { text: 'MI (E4)', value: '330' }, { text: 'FA (F4)', value: '349' },
              { text: 'SOL (G4)', value: '392' }, { text: 'LA (A4)', value: '440' },
              { text: 'SI (B4)', value: '494' }, { text: 'DO (C5)', value: '523' }
            ]
          }
        }
      };
    }

    // ── HAT ─────────────────────────────────────────────────────────────────
    // Reinicia el buffer de código y activa el script.
    // Los bloques de control nativos de Scratch (por siempre, si/entonces,
    // esperar N seg, repetir X veces) cuelgan de este HAT y son ejecutados
    // por el runtime de Scratch; cada bloque de actuador que corra inyecta
    // su línea C++ en _codeLines automáticamente.
    inicio() {
      this._codeLines = [];
      return true;
    }

    // ── MOTORES (TB6612FNG — homologados con REC PCB1 Arduino) ─────────────────
    // _pct2pwm convierte porcentaje (0-100) al rango PWM (0-255) del ATmega328P
    _pct2pwm(pct) { return Math.round(Math.min(Math.abs(Number(pct)), 100) / 100 * 255); }

    // Positivo = adelante, negativo = atrás (freno activo con abs+dir en TB6612FNG)
    moveForward(args) {
      const v = this._pct2pwm(args.PCT);
      if (args.SIDE === 'IZQ') this._codeLines.push(`REC_MotorIzquierdo(${v});`);
      else                     this._codeLines.push(`REC_MotorDerecho(${v});`);
    }

    moveBackward(args) {
      const v = this._pct2pwm(args.PCT);
      if (args.SIDE === 'IZQ') this._codeLines.push(`REC_MotorIzquierdo(-${v});`);
      else                     this._codeLines.push(`REC_MotorDerecho(-${v});`);
    }

    // 0 = freno activo (IN1=L, IN2=L, PWM=255 en driver TB6612FNG)
    stopMotor(args) {
      if (args.WHICH === 'IZQ'  || args.WHICH === 'AMBOS') this._codeLines.push(`REC_MotorIzquierdo(0);`);
      if (args.WHICH === 'DER'  || args.WHICH === 'AMBOS') this._codeLines.push(`REC_MotorDerecho(0);`);
    }

    // ── LUCES ──────────────────────────────────────────────────────────────
    _hexToRgb(hex) {
      let s = String(hex).replace('#', '');
      if (s.length === 3) s = s.split('').map(c => c + c).join('');
      return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16)
      };
    }

    encenderLuz(args) {
      const { r, g, b } = this._hexToRgb(args.COLOR);
      if (args.LED === 'TODAS') {
        this._codeLines.push(`REC_LED(1, ${r}, ${g}, ${b});`);
        this._codeLines.push(`REC_LED(2, ${r}, ${g}, ${b});`);
      } else {
        this._codeLines.push(`REC_LED(${args.LED}, ${r}, ${g}, ${b});`);
      }
    }

    apagarLuz(args) {
      if (args.LED === 'TODAS') {
        this._codeLines.push(`REC_LED(1, 0, 0, 0);`);
        this._codeLines.push(`REC_LED(2, 0, 0, 0);`);
      } else {
        this._codeLines.push(`REC_LED(${args.LED}, 0, 0, 0);`);
      }
    }

    tocarNota(args) {
      this._codeLines.push(`REC_Buzzer(${Math.round(Number(args.NOTE))}, ${Math.max(0, Math.round(Number(args.MS)))});`);
    }

    // ── SENSORES ──────────────────────────────────────────────────────────
    // En modo autónomo los sensores no tienen robot conectado:
    // registran la llamada C++ en el buffer y retornan 0/false como placeholder.
    distancia() {
      this._codeLines.push(`REC_Distancia()`);
      return 0;
    }

    lineaDetectada() {
      this._codeLines.push(`REC_LineaDetectada()`);
      return false;
    }

    getDHT(args) {
      this._codeLines.push(`REC_DHT("${args.TIPO}")`);
      return 0;
    }

    // ── GENERADOR C++ ────────────────────────────────────────────────────────
    // Recorre el árbol de bloques del lienzo (análisis estático, sin ejecutarlos)
    // para producir C++ con estructuras de control reales (while/if/for/delay).
    // El #include <RoboticaEnColegios.h> y los REC_* son la máscara de seguridad
    // del hardware — no modificar ni exponer pines.
    compilar() {
      this._codigoFinal = this._generarCodigoCPP();

      // ── Modal DOM (no puede ser bloqueado, funciona en iframes) ───────────
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);z-index:999999;display:flex;align-items:center;justify-content:center';

      const box = document.createElement('div');
      box.style.cssText = 'background:#1a1a2e;border:2px solid #a8ff78;border-radius:8px;padding:20px;width:min(720px,92vw);max-height:82vh;display:flex;flex-direction:column;gap:12px;box-sizing:border-box';

      const title = document.createElement('div');
      title.style.cssText = 'color:#a8ff78;font-family:monospace;font-size:14px;font-weight:bold;flex-shrink:0';
      title.textContent = '⚙️ Código C++ generado — Jeep Autónomo';

      const pre = document.createElement('pre');
      pre.style.cssText = 'background:#0d0d1a;color:#e0e0e0;padding:15px;border-radius:4px;overflow:auto;flex:1;font-family:monospace;font-size:13px;margin:0;white-space:pre;min-height:0';
      pre.textContent = this._codigoFinal;

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-shrink:0';

      const btnCopy = document.createElement('button');
      btnCopy.style.cssText = 'background:#4b5320;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:13px';
      btnCopy.textContent = '📋 Copiar';
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(this._codigoFinal).catch(() => {});
        btnCopy.textContent = '✅ ¡Copiado!';
        setTimeout(() => { btnCopy.textContent = '📋 Copiar'; }, 1800);
      };

      const btnClose = document.createElement('button');
      btnClose.style.cssText = 'background:#6b0000;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:13px';
      btnClose.textContent = '✖ Cerrar';
      const cerrar = () => { try { document.body.removeChild(overlay); } catch (_) {} };
      btnClose.onclick = cerrar;
      overlay.onclick = (e) => { if (e.target === overlay) cerrar(); };

      btns.append(btnCopy, btnClose);
      box.append(title, pre, btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    async copiarCodigo() {
      if (!this._codigoFinal) return;
      try {
        await navigator.clipboard.writeText(this._codigoFinal);
      } catch (e) {
        console.warn('Clipboard no disponible:', e);
      }
    }

    // ── ANALIZADOR ESTÁTICO DE BLOQUES ────────────────────────────────────────
    // _generarCodigoCPP: localiza el HAT jeepAutonomo_inicio en todos los targets
    // y camina el árbol de hermanos/hijos produciendo líneas C++ correctas.
    // Usa Scratch.vm.runtime (disponible en extensiones unsandboxed de TurboWarp).
    _generarCodigoCPP() {
      const lines = [];
      const vm = (typeof Scratch !== 'undefined' && Scratch.vm) ? Scratch.vm : null;

      if (vm) {
        let found = false;
        for (const target of vm.runtime.targets) {
          const allBlocks = target.blocks._blocks;
          for (const id in allBlocks) {
            if (allBlocks[id].opcode === 'jeepAutonomo_inicio') {
              found = true;
              if (allBlocks[id].next) this._walkChain(target, allBlocks[id].next, lines, '    ');
            }
          }
        }
        if (!found) lines.push('    // (no se encontró el bloque INICIO 🚀 en el lienzo)');
      } else {
        // Fallback: código acumulado en runtime (sin estructuras de control)
        for (const l of this._codeLines) lines.push('    ' + l);
      }

      if (lines.length === 0) lines.push('    // (sin instrucciones — agregá bloques bajo INICIO 🚀)');

      return [
        '#include <RoboticaEnColegios.h>',
        '',
        'void setup() {',
        '    REC_InicializarPlaca();',
        '}',
        '',
        'void loop() {',
        ...lines,
        '}'
      ].join('\n');
    }

    // Camina una cadena lineal de bloques hermanos (siguiendo .next)
    _walkChain(target, blockId, lines, indent) {
      let id = blockId;
      while (id) {
        const block = target.blocks._blocks[id];
        if (!block) break;
        this._genBlock(target, block, lines, indent);
        id = block.next;
      }
    }

    // Traduce un bloque individual a una o varias líneas C++
    _genBlock(target, block, lines, indent) {
      const blks = target.blocks._blocks;

      // Valor de un campo dropdown (almacenado directamente en el bloque)
      const F = (name) => (block.fields[name] || {}).value || '';

      // Valor numérico de un input (shadow literal o reporter conectado)
      const NUM = (name) => {
        const inp = block.inputs[name];
        if (!inp) return 0;
        const id = inp.block != null ? inp.block : inp.shadow;
        if (id == null) return 0;
        const b = blks[id];
        if (!b) return 0;
        for (const key of Object.keys(b.fields || {})) {
          const v = b.fields[key].value;
          if (v !== undefined && v !== null) return Number(v);
        }
        return 0;
      };

      // Valor hex de un input COLOR
      const COLOR = (name) => {
        const inp = block.inputs[name];
        if (!inp) return '#ff0000';
        const id = inp.block != null ? inp.block : inp.shadow;
        if (id == null) return '#ff0000';
        const b = blks[id];
        return (b && b.fields.COLOUR) ? b.fields.COLOUR.value : '#ff0000';
      };

      const p2v = (p) => Math.round(Math.min(Math.abs(p), 100) / 100 * 255);

      switch (block.opcode) {

        // ── Bloques de control nativos de Scratch ──────────────────────────
        case 'control_forever':
          lines.push(`${indent}while (true) {`);
          if (block.inputs.SUBSTACK && block.inputs.SUBSTACK.block)
            this._walkChain(target, block.inputs.SUBSTACK.block, lines, indent + '    ');
          lines.push(`${indent}}`);
          break;

        case 'control_repeat': {
          const n = NUM('TIMES');
          lines.push(`${indent}for (int _i = 0; _i < ${n}; _i++) {`);
          if (block.inputs.SUBSTACK && block.inputs.SUBSTACK.block)
            this._walkChain(target, block.inputs.SUBSTACK.block, lines, indent + '    ');
          lines.push(`${indent}}`);
          break;
        }

        case 'control_if': {
          const c = this._genCond(target, block.inputs.CONDITION, blks);
          lines.push(`${indent}if (${c}) {`);
          if (block.inputs.SUBSTACK && block.inputs.SUBSTACK.block)
            this._walkChain(target, block.inputs.SUBSTACK.block, lines, indent + '    ');
          lines.push(`${indent}}`);
          break;
        }

        case 'control_if_else': {
          const c = this._genCond(target, block.inputs.CONDITION, blks);
          lines.push(`${indent}if (${c}) {`);
          if (block.inputs.SUBSTACK && block.inputs.SUBSTACK.block)
            this._walkChain(target, block.inputs.SUBSTACK.block, lines, indent + '    ');
          lines.push(`${indent}} else {`);
          if (block.inputs.SUBSTACK2 && block.inputs.SUBSTACK2.block)
            this._walkChain(target, block.inputs.SUBSTACK2.block, lines, indent + '    ');
          lines.push(`${indent}}`);
          break;
        }

        case 'control_wait': {
          const secs = NUM('DURATION');
          lines.push(`${indent}delay(${Math.round(secs * 1000)});`);
          break;
        }

        // ── Motores ─────────────────────────────────────────────────────────
        case 'jeepAutonomo_moveForward': {
          const v = p2v(NUM('PCT'));
          lines.push(F('SIDE') === 'IZQ'
            ? `${indent}REC_MotorIzquierdo(${v});`
            : `${indent}REC_MotorDerecho(${v});`);
          break;
        }

        case 'jeepAutonomo_moveBackward': {
          const v = p2v(NUM('PCT'));
          lines.push(F('SIDE') === 'IZQ'
            ? `${indent}REC_MotorIzquierdo(-${v});`
            : `${indent}REC_MotorDerecho(-${v});`);
          break;
        }

        case 'jeepAutonomo_stopMotor': {
          const w = F('WHICH');
          if (w === 'IZQ' || w === 'AMBOS') lines.push(`${indent}REC_MotorIzquierdo(0);`);
          if (w === 'DER' || w === 'AMBOS') lines.push(`${indent}REC_MotorDerecho(0);`);
          break;
        }

        // ── Luces ────────────────────────────────────────────────────────────
        case 'jeepAutonomo_encenderLuz': {
          const hex = COLOR('COLOR');
          const { r, g, b } = this._hexToRgb(hex);
          const led = F('LED');
          if (led === 'TODAS') {
            lines.push(`${indent}REC_LED(1, ${r}, ${g}, ${b});`);
            lines.push(`${indent}REC_LED(2, ${r}, ${g}, ${b});`);
          } else {
            lines.push(`${indent}REC_LED(${led}, ${r}, ${g}, ${b});`);
          }
          break;
        }

        case 'jeepAutonomo_apagarLuz': {
          const led = F('LED');
          if (led === 'TODAS') {
            lines.push(`${indent}REC_LED(1, 0, 0, 0);`);
            lines.push(`${indent}REC_LED(2, 0, 0, 0);`);
          } else {
            lines.push(`${indent}REC_LED(${led}, 0, 0, 0);`);
          }
          break;
        }

        case 'jeepAutonomo_tocarNota': {
          const note = NUM('NOTE');
          const ms   = NUM('MS');
          lines.push(`${indent}REC_Buzzer(${Math.round(note)}, ${Math.max(0, Math.round(ms))});`);
          break;
        }

        default:
          break;
      }
    }

    // Traduce un input boolean a expresión C++ (para condiciones if/while)
    _genCond(target, input, blks) {
      if (!input || input.block == null) return 'false';
      const block = blks[input.block];
      if (!block) return 'false';

      // Valor de un operando: literal numérico o reporter conocido
      const VAL = (name) => {
        const inp = block.inputs[name];
        if (!inp) return '0';
        const id = inp.block != null ? inp.block : inp.shadow;
        if (id == null) return '0';
        const b = blks[id];
        if (!b) return '0';
        if (b.opcode === 'jeepAutonomo_distancia') return 'REC_Distancia()';
        if (b.opcode === 'jeepAutonomo_getDHT') {
          const tipo = (b.fields.TIPO || { value: 'TEMP' }).value;
          return `REC_DHT("${tipo}")`;
        }
        for (const key of Object.keys(b.fields || {})) return String(b.fields[key].value);
        return '0';
      };

      switch (block.opcode) {
        case 'jeepAutonomo_lineaDetectada': return 'REC_LineaDetectada()';
        case 'operator_gt':     return `${VAL('OPERAND1')} > ${VAL('OPERAND2')}`;
        case 'operator_lt':     return `${VAL('OPERAND1')} < ${VAL('OPERAND2')}`;
        case 'operator_equals': return `${VAL('OPERAND1')} == ${VAL('OPERAND2')}`;
        case 'operator_and': {
          const l = this._genCond(target, block.inputs.OPERAND1, blks);
          const r = this._genCond(target, block.inputs.OPERAND2, blks);
          return `(${l}) && (${r})`;
        }
        case 'operator_or': {
          const l = this._genCond(target, block.inputs.OPERAND1, blks);
          const r = this._genCond(target, block.inputs.OPERAND2, blks);
          return `(${l}) || (${r})`;
        }
        case 'operator_not': {
          const v = this._genCond(target, block.inputs.OPERAND, blks);
          return `!(${v})`;
        }
        default: return 'false';
      }
    }

    // ── LOG INTERNO ────────────────────────────────────────────────────────
    _addLog(msg) {
      const ts = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this._log.unshift(`[${ts}] ${msg}`);
      if (this._log.length > 20) this._log.pop();
    }

    // ── SUBIR AL ROBOT: Agente Windows (localhost:3000) → STK500v1 ──────────
    async subirAlRobot() {
      // Generar siempre código fresco del árbol de bloques del lienzo
      this._codigoFinal = this._generarCodigoCPP();

      this._uploadStatus = 'INICIANDO...';
      this._addLog('Iniciando secuencia de carga al robot...');
      this._log = this._log.slice(0, 1); // limpiar log anterior

      const onProgress = (msg) => {
        this._uploadStatus = msg;
        this._addLog(msg);
        console.info('[JeepAutonomo]', msg);
      };

      const flasher = new _STK500Flasher();

      try {
        // ── PASO 1: Compilar vía Agente Windows local (localhost:3000) ────
        onProgress('⏳ Enviando código al Agente local...');
        let binary;
        try {
          const resp = await fetch('http://localhost:3000/compilar', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ codigo: this._codigoFinal })
          });
          if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`Agente respondió ${resp.status}: ${detail}`);
          }
          const buf = await resp.arrayBuffer();
          const ct  = resp.headers.get('Content-Type') || '';
          // El agente devuelve Intel HEX (text/plain) → parsear a Uint8Array
          if (ct.includes('text') || ct.includes('hex')) {
            binary = _parseIntelHex(new TextDecoder().decode(buf));
          } else {
            const hexStr = new TextDecoder().decode(buf);
            binary = hexStr.trimStart().startsWith(':')
              ? _parseIntelHex(hexStr)
              : new Uint8Array(buf);
          }
          onProgress('✅ Compilación exitosa');
        } catch (e) {
          if (e.name === 'TypeError' || e.message.includes('Failed to fetch') ||
              e.message.includes('NetworkError') || e.message.includes('REFUSED')) {
            this._uploadStatus = '❌ Agente no disponible';
            this._addLog('⚠️ Agente Windows no encontrado en localhost:3000');
            alert(
              '⚠️ No se encontró el Agente de compilación.\n\n' +
              'Para subir programas al robot necesitás el Agente Windows instalado y corriendo.\n\n' +
              '→ Usá el bloque "⬇️ Descargar Compilador (Windows)" para obtenerlo.'
            );
            return;
          }
          throw e;
        }

        // ── PASO 2: Flasheo STK500v1 vía Web Serial ──────────────────────
        await flasher.connect(onProgress);
        await flasher.sync(onProgress);
        await flasher.enterProgramMode(onProgress);
        await flasher.flashBinary(binary, onProgress);
        await flasher.leaveProgramMode(onProgress);

        this._uploadStatus = '✅ Carga exitosa';
        this._addLog('✅ ¡Programa cargado! El robot ya funciona en modo autónomo.');

      } catch (err) {
        // ── MANEJO DE ERRORES PEDAGÓGICO ─────────────────────────────────
        this._uploadStatus = '❌ Error — ver registro';
        this._addLog(`❌ ${err.message}`);
        console.error('[JeepAutonomo] Error de carga:', err);
        alert(
          `❌ No se pudo cargar el programa al robot:\n\n` +
          `${err.message}\n\n` +
          `Revisá el bloque "🪲 registro de errores" para más detalles.`
        );
      } finally {
        try { await flasher.close(); } catch (_) {}
      }
    }

    // ── DESCARGA DEL AGENTE WINDOWS ──────────────────────────────────────────
    // URL configurable: apuntar al .exe generado con `npm run build-exe`
    // en la carpeta agente-windows/ y publicado en el repo.
    descargarAgente() {
      const AGENTE_URL = 'https://github.com/ROBOTICAENCOLEGIOS/Laboratorio-IA/releases/download/v1.0.0/REC-Agente-Windows.exe';
      const a = document.createElement('a');
      a.href     = AGENTE_URL;
      a.download = 'REC-Agente-Windows.exe';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    getUploadStatus() { return this._uploadStatus; }
    getLog()          { return this._log.length ? this._log[0] : '(sin registros)'; }
  }

  Scratch.extensions.register(new JeepAutonomo());
})(Scratch);
