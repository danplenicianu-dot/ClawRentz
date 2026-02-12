// Mobile helpers (loaded only by index-mobile.html)
// - default chat minimized on small landscape
// - basic viewport hints

(function(){
  function isLandscapePhone(){
    try{
      return (window.matchMedia && matchMedia('(orientation: landscape)').matches) && (window.innerHeight <= 520);
    }catch(e){ return false; }
  }

  function minimizeChat(){
    try{ localStorage.setItem('rentz_chat_min','1'); }catch(e){}
    try{
      var root = document.getElementById('chatPanel');
      if(root) root.classList.add('minimized');
      // disable toggle interactions
      var tgl = document.getElementById('chatToggle');
      if(tgl){ tgl.onclick = function(e){ e && e.preventDefault && e.preventDefault(); }; }
      var ttl = document.getElementById('chatTitle');
      if(ttl){ ttl.onclick = function(e){ e && e.preventDefault && e.preventDefault(); }; }
    }catch(e){}
  }

  function layoutHand(){
    if(!isLandscapePhone()) return;
    var hand = document.getElementById('handBottom');
    if(!hand) return;
    var cards = hand.querySelectorAll('.card');
    if(!cards || !cards.length) return;

    // available width inside hand container
    var avail = hand.getBoundingClientRect().width;
    // measure a card width (post-css)
    var cardW = cards[0].getBoundingClientRect().width || 58;
    var n = Math.min(cards.length, 8);

    // If they already fit with no overlap, remove overlap.
    var noOverlapW = n * cardW;
    var overlap;
    if(noOverlapW <= avail){
      overlap = 0;
    } else {
      // overlap per gap needed so total <= avail:
      // total = n*cardW - (n-1)*overlap <= avail
      overlap = (n*cardW - avail) / Math.max(1,(n-1));
      // Cap overlap so each card still shows at least ~45% width
      var maxOverlap = cardW * 0.55;
      if(overlap > maxOverlap) overlap = maxOverlap;
      if(overlap < 0) overlap = 0;
    }

    hand.style.setProperty('--handOverlap', (Math.round(overlap)) + 'px');
  }

  function boot(){
    if(isLandscapePhone()) {
      minimizeChat();
      layoutHand();
      // Re-run a few times because the hand is re-rendered by the game.
      setInterval(layoutHand, 350);
      window.addEventListener('resize', layoutHand);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
