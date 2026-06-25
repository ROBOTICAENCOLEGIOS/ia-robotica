'use strict';
// ── REC Agente Windows ────────────────────────────────────────────────────────
// Servidor local (localhost:3000) que recibe código C++ desde el laboratorio
// web, lo compila con arduino-cli y devuelve el Intel HEX listo para flashear.
//
// Arrancar: node server.js   (o doble-clic en el .exe generado con pkg)
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ── Configuración ─────────────────────────────────────────────────────────────
// Board FQBN de la placa objetivo (Arduino Uno / Nano ATmega328P)
const BOARD_FQBN = process.env.BOARD_FQBN || 'arduino:avr:uno';

// Ruta al ejecutable arduino-cli.
// Prioridad: variable de entorno → binary junto al .exe (si empaquetado con pkg) → PATH
function getArduinoCLI() {
  if (process.env.ARDUINO_CLI_PATH) return `"${process.env.ARDUINO_CLI_PATH}"`;
  if (process.pkg) {
    // Cuando corremos como .exe generado por pkg, buscamos arduino-cli.exe
    // en el mismo directorio que el ejecutable
    const bundled = path.join(path.dirname(process.execPath), 'arduino-cli.exe');
    if (fs.existsSync(bundled)) return `"${bundled}"`;
  }
  return 'arduino-cli'; // asume que está en PATH del sistema
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// ── POST /compilar ────────────────────────────────────────────────────────────
// Body JSON: { "codigo": "<código C++ completo>" }
// Respuesta: Intel HEX (text/plain) o JSON { error, detalle } en caso de error
app.post('/compilar', async (req, res) => {
  const { codigo } = req.body || {};
  if (!codigo || typeof codigo !== 'string') {
    return res.status(400).json({ error: 'Campo "codigo" requerido (string).' });
  }

  // arduino-cli requiere que el archivo .ino tenga el MISMO nombre que la carpeta
  const tmpBase   = fs.mkdtempSync(path.join(os.tmpdir(), 'rec_sketch_'));
  const sketchDir = path.join(tmpBase, 'rec_sketch');
  const outputDir = path.join(tmpBase, 'output');

  try {
    fs.mkdirSync(sketchDir);
    fs.mkdirSync(outputDir);

    const inoPath = path.join(sketchDir, 'rec_sketch.ino');
    fs.writeFileSync(inoPath, codigo, 'utf8');

    const cli = getArduinoCLI();
    const cmd = `${cli} compile --fqbn ${BOARD_FQBN} "${sketchDir}" --output-dir "${outputDir}"`;

    console.log('[REC-Agente] Compilando...');
    console.log('[REC-Agente] CMD:', cmd);

    const { stdout, stderr } = await execAsync(cmd, { timeout: 90_000 });
    if (stdout) console.log('[arduino-cli]', stdout.trim());
    if (stderr) console.warn('[arduino-cli]', stderr.trim());

    // Buscar el archivo .hex en la carpeta de salida
    const hexFile = fs.readdirSync(outputDir).find(f => f.endsWith('.hex'));
    if (!hexFile) throw new Error('arduino-cli no generó ningún archivo .hex.');

    const hexContent = fs.readFileSync(path.join(outputDir, hexFile), 'utf8');
    console.log('[REC-Agente] ✅ Compilación exitosa, enviando HEX.');

    res.set('Content-Type', 'text/plain');
    res.send(hexContent);

  } catch (err) {
    const detalle = err.stderr || err.stdout || err.message || String(err);
    console.error('[REC-Agente] ❌ Error:', detalle);
    res.status(500).json({ error: 'Error de compilación', detalle });

  } finally {
    // Limpiar archivos temporales silenciosamente
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
  }
});

// ── GET /estado ───────────────────────────────────────────────────────────────
// Health-check usado por el laboratorio para verificar que el agente está activo
app.get('/estado', (_req, res) => {
  res.json({
    status:  'ok',
    version: '1.0.0',
    agente:  'REC-Agente-Windows',
    fqbn:    BOARD_FQBN,
    cli:     getArduinoCLI()
  });
});

// ── Arrancar ──────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🤖  REC Agente Windows — Compilador Local Arduino       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`   Escuchando en  : http://localhost:${PORT}`);
  console.log(`   Board FQBN     : ${BOARD_FQBN}`);
  console.log(`   arduino-cli    : ${getArduinoCLI()}`);
  console.log('   Endpoint       : POST /compilar  { codigo: "..." }');
  console.log('   Health-check   : GET  /estado');
  console.log('');
  console.log('   Dejá esta ventana abierta mientras usás el laboratorio.');
  console.log('   Para detener: Ctrl + C');
  console.log('');
});
