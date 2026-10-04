/**
 * In-page analysis. `analyze` runs inside the browser (Playwright serialises it), so it
 * must stay self-contained: no imports, no module-scope references. Read-only: the only
 * DOM change is a `data-parity-shot` attribute used to find elements for screenshots.
 *
 * args: { sections, order, locale, side: "product" | "mockup", rootSel, denyEs, denyAccent,
 *         textMap, narrow }
 */
export function analyze(args) {
  const { sections, order, locale, side, textMap, denyEs, denyAccent } = args;
  const root = (side === "mockup" ? document.querySelector(args.rootSel) : null) || document;
  const vw = side === "mockup" ? (document.querySelector(args.rootSel) || document.documentElement).clientWidth : window.innerWidth;

  const visible = (el) => {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const qsa = (scope, sel) => Array.from(scope.querySelectorAll(sel));
  const vis = (scope, sel) => qsa(scope, sel).filter(visible);
  const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const rx = (key) => new RegExp(textMap[key] || key, "i");

  // ---------- resolution ----------
  // Product side: by data-parity-key (the slotKey contract). Only a page with NO key at all
  // (a build that predates the contract) falls back to the map's legacy selectors.
  // Mockup side: by its data-w unit, then the map's own selectors.
  const hasKeys = side === "product" && document.querySelector("[data-parity-key]") !== null;
  const firstVisible = (sel) => {
    let all;
    try { all = qsa(root, sel); } catch { return null; }
    return all.find(visible) || all[0] || null;
  };
  const resolve = (sec) => {
    const tries = [];
    if (side === "mockup" && sec.group && sec.group.length) {
      // one product section = several contiguous mockup siblings: wrap them in a measuring box
      const els = sec.group.map(firstVisible);
      const parent = els[0] && els[0].parentElement;
      if (els.every(Boolean) && els.every((e) => e.parentElement === parent)) {
        const wrap = document.createElement("div");
        wrap.setAttribute("data-parity-wrap", sec.key);
        parent.insertBefore(wrap, els[0]);
        const last = els[els.length - 1];
        const move = [];
        for (let c = wrap.nextElementSibling; c; c = c.nextElementSibling) { move.push(c); if (c === last) break; }
        move.forEach((c) => wrap.appendChild(c));
        return { el: wrap, via: "group:" + sec.group.join(" + ") };
      }
    }
    if (side === "mockup") {
      if (sec.unit) tries.push(`[data-w^="${sec.unit} ·"]`);
      tries.push(...(sec.mockup || []));
    } else if (hasKeys && sec.parityKey) {
      tries.push(`[data-parity-key="${sec.parityKey}"]`);
      // shell sections (header) may lack the key on some designs: still measure them through the map fallback
      if (/^(header|footer|footer_rich|socket)$/.test(sec.parityKey)) tries.push(...(sec.fallback || []));
    } else {
      tries.push(...(sec.fallback || []));
    }
    for (const t of tries) {
      const el = firstVisible(t);
      if (el) return { el, via: t };
    }
    return { el: null, via: null };
  };

  // ---------- geometry helpers ----------
  const inter = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const label = (el) => {
    const t = txt(el).slice(0, 36);
    return `<${el.tagName.toLowerCase()}>${t ? ` "${t}"` : el.getAttribute("aria-label") ? ` [${el.getAttribute("aria-label")}]` : ""}`;
  };
  const hasOwnText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const clipAncestor = (el, stop) => {
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(o.overflowX) && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };

  function layoutChecks(scope, kind) {
    const out = [];
    // overlap: interactive vs interactive/text, neither containing the other
    const inter_ = vis(scope, "a, button, input, textarea, select, [role=button]").filter((e) => !e.closest("[aria-hidden=true]")).slice(0, 120);
    const texts = vis(scope, "h1, h2, h3, h4, p, li, summary, label, q, figcaption, small").filter(hasOwnText).slice(0, 160);
    const seen = new Set();
    const pairs = [];
    const consider = (a, b) => {
      if (a === b || a.contains(b) || b.contains(a)) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const area = inter(ra, rb);
      if (area < 16) return;
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (area / small < 0.2) return;
      // ignore animated marquee / sticky layers
      const k = [label(a), label(b)].sort().join(" x ");
      if (seen.has(k)) return;
      seen.add(k);
      pairs.push(k);
    };
    for (let i = 0; i < inter_.length; i++) {
      for (let j = i + 1; j < inter_.length; j++) consider(inter_[i], inter_[j]);
      for (const t of texts) consider(inter_[i], t);
    }
    out.push({ name: "no overlapping interactive/text", ok: pairs.length === 0, detail: pairs.slice(0, 4).join("; ") });

    // horizontal overflow
    const so = scope === document.documentElement ? scope : scope;
    const overs = [];
    if (so.scrollWidth > so.clientWidth + 1 && !/(auto|scroll)/.test(getComputedStyle(so).overflowX)) overs.push(`section scrollWidth ${so.scrollWidth} > ${so.clientWidth}`);
    const sr = so.getBoundingClientRect();
    for (const e of qsa(scope, "*")) {
      if (overs.length > 3) break;
      if (!visible(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.right > vw + 1.5 && r.right > sr.right + 1.5 && !clipAncestor(e, scope.parentElement) && getComputedStyle(e).position !== "fixed") overs.push(`${label(e)} right ${Math.round(r.right)} > ${vw}`);
    }
    out.push({ name: "no horizontal overflow", ok: overs.length === 0, detail: overs.slice(0, 3).join("; ") });

    // clipped text
    const clipped = [];
    for (const e of qsa(scope, "h1, h2, h3, h4, p, a, button, span, li, summary, small, label")) {
      if (!visible(e) || !hasOwnText(e)) continue;
      const cs = getComputedStyle(e);
      if (cs.overflowX === "visible" && cs.overflow === "visible") continue;
      if (cs.textOverflow === "ellipsis") continue;
      if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 8) clipped.push(`${label(e)} ${e.scrollWidth}>${e.clientWidth}`);
    }
    out.push({ name: "no clipped text", ok: clipped.length === 0, detail: clipped.slice(0, 3).join("; ") });
    return out;
  }

  function structureChecks(el, expects) {
    const out = [];
    for (const x of expects) {
      let ok = false, detail = "";
      if (x.minWidth && vw < x.minWidth) continue;
      if (x.kind === "sel") {
        const n = vis(el, x.sel).length;
        ok = n >= (x.min || 1) || (x.alt ? vis(el, x.alt).length >= 1 : false);
        detail = ok ? "" : `found ${n}, need ${x.min || 1} (${x.sel})`;
      } else if (x.kind === "text") {
        ok = rx(x.re).test(txt(el));
        detail = ok ? "" : `no text matching ${x.re}`;
      } else if (x.kind === "countText") {
        const n = vis(el, x.sel).filter((e) => rx(x.re).test(txt(e))).length;
        ok = n >= x.min;
        detail = ok ? "" : `found ${n}, need ${x.min}`;
      } else if (x.kind === "eyebrow") {
        const h1 = el.querySelector("h1");
        let found = null;
        if (h1) {
          const leaves = qsa(el, "*").filter((e) => visible(e) && e.children.length === 0 && /\S/.test(e.textContent));
          for (const l of leaves) {
            if (l === h1 || h1.contains(l)) break;
            const t = txt(l);
            if (t.length >= 3 && t.length <= 90 && !l.closest("a, button")) found = l;
          }
        }
        ok = !!found;
        detail = ok ? "" : "no short text line above the headline";
      } else if (x.kind === "ctaPair") {
        const h1 = el.querySelector("h1");
        const acts = vis(el, "a, button").filter((a) => !/(hoy|today|pr[oó]xim|next)/i.test(txt(a)) && txt(a).length > 2 && txt(a).length < 40);
        const after = h1 ? acts.filter((a) => h1.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) : acts;
        ok = after.length >= 2;
        detail = ok ? "" : `found ${after.length} actions after the headline`;
      }
      // optional: data the demo may legitimately lack (no phone number, no domain): absent is expected, not a gap
      if (x.optional && !ok) { ok = true; detail = ""; }
      out.push({ name: x.name, ok, detail });
    }
    return out;
  }

  function styleOf(el) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { ff: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase(), fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10) || 400, color: cs.color, bg: cs.backgroundColor, ls: cs.letterSpacing, tt: cs.textTransform };
  }
  function styleSample(key, el) {
    const s = {};
    if (key === "hero") {
      const h1 = el.querySelector("h1");
      let eb = null;
      if (h1) for (const l of qsa(el, "*").filter((e) => visible(e) && e.children.length === 0 && /\S/.test(e.textContent))) { if (l === h1 || h1.contains(l)) break; if (!l.closest("a, button") && txt(l).length >= 3 && txt(l).length <= 90) eb = l; }
      s.eyebrow = styleOf(eb);
      s.headline = styleOf(h1);
      const btns = vis(el, "a, button").filter((a) => txt(a).length > 2 && txt(a).length < 40 && !/(hoy|today|pr[oó]xim|next)/i.test(txt(a)));
      const solid = btns.find((b) => { const bg = getComputedStyle(b).backgroundColor; return bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"; });
      s.button = styleOf(solid || btns[0]);
    } else if (key !== "header" && key !== "socket") {
      s.heading = styleOf(el.querySelector("h2") || el.querySelector("h3"));
    }
    return s;
  }

  // Measurements the gap report compares (read-only; plain numbers and short strings).
  function metrics(el) {
    const r = el.getBoundingClientRect();
    const bgOf = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c; } return "rgb(255, 255, 255)"; };
    const cs = getComputedStyle(el);
    const heads = vis(el, "h1, h2, h3").slice(0, 8).map((h) => ({ tag: h.tagName.toLowerCase(), text: txt(h).slice(0, 60), ...styleOf(h) }));
    const p0 = vis(el, "p").find((e) => txt(e).length > 20);
    const img0 = vis(el, "img")[0];
    const ir = img0 ? img0.getBoundingClientRect() : null;
    return {
      h: Math.round(r.height),
      w: Math.round(r.width),
      imgs: vis(el, "img").length,
      buttons: vis(el, "button, [role=button]").length,
      links: vis(el, "a").length,
      headings: heads,
      para: p0 ? styleOf(p0) : null,
      bg: bgOf(el),
      padTop: parseFloat(cs.paddingTop) || 0,
      padBottom: parseFloat(cs.paddingBottom) || 0,
      img0: ir ? { w: Math.round(ir.width), h: Math.round(ir.height) } : null,
      textLen: txt(el).length,
    };
  }

  // ---------- run ----------
  const res = { sections: {}, page: { keyed: hasKeys } };
  const found = [];
  for (const sec of sections) {
    const { el, via } = resolve(sec);
    // an optional section that renders as an empty, zero-height shell is absent (e.g. the alert band with the talent's setting off)
    if (el && side === "product" && sec.optional && el.getBoundingClientRect().height < 2) { res.sections[sec.key] = { present: false, optional: true }; continue; }
    if (!el) {
      res.sections[sec.key] = { present: false, optional: !!sec.optional };
      continue;
    }
    el.setAttribute("data-parity-shot", sec.key);
    found.push({ key: sec.key, el });
    const text = txt(el);
    const r = el.getBoundingClientRect();
    const i18n = [];
    if (locale === "es") {
      const hits = denyEs.filter((w) => new RegExp(`(^|[^A-Za-zÀ-ÿ])${w}([^A-Za-zÀ-ÿ]|$)`).test(text));
      i18n.push({ name: "no English UI strings", ok: hits.length === 0, detail: hits.slice(0, 5).join(", ") });
      const acc = denyAccent.filter((w) => new RegExp(`(^|[^A-Za-zÀ-ÿ])${w}([^A-Za-zÀ-ÿ]|$)`).test(text));
      i18n.push({ name: "place names keep accents", ok: acc.length === 0, detail: acc.join(", ") });
    }
    if (locale === "es") {
      const vos = text.match(/(^|[^A-Za-zÀ-ÿ])(Elegí|Podés|Querés|Tenés|Reservá|Escribí|Mandá|Seleccioná|Agregá|Contanos|Decime)(?![A-Za-zÀ-ÿ])/g) || [];
      i18n.push({ name: "neutral Spanish (no voseo)", ok: vos.length === 0, detail: Array.from(new Set(vos.map((v) => v.trim()))).join(", ") });
    }
    i18n.push({ name: 'no "Antes / Después" slash labels', ok: !/(antes\s*\/\s*despu[eé]s|before\s*\/\s*after)/i.test(text), detail: "" });
    res.sections[sec.key] = {
      present: true,
      via,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      structure: structureChecks(el, sec.expects),
      layout: layoutChecks(el),
      i18n,
      style: styleSample(sec.key, el),
      metrics: metrics(el),
    };
  }
  // order: document order must follow `order`
  let prev = null;
  for (const key of order) {
    const f = found.find((x) => x.key === key);
    if (!f) continue;
    const bad = prev && !(prev.el.compareDocumentPosition(f.el) & Node.DOCUMENT_POSITION_FOLLOWING) && !prev.el.contains(f.el) && !f.el.contains(prev.el);
    res.sections[key].order = { ok: !bad, detail: bad ? `${key} appears before ${prev.key}` : "" };
    prev = f;
  }

  // ---------- page level ----------
  const page = res.page;
  page.lang = document.documentElement.lang || "";
  const de = document.documentElement;
  page.docOverflow = side === "product" ? de.scrollWidth > window.innerWidth + 1 : false;
  page.docOverflowDetail = `${de.scrollWidth} > ${window.innerWidth}`;
  // anchors
  const broken = [];
  for (const a of qsa(root, "a[href^='#']")) {
    const h = a.getAttribute("href");
    if (!h || h === "#" || h.length < 2) continue;
    const id = decodeURIComponent(h.slice(1));
    if (!document.getElementById(id) && !document.getElementsByName(id).length) broken.push(h);
  }
  page.brokenAnchors = Array.from(new Set(broken));
  // header rows
  const hdr = (found.find((f) => f.key === "header") || {}).el;
  if (hdr) {
    // controls only (a logo with a stacked tagline is one item, not two rows)
    const ctl = qsa(hdr, "a, button, [role=button]").filter((e) => visible(e) && !e.closest("[hidden], [aria-hidden=true]"));
    const items = ctl.filter((e) => !ctl.some((o) => o !== e && e.contains(o)));
    const tops = items.map((e) => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2); }).sort((a, b) => a - b);
    const rows = [];
    for (const t of tops) if (!rows.length || t - rows[rows.length - 1] > 12) rows.push(t);
    page.headerRows = rows.length;
  }
  // fixed layers: bottom bars, chat launchers, and whether they overlap each other
  const inView = (r) => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  const hiddenByState = "[aria-hidden=true], [data-gone=true], [data-show=false]";
  const fixedAll = qsa(document, "body *").filter((e) => {
    if (!visible(e) || e.closest(hiddenByState)) return false;
    if (getComputedStyle(e).position !== "fixed") return false;
    const r = e.getBoundingClientRect();
    if (!(inView(r) && r.width > 24 && r.height > 24)) return false;
    // a fixed wrapper whose only content is hidden (e.g. a launcher that yields) is not a layer
    const live = qsa(e, "a, button, img, svg, [role=button]").some((n) => visible(n) && !n.closest(hiddenByState));
    return live || (hasOwnText(e) && txt(e).length > 1);
  });
  const fixedTop = fixedAll.filter((e) => !fixedAll.some((o) => o !== e && o.contains(e)));
  page.fixedBottomBars = fixedTop
    .filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > window.innerHeight - 140 && r.height < 200 && r.width > Math.min(240, window.innerWidth * 0.5); })
    .map((e) => label(e));
  const launch = qsa(document, "[data-guest-chat-launcher], [data-guest-chat-fab], .tl-fab, .chatb").filter(visible).filter((e) => !e.closest(hiddenByState));
  page.chatLaunchers = launch.filter((e) => !launch.some((o) => o !== e && o.contains(e))).map((e) => label(e));
  page.fixedOverlaps = [];
  for (let i = 0; i < fixedTop.length; i++) {
    for (let j = i + 1; j < fixedTop.length; j++) {
      if (inter(fixedTop[i].getBoundingClientRect(), fixedTop[j].getBoundingClientRect()) > 16) page.fixedOverlaps.push(`${label(fixedTop[i])} x ${label(fixedTop[j])}`);
    }
  }
  page.extraSections = ["before-after", "aftercare", "contact", "visit", "comp_card"].filter((id) => document.getElementById(id));
  return res;
}
