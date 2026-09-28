/**
 * reveal-runtime.ts — the inline scripts that drive the builder's entrance
 * ("reveal") animations on the PUBLIC site.
 *
 * Extracted from `render.tsx` for AUD-045 (2026-09-28). The live talent site
 * (book-jorgelina.tulala.digital, 390x844) left the hero h1 and every section
 * h2 at computed opacity 0 after a fresh load plus 4s idle: the hidden start
 * pose was applied and the only thing that could lift it was an
 * IntersectionObserver callback that, for whatever reason on that page, never
 * delivered. Content the visitor came for sat invisible, waiting.
 *
 * THE RULE THESE SCRIPTS NOW ENFORCE
 * ──────────────────────────────────
 * A section may animate in, but from a visible resting state; it is never left
 * at opacity 0 waiting for an observer. Concretely:
 *
 *   (a) Anything already in the viewport on load is revealed straight away by a
 *       direct geometry check (two animation frames after arming, so the
 *       entrance still plays from load), and again at DOMContentLoaded and at
 *       window load. The observer is not on the critical path for the fold.
 *   (b) The hidden pose is applied only AFTER the observer exists and is
 *       observing. No JS, a CSP block, no IntersectionObserver, or a throw
 *       while constructing it = the server-rendered, fully visible markup.
 *   (c) prefers-reduced-motion never arms: no hidden state at all.
 *   (d) Safety net: whatever is still hidden REVEAL_SAFETY_MS after the script
 *       armed is revealed unconditionally. (The renderer stylesheet carries a
 *       matching CSS backstop for the wrapper, so even a dead timer cannot
 *       leave text invisible.)
 *
 * These are plain string builders with no React or DOM dependency so the
 * tests can execute the exact bytes that ship inside a `vm` sandbox.
 */

/** Anything still hidden this long after arming is revealed regardless. */
export const REVEAL_SAFETY_MS = 1500;

/**
 * Shared JS fragment: is element `n` intersecting the viewport right now?
 * A throw (detached node, exotic host) counts as "yes": visible beats hidden.
 */
const IN_VIEW_FN =
  "function inView(n){try{var b=n.getBoundingClientRect();var h=window.innerHeight||(document.documentElement&&document.documentElement.clientHeight)||0;return b.bottom>0&&b.top<h;}catch(e){return true;}}";

/** Shared JS fragment: run `f` after two frames (or now, if frames are unavailable). */
const TWO_FRAMES_FN =
  "function twoFrames(f){var q=window.requestAnimationFrame;if(typeof q==='function'){q(function(){q(f);});}else{f();}}";

/**
 * The `reveal` wrapper's arming script. It travels INSIDE the node it animates
 * (the earlier `revealOnView` shipped dead because its runtime was never
 * injected on a published page), so markup and script cannot be separated.
 *
 * It only ever ARMS — sets `data-bn-reveal-armed`, which turns on the hidden
 * start pose in the renderer sheet — so when it never runs (no JavaScript, CSP,
 * the builder canvas's `dangerouslySetInnerHTML`, which does not execute
 * scripts) the content stays exactly as the server rendered it: visible.
 */
export function buildRevealArmingScript(config: {
  threshold: number;
  staggerMs: number;
  once: boolean;
}): string {
  const threshold = Number.isFinite(config.threshold)
    ? Math.min(1, Math.max(0, config.threshold))
    : 0.2;
  const stagger = Number.isFinite(config.staggerMs)
    ? Math.min(1000, Math.max(0, Math.round(config.staggerMs)))
    : 80;
  const once = config.once ? "1" : "0";
  return (
    "(function(){var s=document.currentScript;if(!s)return;var r=s.parentElement;if(!r)return;" +
    "if(!('IntersectionObserver' in window))return;" +
    // (c) reduced motion: never arm, so there is no hidden state to escape.
    "try{if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;}catch(e){return;}" +
    "var kids=[];for(var i=0;i<r.children.length;i++){var c=r.children[i];if(c!==s)kids.push(c);}if(!kids.length)return;" +
    `var once=${once}===1;var io=null;` +
    "function isIn(){return r.getAttribute('data-bn-reveal-in')==='1';}" +
    "function show(){r.setAttribute('data-bn-reveal-in','1');if(once&&io){try{io.disconnect();}catch(e){}}}" +
    // (b) observer FIRST. If it cannot be built, bail before anything hides.
    "try{io=new IntersectionObserver(function(es){for(var k=0;k<es.length;k++){var e=es[k];if(e.isIntersecting){show();if(once)return;}else if(!once){r.removeAttribute('data-bn-reveal-in');}}}," +
    `{threshold:${threshold}});io.observe(r);}catch(e){return;}` +
    `for(var j=0;j<kids.length;j++){kids[j].style.setProperty('--bn-reveal-stagger',(j*${stagger})+'ms');}` +
    "r.setAttribute('data-bn-reveal-armed','1');" +
    // (a) above the fold: reveal without waiting on the observer.
    IN_VIEW_FN +
    TWO_FRAMES_FN +
    "function check(){if(!isIn()&&inView(r))show();}" +
    "twoFrames(check);" +
    "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',check);}" +
    "window.addEventListener('load',check);" +
    // (d) safety net.
    `if(typeof setTimeout==='function')setTimeout(function(){if(!isIn())show();},${REVEAL_SAFETY_MS});` +
    "})();"
  );
}

