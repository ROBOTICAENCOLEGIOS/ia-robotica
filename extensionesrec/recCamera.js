/**
 * RECCamera — Motor de cámara centralizado para extensiones RoboticaEnColegios R.E.C.
 * Singleton global: window.RECCamera
 * Modos: FLOTANTE FIJA | FLOTANTE ARRASTRABLE | FONDO DE ESCENARIO (REALIDAD AUMENTADA)
 */
(function () {
  'use strict';
  if (window.RECCamera) return;

  // ── Estado interno ───────────────────────────────────────────────────────────
  let _video     = null;   // Elemento <video> para inferencia
  let _stream    = null;   // MediaStream propio
  let _container = null;   // Div flotante visible
  let _starting  = false;  // Bandera anti-concurrencia
  let _mirror    = true;   // Espejo horizontal (false para señales de tránsito)

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  let _dragging = false, _dsx = 0, _dsy = 0, _dl = 0, _dt = 0;

  function _onDown(e) {
    _dragging = true;
    _dsx = e.clientX; _dsy = e.clientY;
    _dl  = parseFloat(_container.style.left) || cam.camaraX;
    _dt  = parseFloat(_container.style.top)  || cam.camaraY;
    _container.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function _onMove(e) {
    if (!_dragging || !_container) return;
    cam.camaraX = _dl + (e.clientX - _dsx);
    cam.camaraY = _dt + (e.clientY - _dsy);
    _container.style.left = cam.camaraX + 'px';
    _container.style.top  = cam.camaraY + 'px';
  }
  function _onUp() {
    if (_dragging) { _dragging = false; if (_container) _container.style.cursor = 'grab'; }
  }

  // ── Aplicar modo de visualización ───────────────────────────────────────────
  function _applyMode(mode, color) {
    const isAR = mode === 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)';

    if (isAR) {
      // Ocultar contenedor flotante si existe
      if (_container) {
        _container.style.display = 'none';
      } else {
        // Video oculto — solo para inferencia
        _video.style.display = 'none';
        document.body.appendChild(_video);
      }
      // Activar video nativo de Scratch detrás de los sprites
      try {
        const vd = Scratch.vm.runtime.ioDevices.video;
        vd.enableVideo();
        vd.mirror = true;
      } catch (e) {
        console.warn('RECCamera: VM no disponible para AR —', e);
      }
      return;
    }

    // ── Modos flotantes ──────────────────────────────────────────────────────
    // Desactivar AR si venía de ese modo
    try { Scratch.vm.runtime.ioDevices.video.disableVideo(); } catch (e) {}

    if (!_container) {
      _container = document.createElement('div');
      Object.assign(_container.style, {
        position: 'fixed', zIndex: '1000',
        left: cam.camaraX + 'px', top: cam.camaraY + 'px',
        borderRadius: '10px', overflow: 'hidden',
        border: '3px solid ' + color, userSelect: 'none'
      });
      Object.assign(_video.style, {
        display: 'block', width: '160px',
        transform: _mirror ? 'scaleX(-1)' : 'none', pointerEvents: 'none'
      });
      _container.appendChild(_video);
      document.body.appendChild(_container);
    } else {
      _container.style.display = '';
      _container.style.border  = '3px solid ' + color;
    }

    // Reiniciar listeners de drag
    document.removeEventListener('mousemove', _onMove);
    document.removeEventListener('mouseup',   _onUp);
    _container.removeEventListener('mousedown', _onDown);

    if (mode === 'FLOTANTE ARRASTRABLE') {
      _container.style.cursor = 'grab';
      _container.addEventListener('mousedown', _onDown);
      document.addEventListener('mousemove',   _onMove);
      document.addEventListener('mouseup',     _onUp);
    } else {
      _container.style.cursor = 'default';
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────────
  const cam = {
    video:   null,   // Referencia pública al <video>
    camaraX: 400,    // Posición X del contenedor (se actualiza en drag)
    camaraY: 10,     // Posición Y del contenedor (se actualiza en drag)

    /**
     * Inicia la cámara y aplica el modo de visualización.
     * Si ya estaba corriendo, solo cambia el modo.
     * @param {string}  mode   — 'FLOTANTE FIJA' | 'FLOTANTE ARRASTRABLE' | 'FONDO DE ESCENARIO (REALIDAD AUMENTADA)'
     * @param {string}  color  — Color del borde del contenedor
     * @param {boolean} mirror — true=espejo (manos/emociones/objetos); false=sin espejo (señales de tránsito)
     * @returns {HTMLVideoElement|null}
     */
    async start(mode, color, mirror = true) {
      const c = color || '#FF5733';
      _mirror = mirror;

      // Camera ya corriendo: solo actualizar modo y espejo
      if (_video && _stream) {
        _video.style.transform = _mirror ? 'scaleX(-1)' : 'none';
        _applyMode(mode, c);
        return _video;
      }

      // Anti-concurrencia: esperar si ya hay un start en curso
      if (_starting) {
        return new Promise(resolve => {
          const t = setInterval(() => { if (_video) { clearInterval(t); resolve(_video); } }, 50);
        });
      }
      _starting = true;

      try {
        _stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        _video            = document.createElement('video');
        cam.video         = _video;
        _video.srcObject  = _stream;
        _video.setAttribute('autoplay', '');
        _video.setAttribute('playsinline', '');
        _applyMode(mode, c);
      } catch (err) {
        console.error('RECCamera: error al acceder a la cámara —', err);
        _starting = false;
        return null;
      }
      _starting = false;
      return _video;
    },

    /** Detiene la cámara y libera todos los recursos. */
    stop() {
      document.removeEventListener('mousemove', _onMove);
      document.removeEventListener('mouseup',   _onUp);
      if (_container) { _container.remove(); _container = null; }
      else if (_video && _video.parentNode) _video.remove();
      if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
      _video = null; cam.video = null;
      try { Scratch.vm.runtime.ioDevices.video.disableVideo(); } catch (e) {}
    },

    /** Mueve el contenedor flotante a las coordenadas dadas. */
    setPos(x, y) {
      cam.camaraX = x; cam.camaraY = y;
      if (_container) { _container.style.left = x + 'px'; _container.style.top = y + 'px'; }
    },

    /** Ajusta el tamaño del video (porcentaje de 480px base). */
    setSize(pct) {
      if (_video) _video.style.width = Math.round(480 * pct / 100) + 'px';
    }
  };

  window.RECCamera = cam;
})();
