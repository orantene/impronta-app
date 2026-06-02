"use client";
/* eslint-disable @next/next/no-img-element -- bespoke template uses plain <img> with local, pre-sized assets for full layout control */

/**
 * FLAGSHIP bespoke one-pager — "Atelier Aero" (Model · Private Flight Attendant).
 *
 * The most luxurious template in the set: a dark, jet-set palette (midnight +
 * champagne/platinum), a Model ⇄ Private-Flight DISCIPLINE SWITCHER that flips
 * the hero, offer, and accent, plus flight-specific luxe sections (service
 * tiers, languages & certifications, a destinations strip, a discretion note)
 * and an editorial "experience" band. Discreet, by-referral booking.
 *
 * Engine-ready: data-driven; the page builder swaps content + imagery.
 * Imagery: /public/talent-templates/demo/{model,aviation}.
 */
import { useEffect, useMemo, useRef, useState } from "react";

const M = "/talent-templates/demo/model";
const A = "/talent-templates/demo/aviation";

const ig = "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.2.4.4 1 .4 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.2-1 .4-2.2.4-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-1-.4-.4-.7-.8-1-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.6A6.2 6.2 0 1 0 12 18.2 6.2 6.2 0 0 0 12 5.8Zm0 10.2A4 4 0 1 1 12 8a4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z";
const waPath = "M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5c-.2.2-.3.4-.1.6.5.8 1 1.4 1.7 1.9.6.4 1 .6 1.3.7.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.6-.1 1.1Z";
const ICON_MODEL = "M12 3l1.9 5.2 5.6.1-4.5 3.4 1.7 5.3L12 14.9 7.3 17l1.7-5.3L4.5 8.3l5.6-.1z";
const ICON_FLIGHT = "M21 15.5v-2L13 9V3.6a1.5 1.5 0 0 0-3 0V9l-8 4.5v2l8-2.4V18l-2 1.4v1.6l3.5-1 3.5 1v-1.6L13 18v-4.9l8 2.4z";

type Disc = {
  key: string;
  short: string;
  label: string;
  accent: string;
  accentInk: string;
  hero: string;
  tagline: string;
  sub: string;
  cta: string;
  intro: string;
  services: { title: string; desc: string; img: string }[];
  offer: { heading: string; note: string; items: { name: string; meta: string; detail?: string }[] };
  chips: { label: string; items: string[] }[];
  gallery: string[];
};

