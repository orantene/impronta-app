"use client";
/* eslint-disable @next/next/no-img-element -- bespoke template uses plain <img> with local, pre-sized assets for full layout control */

/**
 * Bespoke premium one-pager — "Frame" (Wedding & Portrait Photographer).
 *
 * 3rd design language. Signature feature: a SCROLLSPY SECTION NAV — the header
 * links smooth-scroll to each section and the active link highlights as you
 * scroll (via the reusable `useScrollSpy` IntersectionObserver hook). Plus a
 * filterable portfolio + lightbox, services, about, a process timeline,
 * investment/pricing, a journal/blog, and a contact block with Instagram +
 * WhatsApp.
 *
 * Engine-ready: content + imagery is a typed object; the page builder swaps it.
 * Imagery: curated Unsplash photos in /public/talent-templates/demo/photographer.
 */
import { useEffect, useRef, useState } from "react";

const IMG = "/talent-templates/demo/photographer";

const NAV = [
  { id: "work", label: "Work" },
  { id: "services", label: "Services" },
  { id: "about", label: "About" },
  { id: "process", label: "Process" },
  { id: "investment", label: "Investment" },
  { id: "journal", label: "Journal" },
  { id: "contact", label: "Contact" },
];
const SECTION_IDS = NAV.map((n) => n.id);

const ig = "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.2.4.4 1 .4 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.2-1 .4-2.2.4-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-1-.4-.4-.7-.8-1-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.6A6.2 6.2 0 1 0 12 18.2 6.2 6.2 0 0 0 12 5.8Zm0 10.2A4 4 0 1 1 12 8a4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z";
const waPath = "M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5c-.2.2-.3.4-.1.6.5.8 1 1.4 1.7 1.9.6.4 1 .6 1.3.7.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.6-.1 1.1Z";

