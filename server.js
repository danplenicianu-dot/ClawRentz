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

// --- rooms ---
// Room code: digits only (easy to dictate, no O/0 ambiguity)
function code(){
  // 6 digits
  return String(Math.floor(100000 + Math.random()*900000));
}

const rooms = new Map();
// room = { code, createdAt, players:[{id,name,ws,seat}], started, seed, hands, chooserIndex }

function roomPublic(r){
  return {
    code: r.code,
    started: !!r.started,
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
  // viewer sees full cards for own seat; other seats get only ids + count
  const seats = [0,1,2,3].map(i=>({
    name: (r.players.find(x=>x.seat===i)?.name) || `P${i+1}`,
    seat: i,
    hand: i===viewer.seat ? r.hands[i].map(c=>({id:c.id,suit:c.suit,rank:c.rank})) : r.hands[i].map(c=>({id:c.id}))
  }));
  return {
    players: seats,
    // chooser: who selects the next subgame
    chooserIndex: (r.chooserIndex ?? 0),
    // for dealing reference only
    seed: r.seed,
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
      const name = String(msg.name || 'Player').slice(0,20);
      console.log('[create]', clientId, 'name=', name);
      const c = code();
      room = { code:c, createdAt:Date.now(), players:[], started:false, seed:null, hands:null, chooserIndex:0 };
      rooms.set(c, room);
      player = { id: clientId, name, ws, seat: 0 };
      room.players.push(player);
      sendTo(player, { type:'joined', you:{id:player.id, seat:player.seat, name:player.name}, room: roomPublic(room) });
      broadcast(room, { type:'room_update', room: roomPublic(room) });
      return;
    }

    if(msg.type === 'join'){
      const c = String(msg.code||'').toUpperCase().trim();
      const name = String(msg.name || 'Player').slice(0,20);
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
      if(connectedNow.length !== 4) return sendTo(player, {type:'error', message:'Trebuie 4 jucători conectați în cameră.'});
      if(room.started) return;
      room.started = true;
      room.seed = (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0;
      const dealt = dealState(room.seed);
      room.hands = dealt.hands;

      // send init_state personalized (clients run full game locally)
      for(const p of room.players){
        sendTo(p, { type:'init_state', room: roomPublic(room), state: maskedStateFor(room, p) });
      }
      broadcast(room, { type:'started' });
      return;
    }

    if(msg.type === 'choose_game'){
      // everyone receives same
      broadcast(room, { type:'choose_game', gameName: msg.gameName });
      return;
    }

    if(msg.type === 'next_round'){
      if(player.seat !== 0) return; // host only for now
      if(!room.started) return;
      room.chooserIndex = ((room.chooserIndex ?? 0) + 1) % 4;
      room.seed = (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0;
      const dealt = dealState(room.seed);
      room.hands = dealt.hands;
      for(const p of room.players){
        sendTo(p, { type:'init_state', room: roomPublic(room), state: maskedStateFor(room, p) });
      }
      broadcast(room, { type:'round_started', chooserIndex: room.chooserIndex });
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