const CAMILA = {
  name: "Camila Solís",
  mark: "CS",
  roleLine: "Model · Private Flight Attendant",
  location: "Based in Mexico City · flying worldwide",
  marquee: ["Discreet", "Multilingual", "Worldwide", "On-call", "NDA on request", "By referral"],
  about: [
    "Camila moves between two rarefied worlds — the front row and the front cabin. A face brands build campaigns around, and the calm, impeccable presence a principal trusts at 45,000 feet.",
    "Whether it’s a cover or a charter, the brief is the same: make the extraordinary look effortless.",
  ],
  stats: [
    { n: "60+", l: "Countries flown" },
    { n: "8 yrs", l: "Cabin & runway" },
    { n: "5", l: "Languages" },
    { n: "24/7", l: "On-call" },
  ],
  experience: { img: `${A}/05-service.jpg`, line: "Wheels up in two hours. Everything — handled." },
  destinations: ["New York", "Paris", "Dubai", "Tulum", "Aspen", "Ibiza", "Tokyo", "Los Cabos", "London", "Mykonos"],
  disciplines: [
    {
      key: "model", short: "Model", label: "model", accent: "#c9a56a", accentInk: "#14110a",
      hero: `${M}/01-hero.jpg`, tagline: "The face of the campaign.",
      sub: "International runway, editorial, and campaign work — a face brands build a whole season around.",
      cta: "Book a shoot", intro: "Runway · editorial · campaign",
      services: [
        { title: "Runway", desc: "Fashion weeks, couture shows, and presentations.", img: `${M}/03-runway.jpg` },
        { title: "Editorial", desc: "Covers, spreads, and luxury brand stories.", img: `${M}/05-editorial.jpg` },
        { title: "Campaign", desc: "Global campaigns, lookbooks, and brand films.", img: `${M}/02-gown.jpg` },
      ],
      offer: { heading: "Digitals", note: "Full book & polaroids on request", items: [
        { name: "Height", meta: "179 cm" }, { name: "Bust · Waist · Hips", meta: "84 · 60 · 88" },
        { name: "Shoe · Hair · Eyes", meta: "40 · Brunette · Hazel" }, { name: "Dress", meta: "EU 34 / US 2" },
      ] },
      chips: [{ label: "Represented", items: ["IMG", "Next", "Elite", "Direct bookings"] }],
      gallery: [`${M}/02-gown.jpg`, `${M}/04-runway.jpg`, `${M}/06-runway.jpg`, `${M}/09-editorial.jpg`, `${M}/07-runway.jpg`, `${M}/11-runway.jpg`, `${M}/10-editorial.jpg`, `${M}/05-editorial.jpg`],
    },
    {
      key: "flight", short: "Private Flight", label: "private flight attendant", accent: "#a9c0d0", accentInk: "#0e1419",
      hero: `${A}/01-cabin.jpg`, tagline: "Wheels up. Everything handled.",
      sub: "Private cabin service for owners, charter operators, and VIP clients — discreet, multilingual, and impeccable at altitude.",
      cta: "Request availability", intro: "Private cabin · VIP · charter",
      services: [
        { title: "Owner & VIP cabins", desc: "Full in-flight service tailored to the principal’s standards.", img: `${A}/02-cabin.jpg` },
        { title: "Catering & wine", desc: "Sourcing, plating, and service of bespoke menus on board.", img: `${A}/06-dining.jpg` },
        { title: "Trip logistics", desc: "Pre-flight setup, provisioning, and discreet on-ground coordination.", img: `${A}/08-tarmac.jpg` },
      ],
      offer: { heading: "Service tiers", note: "Day rate + per-diem · by quote", items: [
        { name: "Day trip", meta: "by quote", detail: "Single-day, round-trip cabin service" },
        { name: "Multi-leg", meta: "by quote", detail: "Multi-day itineraries, fully provisioned" },
        { name: "Residency", meta: "by quote", detail: "Dedicated crew for a season or owner" },
      ] },
      chips: [
        { label: "Languages", items: ["Spanish", "English", "French", "Italian", "Portuguese"] },
        { label: "Certified", items: ["EASA Cabin Crew", "First Aid / AED", "Food & Wine Service", "Safety & Emergency"] },
      ],
      gallery: [`${A}/03-cabin.jpg`, `${A}/04-seats.jpg`, `${A}/05-service.jpg`, `${A}/06-dining.jpg`, `${A}/07-flight.jpg`, `${A}/02-cabin.jpg`, `${A}/12-flight.jpg`, `${A}/08-tarmac.jpg`],
    },
  ] as Disc[],
  portrait: `${A}/09-her.jpg`,
  reviews: [
    { quote: "The most composed, anticipatory crew member we’ve flown with. The principal asks for her by name.", author: "Charter operator", tag: "Private Flight" },
    { quote: "A dream on set — professional, magnetic, and completely reliable. We re-booked for the campaign.", author: "Luxury maison", tag: "Model" },
    { quote: "Discretion, taste, and calm under pressure. Exactly who you want at the front of the cabin.", author: "Private client", tag: "Private Flight" },
  ],
  socials: { instagram: "https://instagram.com", whatsapp: "https://wa.me/520000000000", email: "mailto:camila@ateliero.com" },
};

