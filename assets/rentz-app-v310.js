/*! rentz-app-v320.js — MP-safe renderer (NO local simulation) */
(function(){
  const RV = {'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const orderSuits = '♠♣♥♦';
  const val = r => RV[r]||0;

  let S = null; // authoritative state view pushed by parent

  function post(type, payload){ try{ parent.postMessage({type, ...payload}, '*'); }catch(e){} }
  post('rentz:ready', {});

  window.addEventListener('message', (ev)=>{
    const d = ev.data||{};
    if(d.type==='rentz:init'){
      // init can carry myIndex and initial state snapshot
      if(d.payload && d.payload.state) setState(d.payload.state);
      return;
    }
    if(d.type==='rentz:state'){
      setState(d.state);
      return;
    }
    if(d.type==='rentz:reset') reset();
  }, false);

  function reset(){
    document.querySelectorAll('.cards').forEach(c=>c.textContent='');
    const h = document.getElementById('hand');
    if(h) h.textContent='';
    const t = document.getElementById('turnInfo');
    if(t) t.textContent='';
    S = null;
    const pb = document.getElementById('btnPass');
    if(pb) pb.style.display='none';
  }

  function bySuitOrder(a,b){
    return orderSuits.indexOf(a.suit) - orderSuits.indexOf(b.suit) || (val(a.rank)-val(b.rank));
  }

  function mkCardEl(card){
    const rank = card.rank;
    const suit = card.suit;
    const d=document.createElement('div');
    d.className='card';
    d.dataset.rank = rank; d.dataset.suit = suit;
    d.innerHTML = `<div class="rank">${rank}</div><div class="suit">${suit}</div><div class="rank rev">${rank}</div>`;
    if(suit==='♥' || suit==='♦') d.classList.add('red');
    return d;
  }

  function setState(state){
    S = state || null;
    render();
  }

  function laneCanPlace(lane, card, seedRank){
    if(!lane.open) return card.rank===seedRank;
    const v = val(card.rank);
    const leftOk  = (lane.L!=null && (v===lane.L-1 || v===lane.L+1));
    const rightOk = (lane.R!=null && (v===lane.R-1 || v===lane.R+1));
    return leftOk || rightOk;
  }

  function anyPlayable(){
    if(!S) return false;
    const me = S.me;
    if(me.finished) return false;
    if(S.turn !== me.seat) return false;
    return (me.hand||[]).some(c=> laneCanPlace(S.lanes[c.suit], c, S.seed));
  }

  function renderBoard(){
    if(!S) return;
    const pivot = 8; // center column (10s)
    ['♠','♣','♥','♦'].forEach(s=>{
      const laneWrap = document.querySelector(`.lane[data-suit="${s}"] .cards`);
      if(!laneWrap) return;
      laneWrap.textContent='';
      laneWrap.style.display='grid';
      laneWrap.style.gridTemplateColumns='repeat(13,44px)';
      laneWrap.style.justifyContent='center';
      laneWrap.style.gridAutoFlow='column';
      laneWrap.style.alignItems='center';
      laneWrap.style.gap='6px';

      const L = S.lanes[s];
      const seq = (L.seq||[]).slice();
      const seedV = val(S.seed);
      seq.forEach(c=>{
        const el = mkCardEl({rank:c.rank, suit:s});
        el.classList.add('mini');
        const pos = pivot + (val(c.rank) - seedV);
        el.style.gridColumn = String(pos);
        el.style.gridRow = '1';
        laneWrap.appendChild(el);
      });
      if(!L.open){
        const ghost = mkCardEl({rank:S.seed, suit:s});
        ghost.classList.add('ghost','mini');
        ghost.style.gridColumn = String(pivot);
        ghost.style.gridRow = '1';
        laneWrap.appendChild(ghost);
      }
    });
  }

  function renderTurnInfo(){
    if(!S) return;
    const t = document.getElementById('turnInfo');
    if(!t) return;
    const cur = S.players.find(p=>p.seat===S.turn);
    const nxt = S.players.find(p=>p.seat===S.next);
    const curName = cur ? cur.name : ('P'+(S.turn+1));
    const nxtName = nxt ? nxt.name : ('P'+(S.next+1));
    t.textContent = `Rândul: ${curName} • Urmează: ${nxtName}`;
  }

  function renderHand(){
    if(!S) return;
    const wrap = document.getElementById('hand');
    if(!wrap) return;
    wrap.textContent='';

    const me = S.me;
    const myHand = (me.hand||[]).slice().sort(bySuitOrder);
    const myTurn = (S.turn === me.seat) && !me.finished;

    myHand.forEach(c=>{
      const el = mkCardEl(c);
      el.classList.add('hand');

      const ok = myTurn && laneCanPlace(S.lanes[c.suit], c, S.seed);
      if(ok){
        el.classList.add('playable');
        el.classList.remove('dim');
        el.addEventListener('click', ()=>{
          post('rentz:action', { action:{ kind:'play', cardId:c.id } });
        });
      }else{
        el.classList.remove('playable');
        el.classList.add('dim');
      }
      wrap.appendChild(el);
    });

    // Pass button when it's your turn and nothing is playable
    const needPass = myTurn && !anyPlayable();
    let pb = document.getElementById('btnPass');
    if(needPass){
      if(!pb){
        pb = document.createElement('button');
        pb.id = 'btnPass';
        pb.className = 'btn';
        pb.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10;padding:10px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.88);backdrop-filter: blur(14px);-webkit-backdrop-filter: blur(14px);color:#111;font-weight:900;cursor:pointer;';
        pb.textContent = 'Pas';
        document.body.appendChild(pb);
      }
      pb.style.display='inline-block';
      pb.onclick = ()=> post('rentz:action', { action:{ kind:'pass' } });
    } else {
      if(pb) pb.style.display='none';
    }
  }

  function render(){
    if(!S) return;
    renderBoard();
    renderTurnInfo();
    renderHand();
  }
})();
