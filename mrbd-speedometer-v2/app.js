(() => {
  'use strict';
  const valueEl = document.getElementById('speed-value');
  const statusEl = document.getElementById('gps-status');
  const button = document.getElementById('start-button');
  const label = button.querySelector('.content');
  let watch = null;
  let last = null;
  const showSpeed = kmh => valueEl.textContent = String(Math.max(0, Math.round(Number.isFinite(kmh) ? kmh : 0)));
  const showStatus = text => statusEl.textContent = text;
  const metersBetween = (a, b) => {
    const r = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  const fallbackSpeed = coords => {
    const current = { lat: coords.latitude, lon: coords.longitude, time: Date.now() };
    if (!last) { last = current; return 0; }
    const seconds = (current.time - last.time) / 1000;
    const meters = metersBetween(last, current);
    last = current;
    return seconds > 0 && meters >= 0.8 ? (meters / seconds) * 3.6 : 0;
  };
  const stopGps = (reset = true) => {
    if (watch !== null) {
      navigator.geolocation.clearWatch(watch);
      watch = null;
    }
    last = null;
    label.textContent = 'Start GPS';
    if (reset) { showSpeed(0); showStatus('GPS oprit'); }
  };
  const startGps = () => {
    if (!navigator.geolocation) { showStatus('GPS indisponibil'); return; }
    if (watch !== null) return;
    label.textContent = 'Stop GPS';
    showStatus('Caut semnal GPS...');
    watch = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      const kmh = typeof c.speed === 'number' && Number.isFinite(c.speed) && c.speed >= 0 ? c.speed * 3.6 : fallbackSpeed(c);
      showSpeed(kmh);
      const acc = Math.round(c.accuracy || 0);
      showStatus(acc ? 'GPS activ · acuratețe ~' + acc + ' m' : 'GPS activ');
    }, err => {
      stopGps(false);
      showSpeed(0);
      showStatus(err && err.code === 1 ? 'Permite locația în browser' : 'Nu pot citi viteza GPS');
    }, { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 });
  };
  const toggleGps = () => watch === null ? startGps() : stopGps(true);
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-action]');
    if (c && c.dataset.action === 'toggle-gps') toggleGps();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); button.click(); }
    if (e.key === 'Escape') { e.preventDefault(); stopGps(true); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopGps(true); });
  button.focus();
})();