function Stroke({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function Fill({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={d} /></svg>;
}
const DISC_ICON = [ICON_MODEL, ICON_FLIGHT];

export function AviatrixTemplate() {
  const c = CAMILA;
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [lb, setLb] = useState<number | null>(null);
  const d = c.disciplines[active];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal");
    if (!els) return;
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.13 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [active]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (lb !== null && e.key === "ArrowRight") setLb((i) => (i === null ? 0 : (i + 1) % d.gallery.length));
      if (lb !== null && e.key === "ArrowLeft") setLb((i) => (i === null ? 0 : (i - 1 + d.gallery.length) % d.gallery.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb, d.gallery.length]);

  const rootStyle = useMemo(() => ({ ["--accent"]: d.accent, ["--accent-ink"]: d.accentInk } as React.CSSProperties), [d.accent, d.accentInk]);
  const pick = (i: number) => { setActive(i); setLb(null); setMenuOpen(false); };

  return (
    <div className="av-page" ref={root} style={rootStyle}>
      <style>{CSS}</style>

      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-in">
          <a href="#top" className="brand"><span className="brand-mark">{c.mark}</span><span className="brand-name">{c.name}</span></a>
          <div className="switcher" role="tablist" aria-label="Choose">
            {c.disciplines.map((x, i) => (
              <button key={x.key} role="tab" aria-selected={i === active} className={`sw-pill ${i === active ? "on" : ""}`} onClick={() => pick(i)} style={i === active ? { background: x.accent, color: x.accentInk, borderColor: x.accent } : undefined}>
                <Stroke d={DISC_ICON[i]} size={15} /><span>{x.short}</span>
              </button>
            ))}
          </div>
          <div className="nav-right">
            <a className="btn btn-sm btn-primary" href="#enquire">Private enquiry</a>
            <button className="burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}><span /><span /><span /></button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {c.disciplines.map((x, i) => <button key={x.key} className={`sw-pill ${i === active ? "on" : ""}`} onClick={() => pick(i)}><Stroke d={DISC_ICON[i]} size={15} /><span>{x.short}</span></button>)}
            <a className="btn btn-primary" href="#enquire" onClick={() => setMenuOpen(false)}>Private enquiry</a>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        {c.disciplines.map((x, i) => <div key={x.key} className={`hero-slide ${i === active ? "on" : ""}`} style={{ backgroundImage: `url(${x.hero})` }} />)}
        <div className="hero-scrim" />
        <div className="hero-in">
          <div className="eyebrow">{c.roleLine}</div>
          <div className="hero-switch">
            {c.disciplines.map((x, i) => (
              <button key={x.key} className={`sw-pill lg ${i === active ? "on" : ""}`} onClick={() => pick(i)} style={i === active ? { background: x.accent, color: x.accentInk, borderColor: x.accent } : undefined}>
                <Stroke d={DISC_ICON[i]} size={17} /><span>{x.short}</span>
              </button>
            ))}
          </div>
          <h1 className="serif hero-title" key={d.key}>{d.tagline}</h1>
          <p className="hero-sub">{d.sub}</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#enquire">{d.cta}</a>
            <a className="btn btn-ghost btn-lg" href="#offer">Explore {d.short.toLowerCase()}</a>
          </div>
        </div>
        <div className="hero-tag"><span className="tag-dot" /> By referral · discretion assured</div>
      </section>

      {/* MARQUEE */}
      <div className="marquee"><div className="marquee-track">{[...c.marquee, ...c.marquee].map((m, i) => <span key={i}>{m}<i>✦</i></span>)}</div></div>

      {/* OFFER (swaps) */}
      <section className="section offer" id="offer">
        <div className="offer-inner" key={d.key}>
          <div className="sec-head reveal"><div className="eyebrow">As a {d.label}</div><h2 className="serif h2">{d.intro}</h2></div>
          <div className="svc-grid">
            {d.services.map((s) => (
              <article key={s.title} className="svc reveal"><div className="svc-img"><img src={s.img} alt={s.title} /></div><h3 className="serif svc-title">{s.title}</h3><p className="muted">{s.desc}</p></article>
            ))}
          </div>
          <div className="offer-split">
            <div className="price-card reveal">
              <div className="price-head"><span className="serif">{d.offer.heading}</span><span className="price-note">{d.offer.note}</span></div>
              <ul className="price-list">{d.offer.items.map((it) => <li key={it.name}><div><div className="pi-name">{it.name}</div>{it.detail ? <div className="pi-detail">{it.detail}</div> : null}</div><span className="pi-meta">{it.meta}</span></li>)}</ul>
              <a className="btn btn-primary btn-block" href="#enquire">{d.cta}</a>
            </div>
            <div className="chips-card reveal">
              {d.chips.map((g) => (
                <div key={g.label} className="chip-group">
                  <div className="chip-label">{g.label}</div>
                  <div className="chip-row">{g.items.map((x) => <span key={x} className="chip">{x}</span>)}</div>
                </div>
              ))}
              {d.key === "flight" ? (
                <div className="chip-group">
                  <div className="chip-label">Destinations</div>
                  <div className="chip-row">{c.destinations.slice(0, 8).map((x) => <span key={x} className="chip ghost">{x}</span>)}</div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="gal-grid">
            {d.gallery.map((g, i) => <button key={i} className={`gal-item reveal g${i % 5}`} onClick={() => setLb(i)}><img src={g} alt={`${d.short} ${i + 1}`} /></button>)}
          </div>
        </div>
      </section>

      {/* EXPERIENCE BAND */}
      <section className="exp-band" style={{ backgroundImage: `linear-gradient(rgba(10,11,15,.45),rgba(10,11,15,.72)), url(${c.experience.img})` }}>
        <div className="exp-in reveal"><div className="eyebrow">The experience</div><h2 className="serif exp-line">{c.experience.line}</h2></div>
      </section>

      {/* ABOUT */}
      <section className="section about" id="about">
        <div className="about-media reveal"><img src={c.portrait} alt={c.name} /></div>
        <div className="about-copy reveal">
          <div className="eyebrow">The woman</div>
          <h2 className="serif h2">{c.name}</h2>
          {c.about.map((p, i) => <p key={i} className="lede">{p}</p>)}
          <div className="ab-stats">{c.stats.map((s) => <div key={s.l} className="ab-stat"><span className="serif">{s.n}</span><i>{s.l}</i></div>)}</div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section reviews">
        <div className="sec-head reveal"><div className="eyebrow">In confidence</div><h2 className="serif h2">What they say</h2></div>
        <div className="rev-grid">
          {c.reviews.map((r, i) => <figure key={i} className="rev reveal"><span className="rev-tag">{r.tag}</span><blockquote className="serif">“{r.quote}”</blockquote><figcaption>{r.author}</figcaption></figure>)}
        </div>
      </section>

      {/* ENQUIRE */}
      <section className="section enquire" id="enquire">
        <div className="enq-grid">
          <div className="enq-copy reveal">
            <div className="eyebrow">Private enquiry</div>
            <h2 className="serif h2">By referral, or by request.</h2>
            <p className="lede">Share the dates, the route or the brief. Enquiries are handled personally and in confidence — an NDA is available on request.</p>
            <div className="enq-actions">
              <a className="btn btn-primary btn-lg" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <a className="btn btn-ghost btn-lg" href={c.socials.email}>Email Camila</a>
            </div>
            <a className="ig-follow" href={c.socials.instagram} target="_blank" rel="noopener noreferrer"><Fill d={ig} size={18} /> @camila.solis</a>
          </div>
          <form className="enq-form reveal" onSubmit={(e) => e.preventDefault()}>
            <div className="field"><label>Name</label><input placeholder="Your name" /></div>
            <div className="field-row"><div className="field"><label>Service</label><select>{c.disciplines.map((x) => <option key={x.key}>{x.short}</option>)}<option>Both</option></select></div><div className="field"><label>Dates</label><input placeholder="Dec 2026" /></div></div>
            <div className="field"><label>Brief / route</label><textarea rows={3} placeholder="A few details — destination, party size, the occasion…" /></div>
            <button className="btn btn-primary btn-block" type="submit">Send private enquiry</button>
            <p className="form-note">Handled personally · in confidence</p>
          </form>
        </div>
      </section>

      <footer className="footer" style={{ backgroundImage: `linear-gradient(rgba(8,9,12,.7),rgba(8,9,12,.88)), url(${c.disciplines[1].hero})` }}>
        <div className="foot-in">
          <div className="eyebrow">{c.location}</div>
          <h2 className="serif foot-title">{c.name}</h2>
          <div className="foot-role">{c.roleLine}</div>
          <a className="btn btn-primary btn-lg" href="#enquire">Private enquiry</a>
          <div className="foot-fine"><span>© {c.name}</span><span>Made on Tulala</span></div>
        </div>
      </footer>

      <a className="wa-float" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><Fill d={waPath} size={26} /></a>

      {lb !== null && (
        <div className="lightbox" onClick={() => setLb(null)}>
          <button className="lb-close" onClick={() => setLb(null)} aria-label="Close">×</button>
          <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + d.gallery.length) % d.gallery.length); }} aria-label="Previous">‹</button>
          <img src={d.gallery[lb]} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % d.gallery.length); }} aria-label="Next">›</button>
        </div>
      )}
    </div>
  );
}

