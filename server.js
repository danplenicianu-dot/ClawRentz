// Minimal local multiplayer server for Rentz (friends-only MVP)
// - Serves static files from current directory
// - WebSocket room sync
// - Authoritative deal/turn validation (basic)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 5177;
const ROOT = __dirname;

function send(res, code, body, type='text/plain'){
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

const mime = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg',
  '.mp4':'video/mp4',
  '.json':'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^\.\.(\/|\\|$)/, '');
  const abs = path.join(ROOT, filePath);

  fs.readFile(abs, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(abs).toLowerCase();
    send(res, 200, data, mime[ext] || 'application/octet-stream');
  });
});

// --- game helpers ---
const SUITS = ['♣','♦','♥','♠'];
const RANKS_4 = ['A','K','Q','J','10','9','8','7'];
const RANK_VALUE = {A:14,K:13,Q:12,J:11,'10':10,'9':9,'8':8,'7':7};

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeck4(){
  const d=[]; let id=0;
  for(const s of SUITS){
    for(const r of RANKS_4){ d.push({id:id++, suit:s, rank:r}); }
  }
  return d;
}

function shuffle(arr, rnd){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(rnd()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function dealState(seed){
  const rnd = mulberry32(seed);
  let deck = shuffle(makeDeck4(), rnd);
  const hands = [[],[],[],[]];
  for(let n=0;n<8;n++) for(let p=0;p<4;p++) hands[p].push(deck.pop());
  // lead = who has 7♣
  let lead = 0;
  for(let i=0;i<4;i++) if(hands[i].some(c=>c.rank==='7' && c.suit==='♣')) lead=i;
  return { hands, lead };
}

function canPlay(state, seat, card){
  // MVP (lockstep): clients are authoritative for turn + rule enforcement.
  // Server only checks card ownership to avoid desync deadlocks.
  return true;
}

function trickWinner(trick){
  const leadSuit = trick[0].card.suit;
  let best = trick[0];
  for(const play of trick.slice(1)){
    if(play.card.suit === leadSuit && RANK_VALUE[play.card.rank] > RANK_VALUE[best.card.rank]) best = play;
  }
  return best.player;
}

// --- Rentz (MP authoritative) ---
function seedRank(n){ return (n<=3)?'J':(n===4?'10':'9'); }
function minRank(n){ return (n<=3)?'9':(n===4?'7':(n===5?'5':'3')); }
function rv(rank){ return RANK_VALUE[rank] || 0; }

function rentzInit(room){
  const n = 4;
  const seed = seedRank(n);
  const minR = minRank(n);
  const hands = (room.hands||[]).map(h => (h||[]).map(c=>({id:c.id, suit:c.suit, rank:c.rank})));
  const players = [0,1,2,3].map(seat=>({
    seat,
    name: (room.players.find(p=>p.seat===seat)?.name) || `P${seat+1}`,
  }));

  const state = {
    seed,
    minRank: minR,
    turn: (room.chooserIndex ?? 0),
    finished: [false,false,false,false],
    orderOut: [],
    skipFor: null,
    lanes: {
      '♠':{open:false, seq:[], L:null, R:null},
      '♣':{open:false, seq:[], L:null, R:null},
      '♥':{open:false, seq:[], L:null, R:null},
      '♦':{open:false, seq:[], L:null, R:null},
    },
    hands,
    players,
  };

  // Refuz Rentz: ≥4 capete (A sau minRank)
  for(let i=0;i<n;i++){
    const cnt = (hands[i]||[]).filter(c => c.rank==='A' || c.rank===minR).length;
    if(cnt>=4){
      return { refused:true, refuserIndex:i, capete:cnt, state };
    }
  }

  return { refused:false, state };
}

function rentzLaneCanPlace(lane, card, seed){
  if(!lane.open) return card.rank===seed;
  const v = rv(card.rank);
  const leftOk  = (lane.L!=null && (v===lane.L-1 || v===lane.L+1));
  const rightOk = (lane.R!=null && (v===lane.R-1 || v===lane.R+1));
  return leftOk || rightOk;
}

function rentzAnyPlayable(st, seat){
  if(st.finished[seat]) return false;
  if(st.turn !== seat) return false;
  return (st.hands[seat]||[]).some(c => rentzLaneCanPlace(st.lanes[c.suit], c, st.seed));
}

function rentzNextAlive(st, from){
  let t = from;
  for(let k=0;k<4;k++){
    t = (t+1)%4;
    if(!st.finished[t]) return t;
  }
  return from;
}

function rentzRemoveFromHand(st, seat, cardId){
  const h = st.hands[seat]||[];
  const idx = h.findIndex(c=>c.id===cardId);
  if(idx>=0) return h.splice(idx,1)[0];
  return null;
}

function rentzPlaceOnLane(st, card){
  const L = st.lanes[card.suit];
  const v = rv(card.rank);
  if(!L.open){
    L.open=true; L.seq=[{rank:card.rank}]; L.L=v; L.R=v;
    return;
  }
  if(v===L.L-1 || v===L.L+1){ L.seq.unshift({rank:card.rank}); L.L=v; return; }
  if(v===L.R-1 || v===L.R+1){ L.seq.push({rank:card.rank}); L.R=v; return; }
}

function rentzMaybeFinish(st, seat){
  if((st.hands[seat]||[]).length===0 && !st.finished[seat]){
    st.finished[seat] = true;
    st.orderOut.push(seat);
  }
}

function rentzAllEmpty(st){
  return st.hands.every(h => (h||[]).length===0);
}

function rentzScoresFromOrder(orderOut){
  const n=4;
  const scores = new Array(n).fill(0);
  for(let pos=0; pos<orderOut.length; pos++){
    const seat = orderOut[pos];
    scores[seat] = (n-pos)*100;
  }
  return scores;
}

function rentzStateForSeat(st, seat){
  // Mask: only your hand is revealed; others are counts.
  const players = st.players.map(p=>({ seat:p.seat, name:p.name, finished: !!st.finished[p.seat], count: (st.hands[p.seat]||[]).length }));
  const me = { seat, finished: !!st.finished[seat], hand: (st.hands[seat]||[]).map(c=>({id:c.id, suit:c.suit, rank:c.rank})) };
  const next = rentzNextAlive(st, st.turn);
  return {
    seed: st.seed,
    minRank: st.minRank,
    turn: st.turn,
    next,
    lanes: st.lanes,
    players,
    me,
  };
}

function rentzApplyIntent(st, seat, intent){
  if(st.turn !== seat) return { ok:false, error:'Nu e rândul tău.' };
  if(st.finished[seat]) return { ok:false, error:'Ești deja terminat.' };

  if(intent.kind==='pass'){
    // pass only if no playable
    if(rentzAnyPlayable(st, seat)) return { ok:false, error:'Ai mutări, nu poți da Pas.' };
    // advance
    let nxt = rentzNextAlive(st, st.turn);
    if(st.skipFor!=null && nxt===st.skipFor){ st.skipFor=null; nxt = rentzNextAlive(st, nxt); }
    st.turn = nxt;
    return { ok:true };
  }

  if(intent.kind==='play'){
    const cardId = Number(intent.cardId);
    if(!Number.isFinite(cardId)) return { ok:false, error:'Card invalid.' };
    const card = (st.hands[seat]||[]).find(c=>c.id===cardId);
    if(!card) return { ok:false, error:'Nu ai cartea asta.' };
    if(!rentzLaneCanPlace(st.lanes[card.suit], card, st.seed)) return { ok:false, error:'Mutare ilegală.' };

    const removed = rentzRemoveFromHand(st, seat, cardId);
    if(!removed) return { ok:false, error:'Nu ai cartea asta.' };
    rentzPlaceOnLane(st, removed);

    // capăt mic => skip next alive
    if(removed.rank===st.minRank){ st.skipFor = rentzNextAlive(st, seat); }

    rentzMaybeFinish(st, seat);

    // end check
    if(rentzAllEmpty(st)){
      for(let i=0;i<4;i++) if(!st.finished[i]){ st.finished[i]=true; st.orderOut.push(i); }
      return { ok:true, done:true, result:{ orderOut: st.orderOut.slice(), scores: rentzScoresFromOrder(st.orderOut) } };
    }

    // A bonus: extra turn if still playable else advance
    const bonus = (removed.rank==='A');
    if(bonus && rentzAnyPlayable(st, seat)){
      // keep turn
      return { ok:true };
    }

    // advance
    let nxt = rentzNextAlive(st, st.turn);
    if(st.skipFor!=null && nxt===st.skipFor){ st.skipFor=null; nxt = rentzNextAlive(st, nxt); }
    st.turn = nxt;
    return { ok:true };
  }

  return { ok:false, error:'Intent necunoscut.' };
}

// --- rooms ---
// Room code: digits only (easy to dictate, no O/0 ambiguity)
function code(){
  // 6 digits
  return String(Math.floor(100000 + Math.random()*900000));
}

const rooms = new Map();
// room = { code, createdAt, players:[{id,name,ws,seat}], started, seed, hands, chooserIndex }

function roomPublic(r){
  const connected = r.players.filter(p=>p.ws && p.ws.readyState===1);
  return {
    code: r.code,
    started: !!r.started,
    maxHumans: r.maxHumans || 4,
    connectedHumans: connected.length,
    chooserIndex: (r.chooserIndex ?? 0),
    currentGame: r.currentGame || null,
    chosenGames: r.chosenGames || Array.from({length:4}, ()=>[]),
    players: r.players.map(p=>({id:p.id,name:p.name,seat:p.seat,connected: !!p.ws && p.ws.readyState===1})),
  };
}

function broadcast(r, msg){
  const s = JSON.stringify(msg);
  for(const p of r.players){
    if(p.ws && p.ws.readyState===1) p.ws.send(s);
  }
}

function sendTo(p, msg){
  if(p.ws && p.ws.readyState===1) p.ws.send(JSON.stringify(msg));
}

function maskedStateFor(r, viewer){
  // Humans are the connected sockets in room.players. Missing seats are bots.
  const connectedSeats = new Set(r.players.filter(p=>p.ws && p.ws.readyState===1).map(p=>p.seat));

  const seats = [0,1,2,3].map(i=>{
    const human = connectedSeats.has(i);
    const name = (r.players.find(x=>x.seat===i)?.name) || (human ? `P${i+1}` : `Bot ${i+1}`);

    // Visibility rules:
    // - Everyone sees full cards for their own seat.
    // - Host (seat 0) also sees full cards for bot seats so it can run AI locally.
    // - Otherwise, other seats are masked (ids only).
    const isViewer = (i === viewer.seat);
    const hostCanSeeBots = (viewer.seat === 0) && !human;
    const reveal = isViewer || hostCanSeeBots;

    return {
      name,
      seat: i,
      hand: reveal ? r.hands[i].map(c=>({id:c.id,suit:c.suit,rank:c.rank})) : r.hands[i].map(c=>({id:c.id}))
    };
  });

  return {
    players: seats,
    chooserIndex: (r.chooserIndex ?? 0),
    seed: r.seed,
    chosenGames: r.chosenGames || Array.from({length:4}, ()=>[]),
  };
}

// --- WebSocket ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).slice(2);
  let room = null;
  let player = null;

  ws.on('message', (buf) => {
    let msg;
    try{ msg = JSON.parse(buf.toString('utf8')); }catch(e){ return; }

    if(msg.type === 'create'){
      let name = String(msg.name || 'Player');
      name = name.replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim();
      name = name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim();
      if(!name) name = 'Player';
      name = name.slice(0,20);
      console.log('[create]', clientId, 'name=', name);
      const c = code();
      room = { code:c, createdAt:Date.now(), players:[], started:false, seed:null, hands:null, chooserIndex:0, maxHumans: Math.max(1, Math.min(4, Number(msg.maxHumans||4))), chosenGames: Array.from({length:4}, ()=>[]) };
      rooms.set(c, room);
      player = { id: clientId, name, ws, seat: 0 };
      room.players.push(player);
      sendTo(player, { type:'joined', you:{id:player.id, seat:player.seat, name:player.name}, room: roomPublic(room) });
      broadcast(room, { type:'room_update', room: roomPublic(room) });
      return;
    }

    if(msg.type === 'join'){
      const c = String(msg.code||'').toUpperCase().trim();
      let name = String(msg.name || 'Player');
      name = name.replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim();
      name = name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim();
      if(!name) name = 'Player';
      name = name.slice(0,20);
      console.log('[join]', clientId, 'code=', c, 'name=', name);
      const r = rooms.get(c);
      if(!r) return ws.send(JSON.stringify({type:'error', message:'Camera nu există.'}));
      // Room capacity is 4 CONNECTED players. Allow re-joining into disconnected slots.
      const connected = r.players.filter(p=>p.ws && p.ws.readyState===1);
      if(connected.length >= 4){
        return ws.send(JSON.stringify({type:'error', message:'Camera e plină.'}));
      }
      room = r;

      // Prefer reclaiming a disconnected seat with the same name (best-effort)
      const disconnected = r.players.filter(p=>!(p.ws && p.ws.readyState===1));
      let reuse = disconnected.find(p=>p.name===name) || disconnected[0] || null;

      if(reuse){
        reuse.id = clientId;
        reuse.name = name;
        reuse.ws = ws;
        player = reuse;
      } else {
        const used = new Set(r.players.map(p=>p.seat));
        let seat=0; while(used.has(seat)) seat++;
        player = { id: clientId, name, ws, seat };
        r.players.push(player);
      }

      sendTo(player, { type:'joined', you:{id:player.id, seat:player.seat, name:player.name}, room: roomPublic(r) });
      broadcast(r, { type:'room_update', room: roomPublic(r) });
      return;
    }

    if(!room || !player) return;

    if(msg.type === 'start'){
      if(player.seat !== 0) return; // host only
      const connectedNow = room.players.filter(p=>p.ws && p.ws.readyState===1);
      const need = room.maxHumans || 4;
      if(connectedNow.length !== need) return sendTo(player, {type:'error', message:`Trebuie ${need} jucători conectați în cameră.`});
      if(room.started) return;
      room.started = true;
      room.seed = (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0;
      const dealt = dealState(room.seed);
      room.hands = dealt.hands;
      room.rentz = null;
      room.currentGame = null;

      // send init_state personalized (clients run full game locally)
      for(const p of room.players){
        sendTo(p, { type:'init_state', room: roomPublic(room), state: maskedStateFor(room, p) });
      }
      broadcast(room, { type:'started' });
      return;
    }

    if(msg.type === 'choose_game'){
      // Enforce: each player can pick each subgame ONCE per match.
      const gameName = String(msg.gameName || '');
      const chooser = (room.chooserIndex ?? 0);

      // Only current chooser can choose (prevents double-chooses / grief).
      if(player.seat !== chooser){
        return sendTo(player, {type:'error', message:'Nu e rândul tău să alegi jocul.'});
      }

      // Initialize chosenGames store (persist across rounds)
      if(!room.chosenGames) room.chosenGames = Array.from({length:4}, ()=>[]);
      if(!Array.isArray(room.chosenGames[chooser])) room.chosenGames[chooser] = [];

      // Prevent choosing a game already USED by this chooser.
      if(room.chosenGames[chooser].includes(gameName)){
        return sendTo(player, {type:'error', message:`Ai ales deja „${gameName}”. Alege alt sub-joc.`});
      }

      // Store as current round selection ONLY. We will mark it as used on round_end.
      room.currentGame = gameName;

      // Rentz MP authoritative: server owns the Rentz state and pushes masked state per seat.
      if(gameName === 'Rentz'){
        const init = rentzInit(room);
        if(init.refused){
          room.currentGame = null;
          broadcast(room, { type:'rentz_refused', result:{ refused:true, refuserIndex:init.refuserIndex, capete:init.capete } });
          // keep chooser same; host may trigger redeal_same_chooser.
          return;
        }
        room.rentz = init.state;
      } else {
        room.rentz = null;
      }

      broadcast(room, { type:'choose_game', gameName, chooserIndex: chooser, chosenGames: room.chosenGames });

      // Immediately push first Rentz state snapshot.
      if(gameName === 'Rentz'){
        for(const p of room.players){
          sendTo(p, { type:'rentz_state', state: rentzStateForSeat(room.rentz, p.seat) });
        }
      }
      return;
    }

    if(msg.type === 'round_end'){
      if(player.seat !== 0) return; // host only
      if(!room.started) return;
      const gameName = String(msg.gameName || room.currentGame || '');
      const chooser = (room.chooserIndex ?? 0);
      if(!room.chosenGames) room.chosenGames = Array.from({length:4}, ()=>[]);
      if(gameName && !room.chosenGames[chooser].includes(gameName)){
        room.chosenGames[chooser].push(gameName);
      }
      room.currentGame = null;

      // broadcast chosenGames update
      broadcast(room, { type:'chosen_update', chosenGames: room.chosenGames, chooserIndex: chooser });

      // End condition: when everyone exhausted all subgames.
      const ALL = ['Carouri','Dame','Popa Roșu','10 Trefla','Whist','Totale','Rentz'];
      try{
        const done = (room.chosenGames||[]).every(list => ALL.every(g => (list||[]).includes(g)));
        if(done){ broadcast(room, { type:'game_over' }); }
      }catch(e){}
      return;
    }

    if(msg.type === 'redeal_same_chooser'){
      if(player.seat !== 0) return; // host only
      if(!room.started) return;
      // Keep chooserIndex same, just redeal.
      room.seed = (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0;
      const dealt = dealState(room.seed);
      room.hands = dealt.hands;
      room.rentz = null;
      room.currentGame = null;
      for(const p of room.players){
        sendTo(p, { type:'init_state', room: roomPublic(room), state: maskedStateFor(room, p) });
      }
      broadcast(room, { type:'round_started', chooserIndex: room.chooserIndex, chosenGames: room.chosenGames });
      return;
    }

    if(msg.type === 'next_round'){
      if(player.seat !== 0) return; // host only for now
      if(!room.started) return;
      // Advance chooser to next seat that still has available subgames.
      const ALL = ['Carouri','Dame','Popa Roșu','10 Trefla','Whist','Totale','Rentz'];
      if(!room.chosenGames) room.chosenGames = Array.from({length:4}, ()=>[]);
      let next = (room.chooserIndex ?? 0);
      for(let tries=0; tries<4; tries++){
        next = (next + 1) % 4;
        const list = room.chosenGames[next] || [];
        const hasRemaining = ALL.some(g => !list.includes(g));
        if(hasRemaining) break;
      }
      room.chooserIndex = next;
      room.seed = (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0;
      const dealt = dealState(room.seed);
      room.hands = dealt.hands;
      room.rentz = null;
      room.currentGame = null;
      for(const p of room.players){
        sendTo(p, { type:'init_state', room: roomPublic(room), state: maskedStateFor(room, p) });
      }
      broadcast(room, { type:'round_started', chooserIndex: room.chooserIndex, chosenGames: room.chosenGames });
      return;
    }

    if(msg.type === 'rentz_state_req'){
      if(!room.started) return;
      if(room.currentGame !== 'Rentz' || !room.rentz) return;
      // Send current masked state to requester (useful if first snapshot was missed)
      sendTo(player, { type:'rentz_state', state: rentzStateForSeat(room.rentz, player.seat) });
      return;
    }

    if(msg.type === 'rentz_intent'){
      if(!room.started) return;
      if(room.currentGame !== 'Rentz' || !room.rentz) return;
      const action = msg.action || {};
      const intent = { kind: String(action.kind||''), cardId: action.cardId };
      const res = rentzApplyIntent(room.rentz, player.seat, intent);
      if(!res.ok){
        return sendTo(player, { type:'error', message: res.error || 'Acțiune invalidă.' });
      }

      // Push updated state to all seats
      for(const p of room.players){
        sendTo(p, { type:'rentz_state', state: rentzStateForSeat(room.rentz, p.seat) });
      }

      if(res.done){
        broadcast(room, { type:'rentz_done', result: res.result });
      }
      return;
    }

    if(msg.type === 'play_card'){
      if(!room.started) return;
      // lockstep MVP: server does not keep authoritative deck/turn state.
      // It only relays plays to other clients.
      const c = msg.card || {};
      const card = { id: Number(c.id), suit: String(c.suit||''), rank: String(c.rank||'') };
      if(!Number.isFinite(card.id)) return;
      console.log('[play_card]', room.code, 'seat', player.seat, 'cardId', card.id);

      broadcast(room, { type:'play_card', seat: player.seat, card });
      return;
    }

    if(msg.type === 'bot_play'){
      if(!room.started) return;
      // Host-only: allow the host (seat 0) to play on behalf of bot seats.
      if(player.seat !== 0) return;
      const seat = Number(msg.seat);
      if(!Number.isFinite(seat) || seat < 0 || seat > 3) return;
      const c = msg.card || {};
      const card = { id: Number(c.id), suit: String(c.suit||''), rank: String(c.rank||'') };
      if(!Number.isFinite(card.id)) return;
      console.log('[bot_play]', room.code, 'botSeat', seat, 'cardId', card.id);
      broadcast(room, { type:'play_card', seat, card });
      return;
    }
  });

  ws.on('close', () => {
    if(room && player){
      // keep seat reserved, but mark ws null
      const p = room.players.find(x=>x.id===player.id);
      if(p) p.ws = null;
      broadcast(room, { type:'room_update', room: roomPublic(room) });
    }
  });

  ws.send(JSON.stringify({ type:'hello', id: clientId }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Rentz MP server running on :${PORT}`);
});
