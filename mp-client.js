// Multiplayer client patch for Rentz (friends-only MVP)
// Connects to local ws server (same origin) and replaces bots with real players.

(function(){
  const qp = new URLSearchParams(location.search);
  const wsOverride = qp.get('ws');
  const wsGlobal = (typeof window !== 'undefined' && window.MP_WS_URL) ? String(window.MP_WS_URL) : '';
  // Default: same-origin (works for local + when hosting static+ws together).
  // For GitHub Pages (static), pass ?ws=wss://<your-render-host> or set window.MP_WS_URL in HTML.
  const WS_URL = (wsOverride && wsOverride.trim())
    ? wsOverride.trim()
    : (wsGlobal && wsGlobal.trim())
      ? wsGlobal.trim()
      : ((location.protocol==='https:'?'wss':'ws') + '://' + location.host);

  const $ = (s, r=document) => r.querySelector(s);

  let ws = null;
  let you = null; // {seat, name, id}
  let room = null;
  let mpEnabled = false;
  let origPlayCard = null;
  let origChoose = null;
  let origContinue = null;
  const pending = [];

  function log(...a){ console.log('[mp]', ...a); }

  function overlay(){
    const el = document.createElement('div');
    el.id = 'mpOverlay';
    el.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;`;
    el.innerHTML = `
      <div style="background:#111;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px;min-width:320px;max-width:92vw;font-family:system-ui">
        <div style="font-weight:700;font-size:18px;margin-bottom:10px;">Rentz Multiplayer (local)</div>
        <div style="font-size:13px;opacity:.85;margin-bottom:12px;">Fără cont • 4 prieteni • cod cameră</div>

        <label style="display:block;font-size:12px;opacity:.8">Nume</label>
        <input id="mpName" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b0b0b;color:#fff;margin:6px 0 10px" placeholder="Numele tău" />

        <div style="display:flex;gap:8px;align-items:flex-end;">
          <div style="flex:1">
            <label style="display:block;font-size:12px;opacity:.8">Cod cameră</label>
            <input id="mpCode" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b0b0b;color:#fff;margin-top:6px" placeholder="ex: ABCDE" />
          </div>
          <button id="mpCreate" style="padding:10px 12px;border-radius:10px;border:0;background:#2d6cdf;color:#fff;font-weight:700;cursor:pointer">Creează</button>
          <button id="mpJoin" style="padding:10px 12px;border-radius:10px;border:0;background:#333;color:#fff;font-weight:700;cursor:pointer">Intră</button>
        </div>

        <div id="mpStatus" style="margin-top:12px;font-size:12px;opacity:.9"></div>
        <div style="margin-top:10px;font-size:12px;opacity:.7">Rulează serverul: <code>node server.js</code> și apoi deschide 4 tab-uri.</div>
      </div>
    `;
    document.body.appendChild(el);

    const savedName = sessionStorage.getItem('mp.name') || '';
    const qpName = (new URLSearchParams(location.search)).get('name');
    const initialName = (qpName && qpName.trim()) ? qpName.trim().slice(0,20) : savedName;
    $('#mpName', el).value = initialName;
    if(initialName) sessionStorage.setItem('mp.name', initialName);

    $('#mpCreate', el).onclick = () => {
      const name = $('#mpName', el).value.trim() || 'Player';
      sessionStorage.setItem('mp.name', name);
      connect();
      wsSend({type:'create', name});
      setStatus('Se creează camera...');
    };

    $('#mpJoin', el).onclick = () => {
      const name = $('#mpName', el).value.trim() || 'Player';
      const code = ($('#mpCode', el).value || '').trim().toUpperCase();
      if(!code) return setStatus('Introdu codul camerei.');
      sessionStorage.setItem('mp.name', name);
      connect();
      wsSend({type:'join', code, name});
      setStatus('Se intră în cameră...');
    };

    function setStatus(t){
      const s = $('#mpStatus', el);
      if(s) s.textContent = t;
    }

    window.__mpSetStatus = setStatus;
    return el;
  }

  function connect(){
    if(ws && ws.readyState===1) return;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      log('ws open');
      while(pending.length){
        try{ ws.send(pending.shift()); }catch(e){ break; }
      }
    };
    ws.onclose = () => {
      log('ws closed');
      if(window.__mpSetStatus) window.__mpSetStatus('Conexiune închisă. Reîncearcă.');
    };
    ws.onerror = () => {
      if(window.__mpSetStatus) window.__mpSetStatus('Eroare conexiune. Pornește serverul local.');
    };
    ws.onmessage = (ev) => {
      let m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
      handle(m);
    };
  }

  function wsSend(obj){
    const s = JSON.stringify(obj);
    if(ws && ws.readyState===1){
      try{ ws.send(s); }catch(e){}
    } else {
      pending.push(s);
    }
  }

  function seatToName(seat){
    const map = {
      0: '.seat-bottom .seat-name',
      1: '.seat-right .seat-name',
      2: '.seat-top .seat-name',
      3: '.seat-left .seat-name',
    };
    return map[seat];
  }

  function ensureBadge(){
    let b = document.getElementById('mpBadge');
    if(b) return b;
    b = document.createElement('div');
    b.id = 'mpBadge';
    b.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9998;padding:8px 10px;border-radius:12px;background:rgba(0,0,0,.7);color:#fff;font:12px system-ui;border:1px solid rgba(255,255,255,.12)';
    document.body.appendChild(b);
    return b;
  }

  function applyRoomPublic(r){
    room = r;

    // update seat names in UI
    for(const p of (r.players||[])){
      // r.players[*].seat is REAL seat index (server).
      // Map it to LOCAL seat index so each client sees themselves as bottom.
      const localSeat = (you && Number.isFinite(you.realSeat)) ? toLocalSeat(p.seat) : p.seat;

      const sel = seatToName(localSeat);
      const el = sel ? document.querySelector(sel) : null;
      if(el) el.textContent = p.name;

      // also sync into game state ASAP (prevents footballer-name randomizer from reintroducing bots)
      try{
        if(window.__state && window.__state.players && window.__state.players[localSeat]){
          window.__state.players[localSeat].name = p.name;
        }
      }catch(e){}
    }

    try{
      if(typeof window.renderHands==='function') window.renderHands();
      if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel();
    }catch(e){}

    // Fill missing seats with deterministic placeholders (avoid footballer names before others join)
    try{
      if(window.__state && window.__state.players){
        for(let i=0;i<4;i++){
          if(!window.__state.players[i]) continue;
          const has = (r.players||[]).some(pp => ((you && Number.isFinite(you.realSeat)) ? toLocalSeat(pp.seat) : pp.seat) === i);
          if(!has){
            const fallback = (i===0 && you?.name) ? you.name : ('P' + (i+1));
            window.__state.players[i].name = fallback;
          }
          window.__state.players[i].isHuman = true;
        }
        window.__state.__botNamesLocked = true;
      }
    }catch(e){}

    const b = ensureBadge();
    const cnt = (r.players||[]).length;
    b.textContent = `Room ${r.code} • ${cnt}/4`;
  }

  // Perspective: do NOT rotate the whole UI.
  // Instead we run the game locally with a rotated seat-indexing so that YOU are always seat 0 (bottom).
  function toLocalSeat(realSeat){
    try{
      const r = Number(realSeat);
      const me = Number(you?.realSeat);
      if(!Number.isFinite(r) || !Number.isFinite(me)) return r;
      return (r - me + 4) % 4;
    }catch(e){ return realSeat; }
  }
  function toRealSeat(localSeat){
    try{
      const l = Number(localSeat);
      const me = Number(you?.realSeat);
      if(!Number.isFinite(l) || !Number.isFinite(me)) return l;
      return (l + me) % 4;
    }catch(e){ return localSeat; }
  }

  function syncSeatLabels(){
    try{
      const st = window.__state;
      if(!st || !st.players) return;
      const map = [
        ['.seat-bottom .seat-name', 0],
        ['.seat-right .seat-name', 1],
        ['.seat-top .seat-name', 2],
        ['.seat-left .seat-name', 3],
      ];
      for(const [sel,i] of map){
        const el = document.querySelector(sel);
        if(el && st.players[i]) el.textContent = st.players[i].name;
      }
    }catch(e){}
  }

  function enableMultiplayer(){
    if(mpEnabled) return;
    mpEnabled = true;

    // Immediately lock/disable any single-player bot name randomizers
    try{
      const st = window.__state;
      if(st){
        st.__botNamesLocked = true;
        if(Array.isArray(st.players)){
          st.players.forEach(p=>{ if(p) p.isHuman = true; });
        }
      }
    }catch(e){}

    // Per-tab override for legacy name sync (A13) which reads localStorage['rentz.playerName'].
    // localStorage is shared across tabs in the same Chrome profile, so we intercept getItem/setItem for this key.
    if(!window.__mpLSNamePatch){
      window.__mpLSNamePatch = true;
      try{
        const _get = localStorage.getItem.bind(localStorage);
        const _set = localStorage.setItem.bind(localStorage);
        localStorage.getItem = (k) => {
          if(k === 'rentz.playerName' && you?.name) return String(you.name);
          return _get(k);
        };
        localStorage.setItem = (k,v) => {
          if(k === 'rentz.playerName') return; // ignore cross-tab writes
          return _set(k,v);
        };
      }catch(e){}
    }

    // Keep left leaderboard in sync even if some flows bypass finalizeRound hooks
    if(!window.__mpScoreLoop){
      window.__mpScoreLoop = setInterval(()=>{
        try{
          if(you?.name && window.__state?.players?.[0]){
            window.__state.players[0].name = you.name;
            const bn = document.querySelector('.seat-bottom .seat-name');
            if(bn) bn.textContent = you.name;
          }
          syncSeatLabels();
          if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel();
        }catch(e){}
      }, 1000);
    }

    // Hide existing start overlay (single-player)
    const startOverlay = document.getElementById('startOverlay');
    if(startOverlay){ startOverlay.classList.add('hidden'); startOverlay.style.display='none'; }

    // Disable bot autoplay
    if(typeof window.maybeBotPlay === 'function'){
      window.maybeBotPlay = function(){};
    }

    // Intercept continue to request a new round from server (host triggers)
    origContinue = window.__continue;
    window.__continue = function(){
      try{
        const modal = document.getElementById('roundSummary');
        if(modal){ modal.classList.add('hidden'); modal.style.display='none'; }
      }catch(e){}
      // only HOST (real seat 0) asks server to start next round; others just wait
      if(you && you.realSeat===0){
        wsSend({type:'next_round'});
      }
    };

    // intercept choose game
    origChoose = window.__choose;
    window.__choose = function(gameName){
      if(!you || !room) return;
      // apply locally immediately for responsive UI
      try{ if(origChoose) origChoose(gameName); }catch(e){}
      wsSend({type:'choose_game', gameName});
    };

    // intercept play card: send to server only
    origPlayCard = window.playCard;
    window.playCard = function(i, card){
      if(!you || !room) return;
      // In local indexing, YOU are always seat 0 (bottom)
      if(i !== 0) return;
      // send full card so server can broadcast without keeping authoritative deck state
      wsSend({type:'play_card', card: { id: card.id, suit: card.suit, rank: card.rank }});
    };

    // expose setActiveSeat if present (added by patch in index.html)
  }

  function setYourHumanSeat(){
    if(!window.__state || !you) return;
    const st = window.__state;
    // In MP, ALL 4 seats are human players. Mark all as human to prevent bot name randomizers.
    st.players.forEach((p) => { p.isHuman = true; });
    // also lock bot name assignment scripts (some legacy code checks this flag)
    st.__botNamesLocked = true;
  }

  function installStartButton(){
    // add a start button for host
    const existing = document.getElementById('mpStartBtn');
    if(existing) return;
    const btn = document.createElement('button');
    btn.id = 'mpStartBtn';
    btn.textContent = 'Start (host)';
    btn.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9998;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:#111;color:#fff;font-weight:700;cursor:pointer;display:none;';
    btn.onclick = () => wsSend({type:'start'});
    document.body.appendChild(btn);
  }

  function showHostStartIfReady(){
    const btn = document.getElementById('mpStartBtn');
    if(!btn || !room || !you) return;
    const ready = (room.players||[]).length === 4;
    btn.style.display = (you.realSeat===0 && ready && !room.started) ? 'block' : 'none';
  }

  function initRoundFromServer(payload){
    const s = payload.state;
    if(!window.__state) return;
    const st = window.__state;

    // reset round-like fields similar to startNewRound(), but DO NOT redeal
    try{ if(typeof window.resetStats==='function') window.resetStats(); }catch(e){}
    st.roundOver = false;
    st.gameName = null;
    st.trick = [];
    st.piles = [0,0,0,0];
    st.lastScores = [0,0,0,0];

    // Rotate players locally so that YOU are always seat 0 (bottom).
    // s.players[*] are in REAL seat order.
    const realPlayers = s.players || [];
    const rotated = [0,1,2,3].map(localSeat => {
      const realSeat = toRealSeat(localSeat);
      return realPlayers[realSeat] || {name: 'P'+(realSeat+1), hand: []};
    });

    for(let i=0;i<4;i++){
      st.players[i].name = rotated[i].name;
      st.players[i].hand = (rotated[i].hand || []).slice();
    }
    // ensure local seat name stays the local player's name
    try{ if(you?.name) st.players[0].name = you.name; }catch(e){}
    syncSeatLabels();

    // chooser from server is a REAL seat index; convert to LOCAL
    const chooserReal = (s.chooserIndex ?? 0);
    st.chooserIndex = toLocalSeat(chooserReal);

    setYourHumanSeat();

    // clear center spots
    try{
      const cc = document.getElementById('centerCards');
      if(cc){ cc.innerHTML = '<div id="spot-top" class="center-spot"></div><div id="spot-right" class="center-spot"></div><div id="spot-bottom" class="center-spot"></div><div id="spot-left" class="center-spot"></div>'; }
    }catch(e){}

    // lead/turn based on 7♣ in LOCAL hands
    try{
      let lead = 0;
      for(let i=0;i<4;i++){
        if((st.players[i].hand||[]).some(c=>c.rank==='7' && c.suit==='♣')) lead=i;
      }
      st.leadIndex = lead;
      st.turn = lead;
    }catch(e){}

    try{ if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel(); }catch(e){}

    // render
    try{ if(typeof window.setActiveSeat==='function') window.setActiveSeat(st.turn); }catch(e){}
    try{ if(typeof window.renderHands==='function') window.renderHands(); }catch(e){}

    // show selector only for LOCAL chooser
    try{
      if(typeof window.populateSelector==='function') window.populateSelector();
      const chooser = st.chooserIndex || 0;
      const title = document.getElementById('selectorTitle');
      if(title) title.textContent = 'Alege jocul — ' + (st.players?.[chooser]?.name || ('P'+(chooser+1)));
      const sel = document.getElementById('selector');
      if(sel){
        if(chooser === 0){ sel.classList.remove('hidden'); sel.style.display='flex'; }
        else { sel.classList.add('hidden'); sel.style.display='none'; }
      }
    }catch(e){}
  }

  function applyChooseGame(gameName){
    // apply locally using original choose if exists
    if(origChoose) origChoose(gameName);

    // Multiplayer compatibility: Rentz flow uses a modal/overlay in this codebase.
    // To avoid desync/deadlocks, auto-complete the Rentz modal on all clients.
    if(gameName === 'Rentz'){
      setTimeout(() => {
        try{
          const fin = document.getElementById('rentzFinishBtn') || document.getElementById('rentzCont');
          if(fin) fin.click();
        }catch(e){}
      }, 300);
    }
  }

  function applyPlayCard(seat, card){
    // Call original playCard to keep all animations + round progression intact.
    const st = window.__state;
    if(!st) return;

    // Ensure other seats have a removable placeholder card
    let hand = st.players[seat].hand;
    if(!hand.some(c=>c.id===card.id)){
      hand.push({id: card.id});
    }
    const cardObj = hand.find(c=>c.id===card.id);
    cardObj.suit = card.suit;
    cardObj.rank = card.rank;

    if(!origPlayCard) return;
    const tmp = window.playCard;
    window.playCard = origPlayCard;
    try{ origPlayCard(seat, cardObj); } finally { window.playCard = tmp; }
  }

  function handle(msg){
    if(msg.type==='hello') return;
    if(msg.type==='error'){
      if(window.__mpSetStatus) window.__mpSetStatus(msg.message || 'Eroare.');
      return;
    }

    if(msg.type==='joined'){
      // keep both real seat (server) and local seat (always 0)
      you = { ...msg.you, realSeat: msg.you.seat, seat: 0 };
      // Ensure legacy name-sync script doesn't overwrite local seat name
      // (localStorage is patched in enableMultiplayer; do not write shared localStorage here)

      applyRoomPublic(msg.room);
      enableMultiplayer();
      installStartButton();
      showHostStartIfReady();
      if(window.__mpSetStatus) window.__mpSetStatus(`Ești în camera ${room.code} ca seat ${msg.you.seat+1}/4 (local: bottom).`);
      const ov = document.getElementById('mpOverlay');
      if(ov) ov.remove();
      return;
    }

    if(msg.type==='room_update'){
      applyRoomPublic(msg.room);
      showHostStartIfReady();
      return;
    }

    if(msg.type==='init_state'){
      applyRoomPublic(msg.room);
      enableMultiplayer();
      initRoundFromServer(msg);
      showHostStartIfReady();
      return;
    }

    if(msg.type==='choose_game'){
      applyChooseGame(msg.gameName);
      return;
    }

    if(msg.type==='play_card'){
      // msg.seat is REAL seat index -> convert to LOCAL seat index
      const localSeat = toLocalSeat(msg.seat);
      applyPlayCard(localSeat, msg.card);
      return;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    overlay();
  });
})();