const CSS = `
body{margin:0;background:#0b0c10}
html{scroll-behavior:smooth}
.av-page{
  --bg:#0b0c10; --bg-2:#13151c; --card:#161922; --line:rgba(240,236,226,.12);
  --ink:#f1ece2; --muted:rgba(241,236,226,.6); --accent:#c9a96a; --accent-ink:#14110a;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-inter-body),var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.6; overflow-x:hidden;
}
.av-page *{box-sizing:border-box}
.av-page img{display:block;max-width:100%}
.av-page a{color:inherit;text-decoration:none}
.serif{font-family:var(--font-fraunces),"Hoefler Text",Garamond,Georgia,serif;font-weight:400;letter-spacing:-.01em}
.section{max-width:1200px;margin:0 auto;padding:clamp(60px,8vw,118px) 24px}
.h2{font-size:clamp(28px,4.3vw,52px);line-height:1.04;margin:6px 0 0}
.eyebrow{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px;transition:color .5s}
.eyebrow::before{content:"";width:26px;height:1px;background:var(--accent);transition:background .5s}
.muted{color:var(--muted);margin:8px 0 0}
.lede{font-size:clamp(15px,1.4vw,18px);color:rgba(241,236,226,.78);margin:14px 0 0;max-width:54ch}
.sec-head{margin-bottom:clamp(26px,4vw,46px)}

.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:999px;font-weight:600;font-size:14px;padding:12px 22px;cursor:pointer;transition:transform .25s,background .4s,color .4s,border-color .4s;white-space:nowrap}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--accent);color:var(--accent-ink);box-shadow:0 14px 30px -16px rgba(201,169,106,.6)}
.btn-primary:hover{filter:brightness(1.06)}
.btn-ghost{background:transparent;color:var(--ink);border-color:rgba(241,236,226,.3)}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.btn-lg{padding:15px 28px;font-size:15px}.btn-sm{padding:9px 16px;font-size:13px}
.btn-block{width:100%;justify-content:center}

/* switcher */
.switcher,.hero-switch{display:inline-flex;gap:6px;padding:5px;border-radius:999px;background:rgba(241,236,226,.07);border:1px solid rgba(241,236,226,.16)}
.hero-switch{margin:20px 0 4px}
.sw-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;background:transparent;color:var(--ink);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all .35s;white-space:nowrap}
.sw-pill.lg{padding:11px 22px;font-size:14.5px}
.sw-pill:hover:not(.on){background:rgba(241,236,226,.1)}

/* nav */
.nav{position:fixed;inset:0 0 auto;z-index:60;padding:16px 0;transition:all .35s}
.nav.scrolled{background:rgba(11,12,16,.82);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:9px 0}
.nav-in{max-width:1280px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:12px}
.brand-mark{font-family:var(--font-fraunces),serif;font-size:16px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--accent);color:var(--accent)}
.brand-name{font-family:var(--font-fraunces),serif;font-size:16px;letter-spacing:.02em}
.nav .switcher{background:rgba(241,236,226,.06)}
.nav-right{display:flex;align-items:center;gap:12px}
.burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:6px}
.burger span{width:22px;height:2px;background:var(--ink)}
.mobile-menu{display:none}

/* hero */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:120px 24px 92px;overflow:hidden}
.hero-slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.1s ease,transform 8s ease;transform:scale(1.05)}
.hero-slide.on{opacity:1;transform:scale(1.11)}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,12,.5),rgba(8,9,12,.42) 35%,rgba(8,9,12,.88)),radial-gradient(90% 60% at 80% 10%,rgba(201,169,106,.16),transparent 55%)}
.hero-in{position:relative;max-width:1200px;margin:0 auto;width:100%}
.hero-title{font-size:clamp(40px,7vw,90px);line-height:1;margin:14px 0 0;max-width:15ch;text-shadow:0 2px 50px rgba(0,0,0,.45);animation:swap .55s ease}
@keyframes swap{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.hero-sub{font-size:clamp(15px,1.6vw,19px);color:rgba(241,236,226,.84);margin:20px 0 0;max-width:46ch}
.hero-cta{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.hero-tag{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;font-size:12px;color:rgba(241,236,226,.78);font-family:var(--font-geist-mono),monospace;letter-spacing:.08em}
.tag-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 28%,transparent);transition:background .5s}

/* marquee */
.marquee{background:var(--bg-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:hidden;padding:15px 0}
.marquee-track{display:flex;white-space:nowrap;animation:scroll 28s linear infinite;width:max-content}
.marquee-track span{font-family:var(--font-fraunces),serif;font-size:21px;color:rgba(241,236,226,.8);display:inline-flex;align-items:center}
.marquee-track i{color:var(--accent);margin:0 30px;font-style:normal;font-size:11px}
@keyframes scroll{to{transform:translateX(-50%)}}

/* offer */
.offer-inner{animation:fade .55s ease}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.svc-img{border-radius:14px;overflow:hidden;margin-bottom:14px}
.svc-img img{width:100%;aspect-ratio:4/5;object-fit:cover;transition:transform .6s}
.svc:hover .svc-img img{transform:scale(1.05)}
.svc-title{font-size:20px}
.offer-split{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:38px}
.price-card,.chips-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px}
.price-card{display:flex;flex-direction:column}
.price-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:6px}
.price-head .serif{font-size:22px}
.price-note{font-size:12px;color:var(--accent)}
.price-list{list-style:none;margin:0 0 20px;padding:0;flex:1}
.price-list li{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px solid rgba(241,236,226,.08)}
.pi-name{font-weight:600;font-size:15px}.pi-detail{font-size:13px;color:var(--muted);margin-top:2px}
.pi-meta{font-family:var(--font-fraunces),serif;font-size:16px;color:var(--accent);white-space:nowrap}
.chips-card{display:flex;flex-direction:column;gap:22px;justify-content:center}
.chip-label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.chip-row{display:flex;flex-wrap:wrap;gap:8px}
.chip{font-size:13px;border:1px solid var(--line);border-radius:999px;padding:8px 14px;color:var(--ink);background:rgba(241,236,226,.04)}
.chip.ghost{color:var(--muted)}
.gal-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:200px;gap:14px;margin-top:38px}
.gal-item{padding:0;border:0;cursor:pointer;border-radius:14px;overflow:hidden;background:#222}
.gal-item img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.gal-item:hover img{transform:scale(1.06)}
.gal-item.g0{grid-column:span 2;grid-row:span 2}.gal-item.g3{grid-row:span 2}

/* experience band */
.exp-band{background-size:cover;background-position:center;background-attachment:fixed}
.exp-in{max-width:1000px;margin:0 auto;padding:clamp(80px,12vw,160px) 24px;text-align:center}
.exp-line{font-size:clamp(26px,4vw,46px);line-height:1.15;margin:14px auto 0;max-width:20ch;color:#fff}

/* about */
.about{display:grid;grid-template-columns:0.85fr 1.15fr;gap:clamp(32px,6vw,72px);align-items:center}
.about-media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:18px}
.ab-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:30px}
.ab-stat{display:flex;flex-direction:column}
.ab-stat span{font-size:clamp(24px,2.6vw,34px);color:var(--accent)}
.ab-stat i{font-style:normal;font-size:12px;color:var(--muted)}

/* reviews */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.rev{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;margin:0}
.rev-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:999px;padding:4px 11px;margin-bottom:14px}
.rev blockquote{font-size:18px;line-height:1.45;margin:0 0 16px}
.rev figcaption{font-size:13.5px;color:var(--muted)}

/* enquire */
.enq-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,60px);align-items:center}
.enq-actions{display:flex;gap:14px;margin:28px 0 22px;flex-wrap:wrap}
.ig-follow{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--accent)}
.enq-form{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.field input,.field select,.field textarea{background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--ink);font-size:14px;font-family:inherit;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:var(--accent)}
.form-note{font-size:12px;color:var(--muted);text-align:center;margin:2px 0 0}

/* footer */
.footer{background-size:cover;background-position:center;text-align:center}
.foot-in{max-width:760px;margin:0 auto;padding:clamp(72px,11vw,140px) 24px;display:flex;flex-direction:column;align-items:center}
.foot-title{font-size:clamp(32px,5vw,60px);line-height:1.04;margin:12px 0 4px}
.foot-role{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:28px}
.foot-fine{display:flex;gap:24px;margin-top:34px;font-size:12.5px;color:rgba(241,236,226,.5);font-family:var(--font-geist-mono),monospace}

/* wa + lightbox */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:55;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -10px rgba(37,211,102,.7);transition:transform .25s}
.wa-float:hover{transform:scale(1.08)}
.lightbox{position:fixed;inset:0;z-index:80;background:rgba(6,7,10,.96);display:grid;place-items:center;padding:40px}
.lightbox img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:8px}
.lb-close{position:absolute;top:20px;right:26px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(241,236,226,.12);border:1px solid rgba(241,236,226,.25);color:#fff;width:52px;height:52px;border-radius:50%;font-size:28px;cursor:pointer}
.lb-nav.prev{left:24px}.lb-nav.next{right:24px}

.reveal{opacity:0;transform:translateY(26px);transition:opacity .8s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.2,0,0,1)}
.reveal.in{opacity:1;transform:none}

@media(max-width:920px){
  .nav .switcher{display:none}.burger{display:flex}
  .mobile-menu{display:flex;flex-direction:column;gap:8px;padding:16px 24px 22px;background:rgba(11,12,16,.98);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  .mobile-menu .sw-pill{justify-content:center}.mobile-menu .btn{margin-top:8px;justify-content:center}
  .svc-grid{grid-template-columns:1fr}
  .offer-split{grid-template-columns:1fr}
  .gal-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:150px}.gal-item.g0{grid-column:span 2}
  .about{grid-template-columns:1fr}.ab-stats{grid-template-columns:repeat(2,1fr)}
  .rev-grid{grid-template-columns:1fr}
  .enq-grid{grid-template-columns:1fr}
  .exp-band{background-attachment:scroll}
  .hero-tag{display:none}
}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.hero-slide{transition:opacity .4s}.marquee-track,.hero-title,.offer-inner{animation:none}}
`;