const PHOTO = {
  name: "Mateo Ríos",
  mark: "MR",
  role: "Wedding & Portrait Photographer",
  location: "Mexico City · destination worldwide",
  hero: `${IMG}/01-hero.jpg`,
  tagline: "Quiet moments, kept forever.",
  heroSub: "Unposed, film-inspired wedding & portrait photography — for couples who want to feel something when they look back.",
  stats: [
    { n: "180+", l: "Weddings shot" },
    { n: "9 yrs", l: "Behind the lens" },
    { n: "14", l: "Countries" },
    { n: "48h", l: "Sneak-peek delivery" },
  ],
  work: [
    { src: `${IMG}/02-wed.jpg`, cat: "weddings", alt: "Couple in a field" },
    { src: `${IMG}/10-portrait.jpg`, cat: "portraits", alt: "Editorial portrait" },
    { src: `${IMG}/03-wed.jpg`, cat: "weddings", alt: "Wedding kiss" },
    { src: `${IMG}/06-wed.jpg`, cat: "weddings", alt: "Bridal portrait" },
    { src: `${IMG}/12-portrait.jpg`, cat: "portraits", alt: "Portrait in leather" },
    { src: `${IMG}/04-wed.jpg`, cat: "weddings", alt: "Couple among trees" },
    { src: `${IMG}/13-portrait.jpg`, cat: "portraits", alt: "Studio portrait" },
    { src: `${IMG}/05-wed.jpg`, cat: "weddings", alt: "Black and white moment" },
    { src: `${IMG}/09-bridal.jpg`, cat: "weddings", alt: "Bride" },
    { src: `${IMG}/11-portrait.jpg`, cat: "portraits", alt: "Editorial portrait" },
    { src: `${IMG}/07-wed.jpg`, cat: "weddings", alt: "Tender moment" },
    { src: `${IMG}/14-portrait.jpg`, cat: "portraits", alt: "Portrait with hat" },
    { src: `${IMG}/08-wed.jpg`, cat: "weddings", alt: "Couple on a dock" },
  ],
  services: [
    { title: "Weddings", desc: "Full-day, unobtrusive coverage from getting-ready to the last dance.", img: `${IMG}/03-wed.jpg` },
    { title: "Elopements", desc: "Intimate, adventurous, often far away — just the two of you.", img: `${IMG}/04-wed.jpg` },
    { title: "Portraits", desc: "Couples, families, and personal branding sessions on location.", img: `${IMG}/13-portrait.jpg` },
    { title: "Editorial", desc: "Brand and fashion stories for magazines and lookbooks.", img: `${IMG}/11-portrait.jpg` },
  ],
  about: [
    "I shoot the in-between — the held breath before the vows, the laugh nobody planned. Nine years in, I still chase feeling over poses.",
    "Based in Mexico City, I travel anywhere there’s a story worth keeping. Calm on the day, obsessive in the edit.",
  ],
  process: [
    { n: "01", title: "Enquire", desc: "Tell me your date and your story. I’ll send availability and the full guide." },
    { n: "02", title: "Consult", desc: "A call to plan the day, the look, and the must-have moments." },
    { n: "03", title: "The day", desc: "I blend in and document — no stiff line-ups, just real life." },
    { n: "04", title: "Your gallery", desc: "Sneak peeks in 48h; the full, hand-edited gallery within 6 weeks." },
  ],
  investment: [
    { name: "Half day", from: "from $1,400", includes: ["Up to 5 hours", "300+ edited images", "Online gallery", "Print release"] },
    { name: "Full day", from: "from $2,600", featured: true, includes: ["Up to 10 hours", "700+ edited images", "Engagement session", "Heirloom album"] },
    { name: "Destination", from: "from $4,200", includes: ["Two-day coverage", "Travel included", "Second shooter", "Fine-art album"] },
  ],
  journal: [
    { cover: `${IMG}/04-wed.jpg`, cat: "Wedding", date: "Nov 2026", title: "An elopement in the Oaxacan hills", excerpt: "Two people, one valley, and the best light of the year.", min: "6 min" },
    { cover: `${IMG}/12-portrait.jpg`, cat: "Portraits", date: "Oct 2026", title: "How to feel calm in front of a camera", excerpt: "My five prompts for portraits that don’t feel posed.", min: "4 min" },
    { cover: `${IMG}/01-hero.jpg`, cat: "Guide", date: "Sep 2026", title: "Planning a golden-hour ceremony", excerpt: "The timing trick that gives you that glow.", min: "5 min" },
  ],
  reviews: [
    { quote: "We don’t look posed in a single photo — we look like us, on the best day of our lives.", author: "Sofía & Dani", meta: "Wedding · San Miguel" },
    { quote: "Mateo was invisible all day and then delivered magic. Worth every peso.", author: "Lucía & Marco", meta: "Elopement · Oaxaca" },
    { quote: "The most calming presence on a chaotic day. The album makes us cry.", author: "The Herrera family", meta: "Family session" },
  ],
  socials: { instagram: "https://instagram.com", whatsapp: "https://wa.me/520000000000", email: "mailto:hola@mateorios.com" },
};

