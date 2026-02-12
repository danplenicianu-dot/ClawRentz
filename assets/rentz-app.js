
/*! rentz-app.js v1.0 — iframe mini-app */
(function(){
  const RV = {'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const orderSuits = '♠♣♥♦';
  const val = r => RV[r]||0;
  let P = null;

  function bySuitOrder(a,b){ return orderSuits.indexOf(a.suit) - orderSuits.indexOf(b.suit) || (val(a.rank)-val(b.rank)); }
  function seedRank(n){ return (n<=3)?'J':(n===4?'10':'9'); }
  function minRank(n){ return (n<=3)?'9':(n===4?'7':(n===5?'5':'3')); }
  function post(type, payload){ try{ parent.postMessage({type, ...payload}, '*'); }catch(e){} }

  // signal ready to parent
  post('rentz:ready', {});

  window.addEventListener('message', (ev)=>{
    const d = ev.data||{};
    if(d.type==='rentz:init'){ start(d.payload); }
    if(d.type==='rentz:reset'){ reset(); }
  }, false);

  function reset(){
    document.querySelectorAll('.cards').forEach(c=>c.textContent='');
    document.getElementById('hand').textContent='';
    document.getElementById('turnInfo').textContent='';
    P = null;
  }

  function mkCardEl(txt){ const d=document.createElement('div'); d.className='card'; d.textContent=txt; return d; }

  function renderBoard(){
    if(!P) return;
    ['♠','♣','♥','♦'].forEach(s=>{
      const lane = document.querySelector(`.lane[data-suit="${s}"] .cards`);
      lane.textContent='';
      const L = P.lanes[s];
      const seq = (L.seq||[]).slice().sort((a,b)=> val(a.rank)-val(b.rank));
      seq.forEach(c=> lane.appendChild(mkCardEl(c.rank+s)));
      if(!L.open){
        const ghost = mkCardEl(P.seed+s); ghost.classList.add('ghost'); lane.appendChild(ghost);
      }
    });
  }

  function titleTurn(){
    const i=P.turn; const name=P.players[i].name + (P.players[i].isHuman?' (tu)':'');
    document.getElementById('turnInfo').textContent = `Rândul: ${name}`;
  }

  function canPlay(i, card){
    if(!P) return false;
    if(P.finished[i]) return false;
    if(i!==P.turn) return false;
    const L = P.lanes[card.suit];
    if(!L.open) return card.rank===P.seed;
    const v = val(card.rank);
    const leftOk  = (L.L!==null && (v===L.L-1 || v===L.L+1));
    const rightOk = (L.R!==null && (v===L.R-1 || v===L.R+1));
    return leftOk || rightOk;
  }

  function anyPlayable(i){ return P.hands[i].some(c=>canPlay(i,c)); }

  function removeFromHand(i, card){
    const h=P.hands[i];
    let k = -1;
    for(let t=0;t<h.length;t++){ const x=h[t]; if((x.id!=null && card.id!=null && x.id===card.id) || (x.suit===card.suit && x.rank===card.rank)){ k=t; break; } }
    if(k>=0) h.splice(k,1);
  }

  function placeOnLane(card){
    const L = P.lanes[card.suit]; const v=val(card.rank);
    if(!L.open){ L.open=true; L.seq=[{suit:card.suit,rank:card.rank}]; L.L=v; L.R=v; }
    else if(v===L.L-1 || v===L.L+1){ L.seq.unshift({suit:card.suit,rank:card.rank}); L.L=v; }
    else if(v===L.R-1 || v===L.R+1){ L.seq.push({suit:card.suit,rank:card.rank}); L.R=v; }
  }

  function nextAlive(from){
    const n=P.players.length; let t=from;
    for(let k=0;k<n;k++){ t=(t+1)%n; if(!P.finished[t]) return t; }
    return from;
  }

  function maybeFinish(i){
    if(P.hands[i].length===0 && !P.finished[i]){ P.finished[i]=true; P.orderOut.push(i); }
  }

  function allEmpty(){ return P.hands.every(h=>h.length===0); }

  function endIfDone(){
    if(!allEmpty()) return false;
    const n=P.players.length;
    for(let i=0;i<n;i++){ if(!P.finished[i]){ P.finished[i]=true; P.orderOut.push(i); } }
    const scores=new Array(n).fill(0);
    for(let pos=0;pos<P.orderOut.length;pos++){ const pi=P.orderOut[pos]; scores[pi]=(n-pos)*100; }
    post('rentz:done', {result:{orderOut:P.orderOut, scores}});
    return true;
  }

  function advance(){
    let nxt = nextAlive(P.turn);
    if(P.skipFor!=null && nxt===P.skipFor){ P.skipFor=null; nxt = nextAlive(nxt); }
    P.turn = nxt;
    renderHand(); titleTurn();
    if(!P.players[P.turn].isHuman) setTimeout(botStep, 220);
  }

  function playCard(i, card){
    if(!canPlay(i, card)) return;
    removeFromHand(i, card);
    placeOnLane(card);
    const bonus = (card.rank==='A');
    if(card.rank===P.minRank){ P.skipFor = nextAlive(i); } // capăt mic = skip
    renderBoard();
    maybeFinish(i);
    if(endIfDone()) return;
    if(bonus){
      if(anyPlayable(i)){ renderHand(); titleTurn(); if(!P.players[i].isHuman) setTimeout(botStep, 200); }
      else { advance(); }
    } else {
      advance();
    }
  }

  function playableList(i){ return P.hands[i].filter(c=>canPlay(i,c)); }

  function botPick(i){
    const list = playableList(i);
    if(!list.length) return null;
    const a = list.find(c=>c.rank==='A'); if(a) return a;
    const seeds = list.filter(c=>c.rank===P.seed);
    if(seeds.length){
      let best=seeds[0], bestCount=-1;
      for(const s of seeds){
        const cont = P.hands[i].filter(x=>x.suit===s.suit && Math.abs(val(x.rank)-val(s.rank))===1).length;
        if(cont>bestCount){ bestCount=cont; best=s; }
      }
      return best;
    }
    list.sort((a,b)=> val(a.rank)-val(b.rank));
    const k = Math.random()<0.25 && list.length>1 ? 1 : 0;
    return list[k];
  }

  function botStep(){
    const c = botPick(P.turn);
    if(!c){ advance(); return; }
    playCard(P.turn, c);
  }

  function renderHand(){
    const wrap = document.getElementById('hand'); wrap.textContent='';
    const i=P.turn;
    const mine = P.hands[i].slice().sort(bySuitOrder);
    mine.forEach(c=>{
      const el = mkCardEl(c.rank+c.suit);
      if(P.players[i].isHuman && canPlay(i,c)){
        el.classList.add('playable');
        el.addEventListener('click', ()=> playCard(i,c));
      }
      wrap.appendChild(el);
    });
  }

  function banner(txt){
    const b=document.createElement('div');
    b.className='badge'; b.textContent=txt; document.body.appendChild(b);
    setTimeout(()=>b.remove(), 1500);
  }

  function start(payload){
    const n = payload.players.length;
    P = {
      players: payload.players.map((p,i)=>({name:p.name||('P'+(i+1)), isHuman:!!p.isHuman})),
      hands: payload.hands.map(h => (h||[]).slice().sort(bySuitOrder)),
      seed: payload.seed || seedRank(n),
      minRank: payload.minRank || minRank(n),
      turn: payload.chooserIndex|0,
      finished: new Array(n).fill(false),
      orderOut: [], skipFor: null,
      lanes: {'♠':{open:false,seq:[],L:null,R:null}, '♣':{open:false,seq:[],L:null,R:null}, '♥':{open:false,seq:[],L:null,R:null}, '♦':{open:false,seq:[],L:null,R:null}}
    };
    // Refuz Rentz: ≥4 capete (A sau minRank) la vreun jucător
    for(let i=0;i<n;i++){
      const cnt = P.hands[i].filter(c => c.rank==='A' || c.rank===P.minRank).length;
      if(cnt>=4){
        banner('Refuz Rentz — redeal');
        setTimeout(()=> post('rentz:done', {result:{refused:true}}), 900);
        return;
      }
    }
    renderBoard(); renderHand(); titleTurn();
    if(!P.players[P.turn].isHuman) setTimeout(botStep, 260);
  }

  document.getElementById('btnLeave').addEventListener('click', ()=>{
    post('rentz:done', {result:{refused:true}});
  });
})();
