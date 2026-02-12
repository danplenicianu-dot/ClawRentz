
/*! rentz-overlay.js v1.0 — parent page bridge */
(function(){
  if(window.__rentz_overlay_loaded__) return; window.__rentz_overlay_loaded__=true;

  const OL = {el:null, frame:null};
  const SEL_CHOOSERS = ['#selector','.selector','.chooser','#chooser','.choose-modal','[data-modal="chooser"]'];
  function q(s){ return document.querySelector(s); }
  function seedRank(n){ return (n<=3) ? 'J' : (n===4 ? '10' : '9'); }
  function minRank(n){ return (n<=3) ? '9' : (n===4 ? '7'  : (n===5 ? '5' : '3')); }
  function norm(t){ return (t||'').toString().replace(/\s+/g,' ').trim().toLowerCase(); }

  function ensure(){
    if(OL.el) return;
    OL.el = q('#rentzOverlay'); OL.frame = q('#rentzFrame');
    if(!OL.el || !OL.frame) return;
    window.addEventListener('message', onMsg, false);
    OL.el.addEventListener('click', (ev)=>{ if(ev.target===OL.el) closeOverlay(); });
  }
  function openOverlay(payload){
    ensure(); if(!OL.el) return;
    try{ const S = window.__state || (window.__state = {}); S.chooserAtStart = (S.chooserIndex|0); }catch(_){}
    OL.el.hidden=false; OL.el.classList.add('show'); OL.el.setAttribute('aria-hidden','false');
    try{ OL.frame.contentWindow.postMessage({type:'rentz:init', payload}, '*'); }catch(e){}
  }
  function closeOverlay(){
    if(!OL.el) return;
    OL.el.classList.remove('show'); OL.el.setAttribute('aria-hidden','true'); OL.el.hidden=true;
    try{ OL.frame.contentWindow.postMessage({type:'rentz:reset'}, '*'); }catch(e){}
  }
  function getPayloadFromState(){
    const S = window.__state || {};
    const players = (S.players||[]).map(p=>({name:p.name||'—', isHuman:!!p.isHuman}));
    const hands = (S.players||[]).map(p=>(p.hand||[]).map(c=>({id:c.id, suit:c.suit, rank:c.rank})));
    const chooserIndex = S.chooserIndex|0;
    const n = players.length || 4;
    return { players, hands, chooserIndex, seed: (n<=3?'J':(n===4?'10':'9')), minRank: (n<=3?'9':(n===4?'7':(n===5?'5':'3'))) };
  }
  function applyScores(scores){
    const S = window.__state || (window.__state={});
    const n = (S.players||[]).length || scores.length;
    S.totals = S.totals || new Array(n).fill(0);
    for(let i=0;i<n;i++) S.totals[i]+= Number(scores[i]||0);
    S.lastScores = scores.slice();
    if(typeof window.updateLeftScorePanel==='function') window.updateLeftScorePanel();
    if(typeof window.showRoundSummary==='function'){ window.showRoundSummary({title:'Rentz', scores}); }
    else {
      const t=document.createElement('div'); t.style.cssText='position:fixed;left:50%;top:14%;transform:translateX(-50%);background:#222a;padding:10px 16px;border-radius:12px;color:#ffd54a;font-weight:700;z-index:10001;border:1px solid #556633';
      t.textContent='Rentz încheiat — scoruri aplicate'; document.body.appendChild(t); setTimeout(()=>t.remove(), 1800);
    }
  }
  function onMsg(ev){
    const d = ev.data||{};
    if(d.type==='rentz:ready'){ try{ OL.frame.contentWindow.postMessage({type:'rentz:init', payload:getPayloadFromState()}, '*'); }catch(e){} }
    
if(d.type==='rentz:done'){
      const r = d.result||{};
      if(r.refused){ closeOverlay(); return; }

      // 1) apply scores (this shows round summary if available in parent)
      applyScores(r.scores||[]);

      // 2) mark Rentz as used for chooser-at-start
      try{
        const S = window.__state || (window.__state = {});
        const n = (S.players && S.players.length) ? S.players.length : 4;
        const chooser = (S.chooserAtStart!=null) ? S.chooserAtStart : (S.chooserIndex|0);
        S.chosenGames = S.chosenGames || Array.from({length:n}, ()=> new Set());
        const set = S.chosenGames[chooser];
        if(set){
          if(typeof set.add==='function') set.add('Rentz');
          else set['Rentz'] = true;
        }
      }catch(e){}

      // 3) close overlay and let parent "Continuă" advance chooser + redeal
      closeOverlay();
      return;
    }

  }

  const __origChoose = window.__choose || function(){};
  window.__choose = function(name){
    const n = norm(name);
    if(n==='rentz' || n==='rent' || n==='r'){ openOverlay(getPayloadFromState()); return; }
    return __origChoose.apply(this, arguments);
  };

  function wireChooser(container){
    if(!container || container.__rentzWired) return;
    container.__rentzWired = true;
    container.addEventListener('click', (ev)=>{
      const el = ev.target.closest('button,[role="button"],.item,.row,li,div');
      if(!el) return;
      if(norm(el.textContent)==='rentz'){ ev.preventDefault(); ev.stopPropagation(); openOverlay(getPayloadFromState()); }
    }, true);
  }
  function ensureChooserHook(){
    let hooked=false;
    ['#selector','.selector','.chooser','#chooser','.choose-modal','[data-modal="chooser"]'].forEach(sel=>{ const el=document.querySelector(sel); if(el){ wireChooser(el); hooked=true; }});
    if(hooked) return;
    const mo = new MutationObserver(()=>{
      ['#selector','.selector','.chooser','#chooser','.choose-modal','[data-modal="chooser"]'].forEach(sel=>{ const el=document.querySelector(sel); if(el){ wireChooser(el); mo.disconnect(); }});
    });
    mo.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),6000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ensureChooserHook); else ensureChooserHook();
})();
