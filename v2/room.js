(function(){
  const qp = new URLSearchParams(location.search);
  const room = (qp.get('room')||'').trim() || '------';
  const name = (qp.get('name')||'').trim() || 'Tu';
  const humans = Number(qp.get('humans')||4);

  const $ = (s) => document.querySelector(s);
  $('#roomPill').textContent = `Room ${room}`;
  $('#youPill').textContent = name;

  // Minimal placeholders (V2 step 2 will connect to WS and fill real seats)
  $('#p0').textContent = name;
  $('#p1').textContent = humans>=2 ? 'b' : '—';
  $('#p2').textContent = humans>=3 ? 'c' : '—';
  $('#p3').textContent = humans>=4 ? 'd' : '—';
  $('#phase').textContent = 'Lobby (v2) — urmează WS';

  // Render a fake hand for layout preview
  const demo = [
    {r:'A', s:'♠'}, {r:'K', s:'♠'}, {r:'Q', s:'♣'}, {r:'J', s:'♦'},
    {r:'10', s:'♥'}, {r:'9', s:'♣'}, {r:'8', s:'♦'}, {r:'7', s:'♠'},
  ];
  const hand = $('#hand');
  hand.innerHTML = '';
  for(const c of demo){
    const el = document.createElement('div');
    const red = (c.s==='♥' || c.s==='♦');
    el.className = 'card ' + (red?'red':'black');
    el.innerHTML = `<div class="r">${c.r}</div><div class="s">${c.s}</div>`;
    hand.appendChild(el);
  }

  $('#btnLeave').onclick = ()=>{ location.href = './?v=light3'; };
  $('#btnCopy').onclick = async ()=>{
    const url = new URL(location.href);
    const txt = `Rentz v2 — camera ${room}: ${url.toString()}`;
    try{ await navigator.clipboard.writeText(url.toString()); }catch(e){}
    try{ if(navigator.share) await navigator.share({title:'Rentz v2', text:txt, url:url.toString()}); }catch(e){}
  };
})();
