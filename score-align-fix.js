
(function(){
  if(document.getElementById('score-align-style')) return;
  var css = document.createElement('style');
  css.id = 'score-align-style';
  css.textContent = "#scoreList{list-style:none;margin:0;padding:0}"
    + "#scoreList li{display:grid;grid-template-columns:1.2em minmax(4ch,1fr) max-content;column-gap:.45em;align-items:center;}"
    + "#scoreList li .icon-slot{width:1.2em;height:1.1em;}"
    + "#scoreList li .name-slot{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
    + "#scoreList li .score-slot{font-variant-numeric:tabular-nums;}";
  document.head.appendChild(css);
})();
