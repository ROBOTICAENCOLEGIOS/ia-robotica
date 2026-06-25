# REC Agente Windows — Compilador Local Arduino

Servidor local Node.js que recibe código C++ desde el laboratorio web de Robótica En Colegios, lo compila con `arduino-cli` y devuelve el Intel HEX listo para flashear al robot vía Web Serial.

## Arquitectura

```
[Laboratorio Web] --POST /compilar--> [localhost:3000] --arduino-cli--> [.hex] --> [Web Serial → Robot]
```

## Requisitos

- Node.js 18+ (solo para desarrollo; el .exe es standalone)
- [`arduino-cli`](https://arduino.github.io/arduino-cli/) instalado y en PATH
- Librería `RoboticaEnColegios` instalada en Arduino (path de librerías del sistema)
- Board `arduino:avr` instalado: `arduino-cli core install arduino:avr`

## Uso en desarrollo

```bash
npm install
npm start
```

El agente escucha en `http://localhost:3000`.

## Generar el .exe distribuible (Windows x64)

1. Copiá `arduino-cli.exe` a esta carpeta (opcional — si no, se usa el PATH del sistema).
2. Ejecutá:

```bash
npm install
npm run build-exe
```

Esto genera `REC-Agente-Windows.exe` usando [`pkg`](https://github.com/vercel/pkg).

Subí el `.exe` generado al repo en `agente-windows/REC-Agente-Windows.exe` para que el botón
"⬇️ Descargar Compilador (Windows)" en la extensión lo descargue desde jsDelivr.

## Endpoints

| Método | Ruta        | Descripción                                               |
|--------|-------------|-----------------------------------------------------------|
| POST   | `/compilar` | Recibe `{ codigo: "..." }`, devuelve Intel HEX (text/plain) |
| GET    | `/estado`   | Health-check: `{ status: "ok", version, fqbn, cli }`     |

## Variables de entorno

| Variable            | Default                | Descripción                              |
|---------------------|------------------------|------------------------------------------|
| `PORT`              | `3000`                 | Puerto del servidor                      |
| `BOARD_FQBN`        | `arduino:avr:uno`      | FQBN de la placa objetivo                |
| `ARDUINO_CLI_PATH`  | *(PATH del sistema)*   | Ruta absoluta a arduino-cli (opcional)   |

## Seguridad

- El agente escucha **solo en 127.0.0.1** (no expuesto a la red local ni a internet).
- La librería `RoboticaEnColegios` con las definiciones reales de pines reside solo en la
  máquina donde corre el agente. El código que envía el navegador solo contiene la API
  pública (`REC_MotorIzquierdo`, etc.) — **la máscara de seguridad del hardware se mantiene**.
