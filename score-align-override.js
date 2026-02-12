
// Scoreboard override: stable single-line with medal icons
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function ensureCSS(){
    if(document.getElementById('score-align-override-style')) return;
    var css = document.createElement('style');
    css.id = 'score-align-override-style';
    css.textContent = ""
      + ".score-panel ul{list-style:none;margin:0;padding:0}"
      + ".score-panel li{display:grid;grid-template-columns:1.2em auto max-content;align-items:center;column-gap:.45em;white-space:nowrap}"
      + ".score-panel .icon-slot{width:1.2em;height:1.2em;display:inline-flex;align-items:center;justify-content:center}"
      + ".score-panel .name-slot{overflow:hidden;text-overflow:ellipsis}"
      + ".score-panel .score-slot{font-variant-numeric:tabular-nums}";
    document.head.appendChild(css);
  }

  function rowsFromState(){
    var st = window.__state;
    if(!st || !st.players) return [];
    var rows = st.players.map(function(p, i){
      var tot = (st.totals && typeof st.totals[i]==='number') ? st.totals[i] : 0;
      return {i:i, name:p.name, total:tot};
    });
    rows.sort(function(a,b){ return b.total - a.total; });
    return rows;
  }

  function render(){
    var ul = document.getElementById('scoreList');
    if(!ul) return;
    // Build fresh
    ul.innerHTML = "";
    var rows = rowsFromState();
    rows.forEach(function(r, idx){
      var li = document.createElement('li');
      li.className = 'score-li';

      var icon = (idx===0 ? '👑' : (idx===1 ? '🥈' : (idx===2 ? '🥉' : '🐔')));

      var iconSlot = document.createElement('span'); iconSlot.className='icon-slot'; iconSlot.textContent = icon; li.appendChild(iconSlot);
      var nameSlot = document.createElement('span'); nameSlot.className='name-slot'; nameSlot.textContent = r.name; li.appendChild(nameSlot);
      var scoreSlot = document.createElement('span'); scoreSlot.className='score-slot'; scoreSlot.textContent = r.total; li.appendChild(scoreSlot);

      ul.appendChild(li);
    });
  }

  ready(function(){
    ensureCSS();
    // Override global updater if present
    var tryOverride = function(){
      try{
        if(typeof window.updateLeftScorePanel === 'function'){
          var old = window.updateLeftScorePanel;
          window.updateLeftScorePanel = function(){ return render(); };
        }
      }catch(e){}
    };
    tryOverride();
    render();

    // Keep in sync when totals change
    var lastTotalsJSON = "";
    setInterval(function(){
      try{
        var st = window.__state || {};
        var js = JSON.stringify(st.totals || []);
        if(js !== lastTotalsJSON){ lastTotalsJSON = js; render(); }
      }catch(e){/*noop*/}
    }, 500);
  });
})();
