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

  function buildRoomLink(code){
    try{
      const u = new URL(location.href);
      // keep cache-busters like ?v=, but set/overwrite room param
      u.searchParams.set('room', String(code));
      return u.toString();
    }catch(e){
      return location.href;
    }
  }

  async function shareRoom(code){
    const url = buildRoomLink(code);
    const text = `Rentz MP – intră cu codul ${code}: ${url}`;
    try{
      if(navigator.share){
        await navigator.share({ title:'Rentz MP', text, url });
        return;
      }
    }catch(e){}

    // WhatsApp fallback (works on mobile; on desktop opens WhatsApp Web)
    const wa = 'https://wa.me/?text=' + encodeURIComponent(text);
    try{ window.open(wa, '_blank'); }catch(e){ location.href = wa; }

    // best-effort clipboard
    try{ navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText(url); }catch(e){}
  }

  function overlay(){
    const el = document.createElement('div');
    el.id = 'mpOverlay';
    el.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;`;
    el.innerHTML = `
      <style>
        .iosCard{background:rgba(20,20,22,.92);color:#fff;border:1px solid rgba(255,255,255,.10);border-radius:20px;padding:16px;min-width:320px;max-width:92vw;font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial;backdrop-filter: blur(14px);-webkit-backdrop-filter: blur(14px)}
        .iosTitle{font-weight:700;font-size:17px;letter-spacing:-0.01em;margin:0 0 10px}
        .iosSub{font-size:13px;opacity:.75;margin:0 0 14px}
        .iosSeg{display:flex;gap:6px;background:rgba(255,255,255,.08);padding:6px;border-radius:14px;margin-bottom:14px}
        .iosSeg button{flex:1;border:0;background:transparent;color:#fff;padding:9px 10px;border-radius:12px;font-weight:700;opacity:.8;cursor:pointer}
        .iosSeg button.active{background:rgba(255,255,255,.14);opacity:1}
        .iosField{display:flex;flex-direction:column;gap:6px;margin:0 0 12px}
        .iosLabel{font-size:12px;opacity:.7}
        .iosInput,.iosSelect{width:100%;padding:11px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#fff;outline:none}
        .iosRow{display:flex;gap:10px;align-items:flex-end}
        .iosBtn{width:100%;padding:12px 14px;border-radius:16px;border:0;background:#0A84FF;color:#fff;font-weight:800;cursor:pointer}
        .iosBtn.secondary{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14)}
        .iosTiny{font-size:12px;opacity:.7;margin-top:10px;line-height:1.3}
        .iosStatus{margin-top:10px;font-size:12px;opacity:.85}
        .iosShareRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
        .iosShareRow button{flex:1;min-width:140px}
      </style>

      <div class="iosCard">
        <div class="iosTitle">Rentz Multiplayer</div>
        <div class="iosSub">Fără cont • cod numeric • share rapid</div>

        <div class="iosSeg">
          <button id="mpTabCreate" class="active" type="button">Creează</button>
          <button id="mpTabJoin" type="button">Intră</button>
        </div>

        <div class="iosField">
          <div class="iosLabel">Nume</div>
          <input id="mpName" class="iosInput" placeholder="Numele tău" />
        </div>

        <div id="mpPaneCreate">
          <div class="iosRow">
            <div class="iosField" style="flex:1">
              <div class="iosLabel">Oameni</div>
              <select id="mpHumans" class="iosSelect">
                <option value="4" selected>4</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
              </select>
            </div>
          </div>
          <button id="mpCreate" class="iosBtn" type="button">Creează cameră</button>
        </div>

        <div id="mpPaneJoin" style="display:none">
          <div class="iosField">
            <div class="iosLabel">Cod cameră</div>
            <input id="mpCode" class="iosInput" placeholder="123456" inputmode="numeric" />
          </div>
          <button id="mpJoin" class="iosBtn" type="button">Intră în cameră</button>
        </div>

        <div id="mpStatus" class="iosStatus"></div>

        <div class="iosShareRow">
          <button id="mpShare" class="iosBtn" type="button" style="display:none">Partajează pe WhatsApp</button>
          <button id="mpCopy" class="iosBtn secondary" type="button" style="display:none">Copiază link</button>
        </div>

        <div class="iosTiny">Tip: poți trimite link direct cu camera (are parametru <code>?room=</code>).</div>
      </div>
    `;
    document.body.appendChild(el);

    const savedName = sessionStorage.getItem('mp.name') || '';
    const qpName = (new URLSearchParams(location.search)).get('name');
    const initialName = (qpName && qpName.trim()) ? qpName.trim().slice(0,20) : savedName;
    $('#mpName', el).value = initialName;
    if(initialName) sessionStorage.setItem('mp.name', initialName);

    // Tabs
    const tabCreate = $('#mpTabCreate', el);
    const tabJoin = $('#mpTabJoin', el);
    const paneCreate = $('#mpPaneCreate', el);
    const paneJoin = $('#mpPaneJoin', el);
    function setTab(which){
      const isCreate = which==='create';
      if(tabCreate) tabCreate.classList.toggle('active', isCreate);
      if(tabJoin) tabJoin.classList.toggle('active', !isCreate);
      if(paneCreate) paneCreate.style.display = isCreate ? '' : 'none';
      if(paneJoin) paneJoin.style.display = !isCreate ? '' : 'none';
    }
    if(tabCreate) tabCreate.onclick = ()=>setTab('create');
    if(tabJoin) tabJoin.onclick = ()=>setTab('join');

    $('#mpCreate', el).onclick = () => {
      const name = $('#mpName', el).value.trim() || 'Player';
      const maxHumans = Number($('#mpHumans', el)?.value || 4);
      sessionStorage.setItem('mp.name', name);
      connect();
      wsSend({type:'create', name, maxHumans});
      setStatus('Se creează camera...');
    };

    // prefill room code from URL (?room=123456)
    try{
      const roomFromUrl = (new URLSearchParams(location.search)).get('room');
      if(roomFromUrl){
        $('#mpCode', el).value = String(roomFromUrl).trim();
        setStatus('Cod preluat din link. Apasă „Intră”.');
      }
    }catch(e){}

    $('#mpJoin', el).onclick = () => {
      const name = $('#mpName', el).value.trim() || 'Player';
      const code = ($('#mpCode', el).value || '').trim();
      if(!code) return setStatus('Introdu codul camerei.');
      sessionStorage.setItem('mp.name', name);
      connect();
      wsSend({type:'join', code, name});
      setStatus('Se intră în cameră...');
    };

    // Share/copy actions (enabled after joined)
    const shareBtn = $('#mpShare', el);
    const copyBtn = $('#mpCopy', el);
    if(shareBtn) shareBtn.onclick = () => { if(room?.code) shareRoom(room.code); };
    if(copyBtn) copyBtn.onclick = async () => {
      if(!room?.code) return;
      const url = buildRoomLink(room.code);
      try{ await (navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText(url)); setStatus('Link copiat.'); }
      catch(e){ setStatus(url); }
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

  function syncNamesFromRoom(){
    try{
      if(!room || !you || !window.__state || !window.__state.players) return;
      // room.players[*].seat are REAL seats.
      for(const p of (room.players||[])){
        const localSeat = toLocalSeat(p.seat);
        if(window.__state.players[localSeat]) window.__state.players[localSeat].name = p.name;
      }
      // Names are authoritative from room; do not overwrite seat 0 with a cached local name.
      syncSeatLabels();

      // Patch round summary names if it's currently visible
      const rs = document.getElementById('roundSummary');
      if(rs && !rs.classList.contains('hidden') && rs.style.display !== 'none'){
        const rows = rs.querySelectorAll('#roundSummaryTable .row');
        rows.forEach((row,i)=>{
          const nameCell = row.querySelector('.cell.name');
          if(nameCell) nameCell.textContent = window.__state.players[i]?.name || nameCell.textContent;
        });
      }

      // Patch selector title if visible
      const sel = document.getElementById('selector');
      if(sel && !sel.classList.contains('hidden') && sel.style.display !== 'none'){
        const title = document.getElementById('selectorTitle');
        const ch = (window.__state?.chooserIndex ?? 0);
        if(title && window.__state.players[ch]) title.textContent = 'Alege jocul — ' + (window.__state.players[ch].name||'Jucător');
      }
    }catch(e){}
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
          // only local seat should be human (face-up)
          window.__state.players[i].isHuman = (i===0);
        }
        window.__state.__botNamesLocked = true;
      }
    }catch(e){}

    const b = ensureBadge();
    const cnt = (r.connectedHumans != null) ? r.connectedHumans : ((r.players||[]).filter(p=>p.connected).length);
    const need = r.maxHumans || 4;
    b.textContent = `Room ${r.code} • ${cnt}/${need}`;
    b.style.cursor = 'pointer';
    b.title = 'Click pentru a partaja linkul camerei';
    b.onclick = () => { try{ shareRoom(r.code); }catch(e){} };

    // ensure state names are consistent for round summary + overlays
    syncNamesFromRoom();
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
        // keep seat 0 human for rendering; others non-human (backs)
        if(Array.isArray(st.players)){
          st.players.forEach((p,idx)=>{ if(p) p.isHuman = (idx===0); });
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
          if(k === 'rentz.playerName'){
            try{ return String(window.__state?.players?.[0]?.name || you?.name || 'Player'); }catch(e){ return String(you?.name || 'Player'); }
          }
          return _get(k);
        };
        localStorage.setItem = (k,v) => {
          if(k === 'rentz.playerName') return; // ignore cross-tab writes
          return _set(k,v);
        };
      }catch(e){}
    }

    // Keep names + leaderboard in sync even if some flows bypass hooks
    if(!window.__mpScoreLoop){
      window.__mpScoreLoop = setInterval(()=>{
        try{
          syncNamesFromRoom();
          if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel();
        }catch(e){}
      }, 1000);
    }

    // Hide existing start overlay (single-player)
    const startOverlay = document.getElementById('startOverlay');
    if(startOverlay){ startOverlay.classList.add('hidden'); startOverlay.style.display='none'; }

    // Bot autoplay: keep enabled ONLY on host, and ONLY for bot seats (when maxHumans < 4)
    if(!window.__mpOrigMaybeBotPlay && typeof window.maybeBotPlay === 'function'){
      window.__mpOrigMaybeBotPlay = window.maybeBotPlay;
    }
    window.maybeBotPlay = function(){
      try{
        const st = window.__state;
        const orig = window.__mpOrigMaybeBotPlay;
        if(!st || !orig) return;

        // Non-hosts never run bot AI (avoid duplicates)
        if(!(you && you.realSeat===0)) return;

        const need = room?.maxHumans || 4;
        if(need >= 4) return; // no bots

        // Determine if the current REAL turn seat belongs to a connected human
        const connectedReal = new Set((room?.players||[]).filter(p=>p.connected).map(p=>p.seat));
        const turnReal = toRealSeat(st.turn);
        const isHumanTurn = connectedReal.has(turnReal);
        if(isHumanTurn) return;

        // bot turn -> run original bot AI
        return orig();
      }catch(e){}
    };

    // Intercept continue to request a new round from server (host triggers)
    origContinue = window.__continue;
    window.__continue = function(){
      try{
        const modal = document.getElementById('roundSummary');
        if(modal){ modal.classList.add('hidden'); modal.style.display='none'; }
      }catch(e){}
      // only HOST (real seat 0) asks server to start next round; others just wait
      if(you && you.realSeat===0){
        try{ wsSend({type:'round_end', gameName: window.__state?.gameName || ''}); }catch(e){}
        wsSend({type:'next_round'});
      }
    };

    // Also hook finalizeRound to sync names before summary draws
    try{
      if(!window.__mpFinalWrap && typeof window.finalizeRound==='function'){
        window.__mpFinalWrap = true;
        const _fin = window.finalizeRound;
        window.finalizeRound = function(){
          try{ syncNamesFromRoom(); }catch(e){}
          return _fin.apply(this, arguments);
        };
      }
    }catch(e){}

    // Hook selector buttons instead of overriding window.__choose.
    // Overriding __choose breaks the Rentz overlay which relies on wrapping __choose.
    origChoose = window.__choose;

    function forceOpenRentzOverlay(){
    try{
      const ol = document.getElementById('rentzOverlay');
      const frame = document.getElementById('rentzFrame');
      if(!ol || !frame) return;

      // Ensure names are synced before building payload
      try{ syncNamesFromRoom(); }catch(e){}

      const S = window.__state || {};

      // Prefer room-mapped names to avoid any phantom defaults
      let players;
      try{
        if(room && you && Number.isFinite(you.realSeat)){
          players = [0,1,2,3].map(localSeat=>{
            const realSeat = toRealSeat(localSeat);
            const p = (room.players||[]).find(x=>x.seat===realSeat) || {};
            return { name: p.name || (S.players?.[localSeat]?.name) || '—', isHuman: localSeat===0 };
          });
        }
      }catch(e){}
      if(!players) players = (S.players||[]).map((p,idx)=>({name:p.name||'—', isHuman: idx===0}));

      const hands = (S.players||[]).map(p=>(p.hand||[]).map(c=>({id:c.id, suit:c.suit, rank:c.rank})));
      const chooserIndex = (S.chooserIndex|0);
      const payload = { players, hands, chooserIndex, seed:'10', minRank:'7' };

      ol.hidden = false;
      ol.classList.add('show');
      ol.setAttribute('aria-hidden','false');
      try{ frame.contentWindow && frame.contentWindow.postMessage({type:'rentz:init', payload}, '*'); }catch(e){}
    }catch(e){}
  }

    function wireSelectorOnce(){
      if(window.__mpSelectorWired) return;
      window.__mpSelectorWired = true;
      document.addEventListener('click', (ev)=>{
        try{
          const btn = ev.target && ev.target.closest && ev.target.closest('#selector .game-btn');
          if(!btn) return;
          const gameName = (btn.textContent || '').trim();
          if(!gameName) return;
          // prevent the built-in click handler from running (we'll apply locally via __choose)
          ev.preventDefault();
          ev.stopImmediatePropagation();

          // broadcast selection (SERVER is authoritative; do not apply locally here)
          wsSend({type:'choose_game', gameName});

          // optimistic local apply removed: if server rejects (already chosen / wrong turn),
          // applying locally would make it look like it "worked".
          try{
            const s = document.getElementById('mpStatus');
            if(s) s.textContent = 'Se trimite alegerea...';
          }catch(e){}
        }catch(e){}
      }, true);
    }

    wireSelectorOnce();

    // intercept play card: send to server only
    origPlayCard = window.playCard;
    window.playCard = function(i, card){
      if(!you || !room) return;

      // If this is YOUR play (local seat 0), send normal play.
      if(i === 0){
        wsSend({type:'play_card', card: { id: card.id, suit: card.suit, rank: card.rank }});
        return;
      }

      // Bot support: on host, allow bot seats to play by sending bot_play with REAL seat.
      try{
        if(you.realSeat===0){
          const seatReal = toRealSeat(i);
          wsSend({type:'bot_play', seat: seatReal, card: { id: card.id, suit: card.suit, rank: card.rank }});
        }
      }catch(e){}
    };

    // expose setActiveSeat if present (added by patch in index.html)
  }

  function setYourHumanSeat(){
    if(!window.__state || !you) return;
    const st = window.__state;
    // IMPORTANT: only local seat (bottom) should be rendered as human (face-up cards).
    // Other seats must stay non-human so their hands render as card backs.
    st.players.forEach((p, idx) => { p.isHuman = (idx === 0); });
    // lock bot name assignment scripts so we keep real MP names (no footballers)
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
    const cnt = (room.connectedHumans != null) ? room.connectedHumans : ((room.players||[]).filter(p=>p.connected).length);
    const need = room.maxHumans || 4;
    const ready = cnt === need;
    btn.style.display = (you.realSeat===0 && ready && !room.started) ? 'block' : 'none';
  }

  function syncChosenFromServer(chosenReal){
    try{
      const st = window.__state;
      if(!st || !st.players) return;
      if(!Array.isArray(chosenReal)) return;
      st.chosenGames = st.chosenGames || [new Set(),new Set(),new Set(),new Set()];
      // chosenReal is indexed by REAL seat. Convert into LOCAL seat index sets.
      for(let realSeat=0; realSeat<4; realSeat++){
        const localSeat = toLocalSeat(realSeat);
        const list = Array.isArray(chosenReal[realSeat]) ? chosenReal[realSeat] : [];
        st.chosenGames[localSeat] = new Set(list);
      }

      // refresh selector UI so picked games show disabled/hatched immediately
      try{
        if(typeof window.populateSelector==='function') window.populateSelector();
        // also refresh title text (some pages set it once with default name)
        const title = document.getElementById('selectorTitle');
        const ch = (window.__state?.chooserIndex ?? 0);
        if(title && window.__state?.players?.[ch]) title.textContent = 'Alege jocul — ' + (window.__state.players[ch].name||'Jucător');
      }catch(e){}
    }catch(e){}
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
    // seat0 name comes from server room mapping (avoid phantom defaults)
    syncSeatLabels();

    // chooser from server is a REAL seat index; convert to LOCAL
    const chooserReal = (s.chooserIndex ?? 0);
    st.chooserIndex = toLocalSeat(chooserReal);

    // sync chosenGames from server, if provided
    try{ if(s && s.chosenGames) syncChosenFromServer(s.chosenGames); }catch(e){}

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
    // NOTE: For Rentz we must NOT auto-finish; the overlay/miniapp runs and closes itself.
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
      const text = msg.message || 'Eroare.';
      // show in overlay if still present
      try{ if(window.__mpSetStatus) window.__mpSetStatus(text); }catch(e){}
      // also show in-game toast (overlay can be gone)
      try{
        let t = document.getElementById('mpToast');
        if(!t){
          t = document.createElement('div');
          t.id = 'mpToast';
          t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10050;background:rgba(0,0,0,.78);color:#fff;padding:10px 12px;border-radius:12px;font:12px system-ui;border:1px solid rgba(255,255,255,.12);max-width:min(520px,92vw);text-align:center;display:none;';
          document.body.appendChild(t);
        }
        t.textContent = text;
        t.style.display = 'block';
        clearTimeout(window.__mpToastTimer);
        window.__mpToastTimer = setTimeout(()=>{ try{ t.style.display='none'; }catch(e){} }, 2400);
      }catch(e){}

      // If chooser tried to pick an already-chosen game, reopen selector so they can pick again.
      try{
        const st = window.__state;
        const sel = document.getElementById('selector');
        if(sel && st && (st.chooserIndex===0)){
          sel.classList.remove('hidden');
          sel.style.display = 'flex';
        }
      }catch(e){}
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
      if(window.__mpSetStatus) window.__mpSetStatus(`Ești în camera ${room.code} (cod: ${room.code}).`);

      // Show share/copy buttons so host can send a direct link for this room
      try{
        const ov = document.getElementById('mpOverlay');
        const shareBtn = ov && ov.querySelector('#mpShare');
        const copyBtn  = ov && ov.querySelector('#mpCopy');
        if(shareBtn) shareBtn.style.display = 'inline-block';
        if(copyBtn)  copyBtn.style.display  = 'inline-block';
      }catch(e){}

      // auto-dismiss overlay after 2s (still leaves badge in corner)
      setTimeout(()=>{ try{ const ov=document.getElementById('mpOverlay'); if(ov) ov.remove(); }catch(e){} }, 2000);
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
      // sync chosen subgames from server (authoritative)
      try{ if(msg.state && msg.state.chosenGames) syncChosenFromServer(msg.state.chosenGames); }catch(e){}
      showHostStartIfReady();
      return;
    }

    if(msg.type==='rentz_reveal'){
      try{
        const st = window.__state;
        const hands = msg.hands || [];
        if(st && st.players && hands.length){
          for(let realSeat=0; realSeat<4; realSeat++){
            const localSeat = toLocalSeat(realSeat);
            const full = (hands[realSeat]||[]).map(c=>({id:c.id,suit:c.suit,rank:c.rank}));
            st.players[localSeat].hand = full;
          }
          // keep names from room/state; do not overwrite seat 0 with cached name
          syncSeatLabels();
          if(typeof window.renderHands==='function') window.renderHands();
        }
      }catch(e){}
      return;
    }

    if(msg.type==='choose_game'){
      const gameName = msg.gameName;
      // Sync chosenGames from server if present
      try{ if(msg.chosenGames) syncChosenFromServer(msg.chosenGames); }catch(e){}
      // If server says it's not your turn, ensure selector stays closed
      try{ const sel=document.getElementById('selector'); if(sel && (window.__state?.chooserIndex||0)!==0){ sel.classList.add('hidden'); sel.style.display='none'; } }catch(e){}

      // Apply locally without rebroadcast.
      try{
        // Always hide selector once server accepted a choice
        const sel = document.getElementById('selector');
        if(sel){ sel.classList.add('hidden'); sel.style.display='none'; }
      }catch(e){}

      try{
        if(gameName === 'Rentz'){
          // Prefer the official hook (rentz-overlay wraps __choose). If it fails, force-open.
          try{ if(typeof window.__choose === 'function') window.__choose('Rentz'); }catch(e){}
          setTimeout(()=>{
            try{
              const ol = document.getElementById('rentzOverlay');
              const shown = !!(ol && ol.classList.contains('show') && !ol.hidden);
              if(!shown) forceOpenRentzOverlay();
            }catch(e){}
          }, 120);
        } else {
          if(typeof window.__choose === 'function') window.__choose(gameName);
        }
      }catch(e){}

      return;
    }

    if(msg.type==='chosen_update'){
      try{ if(msg.chosenGames) syncChosenFromServer(msg.chosenGames); }catch(e){}
      return;
    }

    if(msg.type==='play_card'){
      // msg.seat is REAL seat index -> convert to LOCAL seat index
      const localSeat = toLocalSeat(msg.seat);
      applyPlayCard(localSeat, msg.card);
      return;
    }
  }

  // Rentz refused flow: redeal same chooser (host only)
  if(!window.__mpRentzRefusedHook){
    window.__mpRentzRefusedHook = true;
    window.addEventListener('rentzRefused', (ev)=>{
      try{
        const r = ev.detail || {};
        const idx = Number.isFinite(r.refuserIndex) ? r.refuserIndex : null;
        const cap = r.capete;
        // show toast
        try{
          let t = document.getElementById('mpToast');
          if(!t){
            t = document.createElement('div');
            t.id = 'mpToast';
            t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10050;background:rgba(0,0,0,.78);color:#fff;padding:10px 12px;border-radius:12px;font:12px system-ui;border:1px solid rgba(255,255,255,.12);max-width:min(520px,92vw);text-align:center;display:none;';
            document.body.appendChild(t);
          }
          const name = (idx!=null && window.__state?.players?.[toLocalSeat(idx)]?.name) ? window.__state.players[toLocalSeat(idx)].name : 'un jucător';
          t.textContent = `Rentz refuzat: ${name} are ${cap||4} capete. Se reîmparte.`;
          t.style.display = 'block';
          clearTimeout(window.__mpToastTimer);
          window.__mpToastTimer = setTimeout(()=>{ try{ t.style.display='none'; }catch(e){} }, 2600);
        }catch(e){}

        // Host triggers redeal on server
        if(you && you.realSeat===0){
          wsSend({type:'redeal_same_chooser'});
        }
      }catch(e){}
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    overlay();
  });
})();
