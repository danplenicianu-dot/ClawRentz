(function(){
  const $ = (s) => document.querySelector(s);
  const tabCreate = $('#tabCreate');
  const tabJoin = $('#tabJoin');
  const paneCreate = $('#paneCreate');
  const paneJoin = $('#paneJoin');
  const status = $('#status');

  function setStatus(t){ status.textContent = t || ''; }

  function setTab(which){
    const isCreate = which==='create';
    tabCreate.classList.toggle('active', isCreate);
    tabJoin.classList.toggle('active', !isCreate);
    tabCreate.setAttribute('aria-selected', String(isCreate));
    tabJoin.setAttribute('aria-selected', String(!isCreate));
    paneCreate.style.display = isCreate ? '' : 'none';
    paneJoin.style.display = !isCreate ? '' : 'none';
    setStatus('');
  }

  tabCreate.addEventListener('click', ()=>setTab('create'));
  tabJoin.addEventListener('click', ()=>setTab('join'));

  // Prefill
  const qp = new URLSearchParams(location.search);
  const room = (qp.get('room')||'').trim();
  if(room){
    $('#code').value = room;
    setTab('join');
    setStatus('Cod preluat din link.');
  }

  const savedName = (sessionStorage.getItem('v2.name')||'').trim();
  if(savedName) $('#name').value = savedName;

  function getName(){
    const n = ($('#name').value||'').trim();
    const clean = n.replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim().slice(0,20);
    sessionStorage.setItem('v2.name', clean);
    return clean || 'Player';
  }

  // Stub actions for now (V2 step 1 is just landing UI)
  $('#btnCreate').addEventListener('click', ()=>{
    const name = getName();
    const humans = Number($('#humans').value||4);
    setStatus(`(demo) Creează: nume=${name}, oameni=${humans}`);
  });

  $('#btnJoin').addEventListener('click', ()=>{
    const name = getName();
    const code = ($('#code').value||'').trim();
    if(!code) return setStatus('Introdu codul camerei.');
    setStatus(`(demo) Intră: cod=${code}, nume=${name}`);
  });
})();
