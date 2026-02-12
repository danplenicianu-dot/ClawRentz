
/*! rentz-overlay-v310-nc.js — robust bridge */
(function(){
  if(window.__rentz_overlay_loaded__) return; window.__rentz_overlay_loaded__=true;
  const OL = {el:null, frame:null};
  function q(s){ return document.querySelector(s); }
  function ensure(){
    if(OL.el) return;
    OL.el = q('#rentzOverlay'); OL.frame = q('#rentzFrame');
    if(!OL.el || !OL.frame) return;
    window.addEventListener('message', onMsg, false);
    OL.el.addEventListener('click', (ev)=>{ if(ev.target===OL.el) closeOverlay(); });
  }
  function openOverlay(payload){
    ensure(); if(!OL.el) return;
    // show
    OL.el.hidden=false; OL.el.classList.add('show'); OL.el.setAttribute('aria-hidden','false');
    try{ OL.frame.contentWindow.postMessage({type:'rentz:init', payload}, '*'); }catch(e){}
  }
  function closeOverlay(){
    if(!OL.el) return;
    OL.el.classList.remove('show'); OL.el.setAttribute('aria-hidden','true'); OL.el.hidden=true;
    try{ OL.frame.contentWindow.postMessage({type:'rentz:reset'}, '*'); }catch(e){}
  }
  function getPayloadFromState(){
    const S = window.__state || window.state || {};
    const players = (S.players||[]).map(p=>({name:p.name||'—', isHuman:!!p.isHuman}));
    const hands = (S.players||[]).map(p=>(p.hand||[]).map(c=>({id:c.id, suit:c.suit, rank:c.rank})));
    const chooserIndex = S.chooserIndex|0;
    const n = players.length || 4;
    const seed = (n<=3?'J':(n===4?'10':'9'));
    const minRank = (n<=3?'9':(n===4?'7':(n===5?'5':'3')));
    return { players, hands, chooserIndex, seed, minRank };
  }
  function applyScoresAndFinalize(r){
    const S = window.__state || (window.__state={});
    const scores = (r && Array.isArray(r.scores)) ? r.scores.slice() : [];
    const n = (S.players||[]).length || scores.length || 4;
    S.gameName = 'Rentz';
    S.stats = S.stats || {};
    S.stats.Rentz = { nPlayers:n, seed:r?.seed||null, minRank:r?.minRank||null, orderOut:r?.orderOut||null, scores:scores.slice() };
    S.stats.rentz = S.stats.Rentz; // alias
    S.lastScores = scores.slice();
    try{
      if(typeof window.finalizeRound==='function'){ window.finalizeRound(); }
      else {
        // minimal fallback: apply totals + toast + reopen chooser
        S.totals = S.totals || new Array(n).fill(0);
        for(let i=0;i<n;i++) S.totals[i]+= Number(scores[i]||0);
        if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel();
        const sel=q('#selector'); if(sel){ sel.classList.remove('hidden'); sel.style.display='flex'; }
        S.gameName='Chooser';
      }
    }catch(e){}
  }
  function onMsg(ev){
    const d = ev.data||{};
    if(d.type==='rentz:ready'){
      try{ OL.frame.contentWindow.postMessage({type:'rentz:init', payload:getPayloadFromState()}, '*'); }catch(e){}
    }
    if(d.type==='rentz:done'){
      const r = d.result||{};
      closeOverlay();
      if(r.refused){
        const S=window.__state||(window.__state={}); S.gameName='Chooser';
        const sel=q('#selector'); if(sel){ sel.classList.remove('hidden'); sel.style.display='flex'; }
        return;
      }
      applyScoresAndFinalize(r);
    }
  }

  // Intercept game selection: hook __choose if exists
  const __origChoose = window.__choose || function(){};
  window.__choose = function(name){
    const n=(name||'').toString().trim().toLowerCase();
    if(n==='rentz' || n==='rent' || n==='r'){
      openOverlay(getPayloadFromState()); return;
    }
    return __origChoose.apply(this, arguments);
  };

  // Intercept clicks on the chooser list
  document.addEventListener('pointerdown', function(e){
    const path = e.composedPath ? e.composedPath() : (function(){ let a=[],n=e.target; while(n){ a.push(n); n=n.parentElement; } return a; })();
    for(let k=0;k<Math.min(10,path.length);k++){
      const el = path[k];
      if(!el || el===document || el===window) continue;
      let t=''; try{ t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(); }catch(_){}
      if(t==='rentz' || (t.includes('rentz') && t.length<20)){
        e.preventDefault(); e.stopPropagation(); try{ e.stopImmediatePropagation(); }catch(_){}
        openOverlay(getPayloadFromState()); return false;
      }
    }
  }, true);

  // Hook __state.gameName setter to neutralize trick-taking path
  (function hookState(){
    const st = window.__state || window.state; if(!st || st.__rentzHooked310) return;
    try{
      st.__rentzHooked310=true;
      const slot='__gn_'+Math.random().toString(36).slice(2); st[slot]=st.gameName;
      Object.defineProperty(st,'gameName',{
        configurable:true, enumerable:true,
        get:function(){ return st[slot]; },
        set:function(v){
          st[slot]=v;
          if((v+'').toLowerCase()==='rentz' && !st.__rentzOverlayActive){
            st.__rentzOverlayActive=true; st[slot]='RentzOverlayActive'; setTimeout(()=>openOverlay(getPayloadFromState()),0);
          }
        }
      });
    }catch(_){}
  })();

  // Kill any legacy rentz modal
  (function killLoop(){
    let t=0, iv=setInterval(function(){
      t++;
      try{ const m=document.getElementById('rentzModal'); if(m) m.remove(); }catch(_){}
      if(t>80) clearInterval(iv);
    },120);
  })();

  // Hotkey fallback Shift+R
  document.addEventListener('keydown', (e)=>{ if((e.key==='R'||e.key==='r') && e.shiftKey){ e.preventDefault(); openOverlay(getPayloadFromState()); }});
})();
