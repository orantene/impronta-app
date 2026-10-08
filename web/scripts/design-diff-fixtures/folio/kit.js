/* Tulala theme review kit v2.
   Review format (same as the Rosé review): Experience (device 390/360/1440, guided journey,
   palettes + custom accent, Demo / My content, Use this design, simulate), Builder map,
   Images, Reviewer notes. Themes supply content, CSS tokens (--k-*) and renderSite().
   Shared journeys: service detail (options/extras), instant (time → details → confirm or pay),
   request, inquiry/quote brief, chat with an unsent service draft, failure states. Nothing is live. */
(function(){
const CSS = `
:root{--rv-bg:#F2F2EE;--rv-panel:#fff;--rv-sunk:#FAFAF7;--rv-ink:#0B0B0D;--rv-mid:rgba(11,11,13,.68);--rv-soft:rgba(11,11,13,.45);--rv-line:rgba(24,24,27,.11);--rv-brand:#0F4F3E;--rv-bsoft:rgba(15,79,62,.10);--rv-stage:#E4E3DE;
  --rv-ok:#2E7D5B;--rv-oks:rgba(46,125,91,.12);--rv-sim:#5B6BA0;--rv-sims:rgba(91,107,160,.12);--rv-prop:#5F4B8B;--rv-props:rgba(95,75,139,.12);--rv-gap:#B0303A;--rv-gaps:rgba(176,48,58,.10)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--rv-bg:#131517;--rv-panel:#1B1E21;--rv-sunk:#212529;--rv-ink:#E9EDEA;--rv-mid:#B2BAB6;--rv-soft:#848D89;--rv-line:rgba(233,237,234,.13);--rv-brand:#6FC3A6;--rv-bsoft:rgba(111,195,166,.14);--rv-stage:#0E1011;--rv-ok:#6FC3A6;--rv-sim:#9AA8DD;--rv-prop:#B8A3E6;--rv-gap:#EC8A86}}
:root[data-theme="dark"]{color-scheme:dark;--rv-bg:#131517;--rv-panel:#1B1E21;--rv-sunk:#212529;--rv-ink:#E9EDEA;--rv-mid:#B2BAB6;--rv-soft:#848D89;--rv-line:rgba(233,237,234,.13);--rv-brand:#6FC3A6;--rv-bsoft:rgba(111,195,166,.14);--rv-stage:#0E1011;--rv-ok:#6FC3A6;--rv-sim:#9AA8DD;--rv-prop:#B8A3E6;--rv-gap:#EC8A86}
*{box-sizing:border-box}
body{margin:0;background:var(--rv-bg);color:var(--rv-ink);font:14px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid #3B82F6;outline-offset:2px}
.rv-top{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:var(--rv-panel);border-bottom:1px solid var(--rv-line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.rv-top h1{margin:0;font:600 15px Geist,Inter,sans-serif;letter-spacing:-.01em}
.rv-top .sub{font-size:12px;color:var(--rv-soft);max-width:70ch}
.rv-top a{color:var(--rv-brand);font-weight:600;font-size:12.5px;text-decoration:none;white-space:nowrap}
.rv-tabs{display:flex;gap:2px;flex-wrap:wrap;margin-left:auto}
.rv-tabs button{border:0;background:none;padding:6px 11px;border-radius:8px;font-size:13px;color:var(--rv-mid)}
.rv-tabs button[aria-pressed="true"]{background:var(--rv-bsoft);color:var(--rv-brand);font-weight:600}
.rv-view{display:none}.rv-view.on{display:block}
.rv-exp{display:grid;grid-template-columns:300px 1fr;min-height:calc(100vh - 56px)}
@media (max-width:980px){.rv-exp{grid-template-columns:1fr}}
.rv-rail{background:var(--rv-panel);border-right:1px solid var(--rv-line);padding:16px;display:flex;flex-direction:column;gap:18px}
@media (min-width:981px){.rv-rail{position:sticky;top:56px;height:calc(100vh - 56px);overflow:auto}}
.rv-rg h3{margin:0 0 8px;font:600 10.5px Geist,Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--rv-soft)}
.rv-seg{display:inline-flex;border:1px solid var(--rv-line);border-radius:9px;overflow:hidden;background:var(--rv-sunk);flex-wrap:wrap}
.rv-seg button{border:0;background:none;padding:6px 10px;font-size:12.5px;color:var(--rv-mid);white-space:nowrap}
.rv-seg button[aria-pressed="true"]{background:var(--rv-ink);color:var(--rv-panel);font-weight:600}
.rv-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rv-steps button{display:grid;grid-template-columns:22px 1fr;gap:8px;width:100%;text-align:left;border:0;background:none;padding:6px 8px;border-radius:8px;font-size:12.5px;color:var(--rv-mid);line-height:1.35}
.rv-steps button:hover{background:var(--rv-sunk);color:var(--rv-ink)}
.rv-steps button[aria-current="true"]{background:var(--rv-bsoft);color:var(--rv-brand);font-weight:600}
.rv-steps i{font-style:normal;font:600 11px Geist,Inter,sans-serif;color:var(--rv-soft);padding-top:1px}
.rv-sw{display:flex;gap:8px;flex-wrap:wrap}
.rv-swb{display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;padding:0;font-size:11px;color:var(--rv-mid);max-width:62px;text-align:center;line-height:1.2}
.rv-swb span{width:34px;height:34px;border-radius:50%;border:2px solid var(--rv-panel);box-shadow:0 0 0 1px var(--rv-line)}
.rv-swb[aria-pressed="true"] span{box-shadow:0 0 0 2px var(--rv-ink)}
.rv-swb[aria-pressed="true"]{color:var(--rv-ink);font-weight:600}
.rv-btn{border:1px solid var(--rv-line);background:var(--rv-panel);border-radius:9px;padding:7px 12px;font:600 12.5px Geist,Inter,sans-serif}
.rv-btn.pri{background:var(--rv-brand);border-color:var(--rv-brand);color:#fff}
.rv-chk{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--rv-mid)}
.rv-hint{font-size:11.5px;color:var(--rv-soft);line-height:1.45;margin:6px 0 0}
.rv-stage{background:var(--rv-stage);display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 16px 40px;min-width:0;overflow:hidden}
.rv-note{max-width:760px;width:100%;background:var(--rv-panel);border:1px solid var(--rv-line);border-radius:12px;padding:12px 14px;font-size:12.5px;color:var(--rv-mid);display:flex;gap:10px;align-items:flex-start}
.rv-note b{color:var(--rv-ink)}
.rv-tag{display:inline-flex;font:600 10px Geist,Inter,sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:5px;white-space:nowrap}
.rv-tag.ex{background:var(--rv-oks);color:var(--rv-ok)}.rv-tag.sim{background:var(--rv-sims);color:var(--rv-sim)}.rv-tag.prop{background:var(--rv-props);color:var(--rv-prop)}.rv-tag.gap{background:var(--rv-gaps);color:var(--rv-gap)}
.rv-hold{position:relative}
.rv-dev{position:relative;overflow:hidden;background:#000;transform-origin:top left}
.rv-dev.phone{border-radius:46px;border:10px solid #121214;box-shadow:0 30px 60px -30px rgba(0,0,0,.55)}
.rv-dev.desk{border-radius:12px;border:1px solid rgba(0,0,0,.2);box-shadow:0 30px 60px -34px rgba(0,0,0,.5)}
.rv-bar{height:34px;background:#EDEDEB;display:flex;align-items:center;gap:7px;padding:0 14px;border-bottom:1px solid #d9d9d6}
.rv-bar i{width:11px;height:11px;border-radius:50%;background:#d1d1ce}
.rv-bar span{margin-left:14px;flex:1;max-width:520px;background:#fff;border-radius:7px;font:12px Inter,sans-serif;color:#666;padding:3px 10px}
.rv-doc{max-width:1120px;margin:0 auto;padding:26px 16px 70px;display:grid;gap:18px}
.rv-doc h2{margin:0;font:600 23px Geist,Inter,sans-serif;letter-spacing:-.02em}
.rv-doc h3{margin:8px 0 0;font:600 15px Geist,Inter,sans-serif}
.rv-doc p{margin:0;color:var(--rv-mid);max-width:80ch}
.rv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.rv-card{background:var(--rv-panel);border:1px solid var(--rv-line);border-radius:12px;padding:14px 16px;font-size:13px;color:var(--rv-mid)}
.rv-card b{color:var(--rv-ink)}
.rv-card h4{margin:0 0 6px;font:600 13.5px Geist,Inter,sans-serif;color:var(--rv-ink)}
.rv-card ul{margin:0;padding-left:17px}.rv-card li{margin:3px 0}
.rv-tw{overflow-x:auto;background:var(--rv-panel);border:1px solid var(--rv-line);border-radius:12px}
.rv-tw table{border-collapse:collapse;width:100%;min-width:820px;font-size:12.8px}
.rv-tw th,.rv-tw td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--rv-line)}
.rv-tw th{font:600 10.5px Geist,Inter,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--rv-soft);background:var(--rv-sunk)}
.rv-tw tr:last-child td{border-bottom:0}
.rv-tw code{font:11.5px 'IBM Plex Mono',ui-monospace,monospace;background:var(--rv-sunk);border-radius:4px;padding:1px 4px}
.rv-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.rv-imgs figure{margin:0;background:var(--rv-panel);border:1px solid var(--rv-line);border-radius:10px;overflow:hidden}
.rv-imgs img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
.rv-imgs figcaption{padding:7px 9px;font-size:11.5px;color:var(--rv-mid);line-height:1.35}
.rv-imgs figcaption b{display:block;color:var(--rv-ink);font-size:12px}
.rv-mbg{position:fixed;inset:0;background:rgba(10,12,12,.45);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
.rv-modal{background:var(--rv-panel);color:var(--rv-ink);border-radius:16px;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 30px 80px -30px rgba(0,0,0,.6)}
.rv-modal .mh{padding:18px 20px 6px}.rv-modal h3{margin:0;font:600 18px Geist,Inter,sans-serif}.rv-modal .mh p{margin:4px 0 0;font-size:13px;color:var(--rv-mid)}
.rv-modal .mb{padding:10px 20px 6px;display:grid;gap:12px}
.rv-modal .mf{padding:14px 20px 18px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--rv-line);margin-top:6px}
.rv-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:520px){.rv-two{grid-template-columns:1fr}}
.rv-two div{background:var(--rv-sunk);border-radius:12px;padding:11px 13px;font-size:12.5px;color:var(--rv-mid)}
.rv-two b{display:block;color:var(--rv-ink);font:600 12.5px Geist,Inter,sans-serif;margin-bottom:4px}.rv-two ul{margin:0;padding-left:16px}
.rv-imp{border:1px solid var(--rv-line);border-radius:12px;overflow:hidden}
.rv-imp summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;gap:10px;align-items:center;font:600 13.5px Geist,Inter,sans-serif}
.rv-imp summary::-webkit-details-marker{display:none}.rv-imp summary span{flex:1}.rv-imp summary small{font:400 12px Inter,sans-serif;color:var(--rv-soft)}
.rv-imp summary::after{content:'›';font-size:18px;color:var(--rv-soft);transform:rotate(90deg)}.rv-imp[open] summary::after{transform:rotate(-90deg)}
.rv-imp .ib{padding:0 14px 14px;display:grid;gap:10px;font-size:12.5px;color:var(--rv-mid)}
.rv-imp label{display:flex;gap:9px;align-items:flex-start}
.rv-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;background:var(--rv-ink);color:var(--rv-panel);padding:10px 16px;border-radius:10px;font-size:13px}

/* ── site + shared overlays, styled by theme tokens ── */
.site{container-type:inline-size;container-name:site;position:absolute;inset:0;overflow:hidden;background:var(--k-bg);color:var(--k-ink);font-family:var(--k-fb)}
.k-vp{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;scroll-behavior:smooth}
.k-vp::-webkit-scrollbar{display:none}
.k-status{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font:600 13px -apple-system,system-ui,sans-serif;background:var(--k-bg);color:var(--k-ink);position:sticky;top:0;z-index:8}
@container site (min-width:900px){.k-status{display:none}}
.k-demo{font:700 9.5px var(--k-fb);letter-spacing:.12em;text-transform:uppercase;border:1px solid var(--k-line);color:var(--k-mute);padding:3px 7px;border-radius:99px;white-space:nowrap}
.k-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border:0;border-radius:var(--k-btnrad);background:var(--k-accent);color:var(--k-on);font:600 15px var(--k-fb);white-space:nowrap}
.k-btn.ghost{background:transparent;color:var(--k-ink);border:1.5px solid color-mix(in srgb,var(--k-ink) 25%,transparent)}
.k-btn.soft{background:var(--k-tint);color:var(--k-at)}
.k-btn[disabled]{opacity:.45;pointer-events:none}
.k-dock{position:absolute;left:12px;right:12px;bottom:14px;z-index:20;display:flex;gap:8px;align-items:center;padding:6px;border-radius:var(--k-dockrad);background:color-mix(in srgb,var(--k-surface) 84%,transparent);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);border:1px solid var(--k-line);box-shadow:0 18px 40px -18px rgba(0,0,0,.45)}
.k-dock .k-btn{flex:1;min-height:46px}
.k-dock .sum{flex:1;min-width:0;border:0;background:none;text-align:left;padding:0 4px;color:var(--k-ink)}
.k-dock .sum b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.k-dock .sum small{font-size:12px;color:var(--k-mute)}
.k-dock .sum+.k-btn{flex:0 0 auto}
.k-fab{position:absolute;right:16px;bottom:18px;z-index:20;width:54px;height:54px;border-radius:50%;border:0;background:var(--k-accent);color:var(--k-on);display:grid;place-items:center;box-shadow:0 14px 30px -12px rgba(0,0,0,.45)}
.k-fab i{position:absolute;top:10px;right:11px;width:9px;height:9px;border-radius:50%;background:#E5484D;box-shadow:0 0 0 2px var(--k-accent)}
.k-chatb{width:46px;height:46px;flex:0 0 auto;border:0;border-radius:calc(var(--k-dockrad) - 4px);background:var(--k-tint);color:var(--k-at);display:grid;place-items:center;position:relative}
.k-chatb i{position:absolute;top:8px;right:8px;width:9px;height:9px;border-radius:50%;background:var(--k-accent);box-shadow:0 0 0 2px var(--k-surface)}
@container site (min-width:900px){.k-dock{left:50%;right:auto;transform:translateX(-50%);width:540px;bottom:22px}.k-fab{right:28px;bottom:28px}}
.k-scrim{position:absolute;inset:0;z-index:30;background:rgba(10,10,12,.4);animation:kf .2s}
@keyframes kf{from{opacity:0}}@keyframes ku{from{transform:translateY(36px);opacity:.4}}@keyframes kr{from{transform:translateX(36px);opacity:.4}}
.k-sheet{position:absolute;left:0;right:0;bottom:0;top:62px;z-index:31;background:var(--k-surface);color:var(--k-ink);border-radius:var(--k-rad) var(--k-rad) 0 0;display:flex;flex-direction:column;overflow:hidden;animation:ku .26s cubic-bezier(.2,.8,.2,1)}
@container site (min-width:900px){.k-sheet{left:auto;top:0;width:470px;border-radius:0;animation:kr .26s cubic-bezier(.2,.8,.2,1)}.k-grab{display:none}}
.k-sheet.s-page{top:0;border-radius:0;animation:kr .26s cubic-bezier(.2,.8,.2,1)}
.k-sheet.s-page .k-grab{display:none}.k-sheet.s-page .k-sht{padding-top:50px;border-bottom:1px solid var(--k-line);margin-bottom:12px}
.k-sheet.s-panel{top:0;left:auto;width:92%;border-radius:0;animation:kr .26s cubic-bezier(.2,.8,.2,1)}
.k-sheet.s-panel .k-grab{display:none}.k-sheet.s-panel .k-sht{padding-top:50px}
.k-sheet.s-modal{top:auto;bottom:10px;left:10px;right:10px;max-height:calc(100% - 70px);border-radius:var(--k-rad);animation:ku .22s}
.k-sheet.s-modal .k-grab{display:none}
.k-wiz{display:flex;gap:4px;padding:0 18px 10px}.k-wiz i{flex:1;height:3px;border-radius:9px;background:var(--k-line)}.k-wiz i.on{background:var(--k-accent)}
@container site (min-width:900px){.k-sheet.s-page{left:0;width:auto}.k-sheet.s-page .k-body,.k-sheet.s-page .k-foot{width:100%;max-width:620px;margin:0 auto}.k-sheet.s-page .k-sht{padding-top:16px}
 .k-sheet.s-panel{width:470px}.k-sheet.s-panel .k-sht{padding-top:18px}
 .k-sheet.s-modal{top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);width:560px;max-height:760px;animation:kf .2s}}
.k-grab{display:flex;justify-content:center;padding:8px 0 0}.k-grab i{width:38px;height:4px;border-radius:9px;background:var(--k-line)}
.k-sht{display:flex;align-items:center;gap:8px;padding:8px 14px 10px}
.k-sht h3{margin:0;flex:1;text-align:center;font:600 15px var(--k-fb)}
.k-ib{width:40px;height:40px;border-radius:50%;border:0;background:var(--k-bg);color:var(--k-ink);display:grid;place-items:center;flex:0 0 auto}
.k-body{flex:1;min-height:0;overflow-y:auto;padding:0 18px 20px;scrollbar-width:none}.k-body::-webkit-scrollbar{display:none}
.k-foot{padding:12px 16px 22px;border-top:1px solid var(--k-line);display:flex;gap:8px}
.k-foot .k-btn{flex:1}
.k-hero{border-radius:calc(var(--k-rad) * .6);overflow:hidden;aspect-ratio:16/10;background:var(--k-tint);margin-bottom:14px}
.k-hero img{width:100%;height:100%;object-fit:cover;display:block}
.k-ey{font:600 11px var(--k-fb);letter-spacing:.14em;text-transform:uppercase;color:var(--k-at)}
.k-t{margin:4px 0 0;font-family:var(--k-fd);font-size:26px;line-height:1.1;font-weight:var(--k-fdw,600);letter-spacing:var(--k-fdls,-.01em);text-wrap:balance}
.k-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin:8px 0 10px;font-size:13px;color:var(--k-mute)}
.k-meta b{color:var(--k-ink)}
.k-d{margin:0 0 14px;color:var(--k-mute);font-size:14.5px;line-height:1.5}
.k-list{display:grid;gap:8px;margin:0;padding:0;list-style:none;font-size:13.5px}
.k-list li{display:flex;gap:9px;align-items:flex-start}
.k-list li::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--k-accent);margin-top:7px;flex:0 0 auto}
.k-note{font-size:12.5px;color:var(--k-mute);background:var(--k-bg);border-radius:12px;padding:10px 12px;margin-top:12px;line-height:1.45}
.k-note.warn{background:color-mix(in srgb,#E9A23B 16%,var(--k-surface));color:var(--k-ink)}
.k-fl{font:600 11px var(--k-fb);letter-spacing:.14em;text-transform:uppercase;color:var(--k-mute);margin:18px 0 8px}
.k-opts{display:grid;gap:8px}
.k-opt{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;border:1.5px solid var(--k-line);border-radius:14px;padding:12px 14px;background:var(--k-surface);text-align:left;color:var(--k-ink);width:100%}
.k-opt[aria-checked="true"]{border-color:var(--k-accent);background:color-mix(in srgb,var(--k-tint) 60%,var(--k-surface))}
.k-opt .rd{width:20px;height:20px;border-radius:50%;border:2px solid var(--k-line)}
.k-opt[aria-checked="true"] .rd{border-color:var(--k-accent);background:radial-gradient(var(--k-accent) 45%,transparent 50%)}
.k-opt .bx{width:20px;height:20px;border-radius:6px;border:2px solid var(--k-line);display:grid;place-items:center;color:var(--k-on);font-size:12px}
.k-opt[aria-checked="true"] .bx{border-color:var(--k-accent);background:var(--k-accent)}
.k-opt b{display:block;font-weight:600;font-size:14.5px}.k-opt small{color:var(--k-mute);font-size:12.5px}
.k-opt .d{font-size:13px;font-weight:600;white-space:nowrap}
.k-fld{display:grid;gap:6px;margin-bottom:12px}
.k-fld label{font-size:12.5px;font-weight:600}
.k-fld input,.k-fld textarea,.k-fld select{width:100%;border:1.5px solid var(--k-line);border-radius:12px;padding:12px 13px;font:15px var(--k-fb);background:var(--k-surface);color:var(--k-ink)}
.k-fld input:focus,.k-fld textarea:focus,.k-fld select:focus{outline:none;border-color:var(--k-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--k-accent) 16%,transparent)}
.k-fld small{font-size:12px;color:var(--k-mute)}
.k-up{display:flex;gap:10px;align-items:center;border:1.5px dashed var(--k-line);border-radius:12px;padding:12px;background:var(--k-bg);color:var(--k-ink);width:100%;text-align:left}
.k-chips{display:flex;flex-wrap:wrap;gap:6px}
.k-chip{border:1.5px solid var(--k-line);background:var(--k-surface);color:var(--k-ink);border-radius:99px;padding:8px 12px;font:500 13px var(--k-fb);min-height:38px}
.k-chip[aria-pressed="true"]{border-color:var(--k-accent);background:var(--k-tint);color:var(--k-at);font-weight:600}
.k-days{display:flex;gap:8px;overflow-x:auto;margin:0 -18px;padding:2px 18px 4px;scrollbar-width:none}.k-days::-webkit-scrollbar{display:none}
.k-day{flex:0 0 60px;height:66px;border-radius:14px;border:1.5px solid var(--k-line);background:var(--k-surface);color:var(--k-ink);display:flex;flex-direction:column;align-items:center;justify-content:center}
.k-day small{font-size:11px;color:var(--k-mute)}.k-day b{font-size:18px}
.k-day[aria-pressed="true"]{background:var(--k-ink);color:var(--k-bg);border-color:var(--k-ink)}.k-day[aria-pressed="true"] small{color:inherit;opacity:.7}
.k-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.k-slot{height:46px;border-radius:12px;border:1.5px solid var(--k-line);background:var(--k-surface);color:var(--k-ink);font:600 14px var(--k-fb);font-variant-numeric:tabular-nums}
.k-slot[aria-pressed="true"]{background:var(--k-accent);border-color:var(--k-accent);color:var(--k-on)}
.k-slot.gone{text-decoration:line-through;color:var(--k-mute);background:var(--k-bg);border-style:dashed}
.k-res{text-align:center;padding:18px 4px 4px}
.k-res .ic{width:62px;height:62px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;background:var(--k-tint);color:var(--k-at)}
.k-res h2{margin:0;font-family:var(--k-fd);font-weight:var(--k-fdw,600);font-size:27px;line-height:1.1;letter-spacing:var(--k-fdls,-.01em)}
.k-res p{color:var(--k-mute);margin:8px auto 0;max-width:32ch;font-size:14.5px}
.k-st{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.k-pill{font:600 12px var(--k-fb);padding:5px 10px;border-radius:99px}
.k-pill.ok{background:color-mix(in srgb,#2FA36B 16%,var(--k-surface));color:#1E7A4F}
.k-pill.wait{background:color-mix(in srgb,#E9A23B 20%,var(--k-surface));color:#8A5A12}
.k-pill.idle{background:var(--k-bg);color:var(--k-mute)}
.k-recap{margin-top:16px;border:1px solid var(--k-line);border-radius:14px;padding:2px 14px;text-align:left}
.k-recap div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--k-line);font-size:13.5px}
.k-recap div:last-child{border-bottom:0}.k-recap span{color:var(--k-mute)}.k-recap b{text-align:right;font-weight:600}
.k-spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--k-tint);border-top-color:var(--k-accent);animation:ksp 1s linear infinite;margin:0 auto}
@keyframes ksp{to{transform:rotate(360deg)}}
.k-chat{position:absolute;inset:0;z-index:50;background:var(--k-surface);color:var(--k-ink);display:flex;flex-direction:column;animation:ku .25s cubic-bezier(.2,.8,.2,1)}
@container site (min-width:900px){.k-chat{inset:auto 24px 24px auto;width:390px;height:620px;border-radius:20px;border:1px solid var(--k-line);box-shadow:0 30px 70px -30px rgba(0,0,0,.5);overflow:hidden}.k-chat.shift{right:494px}.k-cht{padding-top:14px!important}.k-comp{padding-bottom:14px!important}}
.k-cht{padding:50px 14px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--k-line)}
.k-cht img{width:38px;height:38px;border-radius:50%;object-fit:cover}
.k-cht .w{flex:1;min-width:0}.k-cht b{display:block;font-size:15px}.k-cht small{font-size:12px;color:var(--k-mute)}
.k-back{display:flex;align-items:center;gap:8px;margin:8px 12px 0;padding:10px 12px;border-radius:12px;background:var(--k-tint);color:var(--k-at);border:0;font:600 13px var(--k-fb);text-align:left}
.k-back span{flex:1}
.k-msgs{flex:1;min-height:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scrollbar-width:none}.k-msgs::-webkit-scrollbar{display:none}
.k-sep{text-align:center;font-size:11.5px;color:var(--k-mute)}
.k-bub{max-width:82%;padding:10px 13px;border-radius:16px;font-size:14.5px;line-height:1.4}
.k-bub.t{background:var(--k-bg);align-self:flex-start;border-bottom-left-radius:5px}
.k-bub.m{background:var(--k-accent);color:var(--k-on);align-self:flex-end;border-bottom-right-radius:5px}
.k-bub small{display:block;font-size:11px;opacity:.65;margin-top:4px}
.k-ctx{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;background:var(--k-surface);color:var(--k-ink);border:1px solid var(--k-line);border-radius:12px;padding:8px;text-align:left}
.k-bub.m .k-ctx{margin-bottom:8px}
.k-ctx img{width:44px;height:44px;border-radius:8px;object-fit:cover}
.k-ctx b{font-size:13px;line-height:1.25;display:block}.k-ctx small{font-size:11.5px;color:var(--k-mute);opacity:1;margin:0}
.k-x{width:28px;height:28px;border-radius:50%;border:0;background:var(--k-ink);color:var(--k-bg);display:grid;place-items:center}
.k-typing{align-self:flex-start;background:var(--k-bg);border-radius:16px;padding:12px 14px;display:flex;gap:4px}
.k-typing i{width:7px;height:7px;border-radius:50%;background:var(--k-mute);opacity:.5;animation:kbl 1s infinite}
.k-typing i:nth-child(2){animation-delay:.15s}.k-typing i:nth-child(3){animation-delay:.3s}
@keyframes kbl{50%{opacity:1}}
.k-sugg{display:flex;gap:6px;overflow-x:auto;padding:4px 12px 8px;scrollbar-width:none}.k-sugg::-webkit-scrollbar{display:none}
.k-sugg button{flex:0 0 auto;border:1px solid var(--k-line);background:var(--k-surface);color:var(--k-ink);border-radius:99px;padding:8px 12px;font:500 13px var(--k-fb)}
.k-comp{border-top:1px solid var(--k-line);padding:10px 12px 26px;display:grid;gap:8px}
.k-comp .r{display:flex;gap:8px;align-items:flex-end}
.k-comp textarea{flex:1;border:1.5px solid var(--k-line);border-radius:20px;padding:11px 14px;font:15px var(--k-fb);resize:none;height:46px;background:var(--k-bg);color:var(--k-ink)}
.k-comp textarea:focus{outline:none;border-color:var(--k-accent)}
.k-send{width:46px;height:46px;border-radius:50%;border:0;background:var(--k-accent);color:var(--k-on);display:grid;place-items:center;flex:0 0 auto}
.k-mini{display:grid;grid-template-columns:46px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--k-line)}
.k-mini img{width:46px;height:46px;border-radius:8px;object-fit:cover}
.k-mini b{font-size:14px;line-height:1.3}.k-mini small{display:block;color:var(--k-mute);font-size:12px}
.k-sm{min-height:36px;padding:0 13px;border-radius:99px;border:1.5px solid var(--k-ink);background:transparent;color:var(--k-ink);font:600 12.5px var(--k-fb);white-space:nowrap}
.k-co{position:absolute;inset:0;z-index:60;background:#F6F8FA;color:#1A1F36;font:14px/1.45 -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;animation:kr .25s}
@container site (min-width:900px){.k-co{left:auto;width:470px}.k-co .b{padding-top:18px!important}}
.k-co .b{padding:52px 18px 12px;display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid #E3E8EE}
.k-co .c{flex:1;overflow:auto;padding:18px}
.k-co .f{background:#fff;border:1px solid #E3E8EE;border-radius:10px;padding:12px;margin-bottom:10px;color:#697386}
.k-co .f b{color:#1A1F36}
.k-co .p{width:100%;height:48px;border:0;border-radius:8px;background:#635BFF;color:#fff;font-weight:600;font-size:16px}
.k-sim{font:700 9.5px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;background:#FFE9A8;color:#6B4E00;padding:3px 7px;border-radius:5px}
.k-toast{position:absolute;left:50%;transform:translateX(-50%);bottom:86px;z-index:45;background:var(--k-ink);color:var(--k-bg);border-radius:12px;padding:10px 14px;font-size:13.5px;white-space:nowrap;animation:ku .2s}
.annot [data-w]{position:relative;outline:1.5px dashed rgba(59,91,219,.6);outline-offset:-2px}
.annot [data-w]::before{content:attr(data-w);position:absolute;top:6px;left:6px;z-index:3;background:#2F4BC4;color:#fff;font:600 10px/1.2 'IBM Plex Mono',monospace;padding:3px 6px;border-radius:5px;pointer-events:none;white-space:nowrap}
@media (prefers-reduced-motion:reduce){.site *{animation:none!important;transition:none!important}}
`;
document.head.insertAdjacentHTML('beforeend','<style>'+CSS+'</style>');

const ICO = {
  chat:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>',
  back:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  send:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  menu:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  check:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  card:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
  play:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>',
  pause:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  arrow:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  pin:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  up:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  shield:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>'
};
const L = {
  es:{ask:'Preguntar',close:'Cerrar',back:'Atrás',send:'Enviar',nothing:'Nada se envía hasta que toques enviar.',hi:n=>`Hola, soy ${n}. ¿En qué te ayudo?`,reply:'Responde en unas horas',
      browse:'Servicios',browseSub:'Pregunta por cualquier servicio',backChat:'Volver al chat',backBook:'Volver a tu reserva',askThis:'Preguntar',write:'Escribe tu pregunta sobre este servicio',writeAny:'Escribe un mensaje',sent:'Enviado',today:'Hoy',
      pickTime:'Elige el horario',cont:'Continuar',details:'Tus datos',name:'Nombre',email:'Correo',confirm:'Confirmar',pay:a=>`Pagar ${a}`,
      processing:'Confirmando tu pago',procTxt:h=>`El pago está en proceso. Tu horario sigue apartado hasta las ${h}. No se hace un segundo cobro.`,booked:'Confirmado',bookedTxt:'Te mandamos los detalles por correo.',
      declined:'El pago no se completó',declTxt:h=>`Tu tarjeta fue rechazada y no se cobró nada. Tu horario sigue apartado hasta las ${h}.`,retry:'Intentar con otra tarjeta',
      reqSent:'Solicitud enviada',reqTxt:n=>`Aún no está confirmada. ${n} revisa y te responde. No se cobra nada hasta que lo acepte.`,quoteSent:'Cotización solicitada',quoteTxt:n=>`${n} te manda una cotización para aceptar o rechazar. No se cobra nada ahora.`,inqSent:'Consulta enviada',inqTxt:n=>`${n} te responde en el chat con disponibilidad y detalles.`,
      stBooked:'Reserva · Confirmada',stHeld:h=>`Reserva · Apartada hasta ${h}`,stPend:'Solicitud · Pendiente',stQuote:'Cotización · Pendiente',stInq:'Consulta · Enviada',payNone:'Pago · Nada por ahora',payPaid:a=>`Pago · Pagado ${a}`,payProc:'Pago · En proceso',payFree:'Pago · Sin costo',payVisit:'Pago · En la cita',payFail:'Pago · No completado',
      viewChat:'Ver la conversación',when:'Cuándo',service:'Servicio',total:'Total',free:'Sin costo',choice:'Elección',hold:'Te apartamos el horario 15 min mientras pagas. Se confirma cuando el pago se recibe.',
      co:'Checkout simulado',coNote:'Tarjeta de prueba de Stripe. En el producto es Stripe Checkout.',days:[['mié','30'],['jue','1'],['vie','2'],['sáb','3'],['lun','5']],
      taken:t=>`Las ${t} se acaban de ocupar.`,takenTxt:'Alguien reservó ese horario mientras elegías. Estos siguen libres:',opt:'Elige una opción',ext:'Extras',upload:'Subir archivo (opcional)',uploaded:'archivo.pdf listo',
      simReply:'Gracias, lo reviso y te respondo hoy con opciones y precio.',demoNote:'Demo: reservas y pagos simulados.'},
  en:{ask:'Ask',close:'Close',back:'Back',send:'Send',nothing:'Nothing is sent until you tap send.',hi:n=>`Hi, I'm ${n}. How can I help?`,reply:'Replies within a few hours',
      browse:'Services',browseSub:'Ask about any service',backChat:'Back to chat',backBook:'Back to your booking',askThis:'Ask',write:'Write your question about this service',writeAny:'Write a message',sent:'Sent',today:'Today',
      pickTime:'Pick a time',cont:'Continue',details:'Your details',name:'Name',email:'Email',confirm:'Confirm',pay:a=>`Pay ${a}`,
      processing:'Confirming your payment',procTxt:h=>`Payment is processing. Your time stays held until ${h}. You will not be charged twice.`,booked:'Confirmed',bookedTxt:'Details are on their way to your inbox.',
      declined:'Payment did not go through',declTxt:h=>`Your card was declined and nothing was charged. Your time stays held until ${h}.`,retry:'Try another card',
      reqSent:'Request sent',reqTxt:n=>`Not confirmed yet. ${n} reviews it and replies. Nothing is charged until accepted.`,quoteSent:'Quote requested',quoteTxt:n=>`${n} sends you a quote to accept or decline. Nothing is charged now.`,inqSent:'Question sent',inqTxt:n=>`${n} replies in the chat with availability and details.`,
      stBooked:'Booking · Confirmed',stHeld:h=>`Booking · Held until ${h}`,stPend:'Request · Pending',stQuote:'Quote · Pending',stInq:'Question · Sent',payNone:'Payment · Nothing yet',payPaid:a=>`Payment · Paid ${a}`,payProc:'Payment · Processing',payFree:'Payment · Free',payVisit:'Payment · At the appointment',payFail:'Payment · Not completed',
      viewChat:'View the conversation',when:'When',service:'Service',total:'Total',free:'Free',choice:'Choice',hold:'Your time is held for 15 min while you pay. It is confirmed once payment is received.',
      co:'Simulated checkout',coNote:'Stripe test card. In the product this is Stripe Checkout.',days:[['Wed','30'],['Thu','1'],['Fri','2'],['Sat','3'],['Mon','5']],
      taken:t=>`${t} was just taken.`,takenTxt:'Someone booked that time while you were choosing. These are still free:',opt:'Choose an option',ext:'Extras',upload:'Upload a file (optional)',uploaded:'file.pdf ready',
      simReply:'Thanks, I will look at this and reply today with options and a price.',demoNote:'Demo: bookings and payments are simulated.'}
};
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

window.KIT = function(T){ if(!document.body){ document.addEventListener('DOMContentLoaded',()=>window.KIT(T)); return; }
  const t = L[T.lang||'es'];
  const EN = T.lang==='en';
  const S0 = () => ({svc:null, sheet:null, step:null, form:{}, chips:{}, opt:{}, ext:{}, slot:null, day:0, taken:null, recovered:false, pay:'idle', up:false,
    chat:{open:false,msgs:[],ctx:null,browse:false,typing:false,unread:false}, toast:null});
  const G = {dev:'390', pal:Object.keys(T.palettes)[0], cust:null, mine:false, annot:false, race:true, payRes:'ok', step:0};
  let S = Object.assign(S0(), {});
  const $ = q => document.querySelector(q);
  const DATA = () => {
    if(!G.mine) return {talent:T.talent, services:T.services, mine:false};
    const m = T.mine||{};
    return {mine:true, talent:Object.assign({}, T.talent, {name:m.name||(EN?'Your Name':'Tu Nombre'), first:(m.name||(EN?'You':'Tú')).split(' ')[0], tagline:m.tagline||(EN?'Your tagline appears here':'Tu frase principal aparece aquí'), bio:m.bio||(EN?'Your short introduction appears here, in your words.':'Tu presentación aparece aquí, con tus palabras.')}),
      services:T.services.slice(0, m.count||3).map((s,i)=>Object.assign({}, s, {name:(m.names&&m.names[i])||s.name, desc:EN?'Your service description appears here.':'Tu descripción del servicio aparece aquí.'}))};
  };
  const svc = id => DATA().services.find(s=>s.id===id) || T.services.find(s=>s.id===id);
  const first = m => T.services.find(s=>m.includes(s.mode));

  /* ── page shell ── */
  document.body.insertAdjacentHTML('afterbegin', `
  <header class="rv-top"><div><h1>${esc(T.theme)} Theme Review</h1><div class="sub">${esc(T.id)} · ${esc(T.talent.name)}, ${esc(T.talent.role)} · ${esc(T.brief)}</div></div>
    <nav class="rv-tabs" id="rv-tabs"><button data-v="exp" aria-pressed="true">Experience</button><button data-v="map" aria-pressed="false">Builder map</button><button data-v="img" aria-pressed="false">Images</button><button data-v="notes" aria-pressed="false">Reviewer notes</button></nav>
    ${T.galleryUrl?`<a href="${T.galleryUrl}">All themes ↗</a>`:''}
  </header>
  <section class="rv-view on" id="v-exp"><div class="rv-exp">
    <aside class="rv-rail">
      <div class="rv-rg"><h3>Device</h3><div class="rv-seg" id="rv-dev"><button data-d="390" aria-pressed="true">390</button><button data-d="360" aria-pressed="false">360</button><button data-d="1440" aria-pressed="false">1440</button></div></div>
      <div class="rv-rg"><h3>Guided journey</h3><ol class="rv-steps" id="rv-steps"></ol><p class="rv-hint">Every screen is clickable. Steps only jump to a state.</p></div>
      <div class="rv-rg"><h3>Palette</h3><div class="rv-sw" id="rv-pal"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><label class="rv-chk" for="rv-cust">Custom accent</label><input type="color" id="rv-cust" value="${T.customStart||'#2E6F8E'}" style="width:40px;height:30px;border:1px solid var(--rv-line);border-radius:8px;background:none;padding:2px"></div>
        <p class="rv-hint" id="rv-custnote">Text colour and tints are derived; contrast is kept at 4.5:1.</p></div>
      <div class="rv-rg"><h3>Content in the preview</h3><div class="rv-seg" id="rv-cont"><button data-c="demo" aria-pressed="true">Demo content</button><button data-c="mine" aria-pressed="false">My content</button></div>
        <p class="rv-hint" id="rv-conthint">Demo: fictional ${esc(T.talent.name)}, with a Demo badge. Bookings simulated.</p></div>
      <div class="rv-rg"><h3>Builder</h3><button class="rv-btn pri" id="rv-use">Use this design…</button><label class="rv-chk" style="margin-top:10px"><input type="checkbox" id="rv-annot"> Show widget labels</label></div>
      <div class="rv-rg"><h3>Simulate</h3>${first(['instant'])?`<label class="rv-chk"><input type="checkbox" id="rv-race" checked> First chosen time gets taken</label>`:''}
        ${T.services.some(s=>s.payNow)?`<div class="rv-chk" style="margin-top:8px;flex-wrap:wrap">Payment<div class="rv-seg" id="rv-payres"><button data-p="ok" aria-pressed="true">Paid</button><button data-p="decline" aria-pressed="false">Declined</button><button data-p="slow" aria-pressed="false">Slow</button></div></div>`:''}
        <button class="rv-btn" id="rv-reset" style="margin-top:10px">Reset journey</button></div>
    </aside>
    <div class="rv-stage" id="rv-stage"><div class="rv-note" id="rv-note"></div>
      <div class="rv-hold" id="rv-hold"><div class="rv-dev phone" id="rv-devf"><div class="site" id="site"><div class="k-vp" id="vp"></div><div id="ovl"></div></div></div></div></div>
  </div></section>
  <section class="rv-view" id="v-map"><div class="rv-doc" id="rv-map"></div></section>
  <section class="rv-view" id="v-img"><div class="rv-doc" id="rv-img"></div></section>
  <section class="rv-view" id="v-notes"><div class="rv-doc" id="rv-notes"></div></section>
  <div id="rv-modal"></div>`);

  /* ── palette ── */
  function hexRgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16));}
  function rgbHex(r){return '#'+r.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
  function lum(h){return hexRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
  function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function mix(a,b,k){const A=hexRgb(a),B=hexRgb(b);return rgbHex(A.map((v,i)=>v+(B[i]-v)*k));}
  function pal(){
    const base=T.palettes[G.pal]; if(!G.cust) return base;
    const bg=base.surface, dark=lum(bg)<.2; let at=G.cust, adj=false;
    for(let i=0;i<16 && contrast(at,bg)<4.5;i++){ at=mix(at, dark?'#FFFFFF':'#000000', .1); adj=true; }
    return Object.assign({}, base, {accent:G.cust, at, on: contrast(G.cust,'#FFFFFF')>=3.2?'#FFFFFF':'#111111', tint: mix(G.cust, bg, dark?.8:.88), adj});
  }
  function applyPal(){
    const p=pal(), el=$('#site');
    ['bg','surface','ink','mute','line','accent','on','tint'].forEach(k=>el.style.setProperty('--k-'+k, p[k]));
    el.style.setProperty('--k-at', p.at||p.accent);
    Object.entries(T.tokens||{}).forEach(([k,v])=>el.style.setProperty(k,v));
    Object.entries(p.vars||{}).forEach(([k,v])=>el.style.setProperty(k,v));
    $('#rv-custnote').textContent = G.cust ? (p.adj?`Buttons use your colour; a darker ${p.at} is used for text so it stays readable.`:`Readable as text (${contrast(p.at,p.surface).toFixed(1)}:1). Button text: ${p.on==='#FFFFFF'?'white':'dark'}.`) : 'Text colour and tints are derived; contrast is kept at 4.5:1.';
  }
  function renderPals(){ $('#rv-pal').innerHTML = Object.entries(T.palettes).map(([k,p])=>`<button class="rv-swb" data-pal="${k}" aria-pressed="${!G.cust&&G.pal===k}"><span style="background:linear-gradient(135deg,${p.bg} 0 50%,${p.accent} 50%)"></span>${esc(p.n)}</button>`).join(''); }

  /* ── device ── */
  function layout(){
    const f=$('#rv-devf'), hold=$('#rv-hold'), avail=$('#rv-stage').clientWidth-32, desk=G.dev==='1440';
    let w,h; if(desk){w=1440;h=900;f.className='rv-dev desk';} else {w=+G.dev+20;h=(G.dev==='360'?780:844)+20;f.className='rv-dev phone';}
    f.style.width=w+'px'; f.style.height=h+'px';
    const bar=f.querySelector('.rv-bar');
    if(desk&&!bar) f.insertAdjacentHTML('afterbegin',`<div class="rv-bar"><i></i><i></i><i></i><span>${esc(T.domain)}</span></div>`);
    if(!desk&&bar) bar.remove();
    $('#site').style.top=desk?'34px':'0';
    const sc=Math.min(1,avail/w); f.style.transform=`scale(${sc})`; hold.style.width=w*sc+'px'; hold.style.height=h*sc+'px';
  }

  /* ── helpers for themes ── */
  const K = {
    esc, ICO, t, EN,
    get D(){ return DATA(); }, get mine(){ return G.mine; },
    open:(s,cls='',label)=>`<button class="${cls||'k-btn'}" data-k-open="${s.id}">${esc(label||s.cta)}</button>`,
    act:(s,cls='')=>`<button class="${cls||'k-btn'}" data-k-flow="${s.id}">${esc(s.cta)}</button>`,
    demo:()=> G.mine?'':`<span class="k-demo" title="Shown from demo metadata">Demo</span>`,
    status:()=>`<div class="k-status"><span>9:41</span><span>●●● ▮</span></div>`,
    img:k=>`img/${k}.jpg`,
    go:(id,label,cls='')=>`<button class="${cls||'k-btn ghost'}" data-k-go="${id}">${esc(label)}</button>`
  };

  /* ── overlays ── */
  function sheet(title, body, foot, back){
    return `<div class="k-scrim" data-k-close="1"></div><div class="k-sheet s-${T.surface||'sheet'}" role="dialog" aria-label="${esc(title)}"><div class="k-grab"><i></i></div>
      <div class="k-sht">${back?`<button class="k-ib" data-k-back="${back}" aria-label="${t.back}">${ICO.back}</button>`:'<span style="width:40px"></span>'}<h3>${esc(title)}</h3><button class="k-ib" data-k-close="1" aria-label="${t.close}">${ICO.close}</button></div>
      ${T.surface==='modal'?`<div class="k-wiz">${[0,1,2].map(i=>`<i class="${i<=(S.sheet==='detail'?0:S.sheet==='done'?2:1)?'on':''}"></i>`).join('')}</div>`:''}<div class="k-body" id="kb">${body}</div>${foot?`<div class="k-foot">${foot}</div>`:''}</div>`;
  }
  const choiceTxt = s => { const o=s.options&&s.options.find(o=>o[0]===S.opt[s.id]); const ex=(S.ext[s.id]||[]).map(x=>(s.extras.find(e=>e[0]===x)||[])[1]).filter(Boolean); return [o&&o[1], ...ex.map(x=>'+ '+x)].filter(Boolean).join(' · '); };
  function detailSheet(s){
    if(s.options && !S.opt[s.id]) S.opt[s.id]=s.options[0][0];
    const body=`<div class="k-hero"><img src="${K.img(s.img)}" alt=""></div><div class="k-ey">${esc(s.cat||'')}</div><h2 class="k-t">${esc(s.name)}</h2>
      <div class="k-meta"><b>${esc(s.priceLabel||s.price)}</b>${s.dur?`<span>·</span><span>${esc(s.dur)}</span>`:''}${s.modeNote?`<span>·</span><span>${esc(s.modeNote)}</span>`:''}</div>
      <p class="k-d">${esc(s.desc)}</p>${s.includes?`<ul class="k-list">${s.includes.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:''}
      ${s.options?`<div class="k-fl">${esc(s.optLabel||t.opt)}</div><div class="k-opts" role="radiogroup">${s.options.map(o=>`<button class="k-opt" role="radio" aria-checked="${S.opt[s.id]===o[0]}" data-k-optv="${s.id}|${o[0]}"><span class="rd"></span><span><b>${esc(o[1])}</b>${o[2]?`<small>${esc(o[2])}</small>`:''}</span><span class="d">${esc(o[3]||'')}</span></button>`).join('')}</div>`:''}
      ${s.extras?`<div class="k-fl">${t.ext}</div><div class="k-opts">${s.extras.map(e=>{const on=(S.ext[s.id]||[]).includes(e[0]);return `<button class="k-opt" role="checkbox" aria-checked="${on}" data-k-extv="${s.id}|${e[0]}"><span class="bx">${on?'✓':''}</span><span><b>${esc(e[1])}</b>${e[3]?`<small>${esc(e[3])}</small>`:''}</span><span class="d">${esc(e[2]||'')}</span></button>`}).join('')}</div>`:''}
      ${s.policy?`<div class="k-note">${esc(s.policy)}</div>`:''}`;
    return sheet(s.cat||t.service, body, `<button class="k-btn ghost" data-k-ask="${s.id}" style="flex:0 0 auto;padding:0 16px">${ICO.chat}<span>${t.ask}</span></button><button class="k-btn" data-k-flow="${s.id}">${esc(s.cta)}</button>`);
  }
  function fieldHtml(f){
    const v=S.form[f.k]||'';
    if(f.type==='chips') return `<div class="k-fld"><label>${esc(f.l)}</label><div class="k-chips">${f.opts.map(o=>`<button class="k-chip" data-k-chip="${f.k}|${esc(o)}" aria-pressed="${(S.chips[f.k]||[]).includes(o)}">${esc(o)}</button>`).join('')}</div>${f.h?`<small>${esc(f.h)}</small>`:''}</div>`;
    if(f.type==='area') return `<div class="k-fld"><label for="kf-${f.k}">${esc(f.l)}</label><textarea id="kf-${f.k}" data-k-f="${f.k}" rows="3" placeholder="${esc(f.p||'')}">${esc(v)}</textarea>${f.h?`<small>${esc(f.h)}</small>`:''}</div>`;
    if(f.type==='select') return `<div class="k-fld"><label for="kf-${f.k}">${esc(f.l)}</label><select id="kf-${f.k}" data-k-f="${f.k}">${f.opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
    if(f.type==='upload') return `<div class="k-fld"><label>${esc(f.l||t.upload)}</label><button class="k-up" data-k-up="1">${ICO.up}<span><b style="display:block;font-size:14px">${S.up?t.uploaded:esc(f.p||t.upload)}</b><small style="color:var(--k-mute)">${S.up?'':esc(f.h||'PDF, JPG, DOCX')}</small></span></button></div>`;
    return `<div class="k-fld"><label for="kf-${f.k}">${esc(f.l)}</label><input id="kf-${f.k}" data-k-f="${f.k}" value="${esc(v)}" placeholder="${esc(f.p||'')}" ${f.im?`inputmode="${f.im}"`:''}>${f.h?`<small>${esc(f.h)}</small>`:''}</div>`;
  }
  function slotsFor(s,d){ const base=s.slots||['10:00','11:30','13:00','16:00','17:30']; return d%2? base.slice(1) : base; }
  function flowSheet(s){
    const ch=choiceTxt(s);
    if(s.mode==='instant'){
      if(S.step==='time'){
        const sl=slotsFor(s,S.day);
        const rec = S.taken ? `<div class="k-note warn" role="alert"><b>${esc(t.taken(S.taken.t))}</b> ${t.takenTxt}<div class="k-chips" style="margin-top:8px">${[[S.taken.d, sl.filter(x=>x!==S.taken.t)[0]],[S.taken.d, sl.filter(x=>x!==S.taken.t)[1]],[S.taken.d+1, slotsFor(s,S.taken.d+1)[0]]].filter(a=>a[1]).map(([d,x])=>`<button class="k-chip" data-k-alt="${d}|${x}">${t.days[Math.min(d,4)].join(' ')} · ${x}</button>`).join('')}</div></div>` : '';
        const body=`<div class="k-ey">${esc(s.name)}</div><p class="k-d" style="margin-top:6px">${[s.dur, s.priceLabel||s.price, ch].filter(Boolean).map(esc).join(' · ')}</p>
          <div class="k-days">${t.days.map((d,i)=>`<button class="k-day" data-k-day="${i}" aria-pressed="${S.day===i}"><small>${d[0]}</small><b>${d[1]}</b></button>`).join('')}</div>${rec}
          <div class="k-fl">${t.days[S.day].join(' ')}</div><div class="k-slots">${sl.map(x=>{const gone=S.taken&&S.taken.d===S.day&&S.taken.t===x;return `<button class="k-slot ${gone?'gone':''}" ${gone?'disabled':''} data-k-slot="${x}" aria-pressed="${S.slot===x}">${x}</button>`}).join('')}</div>
          ${s.slotNote?`<div class="k-note">${esc(s.slotNote)}</div>`:''}`;
        return sheet(t.pickTime, body, `<button class="k-btn" data-k-step="who" ${S.slot?'':'disabled'}>${t.cont}</button>`, 'detail');
      }
      const body=`<div class="k-note" style="margin:0 0 14px">${esc(s.name)}${ch?' · '+esc(ch):''} · ${t.days[S.day].join(' ')} · ${S.slot}</div>${[{k:'name',l:t.name},{k:'email',l:t.email,im:'email'}].concat(s.whoFields||[]).map(fieldHtml).join('')}
        <div class="k-note">${s.payNow?t.hold:esc(s.payNote|| (s.free?'':(EN?'You pay at the appointment. Nothing is charged online.':'Pagas en la cita. No se cobra nada en línea.')))} ${esc(s.policy||'')}</div>`;
      return sheet(t.details, body, s.payNow?`<button class="k-btn" data-k-pay="1">${ICO.card} ${t.pay(s.payNow)}</button>`:`<button class="k-btn" data-k-done="1">${t.confirm}</button>`, 'time');
    }
    const body=`<div class="k-ey">${esc(s.name)}</div>${ch?`<p class="k-d" style="margin:6px 0 0">${esc(ch)}</p>`:''}<p class="k-d" style="margin:6px 0 14px">${esc(s.flowIntro||'')}</p>${(s.brief||[]).map(fieldHtml).join('')}
      ${[{k:'name',l:t.name},{k:'email',l:t.email,im:'email'}].map(fieldHtml).join('')}
      <div class="k-note">${esc(s.flowNote || (s.mode==='request'?t.reqTxt(DATA().talent.first):s.mode==='quote'?t.quoteTxt(DATA().talent.first):t.inqTxt(DATA().talent.first)))}</div>`;
    return sheet(s.flowTitle||s.cta, body, `<button class="k-btn ghost" data-k-ask="${s.id}" style="flex:0 0 auto;padding:0 14px" aria-label="${t.ask}">${ICO.chat}</button><button class="k-btn" data-k-done="1">${esc(s.submit||(s.mode==='request'?(EN?'Send request':'Enviar solicitud'):s.mode==='quote'?(EN?'Request quote':'Pedir cotización'):(EN?'Send question':'Enviar consulta')))}</button>`, 'detail');
  }
  function doneSheet(s){
    const when=S.slot?`${t.days[S.day].join(' ')} · ${S.slot}`:'', ch=choiceTxt(s), me=DATA().talent.first;
    if(s.mode==='instant'){
      if(S.pay==='processing') return sheet(t.processing, `<div class="k-res"><div class="k-spin"></div><h2 style="margin-top:14px">${t.processing}</h2><p>${t.procTxt('12:47')}</p><div class="k-st"><span class="k-pill wait">${t.stHeld('12:47')}</span><span class="k-pill wait">${t.payProc}</span></div></div>`,'');
      if(S.pay==='declined') return sheet(t.declined, `<div class="k-res"><div class="ic" style="background:color-mix(in srgb,#E9A23B 20%,var(--k-surface));color:#8A5A12">${ICO.card}</div><h2>${t.declined}</h2><p>${t.declTxt('12:47')}</p><div class="k-st"><span class="k-pill wait">${t.stHeld('12:47')}</span><span class="k-pill idle">${t.payFail}</span></div></div>`, `<button class="k-btn" data-k-pay="1">${t.retry}</button>`, 'who');
      const payPill = s.payNow?`<span class="k-pill ok">${t.payPaid(s.payNow)}</span>`: s.free?`<span class="k-pill idle">${t.payFree}</span>`:`<span class="k-pill idle">${t.payVisit}</span>`;
      return sheet(t.booked, `<div class="k-res"><div class="ic">${ICO.check}</div><h2>${t.booked}</h2><p>${t.bookedTxt}</p><div class="k-st"><span class="k-pill ok">${t.stBooked}</span>${payPill}</div></div>
        <div class="k-recap"><div><span>${t.service}</span><b>${esc(s.name)}</b></div>${ch?`<div><span>${t.choice}</span><b>${esc(ch)}</b></div>`:''}<div><span>${t.when}</span><b>${when}</b></div><div><span>${t.total}</span><b>${esc(s.free?t.free:(s.payNow||s.price))}</b></div></div>${s.policy?`<div class="k-note">${esc(s.policy)}</div>`:''}`, `<button class="k-btn" data-k-chat="open">${ICO.chat} ${t.viewChat}</button>`);
    }
    const [h,p,st] = s.mode==='request'?[t.reqSent,t.reqTxt(me),t.stPend]: s.mode==='quote'?[t.quoteSent,t.quoteTxt(me),t.stQuote]:[t.inqSent,t.inqTxt(me),t.stInq];
    const recap=`<div class="k-recap"><div><span>${t.service}</span><b>${esc(s.name)}</b></div>${ch?`<div><span>${t.choice}</span><b>${esc(ch)}</b></div>`:''}${(s.brief||[]).filter(f=>f.type!=='upload').slice(0,3).map(f=>`<div><span>${esc(f.l)}</span><b>${esc(f.type==='chips'?((S.chips[f.k]||[]).join(', ')||'·'):(S.form[f.k]||'·'))}</b></div>`).join('')}</div>`;
    return sheet(h, `<div class="k-res"><div class="ic">${ICO.clock}</div><h2>${esc(h)}</h2><p>${esc(p)}</p><div class="k-st"><span class="k-pill wait">${st}</span><span class="k-pill idle">${t.payNone}</span></div></div>${recap}`, `<button class="k-btn" data-k-chat="open">${ICO.chat} ${t.viewChat}</button>`);
  }
  function ctxCard(c,rm){ const s=svc(c.id); return `<div class="k-ctx"><img src="${K.img(s.img)}" alt=""><div><b>${esc(s.name)}</b><small>${esc([s.priceLabel||s.price, c.extra].filter(Boolean).join(' · '))}</small></div>${rm?`<button class="k-x" data-k-ctxrm="1" aria-label="Remove">${ICO.close}</button>`:'<span></span>'}</div>`; }
  function chatHtml(){
    const c=S.chat, sh=S.sheet?' shift':'', D=DATA();
    if(c.browse) return `<div class="k-chat${sh}" role="dialog" aria-label="${t.browse}"><div class="k-cht"><button class="k-ib" data-k-chat="unbrowse" aria-label="${t.backChat}">${ICO.back}</button><div class="w"><b>${t.browse}</b><small>${t.browseSub}</small></div><button class="k-ib" data-k-chat="close" aria-label="${t.close}">${ICO.close}</button></div>
      <div class="k-msgs" style="gap:0">${D.services.map(s=>`<div class="k-mini"><img src="${K.img(s.img)}" alt=""><div><b>${esc(s.name)}</b><small>${esc(s.priceLabel||s.price)}</small></div><button class="k-sm" data-k-chatask="${s.id}">${t.askThis}</button></div>`).join('')}</div>
      <div class="k-comp"><button class="k-btn soft" data-k-chat="unbrowse">${t.backChat}</button></div></div>`;
    return `<div class="k-chat${sh}" role="dialog" aria-label="Chat"><div class="k-cht"><img src="${K.img(T.talent.avatar)}" alt=""><div class="w"><b>${esc(D.talent.name)}</b><small>${t.reply}</small></div><button class="k-ib" data-k-chat="browse" aria-label="${t.browse}">${ICO.menu}</button><button class="k-ib" data-k-chat="close" aria-label="${t.close}">${ICO.close}</button></div>
      ${S.sheet?`<button class="k-back" data-k-chat="close"><span>${t.backBook}${S.svc?' · '+esc(svc(S.svc).name):''}</span>${ICO.arrow}</button>`:''}
      <div class="k-msgs" id="kmsgs">${!c.msgs.length?`<div class="k-sep">${t.nothing}</div><div class="k-bub t">${esc(t.hi(D.talent.first))}</div>`:`<div class="k-sep">${t.today}</div>`}
      ${c.msgs.map(m=>`<div class="k-bub ${m.me?'m':'t'}">${m.ctx?ctxCard(m.ctx,false):''}${esc(m.text)}<small>${m.time}${m.me?' · '+t.sent:''}</small></div>`).join('')}${c.typing?'<div class="k-typing"><i></i><i></i><i></i></div>':''}</div>
      ${c.ctx&&!c.msgs.length&&T.suggestions?`<div class="k-sugg">${T.suggestions.map(q=>`<button data-k-sugg="${esc(q)}">${esc(q)}</button>`).join('')}</div>`:''}
      <div class="k-comp">${c.ctx?`<div>${ctxCard(c.ctx,true)}</div>`:''}<div class="r"><textarea id="k-in" rows="1" placeholder="${c.ctx?t.write:t.writeAny}" aria-label="${t.writeAny}"></textarea><button class="k-send" data-k-chat="send" aria-label="${t.send}">${ICO.send}</button></div></div></div>`;
  }
  function coHtml(s){ return `<div class="k-co" role="dialog"><div class="b"><button class="k-ib" data-k-co="back" style="background:#F1F3F6" aria-label="${t.back}">${ICO.back}</button><b style="flex:1">${esc(DATA().talent.name)}</b><span class="k-sim">${t.co}</span></div>
    <div class="c"><div style="color:#697386">${esc(s.name)}</div><div style="font-size:30px;font-weight:600;margin:4px 0 16px">${esc(s.payNow)}.00 ${T.currency||'MXN'}</div>
    <div class="f">${t.email}<br><b>${esc(S.form.email||'demo@correo.com')}</b></div><div class="f">Card<br><b>4242 4242 4242 4242 · 12/28 · 123</b></div>
    <button class="p" data-k-co="pay">${t.pay(s.payNow)}.00</button><p style="font-size:12px;color:#697386;text-align:center;margin-top:12px">${t.coNote}</p></div></div>`; }
  function dockHtml(){
    if(S.sheet||S.chat.open) return '';
    const dk=T.dock;
    if(dk && dk.fab) return `<button class="k-fab" data-k-chat="open" aria-label="Chat">${ICO.chat}${S.chat.unread?'<i></i>':''}</button>`;
    return `<div class="k-dock"><button class="k-chatb" data-k-chat="open" aria-label="Chat">${ICO.chat}${S.chat.unread?'<i></i>':''}</button>${(dk||[]).map((d,i)=>`<button class="k-btn ${i?'ghost':''}" ${d.flow?`data-k-flow="${d.flow}"`:`data-k-go="${d.go}"`}>${esc(d.label)}</button>`).join('')}</div>`;
  }
  function renderOverlay(){
    let h=''; const s=S.svc&&svc(S.svc);
    if(S.sheet==='detail') h+=detailSheet(s);
    if(S.sheet==='flow') h+=flowSheet(s);
    if(S.sheet==='done') h+=doneSheet(s);
    if(S.pay==='checkout') h+=coHtml(s);
    if(S.chat.open) h+=chatHtml();
    h+=dockHtml();
    if(S.toast) h+=`<div class="k-toast" role="status">${esc(S.toast)}</div>`;
    const kb=$('#kb'), st=kb?kb.scrollTop:0, act=document.activeElement&&document.activeElement.id;
    $('#ovl').innerHTML=h; enforceCta($('#ovl'));
    if(S.keep&&$('#kb')) $('#kb').scrollTop=st; S.keep=false;
    const m=$('#kmsgs'); if(m) m.scrollTop=m.scrollHeight;
    if(act&&/^kf-/.test(act)&&document.getElementById(act)) document.getElementById(act).focus();
  }
  function enforceCta(root){ root.querySelectorAll('[data-k-flow]').forEach(b=>{ const s=svc(b.dataset.kFlow); if(s && b.textContent.trim()!==s.cta){ const ic=b.querySelector('svg'); b.textContent=s.cta; if(ic) b.prepend(ic); } }); }
  function renderSite(){ const vp=$('#vp'), st=vp.scrollTop; vp.innerHTML=T.renderSite.call(T,K,S); enforceCta(vp); vp.scrollTop=st; if(T.afterRender) T.afterRender(K,S); }
  function render(){ applyPal(); renderSite(); renderOverlay(); $('#site').classList.toggle('annot',G.annot); renderSteps(); renderNote(); }
  let tt; function toast(m){ S.toast=m; clearTimeout(tt); tt=setTimeout(()=>{S.toast=null;renderOverlay();},2200); renderOverlay(); }
  function now(){ return '10:'+String(12+S.chat.msgs.length).padStart(2,'0'); }
  function send(txt){
    const c=S.chat, v=(txt||'').trim(); if(!v&&!c.ctx) return;
    c.msgs.push({me:true,text:v||(EN?'Can you tell me more about this?':'¿Me cuentas más de este servicio?'),ctx:c.ctx,time:now()});
    const ctx=c.ctx; c.ctx=null; c.typing=true; renderOverlay();
    setTimeout(()=>{ c.typing=false; c.msgs.push({me:false,text:(ctx&&svc(ctx.id).reply)||T.reply||t.simReply,time:now()}); if(!c.open) c.unread=true; renderOverlay(); },1200);
  }
  function openChat(id){ S.chat.open=true; S.chat.browse=false; S.chat.unread=false; if(id){ S.chat.ctx={id, extra:choiceTxt(svc(id))||null}; } render(); }

  /* ── events ── */
  document.addEventListener('click', e=>{
    const b=e.target.closest('button,[data-k-open],[data-k-flow],[data-k-go],[data-k-act]'); if(!b) return; const d=b.dataset;
    if(b.closest('#rv-tabs')){ document.querySelectorAll('#rv-tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b)); document.querySelectorAll('.rv-view').forEach(v=>v.classList.toggle('on',v.id==='v-'+d.v)); if(d.v==='exp') layout(); window.scrollTo(0,0); return; }
    if(b.closest('#rv-dev')){ G.dev=d.d; document.querySelectorAll('#rv-dev button').forEach(x=>x.setAttribute('aria-pressed',x===b)); layout(); return; }
    if(b.closest('#rv-pal')&&d.pal){ G.pal=d.pal; G.cust=null; renderPals(); applyPal(); return; }
    if(b.closest('#rv-cont')){ G.mine=d.c==='mine'; document.querySelectorAll('#rv-cont button').forEach(x=>x.setAttribute('aria-pressed',x===b)); $('#rv-conthint').textContent=G.mine?'Your name, services and text in this design, before you apply it. Sections without your content hide. Nothing is saved.':`Demo: fictional ${T.talent.name}, with a Demo badge. Bookings simulated.`; S=S0(); $('#vp').scrollTop=0; return render(); }
    if(b.closest('#rv-payres')){ G.payRes=d.p; document.querySelectorAll('#rv-payres button').forEach(x=>x.setAttribute('aria-pressed',x===b)); return; }
    if(b.id==='rv-reset'){ G.step=0; return jump(0); }
    if(b.closest('#rv-steps')) return jump(+d.i);
    if(b.id==='rv-use') return useModal();
    if(!b.closest('#site')) return;
    if(d.kOpen){ S.svc=d.kOpen; S.sheet='detail'; return render(); }
    if(d.kFlow){ S.svc=d.kFlow; S.sheet='flow'; S.step=svc(d.kFlow).mode==='instant'?'time':null; S.slot=null; return render(); }
    if(d.kAsk) return openChat(d.kAsk);
    if(d.kOptv){ const [id,v]=d.kOptv.split('|'); S.opt[id]=v; S.keep=true; return renderOverlay(); }
    if(d.kExtv){ const [id,v]=d.kExtv.split('|'); const a=S.ext[id]||(S.ext[id]=[]); const i=a.indexOf(v); i<0?a.push(v):a.splice(i,1); S.keep=true; return renderOverlay(); }
    if(d.kClose){ S.sheet=null; S.pay='idle'; return render(); }
    if(d.kBack){ if(d.kBack==='detail'){ S.sheet='detail'; } else { S.sheet='flow'; S.step=d.kBack; S.pay='idle'; } return renderOverlay(); }
    if(d.kStep==='who'){ if(G.race && !S.recovered && !S.taken){ S.taken={d:S.day,t:S.slot}; S.slot=null; return renderOverlay(); } S.step='who'; return renderOverlay(); }
    if(d.kAlt){ const [dd,x]=d.kAlt.split('|'); S.day=Math.min(+dd,4); S.slot=x; S.taken=null; S.recovered=true; S.keep=true; return renderOverlay(); }
    if(d.kDay){ S.day=+d.kDay; S.slot=null; S.keep=true; return renderOverlay(); }
    if(d.kSlot){ S.slot=d.kSlot; S.keep=true; return renderOverlay(); }
    if(d.kChip){ const [k,v]=d.kChip.split('|'); const a=S.chips[k]||(S.chips[k]=[]); const i=a.indexOf(v); i<0?a.push(v):a.splice(i,1); S.keep=true; return renderOverlay(); }
    if(d.kUp){ S.up=true; S.keep=true; return renderOverlay(); }
    if(d.kDone){ const s=svc(S.svc); S.sheet='done'; if(s.mode!=='instant'){ S.chat.msgs.push({me:true,text:(EN?'Sent: ':'Enviado: ')+s.cta,ctx:{id:s.id,extra:choiceTxt(s)||null},time:now()}); S.chat.unread=true; } return render(); }
    if(d.kPay){ S.pay='checkout'; S.sheet='flow'; S.step='who'; return renderOverlay(); }
    if(d.kCo==='back'){ S.pay='idle'; return renderOverlay(); }
    if(d.kCo==='pay'){ S.pay='processing'; S.sheet='done'; renderOverlay(); const r=G.payRes; setTimeout(()=>{ if(S.pay==='processing'){ S.pay= r==='decline'?'declined':'paid'; renderOverlay(); } }, r==='slow'?4200:1700); return; }
    if(d.kChat==='open') return openChat();
    if(d.kChat==='close'){ S.chat.open=false; S.chat.browse=false; return render(); }
    if(d.kChat==='browse'){ S.chat.browse=true; return renderOverlay(); }
    if(d.kChat==='unbrowse'){ S.chat.browse=false; return renderOverlay(); }
    if(d.kChat==='send'){ const i=$('#k-in'); return send(i?i.value:''); }
    if(d.kChatask){ S.chat.browse=false; S.chat.ctx={id:d.kChatask}; return renderOverlay(); }
    if(d.kCtxrm){ S.chat.ctx=null; return renderOverlay(); }
    if(d.kSugg) return send(d.kSugg);
    if(d.kGo){ const el=document.getElementById(d.kGo); if(el) $('#vp').scrollTo({top:el.offsetTop-(G.dev==='1440'?64:96),behavior:'smooth'}); return; }
    if(d.kAct && T.onAction){ T.onAction(d.kAct, S, {render, renderSite, renderOverlay, toast, K}); return; }
  });
  document.addEventListener('input', e=>{ const f=e.target.dataset&&e.target.dataset.kF; if(f) S.form[f]=e.target.value; });
  document.addEventListener('change', e=>{ const f=e.target.dataset&&e.target.dataset.kF; if(f) S.form[f]=e.target.value; if(e.target.id==='rv-annot'){ G.annot=e.target.checked; $('#site').classList.toggle('annot',G.annot);} if(e.target.id==='rv-race') G.race=e.target.checked; });
  document.addEventListener('keydown', e=>{ if(e.key==='Enter'&&e.target.id==='k-in'&&!e.shiftKey){e.preventDefault();send(e.target.value);} if(e.key==='Escape'&&(S.sheet||S.chat.open)){S.sheet=null;S.chat.open=false;render();} });
  $('#rv-cust').addEventListener('input', e=>{ G.cust=e.target.value; renderPals(); applyPal(); });
  window.addEventListener('resize', layout);

  /* ── guided journey ── */
  const hs = T.services.find(s=>s.id===T.hero_service);
  const inst=first(['instant']), req=first(['request']), quo=first(['quote','inquiry']);
  const fill = s => (s.brief||[]).forEach(f=>{ if(f.demo){ if(f.type==='chips') S.chips[f.k]=[].concat(f.demo); else S.form[f.k]=f.demo; }});
  const who = () => { S.form.name=EN?'Dana Ruiz':'Daniela Rosas'; S.form.email='daniela@correo.com'; };
  const STEPS = [
    ['First frame', ()=>{}, 'The hero, the main action and the proof line are visible in the first frame with no entrance animation. There is one floating control: the chat button, inside the dock when there is one.','ex'],
    ['Service detail', ()=>{ S.svc=hs.id; S.sheet='detail'; if(hs.options) S.opt[hs.id]=(hs.options[1]||hs.options[0])[0]; if(hs.extras) S.ext[hs.id]=[hs.extras[0][0]]; }, 'The detail shows price, duration and what is included. Options and extras, when the service has them, are part of the selection.','ex'],
    ['Ask with the service attached', ()=>{ S.svc=hs.id; S.sheet='detail'; if(hs.options) S.opt[hs.id]=(hs.options[1]||hs.options[0])[0]; S.chat.open=true; S.chat.ctx={id:hs.id, extra:choiceTxt(hs)||null}; }, 'The chat opens with the service and the choices attached as a draft. Nothing is sent until the visitor taps send; the draft can be removed.','ex'],
    ['Back to booking, selection kept', ()=>{ S.svc=hs.id; S.sheet='flow'; S.step=hs.mode==='instant'?'time':null; fill(hs); if(hs.options) S.opt[hs.id]=(hs.options[1]||hs.options[0])[0]; S.chat.open=true; S.chat.msgs=[{me:true,text:T.suggestions?T.suggestions[0]:'?',ctx:{id:hs.id,extra:choiceTxt(hs)||null},time:'10:12'},{me:false,text:hs.reply||T.reply||t.simReply,time:'10:14'}]; }, '“Back to your booking” closes the chat and returns to the same step with everything still filled in. The thread is kept.','prop']
  ];
  if(inst){
    STEPS.push(['Instant: pick a time', ()=>{ S.svc=inst.id; S.sheet='flow'; S.step='time'; }, `“${inst.cta}” opens a day and time picker. Only real free times are shown.`,'ex']);
    STEPS.push(['Time taken → recovery', ()=>{ S.svc=inst.id; S.sheet='flow'; S.step='time'; S.taken={d:0,t:slotsFor(inst,0)[0]}; }, 'The chosen time was booked by someone else while the visitor decided. The next free times are offered and nothing else is lost.','prop']);
    STEPS.push([inst.payNow?'Pay → checkout → confirmed':'Confirm (pay at the appointment)', ()=>{ S.svc=inst.id; S.sheet='flow'; S.step='who'; S.slot=slotsFor(inst,0)[1]; S.recovered=true; who(); }, inst.payNow?'Opening checkout is not payment. The booking stays held while the payment processes and is confirmed only when payment is received. Try Declined and Slow under Simulate.':'Confirmed with payment due at the appointment: booking and payment are shown as separate states.','ex']);
  }
  if(req){
    STEPS.push(['Request: preferred times', ()=>{ S.svc=req.id; S.sheet='flow'; fill(req); }, `“${req.cta}” collects what ${T.talent.first} needs to decide. It is a request, never a booking.`,'ex']);
    STEPS.push(['Request sent (not confirmed)', ()=>{ S.svc=req.id; fill(req); S.sheet='done'; }, 'Pending, not confirmed; nothing charged until accepted. The request also appears in the chat thread.','ex']);
  }
  if(quo && quo!==req){
    STEPS.push([quo.mode==='quote'?'Quote brief':'Inquiry form', ()=>{ S.svc=quo.id; S.sheet='flow'; fill(quo); }, `“${quo.cta}” opens a short brief with the questions this service needs. No price is promised.`,'ex']);
    STEPS.push([quo.mode==='quote'?'Quote requested':'Question sent', ()=>{ S.svc=quo.id; fill(quo); S.sheet='done'; }, 'Nothing is charged. The talent replies with a quote or an answer in the chat.','ex']);
  }
  (T.journey||[]).forEach(j=>STEPS.push(j));
  STEPS.push(['360 check', ()=>{ G.dev='360'; }, 'At 360 px long names wrap and never truncate; targets stay 44 px; one bottom control.','ex']);
  STEPS.push(['Desktop 1440', ()=>{ G.dev='1440'; }, 'The same markup at 1440: sheets become a side panel and the chat a floating panel beside it.','ex']);
  function renderSteps(){ $('#rv-steps').innerHTML=STEPS.map((s,i)=>`<li><button data-i="${i}" aria-current="${G.step===i}"><i>${String(i+1).padStart(2,'0')}</i><span>${esc(s[0])}</span></button></li>`).join(''); }
  function renderNote(){ const s=STEPS[G.step]||STEPS[0]; const lab={ex:'Existing engine',sim:'Simulated',prop:'Proposed',gap:'Engine gap'}[s[3]]; $('#rv-note').innerHTML=`<span class="rv-tag ${s[3]}">${lab}</span><span><b>${esc(s[0])}.</b> ${esc(s[2])}</span>`; }
  function jump(i){
    G.step=i; S=S0(); const prevDev=G.dev;
    if(STEPS[i][0]!=='360 check' && STEPS[i][0]!=='Desktop 1440' && G.dev!=='390' && i===0) G.dev='390';
    STEPS[i][1](S);
    document.querySelectorAll('#rv-dev button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.d===G.dev));
    if(!S.sheet) $('#vp').scrollTop=0;
    layout(); render();
  }

  /* ── use this design ── */
  function useModal(){
    const p=G.cust?'Custom '+G.cust:T.palettes[G.pal].n, st=T.starter||{services:T.services.length, faqs:4, texts:6};
    $('#rv-modal').innerHTML=`<div class="rv-mbg" data-m="x"><div class="rv-modal" role="dialog" aria-label="Use the ${esc(T.theme)} design">
      <div class="mh"><h3>Usar el diseño ${esc(T.theme)}</h3><p>Paleta ${esc(p)}. Se aplica a un borrador; tu sitio publicado no cambia hasta que publiques.</p></div>
      <div class="mb"><div class="rv-two"><div><b>Cambia</b><ul><li>Tipografía, colores y espacios</li><li>Orden y estilo de las secciones</li><li>Estilo de tu menú de servicios</li></ul></div><div><b>Se queda igual</b><ul><li>Tus servicios, precios y fotos</li><li>Reglas de reserva, pagos y horarios</li><li>Chat, reseñas y clientes</li></ul></div></div>
      <details class="rv-imp"><summary><span>Contenido de ejemplo <small>Opcional · no se agrega si no lo eliges</small></span></summary><div class="ib"><p style="margin:0">Todo entra como <b>borrador oculto</b>. Nada aparece en tu sitio hasta que lo revises. Las fotos de la demo no se copian.</p>
        <label><input type="checkbox"> <span><b>${st.services} servicios</b> con precio y duración sugeridos. Si ya tienes uno igual, se omite.</span></label>
        <label><input type="checkbox"> <span><b>${st.faqs} preguntas frecuentes</b></span></label>
        <label><input type="checkbox"> <span><b>${st.texts} textos de sección</b></span></label>
        <button class="rv-btn" data-m="imp" style="justify-self:start">Agregar lo elegido como borrador</button></div></details></div>
      <div class="mf"><button class="rv-btn" data-m="x">Cancelar</button><button class="rv-btn pri" data-m="apply">Aplicar diseño al borrador</button></div></div></div>`;
  }
  $('#rv-modal').addEventListener('click', e=>{
    const b=e.target.closest('[data-m]'); if(!b) return; if(b.classList.contains('rv-mbg') && e.target!==b) return;
    const m=b.dataset.m; if(m==='imp'){ rtoast('Contenido agregado como borrador oculto (simulado).'); return; }
    $('#rv-modal').innerHTML=''; if(m==='apply') rtoast('Diseño aplicado al borrador. Tu sitio publicado no cambió (simulado).');
  });
  function rtoast(m){ const d=document.createElement('div'); d.className='rv-toast'; d.textContent=m; document.body.appendChild(d); setTimeout(()=>d.remove(),3000); }

  /* ── docs tabs ── */
  const N=T.notes, TG={Exists:'ex','Existing widget':'ex',Simulated:'sim','New variant':'sim',Proposed:'prop','New widget':'prop','Section preset':'sim',App:'gap'};
  $('#rv-map').innerHTML=`<div><h2>Builder map</h2><p style="margin-top:6px">${esc(N.mapIntro||`Every section of ${T.theme} and the shared widget it uses. Proposed items are reusable extensions every theme can use, not theme-only widgets.`)}</p></div>
    <div class="rv-tw"><table><tr><th style="width:13%">Section</th><th style="width:15%">Shared widget</th><th style="width:17%">Layout variant</th><th style="width:20%">Talent can edit</th><th style="width:11%">Class</th><th>Note or extension</th></tr>
    ${N.map.map(r=>`<tr><td><b>${r[0]}</b></td><td><code>${r[1]}</code></td><td>${r[2]}</td><td>${r[3]||''}</td><td><span class="rv-tag ${TG[r[4]]||'ex'}">${r[4]}</span></td><td>${r[5]||''}</td></tr>`).join('')}</table></div>
    <div class="rv-cards">${[['Type',N.type],['Colour',N.colour],['Shape and motion',N.shape]].filter(x=>x[1]).map(([h,a])=>`<div class="rv-card"><h4>${h}</h4><ul>${a.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>`;
  $('#rv-img').innerHTML=`<div><h2>Images</h2><p style="margin-top:6px">All from Unsplash (free licence), preview only; demo photos are never copied into a talent’s site. ${esc(N.imgNote||'')}</p></div>
    <div class="rv-imgs">${N.images.map(i=>`<figure><img src="img/${i[0]}.jpg" alt="" loading="lazy"><figcaption><b>${esc(i[1])}</b>${esc(i[2]||'')}${i[3]?`<br><a href="https://unsplash.com/photos/${esc(i[3])}" target="_blank" rel="noopener">Unsplash source ↗</a>`:''}${i[4]?`<br>Used: ${esc(i[4])}`:''}</figcaption></figure>`).join('')}</div>
    <h3>Still needed for a finished demo</h3><div class="rv-tw"><table><tr><th>Subject</th><th>Crop</th><th>Count</th><th>Note</th></tr>${(N.needed||[]).map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]||''}</td></tr>`).join('')}</table></div>`;
  $('#rv-notes').innerHTML=`<div><h2>Reviewer notes</h2><p style="margin-top:6px">${esc(N.summary)}</p></div>
    <div class="rv-cards"><div class="rv-card"><h4>What makes ${esc(T.theme)} distinct</h4><ul>${N.distinct.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    ${(N.neighbours||[]).map(n=>`<div class="rv-card"><h4>vs ${esc(n[0])}</h4><p style="margin:0">${n[1]}</p></div>`).join('')}</div>
    <div class="rv-cards"><div class="rv-card"><h4>Booking modes on this site</h4><ul>${T.services.map(s=>`<li><b>${esc(s.name)}</b>: ${esc(s.mode)} · “${esc(s.cta)}”${s.payNow?' · pays online':''}</li>`).join('')}</ul></div>
    <div class="rv-card"><h4><span class="rv-tag sim">Simulated</span></h4><p style="margin:0">Talent replies, the checkout (test card 4242), taken times, uploads, submissions and the Use this design toasts. Nothing is saved or sent.</p></div>
    ${N.suits?`<div class="rv-card"><h4>Also suits (profession-flexible)</h4><ul>${N.suits.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:''}${N.sameContent?`<div class="rv-card"><h4>Same-content test</h4><p style="margin:0">${N.sameContent}</p></div>`:''}${N.matrix?`<div class="rv-card"><h4>Distinctness row</h4><ul>${N.matrix.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:''}${N.unsupported?`<div class="rv-card"><h4>Unsupported today</h4><ul>${N.unsupported.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:''}${N.questions?`<div class="rv-card"><h4>Open questions</h4><ul>${N.questions.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:''}${N.deviation?`<div class="rv-card"><h4>Where I changed the proposed direction</h4><p style="margin:0">${N.deviation}</p></div>`:''}</div>`;

  renderPals(); render(); layout();
  return {S:()=>S, G, render};
};
})();
