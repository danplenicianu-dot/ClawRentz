
(function(){
  function ready(fn){ if(document.readyState !== 'loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  ready(function(){
    const startOverlay = document.getElementById('startOverlay');
    const selector = document.getElementById('selector');
    const startBtn = document.getElementById('startBtn');
    const nameInput = document.getElementById('nameInput');
    const diffSelect = document.getElementById('diffSelect');
    const hudGameName = document.getElementById('hudGameName');
    const centerDash = document.querySelector('.center-dash');
    const centerCards = document.getElementById('centerCards');

    const seatsEls = {
      0: document.querySelector('.seat-bottom'),
      1: document.querySelector('.seat-right'),
      2: document.querySelector('.seat-top'),
      3: document.querySelector('.seat-left')
    };
    const handsEls = {
      0: document.getElementById('handBottom'),
      1: document.getElementById('handRight'),
      2: document.getElementById('handTop'),
      3: document.getElementById('handLeft')
    };

    const spotsById = {
      0: document.getElementById('spot-bottom'),
      1: document.getElementById('spot-right'),
      2: document.getElementById('spot-top'),
      3: document.getElementById('spot-left')
    };
    function getSpotForPlayer(i){ return spotsById[i]; }

    
    // --- dynamic diamond spots around label ---
    let endTargets = {0:{x:0,y:0},1:{x:0,y:0},2:{x:0,y:0},3:{x:0,y:0}};
    function updateSpotPositions(){
      const centerRect = centerCards.getBoundingClientRect();
      const label = centerDash;
      const labelRect = label.getBoundingClientRect();
      const cx = (labelRect.left + labelRect.width/2) - (centerRect.left + centerRect.width/2);
      const cy = (labelRect.top + labelRect.height/2) - (centerRect.top + centerRect.height/2);
      const base = Math.min(centerRect.width, centerRect.height) * 0.18; // distance radius
      const hx = base * 1.25;
      const vy = base * 1.0;
      endTargets[0] = {x: cx + 0, y: cy + vy};    // bottom (you)
      endTargets[2] = {x: cx + 0, y: cy - vy};    // top
      endTargets[1] = {x: cx + hx, y: cy + 0};    // right
      endTargets[3] = {x: cx - hx, y: cy + 0};    // left
    }
    window.addEventListener('resize', updateSpotPositions);
function toast(msg){
      let t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(()=>t.classList.add('show'), 10);
      setTimeout(()=>{t.classList.remove('show'); setTimeout(()=>t.remove(), 300);}, 1500);
    }

    // Deck helpers
    const SUITS = ['♣','♦','♥','♠'];
    const RED = new Set(['♦','♥']);
    const RANKS_4 = ['A','K','Q','J','10','9','8','7']; // 32 cards (A..7)
    const RANK_VALUE = {'A':14,'K':13,'Q':12,'J':11,'10':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2};

    function makeDeck4(){
      const deck=[]; let id=0;
      for(const s of SUITS){
        for(const r of RANKS_4){
          deck.push({id:id++, suit:s, rank:r});
        }
      }
      return deck;
    }
    function shuffle(a){
      for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
      return a;
    }
    function sortHand(cards){
      const orderSuit = {'♣':0,'♦':1,'♥':2,'♠':3};
      return cards.slice().sort((a,b)=> orderSuit[a.suit]-orderSuit[b.suit] || RANK_VALUE[a.rank]-RANK_VALUE[b.rank]);
    }

    // Game state (demo trick-taking)
    let state = {
      players: [
        {name:'Domnul Dan', isHuman:true, hand:[]},
        {name:'Bot A', isHuman:false, hand:[]},
        {name:'Bot B', isHuman:false, hand:[]},
        {name:'Bot C', isHuman:false, hand:[]},
      ],
      piles: [0,0,0,0],
      trick: [],
      leadIndex: 0,
      turn: 0,
      gameName: null
    };

    // UI helpers
    function setActiveSeat(i){
      Object.values(seatsEls).forEach(el=>el.classList.remove('active'));
      seatsEls[i].classList.add('active');
    }
    function renderHands(){
      for(let i=0;i<4;i++){
        const el = handsEls[i];
        el.innerHTML = '';
        const isHuman = state.players[i].isHuman;
        const hand = isHuman ? sortHand(state.players[i].hand) : state.players[i].hand;

        if(isHuman){
          let prevSuit = null;
          for(const c of hand){
            if(prevSuit!==null && prevSuit!==c.suit){
              const gap = document.createElement('div');
              gap.className = 'suit-gap';
              el.appendChild(gap);
            }
            prevSuit = c.suit;
            const card = createCardFace(c);
            if(!canPlay(i,c)) card.classList.add('disabled');
            card.addEventListener('click', ()=>playCard(i,c));
            el.appendChild(card);
            // Also allow double-click to play (local mode)
            card.addEventListener('dblclick', ()=>playCard(i,c));
          }
        } else {
          // single stack back with count
          const stack1 = document.createElement('div'); stack1.className = 'stack-shadow';
          const stack2 = document.createElement('div'); stack2.className = 'stack-shadow two';
          const back = createCardBack(state.players[i].hand.length); back.classList.add('bot-back');
          back.dataset.player = i;
          el.appendChild(stack1); el.appendChild(stack2); el.appendChild(back);
        }
      }
      // update pile badges
      document.querySelectorAll('.pile-badge').forEach((b,idx)=> b.textContent = state.piles[idx]);
      // center name
      centerDash.textContent = state.gameName || '';
    }

    function createCardFace(c){
      const d = document.createElement('div');
      d.className = 'card' + (RED.has(c.suit)?' red':'');
      d.dataset.id = c.id;
      d.innerHTML = `<div class="rank">${c.rank}</div><div class="suit">${c.suit}</div><div class="rank rev">${c.rank}</div>`;
      return d;
    }
    function createCardBack(count){
      const d = document.createElement('div');
      d.className = 'card back';
      d.innerHTML = `<div class="diamond"><span>${Math.max(0, Math.min(99, count))}</span></div>`;
      return d;
    }

    function deal(){
      const deck = shuffle(makeDeck4());
      for(let i=0;i<4;i++){ state.players[i].hand = []; }
      for(let n=0;n<8;n++){
        for(let p=0;p<4;p++){
          state.players[p].hand.push(deck.pop());
        }
      }
      // who has 7♣ leads (convenție simplă pentru demo)
      let lead=0;
      for(let i=0;i<4;i++){
        if(state.players[i].hand.some(c=>c.rank==='7' && c.suit==='♣')) lead=i;
      }
      state.leadIndex = lead;
      state.turn = lead;
      state.trick = [];
      setActiveSeat(state.turn);
      renderHands();
    }

    // Rules (demo): must follow suit if possible
    function canPlay(playerIndex, card){
      if(playerIndex !== state.turn) return false;
      if(state.trick.length===0) return true;
      const leadSuit = state.trick[0].card.suit;
      const hand = state.players[playerIndex].hand;
      const hasLead = hand.some(c=>c.suit===leadSuit);
      return !hasLead || card.suit===leadSuit;
    }

    function removeFromHand(i, card){
      const h = state.players[i].hand;
      const idx = h.findIndex(x=>x.id===card.id);
      if(idx>=0) h.splice(idx,1);
    }

    function trickWinner(){
      const leadSuit = state.trick[0].card.suit;
      let best = state.trick[0];
      for(const play of state.trick.slice(1)){
        if(play.card.suit===leadSuit && RANK_VALUE[play.card.rank] > RANK_VALUE[best.card.rank]){
          best = play;
        }
      }
      return best; // {player, card}
    }

    function getBotBackEl(i){
      return handsEls[i].querySelector('.card.back.bot-back') || handsEls[i].querySelector('.card.back');
    }

    function flyFromSeatToCenter(playerIndex, card){
      // Create a flying clone from seat position to dynamic diamond end target
      const sourceEl = state.players[playerIndex].isHuman ? handsEls[playerIndex] : (getBotBackEl(playerIndex) || handsEls[playerIndex]);
      const srcRect = sourceEl.getBoundingClientRect();
      const centerRect = centerCards.getBoundingClientRect();
      const startX = (srcRect.left + srcRect.width/2) - (centerRect.left + centerRect.width/2);
      const startY = (srcRect.top + srcRect.height/2) - (centerRect.top + centerRect.height/2);

      // ensure we have fresh end targets
      updateSpotPositions();
      const end = endTargets[playerIndex] || {x:0,y:0};

      const clone = createCardFace(card);
      clone.classList.add('fly');
      clone.dataset.player = String(playerIndex);
      clone.dataset.id = String(card.id);
      clone.style.left = '50%'; clone.style.top = '50%';
      clone.style.transform = `translate(${startX}px, ${startY}px)`;
      centerCards.appendChild(clone);
      clone.animate([
        { transform: `translate(${startX}px, ${startY}px) rotate(${playerIndex*4}deg)`, opacity:.95 },
        { transform: `translate(${end.x}px, ${end.y}px) rotate(0deg)`, opacity:1 }
      ], { duration: 520, easing: 'ease', fill: 'forwards' });
    }px, ${startY}px)`;
      centerCards.appendChild(clone);
      // Animate
      clone.animate([
        { transform: `translate(${startX}px, ${startY}px) rotate(${playerIndex*4}deg)`, opacity:.95 },
        { transform: `translate(${endX}px, ${endY}px) rotate(0deg)`, opacity:1 }
      ], { duration: 520, easing: 'ease', fill: 'forwards' });
    }

    function fanInToWinner(winnerIndex){
      const centerEls = [...centerCards.querySelectorAll('.fly')];
      centerEls.forEach(el=>{
        const target = seatsEls[winnerIndex].getBoundingClientRect();
        const centerRect = centerCards.getBoundingClientRect();
        const dx = (target.left + target.width/2) - (centerRect.left + centerRect.width/2);
        const dy = (target.top + target.height/2) - (centerRect.top + centerRect.height/2);
        el.animate([
          { transform: getComputedStyle(el).transform },
          { transform: `translate(${dx}px, ${dy}px) scale(.85)` }
        ], { duration: 450, easing: 'ease', fill:'forwards' });
      });
      setTimeout(()=> centerCards.innerHTML='', 480);
    }

    function nextTurn(){
      state.turn = (state.turn + 1) % 4;
      setActiveSeat(state.turn);
      renderHands();
      maybeBotPlay();
    }

    function playCard(playerIndex, card){
      if(!canPlay(playerIndex, card)) return;
      removeFromHand(playerIndex, card);
      state.trick.push({player:playerIndex, card});
      flyFromSeatToCenter(playerIndex, card);
      renderHands();

      if(state.trick.length===4){
        // Determine winner after short delay, then highlight and fan-in
        setTimeout(()=>{
          const best = trickWinner();
          // highlight the winning card element in center
          const el = document.querySelector('.center-cards .fly[data-id="'+best.card.id+'"]');
          if(el){ el.classList.add('will-win'); }
          setTimeout(()=>{
            state.piles[best.player] += 1;
            fanInToWinner(best.player);
            state.trick = [];
            state.turn = best.player;
            setActiveSeat(best.player);
            setTimeout(()=>{
              renderHands();
              maybeBotPlay();
            }, 520);
          }, 620);
        }, 380);
      } else {
        nextTurn();
      }
    }

    function botPick(i){
      const leadSuit = state.trick[0]?.card.suit;
      const hand = state.players[i].hand.slice();
      let choice = null;
      if(!leadSuit){
        // lead: play a low card
        hand.sort((a,b)=> RANK_VALUE[a.rank]-RANK_VALUE[b.rank]);
        choice = hand[0];
      } else {
        const follow = hand.filter(c=>c.suit===leadSuit).sort((a,b)=> RANK_VALUE[a.rank]-RANK_VALUE[b.rank]);
        if(follow.length) choice = follow[0];
        else {
          hand.sort((a,b)=> RANK_VALUE[a.rank]-RANK_VALUE[b.rank]);
          choice = hand[0];
        }
      }
      return choice;
    }

    function maybeBotPlay(){
      const p = state.turn;
      if(state.players[p].isHuman) return;
      const card = botPick(p);
      setTimeout(()=> playCard(p, card), 620);
    }

    // Start flow
    function startGame(){
      const name = (nameInput && nameInput.value.trim()) || 'Domnul Dan';
      const seatName = document.querySelector('.seat-bottom .seat-name');
      if (seatName) seatName.textContent = name;
      if (startOverlay){ startOverlay.classList.add('hidden'); startOverlay.style.display='none'; }
      if (selector){ selector.classList.remove('hidden'); selector.style.display='flex'; }
    }
    if (startBtn) startBtn.addEventListener('click', startGame);
    window.__start = ()=> startGame();
    // delegated fallback
    document.body.addEventListener('click', (e)=>{ if(e.target && e.target.id==='startBtn'){ startGame(); } });
    document.addEventListener('keydown', e=>{ if(!startOverlay.classList.contains('hidden') && e.key==='Enter'){ startGame(); }});

    // Choose game
    document.querySelectorAll('.game-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const name = btn.textContent;
        if(hudGameName){ hudGameName.textContent = name; hudGameName.classList.remove('hidden'); }
        if(selector){ selector.classList.add('hidden'); }
        if(centerDash){ centerDash.textContent = name; }
        state.gameName = name; updateSpotPositions();
        deal();
        renderHands();
        if(state.players[state.turn] && !state.players[state.turn].isHuman) maybeBotPlay();
      });
    });

    // Initialize on load
    if(selector) selector.classList.add('hidden');
    if(startOverlay) startOverlay.classList.remove('hidden');
    centerDash.textContent = '';
    setActiveSeat(0);
  });
})();
