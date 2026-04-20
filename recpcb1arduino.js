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

    // Suavizado de distancia
    this._distanceEma = null;
    this._distanceLastMs = 0;
    this._distanceLastDisplay = null;
    this._distanceMinIntervalMs = 65;
    this._distanceLastGood = null;

    // CACHÉ ANTI-SPAM MOTORES
    this._lastMotorValue = { IZQ: null, DER: null };
    this._lastLedValue = { '1': null, '2': null, 'TODAS': null };
    this._lastNote = null;
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
          text: 'Estado Conexión',
        },
        {
          opcode: 'moveForward',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Mover Adelante [VELOCIDAD]',
          arguments: {
            VELOCIDAD: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 180,
            },
          },
        },
        {
          opcode: 'moveBackward',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Mover Atrás [VELOCIDAD]',
          arguments: {
            VELOCIDAD: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 180,
            },
          },
        },
        {
          opcode: 'turnLeft',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Girar Izquierda [VELOCIDAD]',
          arguments: {
            VELOCIDAD: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 180,
            },
          },
        },
        {
          opcode: 'turnRight',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Girar Derecha [VELOCIDAD]',
          arguments: {
            VELOCIDAD: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 180,
            },
          },
        },
        {
          opcode: 'stopMotors',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Detener Motores',
        },
        {
          opcode: 'getDistance',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Distancia Sensor',
        },
        {
          opcode: 'playNote',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Tocar Nota [NOTA] por [DURACION]ms',
          arguments: {
            NOTA: {
              type: Scratch.ArgumentType.STRING,
              menu: 'NOTAS',
              defaultValue: 'C4',
            },
            DURACION: {
              type: Scratch.ArgumentType.NUMBER,
              defaultValue: 500,
            },
          },
        },
        {
          opcode: 'turnOnLED',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Encender LED [LED]',
          arguments: {
            LED: {
              type: Scratch.ArgumentType.STRING,
              menu: 'LEDS',
              defaultValue: '1',
            },
          },
        },
        {
          opcode: 'turnOffLED',
          blockType: Scratch.BlockType.COMMAND,
          text: 'Apagar LED [LED]',
          arguments: {
            LED: {
              type: Scratch.ArgumentType.STRING,
              menu: 'LEDS',
              defaultValue: '1',
            },
          },
        },
      ],
      menus: {
        NOTAS: {
          acceptReporters: false,
          items: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
        },
        LEDS: {
          acceptReporters: false,
          items: ['1', '2', 'TODAS'],
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

  // OVERLAY BUTTON: Crear botón superpuesto para gesto directo
  _createOverlayButton() {
    // Eliminar botón existente si hay
    if (this._overlayButton) {
      this._overlayButton.remove();
    }

    // Crear botón superpuesto
    this._overlayButton = document.createElement('div');
    this._overlayButton.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-size: 24px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      cursor: pointer;
      border: 3px solid #00ff00;
      box-sizing: border-box;
    `;
    
    this._overlayButton.innerHTML = `
      <div style="text-align: center; padding: 20px; background: #ff4444; border-radius: 10px; max-width: 80%;">
        <div style="font-size: 32px; margin-bottom: 20px;">🤖</div>
        <div style="margin-bottom: 10px;">HAGA CLIC AQUÍ</div>
        <div style="font-size: 18px; color: #ffff00;">PARA CONECTAR ARDUINO</div>
      </div>
    `;

    // Añadir al documento
    document.body.appendChild(this._overlayButton);

    // Evento de clic directo - 100% gesto de usuario
    this._overlayButton.addEventListener('click', () => {
      this._directConnect();
    });
  }

  // CONEXIÓN DIRECTA: 100% gesto de usuario sin latencia
  _directConnect() {
    try {
      // PRIMERA LÍNEA: Acceso directo al hardware - SIN NADA ANTES
      navigator.serial.requestPort()
        .then(port => {
          this.port = port;
          // Auto-eliminación del botón
          this._removeOverlayButton();
          // Conexión asíncrona separada
          this._handleConnectionAsync();
        })
        .catch(e => {
          console.error('Error al solicitar puerto:', e);
          // Mostrar error en el botón
          if (this._overlayButton) {
            this._overlayButton.innerHTML = `
              <div style="text-align: center; padding: 20px; background: #ff0000; border-radius: 10px; max-width: 80%;">
                <div style="font-size: 32px; margin-bottom: 20px;">❌</div>
                <div style="margin-bottom: 10px;">ERROR AL CONECTAR</div>
                <div style="font-size: 16px;">${e.message || 'Error desconocido'}</div>
                <div style="margin-top: 20px; font-size: 14px;">HAGA CLIC PARA REINTENTAR</div>
              </div>
            `;
          }
        });
    } catch (e) {
      console.error('Error en requestPort:', e);
      if (this._overlayButton) {
        this._overlayButton.innerHTML = `
          <div style="text-align: center; padding: 20px; background: #ff0000; border-radius: 10px; max-width: 80%;">
            <div style="font-size: 32px; margin-bottom: 20px;">❌</div>
            <div style="margin-bottom: 10px;">ERROR CRÍTICO</div>
            <div style="font-size: 16px;">${e.message || 'Error desconocido'}</div>
          </div>
        `;
      }
    }
  }

  // AUTO-ELIMINACIÓN: Botón desaparece después de selección
  _removeOverlayButton() {
    if (this._overlayButton) {
      this._overlayButton.remove();
      this._overlayButton = null;
    }
  }

  // Función principal de conexión
  connectRobot() {
    // Intentar conexión directa primero
    try {
      // PRIMERA LÍNEA: Acceso directo al hardware - SIN NADA ANTES
      navigator.serial.requestPort()
        .then(port => {
          this.port = port;
          // Conexión asíncrona separada
          this._handleConnectionAsync();
        })
        .catch(e => {
          console.error('Error en conexión directa, activando botón superpuesto:', e);
          // Si falla, activar botón superpuesto
          this._createOverlayButton();
        });
    } catch (e) {
      console.error('Error en requestPort, activando botón superpuesto:', e);
      // Si falla, activar botón superpuesto
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
      try {
        await this._activePort.close();
      } catch (_) {}
      this._activePort = null;
    }
    this._lineWaiters = [];
    this._distanceEma = null;
    this._distanceLastMs = 0;
    this._distanceLastDisplay = null;
    this._distanceLastGood = null;
    this._lastMotorValue = { IZQ: null, DER: null };
    this._lastLedValue = { '1': null, '2': null, 'TODAS': null };
    this._lastNote = null;
    // Limpiar botón al desconectar
    this._removeOverlayButton();
  }

  _enqueueSerial(task) {
    const next = this._serialQueue.then(() => task());
    this._serialQueue = next.catch(() => {});
    return next;
  }

  async _writeLine(line) {
    if (!this._connected()) return;
    const encoded = this.encoder.encode(line + '\n');
    const writer = this._activePort.writable.getWriter();
    await writer.write(encoded);
    writer.releaseLock();
  }

  async _readUntil(separator) {
    const line = await new Promise(resolve => {
      const waiter = { resolve, separator };
      this._lineWaiters.push(waiter);
    });
    return line;
  }

  _startReadLoop() {
    if (this._readLoopRunning) return;
    this._readLoopRunning = true;
    const reader = this._activePort.readable.getReader();
    const readChunk = async () => {
      try {
        while (this._readLoopRunning) {
          const { value, done } = await reader.read();
          if (done) {
            this._readLoopRunning = false;
            break;
          }
          const text = this.decoder.decode(value, { stream: true });
          this._rxRemainder += text;
          while (true) {
            const idx = this._rxRemainder.indexOf('\n');
            if (idx < 0) break;
            const line = this._rxRemainder.slice(0, idx);
            this._rxRemainder = this._rxRemainder.slice(idx + 1);
            if (this._lineWaiters.length > 0) {
              const waiter = this._lineWaiters.shift();
              waiter.resolve(line);
            }
          }
        }
      } catch (e) {
        console.error('Error en read loop:', e);
        this._readLoopRunning = false;
      }
    };
    readChunk();
  }

  async moveForward(args) {
    const speed = Math.max(0, Math.min(255, args.VELOCIDAD || 180));
    const left = this._lastMotorValue.IZQ;
    const right = this._lastMotorValue.DER;
    if (left === speed && right === speed) return;
    this._lastMotorValue.IZQ = speed;
    this._lastMotorValue.DER = speed;
    await this._enqueueSerial(() => this._writeLine(`M:${speed},${speed}`));
  }

  async moveBackward(args) {
    const speed = Math.max(0, Math.min(255, args.VELOCIDAD || 180));
    const left = this._lastMotorValue.IZQ;
    const right = this._lastMotorValue.DER;
    if (left === -speed && right === -speed) return;
    this._lastMotorValue.IZQ = -speed;
    this._lastMotorValue.DER = -speed;
    await this._enqueueSerial(() => this._writeLine(`M:${-speed},${-speed}`));
  }

  async turnLeft(args) {
    const speed = Math.max(0, Math.min(255, args.VELOCIDAD || 180));
    const left = this._lastMotorValue.IZQ;
    const right = this._lastMotorValue.DER;
    if (left === -speed && right === speed) return;
    this._lastMotorValue.IZQ = -speed;
    this._lastMotorValue.DER = speed;
    await this._enqueueSerial(() => this._writeLine(`M:${-speed},${speed}`));
  }

  async turnRight(args) {
    const speed = Math.max(0, Math.min(255, args.VELOCIDAD || 180));
    const left = this._lastMotorValue.IZQ;
    const right = this._lastMotorValue.DER;
    if (left === speed && right === -speed) return;
    this._lastMotorValue.IZQ = speed;
    this._lastMotorValue.DER = -speed;
    await this._enqueueSerial(() => this._writeLine(`M:${speed},${-speed}`));
  }

  async stopMotors() {
    const left = this._lastMotorValue.IZQ;
    const right = this._lastMotorValue.DER;
    if (left === 0 && right === 0) return;
    this._lastMotorValue.IZQ = 0;
    this._lastMotorValue.DER = 0;
    await this._enqueueSerial(() => this._writeLine('M:0,0'));
  }

  async getDistance() {
    const now = Date.now();
    if (now - this._distanceLastMs < this._distanceMinIntervalMs) {
      return this._distanceLastDisplay;
    }
    this._distanceLastMs = now;

    return this._enqueueSerial(async () => {
      try {
        await this._writeLine('D');
        const response = await this._readUntil('\n');
        const distance = parseFloat(response.trim());
        if (!isNaN(distance) && distance >= 0 && distance <= 400) {
          if (this._distanceEma === null) {
            this._distanceEma = distance;
          } else {
            const alpha = 0.3;
            this._distanceEma = alpha * distance + (1 - alpha) * this._distanceEma;
          }
          this._distanceLastGood = this._distanceEma;
          this._distanceLastDisplay = Math.round(this._distanceEma);
        } else {
          this._distanceLastDisplay = this._distanceLastGood || 0;
        }
      } catch (e) {
        console.error('Error leyendo distancia:', e);
        this._distanceLastDisplay = this._distanceLastGood || 0;
      }
      return this._distanceLastDisplay;
    });
  }

  async playNote(args) {
    const note = args.NOTA || 'C4';
    const duration = Math.max(50, Math.min(2000, args.DURACION || 500));
    if (this._lastNote === note) return;
    this._lastNote = note;
    await this._enqueueSerial(() => this._writeLine(`N:${note},${duration}`));
  }

  async turnOnLED(args) {
    const led = args.LED || '1';
    const current = this._lastLedValue[led];
    if (current === 1) return;
    this._lastLedValue[led] = 1;
    await this._enqueueSerial(() => this._writeLine(`L:${led},1`));
  }

  async turnOffLED(args) {
    const led = args.LED || '1';
    const current = this._lastLedValue[led];
    if (current === 0) return;
    this._lastLedValue[led] = 0;
    await this._enqueueSerial(() => this._writeLine(`L:${led},0`));
  }
}

Scratch.extensions.register(new RecPcb1Arduino());
