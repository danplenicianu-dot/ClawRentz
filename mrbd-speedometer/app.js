(() => {
  'use strict';

  const valueEl = document.getElementById('speed-value');
  const statusEl = document.getElementById('gps-status');
  const button = document.getElementById('start-button');
  const label = button.querySelector('.content');

  let watch = null;
  let last = null;

  const showSpeed = (kmh) => {
    valueEl.textContent = String(Math.max(0, Math.round(Number.isFinite(kmh) ? kmh : 0)));
  };

  const showStatus = (text) => {
    statusEl.textContent = text;
  };

  const metersBetween = (a, b) => {
    const radius = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const fallbackSpeed = (coords) => {
    const now = Date.now();
    const current = { lat: coords.latitude, lon: coords.longitude, time: now };
    if (!last) {
      last = current;
      return 0;
    }
    const seconds = (current.time - last.time) / 1000;
    const meters = metersBetween(last, current);
    last = current;
    if (seconds <= 0 || meters < 0.8) return 0;
    return (meters / seconds) * 3.6;
  };

  const stopGps = (resetText = true) => {
    if (watch !== null) {
      navigator.geolocation.clearWatch(watch);
      watch = null;
    }
    last = null;
    label.textContent = 'Start GPS';
    if (resetText) {
      showSpeed(0);
      showStatus('GPS oprit');
    }
  };

  const startGps = () => {
    if (!navigator.geolocation) {
      showStatus('GPS indisponibil');
      return;
    }
    if (watch !== null) return;
    label.textContent = 'Stop GPS';
    showStatus('Caut semnal GPS...');
    watch = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const kmh = (typeof c.speed === 'number' && Number.isFinite(c.speed) && c.speed >= 0)
          ? c.speed * 3.6
          : fallbackSpeed(c);
        showSpeed(kmh);
        const acc = Math.round(c.accuracy || 0);
        showStatus(acc ? 'GPS activ · acuratețe ~' + acc + ' m' : 'GPS activ');
      },
      (err) => {
        stopGps(false);
        showSpeed(0);
        showStatus(err && err.code === 1 ? 'Permite locația în browser' : 'Nu pot citi viteza GPS');
      },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 }
    );
  };

  const toggleGps = () => watch === null ? startGps() : stopGps(true);

  const focusables = () => Array.from(document.querySelectorAll('.focusable')).filter(el => el.offsetParent !== null && !el.disabled);
  const moveFocus = (step) => {
    const items = focusables();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    const next = step > 0 ? (idx + 1) % items.length : (idx <= 0 ? items.length - 1 : idx - 1);
    items[next].focus();
  };

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (control && control.dataset.action === 'toggle-gps') toggleGps();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (document.activeElement && document.activeElement.click) document.activeElement.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      stopGps(true);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopGps(true);
  });

  button.focus();
})();