/**
 * Both page-level scroll lanes (play-once `data-bn-anim-once`, and the older
 * `data-bn-reveal` style lane) are the same machine with different names: guard
 * flag, armed sheet, IntersectionObserver. One builder, so a fix to one lane
 * cannot skip the other.
 *
 * ARMING IS A STYLESHEET, NOT AN ATTRIBUTE. The runtime runs at
 * DOMContentLoaded, before React hydrates, so an attribute written onto a node
 * here is one the server never rendered (an unpatchable hydration mismatch).
 * Appending a <style> to <head> touches nothing React owns.
 *
 * The observer binds to EVERY node in the lane, present or future: entering
 * the builder swaps the canvas in place, so each section becomes a new DOM node
 * (2026-09-16: ten sections invisible). A MutationObserver re-binds new nodes;
 * a node already carrying `data-bn-revealed` was moved, not born, and is left
 * alone.
 *
 * AUD-045: nodes on screen at bind time are revealed by a direct geometry
 * check, and REVEAL_SAFETY_MS after binding the armed sheet is REMOVED, which
 * lifts the hidden pose off every node in the lane, present or future. After
 * that the lane simply renders at rest.
 */
export function buildScrollLaneRuntimeScript(lane: {
  /** window flag so the second/third sheet mount on a page does not re-bind. */
  flag: string;
  /** attribute that opts a node into the lane. */
  attr: string;
  /** attribute on the injected <style> that holds the hidden pose. */
  sheetAttr: string;
  /** the hidden pose, applied only to un-revealed nodes. */
  armedCss: string;
}): string {
  const sel = JSON.stringify(`[${lane.attr}]`);
  const sheetAttr = JSON.stringify(lane.sheetAttr);
  return `(function(){
  if(window.${lane.flag})return;
  window.${lane.flag}=1;
  var SEL=${sel};
  function run(){
    var io=null,armed=null,done=false;
    function disarm(){
      done=true;
      if(io){try{io.disconnect();}catch(e){}}
      var s2=document.querySelector('style['+${sheetAttr}+']');
      if(s2&&s2.parentNode)s2.parentNode.removeChild(s2);
      armed=null;
    }
    try{
      var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Reduced motion / no IntersectionObserver: never arm. The poses live in
      // the injected sheet, so skipping injection leaves every node at rest.
      if(reduce||typeof IntersectionObserver==='undefined')return;
      io=new IntersectionObserver(function(entries){
        for(var k=0;k<entries.length;k++){
          var e=entries[k];
          if(e.isIntersecting)reveal(e.target);
        }
      },{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
      ${IN_VIEW_FN}
      ${TWO_FRAMES_FN}
      function reveal(n){
        n.setAttribute('data-bn-revealed','');
        if(io){try{io.unobserve(n);}catch(e){}}
      }
      function arm(){
        if(armed||done)return;
        armed=document.createElement('style');
        armed.setAttribute(${sheetAttr},'');
        armed.textContent=${JSON.stringify(lane.armedCss)};
        document.head.appendChild(armed);
      }
      function watch(root){
        if(done||!root||root.nodeType!==1)return;
        var list=root.querySelectorAll(SEL);
        var own=root.matches&&root.matches(SEL);
        if(!own&&!list.length)return;
        var pending=[];
        if(own&&!root.hasAttribute('data-bn-revealed'))pending.push(root);
        for(var m=0;m<list.length;m++)if(!list[m].hasAttribute('data-bn-revealed'))pending.push(list[m]);
        // Observe FIRST, arm second: the hidden pose never exists without an
        // observer already watching the node it hides.
        for(var p=0;p<pending.length;p++)io.observe(pending[p]);
        arm();
        // Above the fold: reveal on geometry, do not wait for the observer.
        twoFrames(function(){
          for(var q=0;q<pending.length;q++){
            var n=pending[q];
            if(!n.hasAttribute('data-bn-revealed')&&inView(n))reveal(n);
          }
        });
      }
      watch(document.body);
      if(typeof MutationObserver!=='undefined'){
        new MutationObserver(function(recs){
          for(var r=0;r<recs.length;r++){
            var added=recs[r].addedNodes;
            for(var a=0;a<added.length;a++)watch(added[a]);
          }
        }).observe(document.body,{childList:true,subtree:true});
      }
      // Safety net: nothing stays hidden waiting for an observer.
      if(typeof setTimeout==='function')setTimeout(disarm,${REVEAL_SAFETY_MS});
    }catch(err){
      // Anything went wrong: drop the poses so the content is visible.
      disarm();
    }
  }
  // The runtime ships with the SHEET, which is emitted in head order -- so at
  // execution time the body it needs to query does not exist yet. Wait for it.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',run);
  }else{
    run();
  }
})();`;
}
