/*! rentz-overlay.js v2 — MP bridge (authoritative server state) */
(function(){
  if(window.__rentz_overlay_loaded__) return; window.__rentz_overlay_loaded__=true;

  const OL = {el:null, frame:null, open:false};
  function q(s){ return document.querySelector(s); }

  function ensure(){
    if(OL.el) return;
    OL.el = q('#rentzOverlay');
    OL.frame = q('#rentzFrame');
    if(!OL.el || !OL.frame) return;
    window.addEventListener('message', onMsg, false);
    OL.el.addEventListener('click', (ev)=>{ if(ev.target===OL.el) closeOverlay(); });
  }

  function openOverlay(){
    ensure();
    if(!OL.el) return;
    OL.open = true;
    OL.el.hidden=false;
    OL.el.classList.add('show');
    OL.el.setAttribute('aria-hidden','false');
  }

  function closeOverlay(){
    ensure();
    if(!OL.el) return;
    OL.open = false;
    OL.el.classList.remove('show');
    OL.el.setAttribute('aria-hidden','true');
    OL.el.hidden=true;
    try{ OL.frame.contentWindow.postMessage({type:'rentz:reset'}, '*'); }catch(e){}
  }

  function setState(state){
    ensure();
    if(!OL.frame) return;
    // ensure opened when receiving state
    if(!OL.open) openOverlay();
    try{ OL.frame.contentWindow.postMessage({type:'rentz:state', state}, '*'); }catch(e){}
  }

  function onMsg(ev){
    const d = ev.data||{};
    if(d.type==='rentz:ready'){
      // iframe ready — parent will push state via __rentzSetState
      return;
    }
    if(d.type==='rentz:action'){
      try{
        window.dispatchEvent(new CustomEvent('rentzAction', { detail: d.action }));
      }catch(e){}
      return;
    }
  }

  // Public hooks for mp-client
  window.__rentzOpen = openOverlay;
  window.__rentzClose = closeOverlay;
  window.__rentzSetState = setState;
})();