function Fill({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={d} /></svg>;
}

/** Reusable scrollspy — returns the id of the section currently in view. */
function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive((vis[0].target as HTMLElement).id);
      },
      { rootMargin: "-44% 0px -52% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

export function PhotographerTemplate() {
  const c = PHOTO;
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cat, setCat] = useState("all");
  const [lb, setLb] = useState<number | null>(null);
  const active = useScrollSpy(SECTION_IDS);

  const items = cat === "all" ? c.work : c.work.filter((w) => w.cat === cat);

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
  }, [cat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (lb !== null && e.key === "ArrowRight") setLb((i) => (i === null ? 0 : (i + 1) % items.length));
      if (lb !== null && e.key === "ArrowLeft") setLb((i) => (i === null ? 0 : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb, items.length]);

  const close = () => setMenuOpen(false);

  return (
    <div className="ph-page" ref={root}>
      <style>{CSS}</style>

      {/* NAV with scrollspy */}
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-in">
          <a href="#top" className="brand"><span className="brand-mark">{c.mark}</span><span className="brand-name">{c.name}</span></a>
          <nav className="nav-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={`nav-link ${active === n.id ? "active" : ""}`} aria-current={active === n.id ? "true" : undefined}>{n.label}</a>
            ))}
          </nav>
          <div className="nav-right">
            <a className="btn btn-sm btn-primary" href="#contact">Enquire</a>
            <button className="burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}><span /><span /><span /></button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} className={active === n.id ? "active" : ""} onClick={close}>{n.label}</a>)}
            <a className="btn btn-primary" href="#contact" onClick={close}>Enquire</a>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="hero-bg" style={{ backgroundImage: `url(${c.hero})` }} />
        <div className="hero-scrim" />
        <div className="hero-in">
          <div className="eyebrow on-dark">{c.role}</div>
          <h1 className="serif hero-title">{c.tagline}</h1>
          <p className="hero-sub">{c.heroSub}</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#work">View the work</a>
            <a className="btn btn-glass btn-lg" href="#contact">Check your date</a>
          </div>
        </div>
        <div className="hero-name serif">{c.name}</div>
        <a href="#work" className="scroll-cue" aria-label="Scroll">scroll</a>
      </section>

      {/* WORK */}
      <section className="section work" id="work">
        <div className="sec-head between reveal">
          <div><div className="eyebrow">Selected work</div><h2 className="serif h2">A few stories</h2></div>
          <div className="tabs">
            {[["all", "All"], ["weddings", "Weddings"], ["portraits", "Portraits"]].map(([k, l]) => (
              <button key={k} className={`tab ${cat === k ? "on" : ""}`} onClick={() => { setCat(k); setLb(null); }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="work-grid">
          {items.map((w, i) => (
            <button key={w.src} className={`work-item reveal w${i % 6}`} onClick={() => setLb(i)} aria-label="Open image">
              <img src={w.src} alt={w.alt} loading="lazy" />
              <span className="work-tag">{w.cat}</span>
            </button>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section className="section services" id="services">
        <div className="sec-head reveal"><div className="eyebrow">What I shoot</div><h2 className="serif h2">Services</h2></div>
        <div className="svc-grid">
          {c.services.map((s) => (
            <article key={s.title} className="svc reveal">
              <div className="svc-img"><img src={s.img} alt={s.title} loading="lazy" /></div>
              <h3 className="serif svc-title">{s.title}</h3>
              <p className="muted">{s.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="section about" id="about">
        <div className="about-media reveal"><img src={`${IMG}/15-about.jpg`} alt={c.name} loading="lazy" /></div>
        <div className="about-copy reveal">
          <div className="eyebrow">Behind the lens</div>
          <h2 className="serif h2">{c.name}</h2>
          {c.about.map((p, i) => <p key={i} className="lede">{p}</p>)}
          <div className="about-stats">
            {c.stats.map((s) => <div key={s.l} className="ab-stat"><span className="serif">{s.n}</span><i>{s.l}</i></div>)}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="section process" id="process">
        <div className="sec-head reveal"><div className="eyebrow">How it works</div><h2 className="serif h2">From hello to heirloom</h2></div>
        <div className="proc-grid">
          {c.process.map((p) => (
            <div key={p.n} className="proc reveal">
              <span className="serif proc-n">{p.n}</span>
              <h3 className="proc-t">{p.title}</h3>
              <p className="muted">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INVESTMENT */}
      <section className="section investment" id="investment">
        <div className="sec-head reveal"><div className="eyebrow">Investment</div><h2 className="serif h2">Collections</h2></div>
        <div className="price-grid">
          {c.investment.map((p) => (
            <div key={p.name} className={`pkg reveal ${p.featured ? "featured" : ""}`}>
              {p.featured ? <span className="pkg-badge">Most booked</span> : null}
              <div className="pkg-name serif">{p.name}</div>
              <div className="pkg-from">{p.from}</div>
              <ul className="pkg-inc">{p.includes.map((x) => <li key={x}>{x}</li>)}</ul>
              <a className="btn btn-block btn-primary" href="#contact">Enquire</a>
            </div>
          ))}
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section reviews">
        <div className="sec-head reveal"><div className="eyebrow">Kind words</div><h2 className="serif h2">Couples &amp; clients</h2></div>
        <div className="rev-grid">
          {c.reviews.map((r, i) => (
            <figure key={i} className="rev reveal"><blockquote className="serif">“{r.quote}”</blockquote><figcaption><strong>{r.author}</strong><span>{r.meta}</span></figcaption></figure>
          ))}
        </div>
      </section>

      {/* JOURNAL */}
      <section className="section journal" id="journal">
        <div className="sec-head between reveal"><div><div className="eyebrow">Journal</div><h2 className="serif h2">Recent stories</h2></div><a className="btn btn-ghost" href="#journal">All posts</a></div>
        <div className="blog-grid">
          {c.journal.map((b, i) => (
            <a key={i} className="post reveal" href="#journal">
              <div className="post-img"><img src={b.cover} alt={b.title} loading="lazy" /><span className="post-cat">{b.cat}</span></div>
              <div className="post-body"><div className="post-meta">{b.date} · {b.min} read</div><h3 className="serif post-title">{b.title}</h3><p className="muted">{b.excerpt}</p><span className="post-go">Read →</span></div>
            </a>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section className="section contact" id="contact">
        <div className="contact-grid">
          <div className="contact-copy reveal">
            <div className="eyebrow">Enquire</div>
            <h2 className="serif h2">Let’s keep your day forever.</h2>
            <p className="lede">Tell me your date and a little about your story. I take a limited number of weddings each year — reply within 24 hours.</p>
            <div className="contact-actions">
              <a className="btn btn-primary btn-lg" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              <a className="btn btn-outline btn-lg" href={c.socials.email}>Email Mateo</a>
            </div>
            <a className="ig-follow" href={c.socials.instagram} target="_blank" rel="noopener noreferrer"><Fill d={ig} size={18} /> Follow @mateo.rios</a>
          </div>
          <form className="contact-form reveal" onSubmit={(e) => e.preventDefault()}>
            <div className="field"><label>Names</label><input placeholder="Sofía & Dani" /></div>
            <div className="field-row"><div className="field"><label>Date</label><input placeholder="June 2027" /></div><div className="field"><label>Type</label><select><option>Wedding</option><option>Elopement</option><option>Portrait</option><option>Editorial</option></select></div></div>
            <div className="field"><label>Tell me about your day</label><textarea rows={3} placeholder="Where, the vibe, anything that matters…" /></div>
            <button className="btn btn-primary btn-block" type="submit">Check your date</button>
          </form>
        </div>
      </section>

      <footer className="footer" style={{ backgroundImage: `linear-gradient(rgba(28,22,18,.7),rgba(28,22,18,.82)), url(${IMG}/01-hero.jpg)` }}>
        <div className="foot-in">
          <div className="eyebrow on-dark">{c.location}</div>
          <h2 className="serif foot-title">Quiet moments, kept forever.</h2>
          <a className="btn btn-primary btn-lg" href="#contact">Check your date</a>
          <div className="foot-fine"><span>© {c.name}</span><span>Made on Tulala</span></div>
        </div>
      </footer>

      <a className="wa-float" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><Fill d={waPath} size={26} /></a>

      {lb !== null && (
        <div className="lightbox" onClick={() => setLb(null)}>
          <button className="lb-close" onClick={() => setLb(null)} aria-label="Close">×</button>
          <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + items.length) % items.length); }} aria-label="Previous">‹</button>
          <img src={items[lb]?.src} alt={items[lb]?.alt} onClick={(e) => e.stopPropagation()} />
          <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % items.length); }} aria-label="Next">›</button>
        </div>
      )}
    </div>
  );
}

const CSS = `
body{margin:0;background:#f5f1ea}
html{scroll-behavior:smooth}
.ph-page{
  --bg:#f5f1ea; --card:#fff; --ink:#211c17; --muted:#857a6d; --line:rgba(33,28,23,.12); --espresso:#1c1612;
  --accent:#a9786b; --accent-d:#92604f;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-inter-body),var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.6; overflow-x:hidden;
}
.ph-page *{box-sizing:border-box}
.ph-page img{display:block;max-width:100%}
.ph-page a{color:inherit;text-decoration:none}
.ph-page section[id]{scroll-margin-top:78px}
.serif{font-family:var(--font-fraunces),"Hoefler Text",Garamond,Georgia,serif;font-weight:400;letter-spacing:-.01em}
.section{max-width:1200px;margin:0 auto;padding:clamp(58px,8vw,116px) 24px}
.h2{font-size:clamp(28px,4.2vw,50px);line-height:1.05;margin:6px 0 0}
.eyebrow{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--accent)}
.eyebrow.on-dark{color:#f3e9e2}.eyebrow.on-dark::before{background:rgba(243,233,226,.7)}
.muted{color:var(--muted);margin:8px 0 0}
.lede{font-size:clamp(15px,1.4vw,18px);color:#534a40;margin:14px 0 0;max-width:54ch}
.sec-head{margin-bottom:clamp(26px,4vw,46px)}
.sec-head.between{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}

.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:999px;font-weight:600;font-size:14px;padding:12px 22px;cursor:pointer;transition:transform .25s,background .25s,color .25s,border-color .25s;white-space:nowrap}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 12px 26px -14px rgba(169,120,107,.8)}
.btn-primary:hover{background:var(--accent-d)}
.btn-glass{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.34);backdrop-filter:blur(6px)}
.btn-glass:hover{background:rgba(255,255,255,.2)}
.btn-outline{background:transparent;color:var(--ink);border-color:var(--line)}
.btn-outline:hover{border-color:var(--accent);color:var(--accent)}
.btn-ghost{background:transparent;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 42%,transparent)}
.btn-lg{padding:15px 28px;font-size:15px}.btn-sm{padding:9px 16px;font-size:13px}
.btn-block{width:100%;justify-content:center}

/* nav + scrollspy */
.nav{position:fixed;inset:0 0 auto;z-index:60;padding:18px 0;transition:all .35s}
.nav.scrolled{background:rgba(245,241,234,.86);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:10px 0}
.nav-in{max-width:1280px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:12px;color:#fff;transition:color .35s}
.nav.scrolled .brand{color:var(--ink)}
.brand-mark{font-family:var(--font-fraunces),serif;font-size:16px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor}
.brand-name{font-family:var(--font-fraunces),serif;font-size:16px}
.nav-links{display:flex;gap:26px}
.nav-link{position:relative;font-size:13.5px;color:rgba(255,255,255,.82);padding:4px 0;transition:color .25s}
.nav.scrolled .nav-link{color:var(--muted)}
.nav-link::after{content:"";position:absolute;left:0;right:100%;bottom:-3px;height:1.5px;background:var(--accent);transition:right .3s ease}
.nav-link:hover{color:#fff}.nav.scrolled .nav-link:hover{color:var(--ink)}
.nav-link.active{color:#fff;font-weight:600}
.nav.scrolled .nav-link.active{color:var(--accent)}
.nav-link.active::after{right:0}
.nav-right{display:flex;align-items:center;gap:12px}
.burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:6px}
.burger span{width:22px;height:2px;background:#fff}.nav.scrolled .burger span{background:var(--ink)}
.mobile-menu{display:none}

/* hero */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:120px 24px 110px;overflow:hidden;color:#fff}
.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.05);animation:kb 20s ease-out forwards}
@keyframes kb{to{transform:scale(1.12)}}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(28,22,18,.42),rgba(28,22,18,.32) 35%,rgba(28,22,18,.8))}
.hero-in{position:relative;max-width:1200px;margin:0 auto;width:100%}
.hero-title{font-size:clamp(40px,7vw,90px);line-height:1;margin:16px 0 0;max-width:14ch;text-shadow:0 2px 40px rgba(0,0,0,.35)}
.hero-sub{font-size:clamp(15px,1.6vw,19px);color:rgba(255,255,255,.86);margin:20px 0 0;max-width:46ch}
.hero-cta{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.hero-name{position:absolute;right:24px;bottom:90px;font-size:13px;letter-spacing:.3em;text-transform:uppercase;writing-mode:vertical-rl;color:rgba(255,255,255,.6)}
.scroll-cue{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-family:var(--font-geist-mono),monospace;font-size:10.5px;letter-spacing:.25em;text-transform:uppercase}
.scroll-cue::after{content:"";display:block;width:1px;height:30px;background:linear-gradient(rgba(255,255,255,.7),transparent);margin:8px auto 0}

/* work */
.tabs{display:inline-flex;gap:6px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px}
.tab{border:0;background:transparent;color:var(--muted);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.tab.on{background:var(--accent);color:#fff}
.tab:hover:not(.on){color:var(--ink)}
.work-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:210px;gap:14px}
.work-item{position:relative;padding:0;border:0;cursor:pointer;border-radius:14px;overflow:hidden;background:#e8e2d8}
.work-item img{width:100%;height:100%;object-fit:cover;transition:transform .7s}
.work-item:hover img{transform:scale(1.06)}
.work-item.w0{grid-column:span 2;grid-row:span 2}
.work-item.w3{grid-row:span 2}
.work-tag{position:absolute;top:10px;left:10px;background:rgba(245,241,234,.92);color:var(--ink);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px;opacity:0;transition:opacity .25s}
.work-item:hover .work-tag{opacity:1}

/* services */
.svc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.svc{display:flex;flex-direction:column}
.svc-img{border-radius:14px;overflow:hidden;margin-bottom:14px}
.svc-img img{width:100%;aspect-ratio:3/4;object-fit:cover;transition:transform .6s}
.svc:hover .svc-img img{transform:scale(1.05)}
.svc-title{font-size:20px}

/* about */
.about{display:grid;grid-template-columns:0.9fr 1.1fr;gap:clamp(32px,6vw,72px);align-items:center}
.about-media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:18px}
.about-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:30px}
.ab-stat{display:flex;flex-direction:column}
.ab-stat span{font-size:clamp(24px,2.6vw,34px);color:var(--accent)}
.ab-stat i{font-style:normal;font-size:12px;color:var(--muted)}

/* process */
.proc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.proc{border-top:2px solid var(--line);padding-top:18px}
.proc-n{display:block;font-size:30px;color:var(--accent)}
.proc-t{font-size:18px;margin:8px 0 0}

/* investment */
.price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:start}
.pkg{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px;display:flex;flex-direction:column}
.pkg.featured{border-color:var(--accent);box-shadow:0 30px 60px -36px rgba(169,120,107,.6)}
.pkg-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 13px;border-radius:999px}
.pkg-name{font-size:24px}
.pkg-from{font-size:14px;color:var(--muted);margin:4px 0 18px}
.pkg-inc{list-style:none;margin:0 0 22px;padding:0;flex:1}
.pkg-inc li{font-size:14px;padding:9px 0 9px 24px;position:relative;border-bottom:1px solid rgba(33,28,23,.07)}
.pkg-inc li::before{content:"";position:absolute;left:0;top:15px;width:7px;height:7px;border-radius:50%;background:var(--accent)}

/* reviews */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.rev{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;margin:0}
.rev blockquote{font-size:18px;line-height:1.45;margin:0 0 18px}
.rev figcaption{display:flex;flex-direction:column;gap:2px;font-size:14px}
.rev figcaption span{color:var(--muted);font-size:13px}

/* journal */
.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.post{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .3s,box-shadow .3s;display:flex;flex-direction:column}
.post:hover{transform:translateY(-5px);box-shadow:0 30px 56px -34px rgba(33,28,23,.4)}
.post-img{position:relative;overflow:hidden}
.post-img img{width:100%;aspect-ratio:3/2;object-fit:cover;transition:transform .6s}
.post:hover .post-img img{transform:scale(1.06)}
.post-cat{position:absolute;top:12px;left:12px;background:rgba(245,241,234,.92);color:var(--ink);font-size:11px;font-weight:600;padding:5px 11px;border-radius:999px}
.post-body{padding:22px;display:flex;flex-direction:column;flex:1}
.post-meta{font-size:12px;color:var(--muted)}
.post-title{font-size:19px;margin:6px 0 0}
.post-go{font-size:13px;font-weight:600;color:var(--accent);margin-top:14px}

/* contact */
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,60px);align-items:center}
.contact-actions{display:flex;gap:14px;margin:28px 0 22px;flex-wrap:wrap}
.ig-follow{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--accent)}
.contact-form{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.field input,.field select,.field textarea{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--ink);font-size:14px;font-family:inherit;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:var(--accent)}

/* footer */
.footer{background-size:cover;background-position:center;color:#fff;text-align:center}
.foot-in{max-width:760px;margin:0 auto;padding:clamp(70px,11vw,136px) 24px;display:flex;flex-direction:column;align-items:center}
.foot-title{font-size:clamp(28px,4.6vw,54px);line-height:1.08;margin:14px 0 28px}
.foot-fine{display:flex;gap:24px;margin-top:34px;font-size:12.5px;color:rgba(255,255,255,.55);font-family:var(--font-geist-mono),monospace}

/* wa + lightbox */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:55;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -10px rgba(37,211,102,.7);transition:transform .25s}
.wa-float:hover{transform:scale(1.08)}
.lightbox{position:fixed;inset:0;z-index:80;background:rgba(20,15,11,.95);display:grid;place-items:center;padding:40px}
.lightbox img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:8px}
.lb-close{position:absolute;top:20px;right:26px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;width:52px;height:52px;border-radius:50%;font-size:28px;cursor:pointer}
.lb-nav.prev{left:24px}.lb-nav.next{right:24px}

.reveal{opacity:0;transform:translateY(26px);transition:opacity .8s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.2,0,0,1)}
.reveal.in{opacity:1;transform:none}

@media(max-width:920px){
  .nav-links{display:none}.burger{display:flex}
  .mobile-menu{display:flex;flex-direction:column;gap:4px;padding:16px 24px 22px;background:rgba(245,241,234,.98);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  .mobile-menu a:not(.btn){padding:11px 0;font-size:16px;color:var(--ink);border-bottom:1px solid var(--line)}
  .mobile-menu a.active{color:var(--accent)}
  .mobile-menu .btn{margin-top:10px;justify-content:center}
  .work-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:170px}.work-item.w0{grid-column:span 2}
  .svc-grid{grid-template-columns:repeat(2,1fr)}
  .about{grid-template-columns:1fr}.about-stats{grid-template-columns:repeat(2,1fr)}
  .proc-grid{grid-template-columns:repeat(2,1fr)}
  .price-grid{grid-template-columns:1fr}
  .rev-grid,.blog-grid{grid-template-columns:1fr}
  .contact-grid{grid-template-columns:1fr}
  .hero-name{display:none}
}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.hero-bg{animation:none}}
`;
