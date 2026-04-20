/**
TurboWarp / Scratch 3 Custom Extension REC PCB1 ARDUINO v1.7.2
Web Serial API @ 115200 baud. Verde Militar & Bloques Musicales. */
(function (Scratch) { 'use strict';
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
    this._overlayButton = null;
    this._oldStyle = null;
    this._parentButton = null;
    
    // Suavizado de distancia
    this._distanceEma = null;
    this._distanceLastMs = 0;
    this._distanceLastDisplay = null;
    this._distanceMinIntervalMs = 65;
    this._distanceLastGood = null;

    // CACHÉ ANTI-SPAM MOTORES
    this._lastMotorValue = { IZQ: null, DER: null };
  }

  getInfo() {
    return {
      id: 'recpcb1arduino',
      name: 'REC - PCB1 ARDUINO',
      color1: '#4b5320',
      color2: '#3d441a',
      color3: '#2f3514',
      blocks: [
        {
          opcode: 'connectRobot',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Conectar Robot',
        },
        {
          opcode: 'checkConnection',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Check Connection',
          disableMonitor: false,
        },
        '---',
        {
          opcode: 'moveForward',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Mover motor [SIDE] hacia ADELANTE a [PCT]%',
          arguments: {
            SIDE: { type: 'string', menu: 'motorSide' },
            PCT: { type: 'number', defaultValue: 50 },
          },
        },
        {
          opcode: 'moveBackward',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Mover motor [SIDE] hacia ATRÁS a [PCT]%',
          arguments: {
            SIDE: { type: 'string', menu: 'motorSide' },
            PCT: { type: 'number', defaultValue: 50 },
          },
        },
        {
          opcode: 'stopMotor',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Detener motor [WHICH]',
          arguments: {
            WHICH: { type: 'string', menu: 'stopWhich' },
          },
        },
        '---',
        {
          opcode: 'lightOn',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Encender Luz [LED] en color [COLOR]',
          arguments: {
            LED: { type: 'string', menu: 'ledWhich' },
            COLOR: { type: 'color' },
          },
        },
        {
          opcode: 'lightOff',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Apagar Luz [LED]',
          arguments: {
            LED: { type: 'string', menu: 'ledWhich' },
          },
        },
        {
          opcode: 'playNote',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Tocar nota [NOTE] por [MS] ms',
          arguments: {
            NOTE: { type: 'number', menu: 'musicalNotes', defaultValue: 262 },
            MS: { type: 'number', defaultValue: 500 },
          },
        },
        '---',
        {
          opcode: 'distanceCm',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Distancia en cm',
          disableMonitor: false,
        },
        {
          opcode: 'lineDetected',
          blockType: Scratch.BlockType.BOOLEAN,
          text: '¿Detecta línea?',
        },
      ],
      menus: {
        motorSide: {
          acceptReporters: true,
          items: [
            { text: 'IZQUIERDO / B', value: 'IZQ' },
            { text: 'DERECHO / A', value: 'DER' },
          ],
        },
        stopWhich: {
          acceptReporters: true,
          items: [
            { text: 'IZQUIERDO / B', value: 'IZQ' },
            { text: 'DERECHO / A', value: 'DER' },
            { text: 'AMBOS', value: 'AMBOS' },
          ],
        },
        ledWhich: { acceptReporters: true, items: ['1', '2', 'TODAS'] },
        musicalNotes: {
          acceptReporters: true,
          items: [
            { text: 'DO (C4)', value: '262' },
            { text: 'RE (D4)', value: '294' },
            { text: 'MI (E4)', value: '330' },
            { text: 'FA (F4)', value: '349' },
            { text: 'SOL (G4)', value: '392' },
            { text: 'LA (A4)', value: '440' },
            { text: 'SI (B4)', value: '494' },
            { text: 'DO (C5)', value: '523' }
          ],
        },
      },
    };
  }

  _connected() {
    return !!(this._activePort && this._activePort.readable && this._activePort.writable);
  }

  checkConnection() {
    return this._connected() ? 'Connected' : 'Disconnected';
  }

  // PADRE GESTURE: Crear botón en documento principal
  _createParentGestureButton() {
    try {
      // Intentar crear botón en el documento principal
      const parentDoc = window.parent.document;
      if (parentDoc && parentDoc.body) {
        this._parentButton = parentDoc.createElement('div');
        this._parentButton.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:50px;background:#ff4444;color:white;font-size:32px;font-weight:bold;border:5px solid white;border-radius:20px;cursor:pointer;z-index:999999999;text-align:center;box-shadow:0 0 50px black;';
        this._parentButton.innerHTML = '⚠️ CLIC AQUÍ PARA CONECTAR ARDUINO<br><span style="font-size:18px;">(Requerido por seguridad del navegador)</span>';
        parentDoc.body.appendChild(this._parentButton);
        
        this._parentButton.onclick = () => {
          console.log('Parent gesture detectado');
          this._directConnect();
          if (this._parentButton) {
            this._parentButton.remove();
            this._parentButton = null;
          }
        };
        return true;
      }
    } catch (e) {
      console.error('Error creando botón en documento principal:', e);
    }
    return false;
  }

  // FALLBACK: Botón en iframe
  _createOverlayButton() {
    if (window.frameElement) {
        this._oldStyle = window.frameElement.style.cssText;
        window.frameElement.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:block !important;';
    }
    document.body.style.background = 'rgba(0,0,0,0.5)';
    this._overlayButton = document.createElement('div');
    this._overlayButton.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:50px;background:#ff4444;color:white;font-size:32px;font-weight:bold;border:5px solid white;border-radius:20px;cursor:pointer;z-index:1000000;text-align:center;box-shadow:0 0 50px black;';
    this._overlayButton.innerHTML = '⚠️ CLIC AQUÍ PARA CONECTAR ARDUINO<br><span style="font-size:18px;">(Requerido por seguridad del navegador)</span>';
    document.body.appendChild(this._overlayButton);
    this._overlayButton.onclick = () => {
        console.log('Iframe gesture detectado');
        this._directConnect();
    };
  }

  // LIMPIEZA COMPLETA
  _removeOverlayButton() {
    if (this._overlayButton) {
        this._overlayButton.remove();
        this._overlayButton = null;
    }
    if (this._parentButton) {
        this._parentButton.remove();
        this._parentButton = null;
    }
    if (window.frameElement && this._oldStyle !== undefined) {
        window.frameElement.style.cssText = this._oldStyle;
    }
  }

  // CONEXIÓN DIRECTA: 100% gesto de usuario
  _directConnect() {
    try {
      navigator.serial.requestPort()
        .then(port => {
          this.port = port;
          this._removeOverlayButton();
          this._handleConnectionAsync();
        })
        .catch(e => {
          console.error('Error al solicitar puerto:', e);
          // Mostrar error en ambos botones si existen
          if (this._parentButton) {
            this._parentButton.innerHTML = '❌ ERROR AL CONECTAR<br><span style="font-size:18px;">HAGA CLIC PARA REINTENTAR</span>';
          }
          if (this._overlayButton) {
            this._overlayButton.innerHTML = '❌ ERROR AL CONECTAR<br><span style="font-size:18px;">HAGA CLIC PARA REINTENTAR</span>';
          }
        });
    } catch (e) {
      console.error('Error en requestPort:', e);
      if (this._parentButton) {
        this._parentButton.innerHTML = '❌ ERROR CRÍTICO<br><span style="font-size:18px;">RECARGUE LA PÁGINA</span>';
      }
      if (this._overlayButton) {
        this._overlayButton.innerHTML = '❌ ERROR CRÍTICO<br><span style="font-size:18px;">RECARGUE LA PÁGINA</span>';
      }
    }
  }

  // Función principal de conexión
  connectRobot() {
    // Primero intentar con botón en documento principal
    const parentButtonCreated = this._createParentGestureButton();
    if (parentButtonCreated) {
      console.log('Botón creado en documento principal');
      return;
    }
    
    // Si no funciona, usar fallback en iframe
    console.log('Fallback: usando botón en iframe');
    try {
      navigator.serial.requestPort()
        .then(port => {
          this.port = port;
          this._handleConnectionAsync();
        })
        .catch(e => {
          console.error('Error en conexión directa, activando botón superpuesto:', e);
          this._createOverlayButton();
        });
    } catch (e) {
      console.error('Error en requestPort, activando botón superpuesto:', e);
      this._createOverlayButton();
    }
  }

  // Separar completamente la lógica asíncrona
  async _handleConnectionAsync() {
    try {
      await this._disconnect();
      this._activePort = this.port;
      await this._activePort.open({ baudRate: 115200 });
      this._rxRemainder = '';
      this._lineWaiters = [];
      this._startReadLoop();
    } catch (e) {
      console.error('Error conectando:', e);
      this._activePort = null;
    }
  }

  async _disconnect() {
    this._readLoopRunning = false;
    if (this._activePort) {
      try { await this._activePort.close(); } catch (_) {}
      this._activePort = null;
    }
    this._lineWaiters = [];
    this._distanceEma = null;
    this._distanceLastMs = 0;
    this._distanceLastDisplay = null;
    this._distanceLastGood = null;
    this._lastMotorValue = { IZQ: null, DER: null };
    this._removeOverlayButton();
  }

  _enqueueSerial(task) {
    const next = this._serialQueue.then(() => task());
    this._serialQueue = next.catch(() => {});
    return next;
  }

  async _sendLineRaw(msg) {
    if (!this._activePort || !this._activePort.writable) return;
    const writer = this._activePort.writable.getWriter();
    try {
      await writer.write(this.encoder.encode(msg + '\n'));
    } finally {
      writer.releaseLock();
    }
  }

  async _sendLine(msg) {
    return this._enqueueSerial(() => this._sendLineRaw(msg));
  }

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
      w.resolve = (val) => {
        if (w.timer) clearTimeout(w.timer);
        origResolve(val);
      };
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
              if (value && value.byteLength) this._feedBytes(value);
            }
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
      if (w.predicate(line)) {
        this._lineWaiters.splice(i, 1);
        w.resolve(line);
        return;
      }
    }
  }

  _hexToRgb(hex) {
    let s = String(hex).trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }

  async _setMotor(side, value) {
    if (side === 'IZQ' || side === 'DER') this._lastMotorValue[side] = value;
    await this._sendLine(`AT+M_${side}=${value}`);
  }

  async moveForward(args) {
    const speed = Math.round((Math.abs(args.PCT) / 100) * 255);
    await this._setMotor(args.SIDE, speed);
  }

  async moveBackward(args) {
    const speed = Math.round((Math.abs(args.PCT) / 100) * 255) * -1;
    await this._setMotor(args.SIDE, speed);
  }

  async stopMotor(args) {
    if (args.WHICH === 'AMBOS') {
      this._lastMotorValue['IZQ'] = 0;
      this._lastMotorValue['DER'] = 0;
      await this._sendLine('AT+MOTOR=STOP');
      return;
    }
    await this._setMotor(args.WHICH, 0);
  }

  async lightOn(args) {
    const rgb = this._hexToRgb(args.COLOR);
    await this._sendLine(`AT+LED${args.LED}=${rgb.r},${rgb.g},${rgb.b}`);
  }

  async lightOff(args) {
    await this._sendLine(`AT+LED${args.LED}=0,0,0`);
  }

  async playNote(args) {
    const freq = Math.round(args.NOTE);
    const duration = Math.max(0, Math.round(args.MS));
    // Envía el comando AT+NOTE=frec,duracion compatible con el firmware
    await this._sendLine(`AT+NOTE=${freq},${duration}`);
  }

  _normalizeDistanceCm(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    if (n === -1 || n === 0) return null;
    if (n < 2 || n > 450) return null;
    return n;
  }

  _filterDistanceCm(n) {
    if (n == null) return null;
    if (this._distanceEma == null) {
      this._distanceEma = n;
      return n;
    }
    const alpha = 0.35;
    this._distanceEma = Math.round(this._distanceEma * (1 - alpha) + n * alpha);
    return this._distanceEma;
  }

  _distanceDisplayCm(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 999;
    return Math.round(v);
  }

  distanceCm() {
    if (!this._connected()) return -1;
    const now = Date.now();
    if (this._distanceLastDisplay != null && now - this._distanceLastMs < this._distanceMinIntervalMs) {
      return Promise.resolve(this._distanceLastDisplay);
    }
    return this._enqueueSerial(async () => {
      const pred = (ln) => /^-?\d+$/.test(ln);
      const linePromise = this._waitForLine(pred, 5000)
        .then((ln) => {
          const raw = parseInt(String(ln).trim(), 10);
          const norm = this._normalizeDistanceCm(raw);
          if (norm != null) {
            this._distanceLastGood = norm;
            return this._filterDistanceCm(norm);
          }
          throw new Error("Invalid reading");
        })
        .catch(() => {
          if (this._distanceLastGood != null) return this._distanceLastGood;
          return 999;
        });
      await this._sendLineRaw('AT+DISTANCIA');
      const out = await linePromise;
      const v = this._distanceDisplayCm(out);
      this._distanceLastMs = Date.now();
      this._distanceLastDisplay = v;
      return v;
    });
  }

  lineDetected() {
    if (!this._connected()) return false;
    return this._enqueueSerial(async () => {
      const pred = (ln) => ln === '0' || ln === '1';
      const linePromise = this._waitForLine(pred, 5000)
        .then((ln) => ln === '1')
        .catch(() => false);
      await this._sendLineRaw('AT+IR');
      return await linePromise;
    });
  }
}
Scratch.extensions.register(new RecPcb1Arduino()); })(Scratch);
