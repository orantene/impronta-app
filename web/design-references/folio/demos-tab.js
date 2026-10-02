/* Demos tab for a theme review: the 7 real demo talents planned for this theme
   (Demo Foundation workbook). Adds a tab to the kit's #rv-tabs; the kit's own
   delegated click handler switches views. Data: demos.json next to this file. */
(function(){
  const GUIDE='https://claude.ai/artifact/AgVQpzdavmcAbjBdse41vw';
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const cur=(n,c)=>(c==='USD'?'US$':'$')+Number(n||0).toLocaleString('en-US')+(c==='MXN'?' MXN':'');
    const css=`#v-demos.dt-rose{--rv-line:var(--r-line,rgba(24,24,27,.11));--rv-panel:var(--r-panel,#fff);--rv-ink:var(--r-ink,#0B0B0D);--rv-mid:var(--r-mid,rgba(11,11,13,.68));--rv-brand:var(--r-brand,#0F4F3E);--rv-bsoft:var(--r-brand-soft,rgba(15,79,62,.1));--rv-ok:var(--r-ok,#2E7D5B);--rv-oks:var(--r-ok-soft,rgba(46,125,91,.12));--rv-gap:var(--r-gap,#B0303A);--rv-gaps:var(--r-gap-soft,rgba(176,48,58,.1))}
.dt-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.dt-top input{border:1px solid var(--rv-line);background:var(--rv-panel);color:var(--rv-ink);border-radius:8px;padding:7px 10px;width:200px;max-width:100%;font:13px ui-monospace,Menlo,monospace}
.dt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.dt-card{background:var(--rv-panel);border:1px solid var(--rv-line);border-radius:14px;padding:14px;display:grid;gap:8px;align-content:start;min-width:0}
.dt-card h3{margin:0!important;font:600 16px Geist,Inter,sans-serif}.dt-sub{color:var(--rv-mid);font-size:12.5px}
.dt-chip{display:inline-block;font:600 10.5px Geist,Inter,sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:var(--rv-bsoft);color:var(--rv-brand)}
.dt-chip.live{background:var(--rv-oks);color:var(--rv-ok)}.dt-chip.block{background:var(--rv-gaps);color:var(--rv-gap)}
.dt-kv{display:grid;grid-template-columns:78px 1fr;gap:3px 10px;font-size:12.5px;margin:0}.dt-kv dt{color:var(--rv-mid)}.dt-kv dd{margin:0;min-width:0;overflow-wrap:anywhere;font-family:ui-monospace,Menlo,monospace}
.dt-svc{font-size:12.5px;display:grid;gap:3px;margin:0;padding:0;list-style:none}.dt-svc li{display:flex;gap:8px}.dt-svc li span:last-child{margin-left:auto;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
.dt-card details{font-size:12.5px;color:var(--rv-mid)}.dt-card summary{cursor:pointer;color:var(--rv-ink);font-weight:600}
.dt-cp{border:1px solid var(--rv-line);background:transparent;color:var(--rv-ink);border-radius:6px;font-size:11px;padding:1px 6px;margin-left:6px;cursor:pointer}`;
  function mount(){
    const tabs=document.getElementById('rv-tabs')||document.getElementById('tabs');
    if(!tabs){return false}
    const rv=tabs.id==='rv-tabs', viewCls=rv?'rv-view':'view', docCls=rv?'rv-doc':'doc';
    if(document.getElementById('v-demos'))return true;
    const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    tabs.insertAdjacentHTML('beforeend','<button data-v="demos" aria-pressed="false">Demos (7)</button>');
    const last=[...document.querySelectorAll('.'+viewCls)].pop();
    last.insertAdjacentHTML('afterend','<section class="'+viewCls+(rv?'':' dt-rose')+'" id="v-demos"><div class="'+docCls+'" id="rv-demos"><p>Loading the demo roster…</p></div></section>');
    fetch('demos.json').then(r=>r.json()).then(render).catch(()=>{document.getElementById('rv-demos').innerHTML='<p>The demo roster did not load. Reload the page.</p>'});
    return true;
  }
  function render(J){
    try{localStorage.removeItem('dt-pw')}catch(e){}
    const box=document.getElementById('rv-demos');
    const card=d=>{
      const en=(d.siteLangs||[d.locale])[0]==='en';
      const st=d.live?`<span class="dt-chip live">Live ${esc(d.code)}</span>`:d.taxPending?'<span class="dt-chip block">Needs taxonomy</span>':'<span class="dt-chip">Planned</span>';
      return `<article class="dt-card"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><h3>${esc(d.name)}</h3>${st}</div>
        <div class="dt-sub">${esc(d.profession)} · ${esc(d.city)}, ${esc(d.state)} · ${esc(d.country)} · ${esc(d.age)} · ${esc((d.langs||[]).join(', '))}</div>
        <div class="dt-sub" style="color:var(--rv-ink)">${esc(en?d.tagEn:d.tagEs)}</div>
        <dl class="dt-kv"><dt>Email</dt><dd>${esc(d.email)}<button class="dt-cp" data-cp="${esc(d.email)}">Copy</button></dd><dt>Password</dt><dd style="font-family:inherit">Shared demo password (not shown)</dd><dt>Languages</dt><dd style="font-family:inherit">${esc((d.siteLangs||[]).map((x,i)=>({es:"Spanish",en:"English"})[x]+(i?" (second)":" (main)")).join(" + "))}<br><span class="dt-sub">${esc(d.siteLangsWhy||"")}</span></dd><dt>Site</dt><dd><a href="${esc(d.site)}" target="_blank" rel="noopener">${esc(d.site.replace('https://',''))}</a></dd><dt>Code</dt><dd>${esc(d.id)} · ${esc(d.code)}</dd></dl>
        <ul class="dt-svc">${d.services.map(s=>`<li><span>${esc(en?s.nameEn:s.name)} <span class="dt-sub">(${esc(s.mode)}${s.dur?', '+esc(s.dur)+' min':''})</span></span><span>${s.disp==='from'?'from ':s.disp==='quote'?'quote ':''}${cur(s.price,s.cur)}</span></li>`).join('')}</ul>
        <details><summary>Bio, hours and photo brief</summary><p style="margin-top:6px">${esc(en?d.bioEn:d.bioEs)}</p><p style="margin-top:6px"><b>Hours:</b> ${esc(d.hours)}</p><p style="margin-top:6px"><b>Photos:</b> ${esc(d.photo)}</p></details>
      </article>`};
    const draw=()=>{box.innerHTML=`<div><h2>Demos for ${esc(J.theme.name)} (7)</h2><p style="margin-top:6px">The real demo talents planned for this theme, from the Demo Foundation workbook. The Experience tab still shows the mockup's own fictional talent. Status: <b>${esc(J.theme.statusLabel)}</b>. Full profiles, services and plans: <a href="${GUIDE}" target="_blank" rel="noopener">Demo Foundation Guide</a>.</p></div>
      <p class="dt-sub">All demos sign in with one shared password, held privately by the demo profiles session and never shown here.</p>
      <div class="dt-grid">${J.demos.map(card).join('')}</div>`;
};
    draw();
    box.addEventListener('click',e=>{const b=e.target.closest('[data-cp]');if(!b)return;(navigator.clipboard?navigator.clipboard.writeText(b.dataset.cp):Promise.reject()).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1200)},()=>{b.textContent='Select it'})});
  }
  if(!mount()){const mo=new MutationObserver(()=>{if(mount())mo.disconnect()});mo.observe(document.documentElement,{childList:true,subtree:true})}
})();
