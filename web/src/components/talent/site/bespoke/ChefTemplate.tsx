"use client";
/* eslint-disable @next/next/no-img-element -- bespoke template uses plain <img> with local, pre-sized assets for full layout control */

/**
 * Bespoke, premium talent one-page template — "Tasting" (Private Chef).
 *
 * Hand-built (NOT the section registry): full 360 experience with a sticky
 * one-page nav, cinematic hero, story, signature dishes, interactive menus,
 * portfolio gallery + lightbox, integration hub (Instagram / YouTube / TikTok /
 * Spotify), reviews, availability + booking, FAQ, footer, and a floating
 * WhatsApp button. Content is data-driven so it can later be fed a real
 * talent's profile + media.
 *
 * Imagery: curated Unsplash photos downloaded to /public/talent-templates/demo/chef.
 */
import { useEffect, useRef, useState } from "react";

const IMG = "/talent-templates/demo/chef";

type Course = { n: string; t: string; d: string };
type Menu = { id: string; label: string; priceFrom: string; note: string; courses: Course[] };

const CHEF = {
  name: "Lucía Fernández",
  mark: "LF",
  role: "Private Chef",
  location: "Guadalajara · Riviera Nayarit",
  hero: `${IMG}/01-hero.jpg`,
  portrait: `${IMG}/02-portrait.jpg`,
  tagline: "Restaurant tasting menus, cooked at your table.",
  heroSub:
    "Seasonal, market-led private dining for intimate dinners, celebrations, and events — designed around the people you’re hosting.",
  stats: [
    { n: "500+", l: "Dinners served" },
    { n: "12 yrs", l: "In professional kitchens" },
    { n: "4.9★", l: "Average guest rating" },
    { n: "2–40", l: "Guests per event" },
  ],
  story: [
    "I trained between Oaxaca and San Sebastián, then spent a decade on the line before going private — because the best meals happen at home, not behind a pass.",
    "Every menu starts at the market that morning and ends at your table that night. I shop, cook, plate, and serve — and leave your kitchen exactly as I found it.",
  ],
  signatures: [
    { img: `${IMG}/03-dish.jpg`, name: "Aguachile de temporada", tag: "Raw bar", desc: "Bay scallop, charred serrano oil, finger lime, tostada crumble." },
    { img: `${IMG}/04-dish.jpg`, name: "Pesca del día", tag: "Main", desc: "Line-caught fish, brown-butter mole blanco, heirloom squash." },
    { img: `${IMG}/05-dessert.jpg`, name: "Cajeta & cacao", tag: "Dessert", desc: "Burnt goat-milk caramel, single-origin cacao, sea salt." },
  ],
  menus: [
    {
      id: "tasting",
      label: "Tasting menu",
      priceFrom: "from $95 / guest",
      note: "5–7 courses · wine pairing optional",
      courses: [
        { n: "I", t: "Snacks", d: "Three one-bite openers from the morning market." },
        { n: "II", t: "Raw", d: "Aguachile de temporada, charred serrano oil." },
        { n: "III", t: "Garden", d: "Fire-roasted vegetables, fermented chili, queso fresco." },
        { n: "IV", t: "Sea", d: "Line-caught fish, mole blanco, heirloom squash." },
        { n: "V", t: "Fire", d: "Slow-cooked short rib, smoked tomato, masa." },
        { n: "VI", t: "Sweet", d: "Cajeta & single-origin cacao." },
      ],
    },
    {
      id: "family",
      label: "Family-style",
      priceFrom: "from $70 / guest",
      note: "Generous shared plates, brought to the centre",
      courses: [
        { n: "01", t: "To start", d: "Warm bread, cultured butter, market dips." },
        { n: "02", t: "The table", d: "Whole roasted fish, charred greens, citrus rice." },
        { n: "03", t: "The board", d: "Slow lamb barbacoa, handmade tortillas, salsas." },
        { n: "04", t: "To finish", d: "Seasonal fruit, cajeta, churro crumble." },
      ],
    },
    {
      id: "canapes",
      label: "Canapés & events",
      priceFrom: "from $48 / guest",
      note: "Passed bites & grazing for celebrations",
      courses: [
        { n: "01", t: "Passed", d: "Eight rotating one-bite canapés." },
        { n: "02", t: "Grazing", d: "Seasonal table of cheese, charcuterie, conservas." },
        { n: "03", t: "Live", d: "À-la-minute tostada or taco station." },
        { n: "04", t: "Sweet", d: "Petit-four trio with coffee service." },
      ],
    },
  ] as Menu[],
  experiences: [
    { img: `${IMG}/08-action.jpg`, title: "Intimate dinner", from: "2–12 guests", desc: "I shop, cook, serve, and clean. You just show up and enjoy a restaurant night at home.", includes: ["Menu design", "Market sourcing", "Full service", "Spotless kitchen"] },
    { img: `${IMG}/10-table.jpg`, title: "Events & celebrations", from: "up to 40 guests", desc: "Milestones, launches, and weddings — full menu, service staff, and styling, coordinated end to end.", includes: ["Service team", "Rentals & styling", "Bar pairing", "Timeline"] },
    { img: `${IMG}/07-action.jpg`, title: "Hands-on classes", from: "2–8 guests", desc: "Learn a menu together, then sit down and eat it. The most fun a kitchen can be.", includes: ["Techniques", "Recipe cards", "Wine pairing", "Dinner after"] },
  ],
  gallery: [
    { src: `${IMG}/06-dish.jpg`, alt: "Plated course on wood" },
    { src: `${IMG}/09-action.jpg`, alt: "Chef slicing produce" },
    { src: `${IMG}/11-table.jpg`, alt: "Table set for two by candlelight" },
    { src: `${IMG}/13-kitchen.jpg`, alt: "Chef working in the kitchen" },
    { src: `${IMG}/14-plate.jpg`, alt: "Finished plate, fork and knife" },
    { src: `${IMG}/12-table.jpg`, alt: "Formal dinner with candles" },
    { src: `${IMG}/03-dish.jpg`, alt: "Raw bar course" },
    { src: `${IMG}/04-dish.jpg`, alt: "Fish main course" },
  ],
  instagram: {
    handle: "@lucia.cocina",
    href: "https://instagram.com",
    tiles: [
      `${IMG}/03-dish.jpg`, `${IMG}/05-dessert.jpg`, `${IMG}/08-action.jpg`,
      `${IMG}/14-plate.jpg`, `${IMG}/04-dish.jpg`, `${IMG}/09-action.jpg`,
      `${IMG}/06-dish.jpg`, `${IMG}/10-table.jpg`, `${IMG}/07-action.jpg`,
    ],
  },
  youtube: { title: "A night with Lucía", meta: "Behind a 7-course private dinner", thumb: `${IMG}/13-kitchen.jpg`, href: "https://youtube.com" },
  tiktok: { handle: "@lucia.cocina", caption: "Plating the aguachile 🔥 #privatechef", thumb: `${IMG}/08-action.jpg`, likes: "12.4k", href: "https://tiktok.com" },
  spotify: { title: "Dinner at Lucía’s", meta: "The playlist behind the table · 38 tracks", cover: `${IMG}/10-table.jpg`, href: "https://open.spotify.com", tracks: ["Bossa, slow — Sunset side", "Buena Vista — Café", "Khruangbin — Friday", "Norah Jones — Late"] },
  reviews: [
    { quote: "Better than any restaurant we went to this year — and it was in our living room. Every course had a story.", author: "The Herrera family", meta: "Anniversary dinner · Guadalajara", stars: 5 },
    { quote: "Seamless from the first message to the last plate. Our guests are still talking about it.", author: "Studio Norte", meta: "Team celebration", stars: 5 },
    { quote: "Lucía handled 30 guests like it was nothing. Flawless, warm, unforgettable.", author: "Andrea P.", meta: "Birthday tasting", stars: 5 },
  ],
  faqs: [
    { q: "Do you handle dietary needs and allergies?", a: "Always. Share preferences and allergies when you inquire and every course is tailored — vegetarian, vegan, gluten-free, and more." },
    { q: "What do you need in my kitchen?", a: "A standard home kitchen is plenty. I arrive with my tools, everything prepped, and ready to cook on site." },
    { q: "What’s included in the price?", a: "Menu design, grocery sourcing, cooking, plating, service, and full clean-up. Staff and rentals can be added for larger events." },
    { q: "How far ahead should I book?", a: "Two to three weeks is ideal for dinners; larger events earlier. Last-minute dates are sometimes possible — just ask." },
  ],
  socials: {
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com",
    youtube: "https://youtube.com",
    spotify: "https://open.spotify.com",
    whatsapp: "https://wa.me/520000000000",
    email: "mailto:hola@luciacocina.mx",
  },
};

const NAV = [
  { id: "story", label: "Story" },
  { id: "menus", label: "Menus" },
  { id: "experiences", label: "Experiences" },
  { id: "gallery", label: "Gallery" },
  { id: "reviews", label: "Reviews" },
  { id: "book", label: "Book" },
];

/* ── icons ──────────────────────────────────────────────────────────────── */
const ig = "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.2.4.4 1 .4 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.2-1 .4-2.2.4-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-1-.4-.4-.7-.8-1-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.6A6.2 6.2 0 1 0 12 18.2 6.2 6.2 0 0 0 12 5.8Zm0 10.2A4 4 0 1 1 12 8a4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z";

function Icon({ d, label, size = 18 }: { d: string; label?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-label={label} role="img">
      <path d={d} />
    </svg>
  );
}
function SocialRow({ className = "" }: { className?: string }) {
  const s = CHEF.socials;
  const items: { href: string; label: string; node: React.ReactNode }[] = [
    { href: s.instagram, label: "Instagram", node: <Icon d={ig} label="Instagram" /> },
    { href: s.tiktok, label: "TikTok", node: <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.5 3c.3 2 1.5 3.6 3.5 3.9V10c-1.4 0-2.7-.4-3.9-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.07v3.1a2.6 2.6 0 1 0 1.8 2.5V3h3.3Z"/></svg> },
    { href: s.youtube, label: "YouTube", node: <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M23 12s0-3.1-.4-4.6a2.4 2.4 0 0 0-1.7-1.7C19.4 5.3 12 5.3 12 5.3s-7.4 0-8.9.4A2.4 2.4 0 0 0 1.4 7.4C1 8.9 1 12 1 12s0 3.1.4 4.6a2.4 2.4 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.4 2.4 0 0 0 1.7-1.7C23 15.1 23 12 23 12ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z"/></svg> },
    { href: s.spotify, label: "Spotify", node: <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.8-2.2-11.2-1.2a.8.8 0 1 1-.3-1.6c4.8-1 9-.6 12.3 1.4.4.2.5.7.3 1.1Zm1.2-2.7a1 1 0 0 1-1.3.3C13.1 12 8 11.5 4.3 12.6a1 1 0 1 1-.6-1.9C8 9.5 13.6 10 17.5 12.4a1 1 0 0 1 .3 1.3Zm.1-2.8C14.4 8 8.2 7.8 4.7 8.9a1.2 1.2 0 1 1-.7-2.3C8.1 5.4 15 5.6 19.4 8.2a1.2 1.2 0 1 1-1.2 2Z"/></svg> },
  ];
  return (
    <div className={`soc ${className}`}>
      {items.map((it) => (
        <a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer" aria-label={it.label}>
          {it.node}
        </a>
      ))}
    </div>
  );
}
const arrow = "M5 12h14M13 6l6 6-6 6";
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={arrow} /></svg>;
}

/* ── component ──────────────────────────────────────────────────────────── */
export function ChefTemplate() {
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState(CHEF.menus[0].id);
  const [lb, setLb] = useState<number | null>(null);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (lb !== null && e.key === "ArrowRight") setLb((i) => (i === null ? 0 : (i + 1) % CHEF.gallery.length));
      if (lb !== null && e.key === "ArrowLeft") setLb((i) => (i === null ? 0 : (i - 1 + CHEF.gallery.length) % CHEF.gallery.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb]);

  const activeMenu = CHEF.menus.find((m) => m.id === tab) ?? CHEF.menus[0];
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="chef-page" ref={root}>
      <style>{CSS}</style>

      {/* NAV */}
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-in">
          <a href="#top" className="brand" onClick={() => closeMenu()}>
            <span className="brand-mark">{CHEF.mark}</span>
            <span className="brand-name">{CHEF.name}</span>
          </a>
          <nav className="nav-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} onClick={() => closeMenu()}>{n.label}</a>
            ))}
          </nav>
          <div className="nav-right">
            <a className="btn btn-sm btn-primary" href="#book">Reserve a date</a>
            <button className="burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} onClick={() => closeMenu()}>{n.label}</a>
            ))}
            <a className="btn btn-primary" href="#book" onClick={() => closeMenu()}>Reserve a date</a>
            <SocialRow className="soc-dark" />
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="hero-bg" style={{ backgroundImage: `url(${CHEF.hero})` }} />
        <div className="hero-scrim" />
        <div className="hero-in">
          <div className="eyebrow light">{CHEF.role} · {CHEF.location}</div>
          <h1 className="serif hero-title">{CHEF.tagline}</h1>
          <p className="hero-sub">{CHEF.heroSub}</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#book">Reserve a date</a>
            <a className="btn btn-glass btn-lg" href="#menus">View the menus <ArrowIcon /></a>
          </div>
          <SocialRow className="hero-soc" />
        </div>
        <div className="hero-pill">
          <span className="dot" /> Booking autumn dates now
        </div>
        <a href="#story" className="scroll-cue" aria-label="Scroll">Scroll</a>
      </section>

      {/* STATS STRIP */}
      <section className="strip">
        {CHEF.stats.map((s) => (
          <div key={s.l} className="stat reveal">
            <div className="serif stat-n">{s.n}</div>
            <div className="stat-l">{s.l}</div>
          </div>
        ))}
      </section>

      {/* STORY */}
      <section className="section story" id="story">
        <div className="story-media reveal">
          <img src={CHEF.portrait} alt={CHEF.name} loading="lazy" />
          <div className="story-badge serif">Est. table<br />of trust</div>
        </div>
        <div className="story-copy reveal">
          <div className="eyebrow">The chef</div>
          <h2 className="serif h2">Food worth leaving the restaurant for.</h2>
          {CHEF.story.map((p, i) => <p key={i} className="lede">{p}</p>)}
          <a className="link-arrow" href="#book">Plan your evening <ArrowIcon /></a>
        </div>
      </section>

      {/* SIGNATURES */}
      <section className="section signatures">
        <div className="sec-head reveal">
          <div className="eyebrow">Signatures</div>
          <h2 className="serif h2">A few plates you’ll remember</h2>
        </div>
        <div className="sig-grid">
          {CHEF.signatures.map((s) => (
            <article key={s.name} className="sig reveal">
              <div className="sig-img"><img src={s.img} alt={s.name} loading="lazy" /><span className="sig-tag">{s.tag}</span></div>
              <h3 className="serif sig-name">{s.name}</h3>
              <p className="muted">{s.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* MENUS */}
      <section className="section menus dark" id="menus">
        <div className="sec-head center reveal">
          <div className="eyebrow light">The menus</div>
          <h2 className="serif h2 light">Choose how the night unfolds</h2>
        </div>
        <div className="menu-tabs reveal">
          {CHEF.menus.map((m) => (
            <button key={m.id} className={`menu-tab ${tab === m.id ? "on" : ""}`} onClick={() => setTab(m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="menu-panel reveal" key={activeMenu.id}>
          <div className="menu-meta">
            <span className="serif price">{activeMenu.priceFrom}</span>
            <span className="menu-note">{activeMenu.note}</span>
          </div>
          <ol className="courses">
            {activeMenu.courses.map((c) => (
              <li key={c.n} className="course">
                <span className="serif course-n">{c.n}</span>
                <div>
                  <div className="course-t">{c.t}</div>
                  <div className="course-d">{c.d}</div>
                </div>
              </li>
            ))}
          </ol>
          <a className="btn btn-primary" href="#book">Build this menu with me</a>
        </div>
      </section>

      {/* EXPERIENCES */}
      <section className="section experiences" id="experiences">
        <div className="sec-head reveal">
          <div className="eyebrow">Experiences</div>
          <h2 className="serif h2">Ways to host with me</h2>
        </div>
        <div className="exp-grid">
          {CHEF.experiences.map((e) => (
            <article key={e.title} className="exp reveal">
              <div className="exp-img"><img src={e.img} alt={e.title} loading="lazy" /></div>
              <div className="exp-body">
                <div className="exp-top"><h3 className="serif exp-title">{e.title}</h3><span className="exp-from">{e.from}</span></div>
                <p className="muted">{e.desc}</p>
                <ul className="exp-inc">{e.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                <a className="link-arrow" href="#book">Enquire <ArrowIcon /></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* GALLERY */}
      <section className="section gallery" id="gallery">
        <div className="sec-head reveal">
          <div className="eyebrow">From the table</div>
          <h2 className="serif h2">Recent dinners</h2>
        </div>
        <div className="gal-grid">
          {CHEF.gallery.map((g, i) => (
            <button key={g.src} className={`gal-item reveal g${i % 5}`} onClick={() => setLb(i)} aria-label="Open image">
              <img src={g.src} alt={g.alt} loading="lazy" />
            </button>
          ))}
        </div>
      </section>

      {/* SOCIAL HUB */}
      <section className="section hub dark">
        <div className="sec-head center reveal">
          <div className="eyebrow light">Beyond the plate</div>
          <h2 className="serif h2 light">Follow the kitchen</h2>
        </div>
        <div className="hub-grid">
          {/* instagram */}
          <div className="hub-card ig reveal">
            <div className="hub-card-head">
              <span className="hub-ico"><Icon d={ig} /></span>
              <div><div className="hub-t">Instagram</div><div className="hub-m">{CHEF.instagram.handle}</div></div>
              <a className="btn btn-xs btn-glass" href={CHEF.instagram.href} target="_blank" rel="noopener noreferrer">Follow</a>
            </div>
            <div className="ig-grid">
              {CHEF.instagram.tiles.map((t, i) => (
                <a key={i} href={CHEF.instagram.href} target="_blank" rel="noopener noreferrer" className="ig-tile"><img src={t} alt="" loading="lazy" /></a>
              ))}
            </div>
          </div>

          <div className="hub-col">
            {/* youtube */}
            <a className="hub-card yt reveal" href={CHEF.youtube.href} target="_blank" rel="noopener noreferrer">
              <div className="yt-thumb"><img src={CHEF.youtube.thumb} alt="" loading="lazy" /><span className="play"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>
              <div className="yt-meta"><div className="hub-t">{CHEF.youtube.title}</div><div className="hub-m">{CHEF.youtube.meta}</div></div>
            </a>

            <div className="hub-row">
              {/* tiktok */}
              <a className="hub-card tk reveal" href={CHEF.tiktok.href} target="_blank" rel="noopener noreferrer">
                <div className="tk-phone"><img src={CHEF.tiktok.thumb} alt="" loading="lazy" />
                  <span className="tk-likes">♥ {CHEF.tiktok.likes}</span>
                  <span className="tk-cap">{CHEF.tiktok.caption}</span>
                </div>
              </a>
              {/* spotify */}
              <a className="hub-card sp reveal" href={CHEF.spotify.href} target="_blank" rel="noopener noreferrer">
                <div className="sp-top"><img className="sp-cover" src={CHEF.spotify.cover} alt="" loading="lazy" />
                  <div><div className="hub-t">{CHEF.spotify.title}</div><div className="hub-m">{CHEF.spotify.meta}</div></div>
                </div>
                <ul className="sp-tracks">{CHEF.spotify.tracks.map((t) => <li key={t}><span className="sp-bar" /> {t}</li>)}</ul>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section reviews" id="reviews">
        <div className="sec-head reveal">
          <div className="eyebrow">Kind words</div>
          <h2 className="serif h2">From the people at the table</h2>
        </div>
        <div className="rev-grid">
          {CHEF.reviews.map((r) => (
            <figure key={r.author} className="rev reveal">
              <div className="stars">{"★".repeat(r.stars)}</div>
              <blockquote className="serif">“{r.quote}”</blockquote>
              <figcaption><strong>{r.author}</strong><span>{r.meta}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* BOOKING */}
      <section className="section book dark" id="book">
        <div className="book-grid">
          <div className="book-copy reveal">
            <div className="eyebrow light">Reserve</div>
            <h2 className="serif h2 light">Let’s plan your night</h2>
            <p className="lede light">Tell me the date, the headcount, and the occasion. I’ll reply within 24 hours with a menu proposal and a quote.</p>
            <div className="book-actions">
              <a className="btn btn-primary btn-lg" href={CHEF.socials.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              <a className="btn btn-glass btn-lg" href={CHEF.socials.email}>Email Lucía</a>
            </div>
            <SocialRow className="soc-dark" />
          </div>
          <div className="book-cal reveal">
            <div className="cal-head"><span className="serif">Availability</span><span className="cal-month">This season</span></div>
            <div className="cal-dow">{["M","T","W","T","F","S","S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="cal-grid">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                const avail = [12, 13, 18, 19, 20, 25, 26, 27].includes(d);
                const few = [5, 6, 14].includes(d);
                return <span key={d} className={`cal-day ${avail ? "avail" : ""} ${few ? "few" : ""}`}>{d}</span>;
              })}
            </div>
            <div className="cal-legend"><span><i className="lg avail" /> Open</span><span><i className="lg few" /> Few left</span><span><i className="lg" /> Booked</span></div>
            <a className="btn btn-primary cal-btn" href={CHEF.socials.whatsapp} target="_blank" rel="noopener noreferrer">Check a specific date</a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section faq">
        <div className="sec-head reveal">
          <div className="eyebrow">Good to know</div>
          <h2 className="serif h2">Questions, answered</h2>
        </div>
        <div className="faq-list">
          {CHEF.faqs.map((f, i) => (
            <div key={i} className={`faq-item reveal ${faq === i ? "open" : ""}`}>
              <button className="faq-q" onClick={() => setFaq(faq === i ? -1 : i)}>
                <span>{f.q}</span><span className="faq-plus">{faq === i ? "–" : "+"}</span>
              </button>
              <div className="faq-a"><p>{f.a}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer" style={{ backgroundImage: `linear-gradient(rgba(20,16,12,.86), rgba(20,16,12,.93)), url(${IMG}/12-table.jpg)` }}>
        <div className="foot-in">
          <div className="eyebrow light">{CHEF.location}</div>
          <h2 className="serif foot-title">Reserve {CHEF.name.split(" ")[0]}’s table at home.</h2>
          <a className="btn btn-primary btn-lg" href="#book">Reserve a date</a>
          <SocialRow className="soc-dark foot-soc" />
          <div className="foot-fine">
            <span>© {CHEF.name}</span>
            <span>Made on Tulala</span>
          </div>
        </div>
      </footer>

      {/* floating whatsapp */}
      <a className="wa-float" href={CHEF.socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5c-.2.2-.3.4-.1.6.5.8 1 1.4 1.7 1.9.6.4 1 .6 1.3.7.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.6-.1 1.1Z"/></svg>
      </a>

      {/* lightbox */}
      {lb !== null && (
        <div className="lightbox" onClick={() => setLb(null)}>
          <button className="lb-close" aria-label="Close" onClick={() => setLb(null)}>×</button>
          <button className="lb-nav prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + CHEF.gallery.length) % CHEF.gallery.length); }}>‹</button>
          <img src={CHEF.gallery[lb].src} alt={CHEF.gallery[lb].alt} onClick={(e) => e.stopPropagation()} />
          <button className="lb-nav next" aria-label="Next" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % CHEF.gallery.length); }}>›</button>
        </div>
      )}
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */
const CSS = `
body{margin:0}
html{scroll-behavior:smooth}
.chef-page{
  --ink:#1c1611; --muted:#7a6f63; --cream:#f7f1e6; --paper:#fbf8f1; --card:#fff;
  --espresso:#15110c; --espresso-2:#221b14; --accent:#bf5a33; --accent-d:#a64824;
  --line:rgba(28,22,17,.12); --line-light:rgba(247,241,230,.16);
  background:var(--paper); color:var(--ink);
  font-family:var(--font-inter-body),var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.6; overflow-x:hidden;
}
.chef-page *{box-sizing:border-box}
.chef-page img{display:block;max-width:100%}
.chef-page a{color:inherit;text-decoration:none}
.serif{font-family:var(--font-fraunces),"Hoefler Text",Garamond,Georgia,serif;font-weight:400;letter-spacing:-.01em}
.section{max-width:1200px;margin:0 auto;padding:clamp(64px,9vw,128px) 24px}
.h2{font-size:clamp(30px,4.4vw,52px);line-height:1.05;margin:10px 0 0}
.eyebrow{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:26px;height:1px;background:var(--accent);display:inline-block}
.eyebrow.light{color:#e7b9a3}
.eyebrow.light::before{background:#e7b9a3}
.muted{color:var(--muted);margin:8px 0 0}
.lede{font-size:clamp(15px,1.4vw,18px);color:#4b4239;margin:16px 0 0;max-width:52ch}
.light{color:var(--cream)!important}
.lede.light{color:rgba(247,241,230,.78)!important}
.sec-head{margin-bottom:clamp(28px,4vw,48px)}
.sec-head.center{text-align:center;display:flex;flex-direction:column;align-items:center}

/* buttons */
.btn{display:inline-flex;align-items:center;gap:9px;border:1px solid transparent;border-radius:999px;font-weight:600;font-size:14px;padding:12px 22px;cursor:pointer;transition:transform .25s ease,background .25s ease,color .25s,box-shadow .25s;white-space:nowrap}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 10px 24px -12px rgba(191,90,51,.8)}
.btn-primary:hover{background:var(--accent-d)}
.btn-glass{background:rgba(247,241,230,.1);color:var(--cream);border-color:rgba(247,241,230,.3);backdrop-filter:blur(6px)}
.btn-glass:hover{background:rgba(247,241,230,.18)}
.btn-lg{padding:15px 28px;font-size:15px}
.btn-sm{padding:9px 16px;font-size:13px}
.btn-xs{padding:6px 14px;font-size:12px}
.link-arrow{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;font-size:14px;margin-top:22px;border-bottom:1px solid transparent;transition:gap .2s}
.link-arrow:hover{gap:12px}

/* nav */
.nav{position:fixed;top:0;left:0;right:0;z-index:60;transition:background .35s,box-shadow .35s,padding .35s;padding:18px 0}
.nav.scrolled{background:rgba(251,248,241,.86);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:10px 0}
.nav-in{max-width:1240px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:12px;color:var(--cream)}
.nav.scrolled .brand{color:var(--ink)}
.brand-mark{font-family:var(--font-fraunces),serif;font-size:18px;font-weight:600;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;letter-spacing:0}
.brand-name{font-family:var(--font-fraunces),serif;font-size:17px;letter-spacing:.01em}
.nav-links{display:flex;gap:28px}
.nav-links a{font-size:14px;color:rgba(247,241,230,.86);position:relative;transition:color .2s}
.nav.scrolled .nav-links a{color:var(--ink)}
.nav-links a::after{content:"";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:var(--accent);transition:width .25s}
.nav-links a:hover{color:var(--accent)}
.nav-links a:hover::after{width:100%}
.nav-right{display:flex;align-items:center;gap:14px}
.burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:6px}
.burger span{width:22px;height:2px;background:var(--cream);transition:background .3s}
.nav.scrolled .burger span{background:var(--ink)}
.mobile-menu{display:none}

/* hero */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;justify-content:center;color:var(--cream);overflow:hidden;padding:120px 24px 80px}
.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.05);animation:kb 18s ease-out forwards}
@keyframes kb{to{transform:scale(1.12)}}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,14,10,.55) 0%,rgba(18,14,10,.35) 35%,rgba(18,14,10,.78) 100%)}
.hero-in{position:relative;max-width:1200px;margin:0 auto;width:100%}
.hero-title{font-size:clamp(40px,7vw,86px);line-height:1;margin:18px 0 0;max-width:16ch;text-shadow:0 2px 30px rgba(0,0,0,.3)}
.hero-sub{font-size:clamp(15px,1.6vw,19px);color:rgba(247,241,230,.84);margin:22px 0 0;max-width:48ch}
.hero-cta{display:flex;gap:14px;margin-top:32px;flex-wrap:wrap}
.hero-soc{margin-top:34px}
.hero-pill{position:absolute;top:120px;right:24px;display:flex;align-items:center;gap:9px;background:rgba(247,241,230,.12);backdrop-filter:blur(8px);border:1px solid rgba(247,241,230,.22);color:var(--cream);font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:999px}
.hero-pill .dot{width:8px;height:8px;border-radius:50%;background:#7bd88f;box-shadow:0 0 0 4px rgba(123,216,143,.25)}
.scroll-cue{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:rgba(247,241,230,.7);font-family:var(--font-geist-mono),monospace;font-size:10.5px;letter-spacing:.25em;text-transform:uppercase}
.scroll-cue::after{content:"";display:block;width:1px;height:34px;background:linear-gradient(rgba(247,241,230,.7),transparent);margin:10px auto 0}
.soc{display:flex;gap:12px}
.soc a{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(247,241,230,.28);color:var(--cream);transition:background .2s,transform .2s,color .2s}
.soc a:hover{background:var(--accent);border-color:var(--accent);transform:translateY(-2px)}
.soc-dark a{border-color:rgba(247,241,230,.28);color:var(--cream)}

/* strip */
.strip{max-width:1200px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;transform:translateY(-42px)}
.stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 24px 50px -32px rgba(28,22,17,.3)}
.stat-n{font-size:clamp(28px,3vw,40px);color:var(--accent)}
.stat-l{font-size:13px;color:var(--muted);margin-top:4px}

/* story */
.story{display:grid;grid-template-columns:0.9fr 1.1fr;gap:clamp(32px,6vw,80px);align-items:center}
.story-media{position:relative}
.story-media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:18px}
.story-badge{position:absolute;right:-18px;bottom:-18px;background:var(--accent);color:#fff;border-radius:50%;width:128px;height:128px;display:grid;place-items:center;text-align:center;font-size:15px;line-height:1.25;box-shadow:0 20px 40px -18px rgba(191,90,51,.7)}

/* signatures */
.sig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.sig-img{position:relative;border-radius:16px;overflow:hidden}
.sig-img img{width:100%;aspect-ratio:4/5;object-fit:cover;transition:transform .7s ease}
.sig:hover .sig-img img{transform:scale(1.06)}
.sig-tag{position:absolute;top:14px;left:14px;background:rgba(251,248,241,.92);color:var(--ink);font-size:11px;font-weight:600;letter-spacing:.04em;padding:5px 12px;border-radius:999px;text-transform:uppercase}
.sig-name{font-size:22px;margin:16px 0 0}

/* dark sections */
.dark{background:var(--espresso);color:var(--cream)}
.menus,.hub,.book{max-width:none;margin:0;padding-left:0;padding-right:0}
.menus>*,.hub>*,.book>*{max-width:1200px;margin-left:auto;margin-right:auto;padding-left:24px;padding-right:24px}

/* menus */
.menu-tabs{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:34px}
.menu-tab{background:transparent;border:1px solid var(--line-light);color:rgba(247,241,230,.78);border-radius:999px;padding:11px 22px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}
.menu-tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
.menu-tab:hover:not(.on){border-color:rgba(247,241,230,.5);color:var(--cream)}
.menu-panel{max-width:760px;margin:0 auto;animation:fade .5s ease}
@keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.menu-meta{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding-bottom:18px;margin-bottom:8px;border-bottom:1px solid var(--line-light);flex-wrap:wrap}
.price{font-size:24px;color:#e7b9a3}
.menu-note{font-size:13px;color:rgba(247,241,230,.6)}
.courses{list-style:none;margin:0;padding:0}
.course{display:flex;gap:20px;padding:18px 0;border-bottom:1px solid rgba(247,241,230,.08)}
.course-n{font-size:18px;color:var(--accent);min-width:34px}
.course-t{font-weight:600;font-size:16px}
.course-d{color:rgba(247,241,230,.66);font-size:14.5px;margin-top:2px}
.menu-panel .btn{margin-top:30px}

/* experiences */
.exp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.exp{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .3s,box-shadow .3s;display:flex;flex-direction:column}
.exp:hover{transform:translateY(-6px);box-shadow:0 30px 60px -34px rgba(28,22,17,.4)}
.exp-img{overflow:hidden}
.exp-img img{width:100%;aspect-ratio:3/2;object-fit:cover;transition:transform .7s}
.exp:hover .exp-img img{transform:scale(1.06)}
.exp-body{padding:24px;display:flex;flex-direction:column;flex:1}
.exp-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.exp-title{font-size:21px}
.exp-from{font-size:12px;color:var(--accent);font-weight:600;white-space:nowrap}
.exp-inc{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.exp-inc li{font-size:13px;color:#4b4239;padding-left:18px;position:relative}
.exp-inc li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
.exp .link-arrow{margin-top:auto;padding-top:20px}

/* gallery */
.gal-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:200px;gap:14px}
.gal-item{padding:0;border:0;cursor:pointer;border-radius:14px;overflow:hidden;background:#eee}
.gal-item img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.gal-item:hover img{transform:scale(1.07)}
.gal-item.g0{grid-column:span 2;grid-row:span 2}
.gal-item.g3{grid-row:span 2}

/* hub */
.hub-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:24px}
.hub-card{background:var(--espresso-2);border:1px solid var(--line-light);border-radius:18px;padding:20px;transition:transform .3s,border-color .3s}
.hub-card:hover{transform:translateY(-4px);border-color:rgba(247,241,230,.34)}
.hub-card-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.hub-ico{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,#feda75,#d62976 45%,#962fbf);color:#fff;flex:none}
.hub-t{font-weight:600;font-size:15px}
.hub-m{font-size:12.5px;color:rgba(247,241,230,.6)}
.hub-card-head .btn{margin-left:auto}
.ig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ig-tile{aspect-ratio:1;overflow:hidden;border-radius:8px}
.ig-tile img{width:100%;height:100%;object-fit:cover;transition:transform .5s,filter .3s}
.ig-tile:hover img{transform:scale(1.08)}
.hub-col{display:flex;flex-direction:column;gap:24px}
.yt{display:block;padding:0;overflow:hidden}
.yt-thumb{position:relative}
.yt-thumb img{width:100%;aspect-ratio:16/9;object-fit:cover}
.play{position:absolute;inset:0;margin:auto;width:62px;height:62px;border-radius:50%;background:rgba(191,90,51,.92);color:#fff;display:grid;place-items:center;box-shadow:0 10px 30px -8px rgba(0,0,0,.6);transition:transform .3s}
.yt:hover .play{transform:scale(1.1)}
.yt-meta{padding:16px 20px}
.hub-row{display:grid;grid-template-columns:0.85fr 1.15fr;gap:24px}
.tk{padding:0;overflow:hidden}
.tk-phone{position:relative;height:100%;min-height:220px}
.tk-phone img{width:100%;height:100%;object-fit:cover;min-height:220px}
.tk-likes{position:absolute;right:10px;bottom:42px;color:#fff;font-size:12px;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.tk-cap{position:absolute;left:12px;right:12px;bottom:12px;color:#fff;font-size:12px;text-shadow:0 1px 6px rgba(0,0,0,.8);line-height:1.3}
.sp{background:#121a15}
.sp-top{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.sp-cover{width:56px;height:56px;border-radius:8px;object-fit:cover;flex:none}
.sp .hub-m{color:rgba(247,241,230,.55)}
.sp-tracks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.sp-tracks li{display:flex;align-items:center;gap:10px;font-size:12.5px;color:rgba(247,241,230,.78)}
.sp-bar{width:14px;height:14px;border-radius:50%;border:1.5px solid #1db954;flex:none;position:relative}
.sp-bar::after{content:"";position:absolute;inset:4px;border-radius:50%;background:#1db954}

/* reviews */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.rev{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px;margin:0}
.stars{color:var(--accent);letter-spacing:3px;font-size:14px}
.rev blockquote{font-size:19px;line-height:1.45;margin:16px 0 22px}
.rev figcaption{display:flex;flex-direction:column;gap:2px;font-size:14px}
.rev figcaption span{color:var(--muted);font-size:13px}

/* book */
.book-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,5vw,64px);align-items:center}
.book-actions{display:flex;gap:14px;margin:30px 0 26px;flex-wrap:wrap}
.book-cal{background:var(--espresso-2);border:1px solid var(--line-light);border-radius:20px;padding:26px}
.cal-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:18px}
.cal-head .serif{font-size:20px;color:var(--cream)}
.cal-month{font-size:12px;color:rgba(247,241,230,.55);font-family:var(--font-geist-mono),monospace;letter-spacing:.1em;text-transform:uppercase}
.cal-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px}
.cal-dow span{text-align:center;font-size:11px;color:rgba(247,241,230,.45)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.cal-day{aspect-ratio:1;display:grid;place-items:center;font-size:13px;border-radius:9px;color:rgba(247,241,230,.4);background:rgba(247,241,230,.04)}
.cal-day.avail{background:rgba(123,216,143,.16);color:#bff0c8;font-weight:600;cursor:pointer}
.cal-day.few{background:rgba(229,180,90,.16);color:#f1d29a;font-weight:600;cursor:pointer}
.cal-legend{display:flex;gap:18px;margin:18px 0 0;font-size:12px;color:rgba(247,241,230,.6)}
.cal-legend span{display:flex;align-items:center;gap:7px}
.lg{width:11px;height:11px;border-radius:3px;background:rgba(247,241,230,.1);display:inline-block}
.lg.avail{background:rgba(123,216,143,.5)}
.lg.few{background:rgba(229,180,90,.55)}
.cal-btn{width:100%;justify-content:center;margin-top:20px}

/* faq */
.faq-list{max-width:820px;margin:0 auto}
.faq-item{border-bottom:1px solid var(--line)}
.faq-q{width:100%;background:none;border:0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 0;font-size:clamp(16px,1.6vw,19px);font-weight:600;color:var(--ink);text-align:left}
.faq-plus{color:var(--accent);font-size:24px;flex:none}
.faq-a{max-height:0;overflow:hidden;transition:max-height .35s ease}
.faq-item.open .faq-a{max-height:200px}
.faq-a p{color:var(--muted);margin:0 0 22px;max-width:64ch}

/* footer */
.footer{background-size:cover;background-position:center;color:var(--cream);text-align:center}
.foot-in{max-width:760px;margin:0 auto;padding:clamp(72px,11vw,140px) 24px;display:flex;flex-direction:column;align-items:center}
.foot-title{font-size:clamp(30px,5vw,56px);line-height:1.05;margin:14px 0 30px}
.foot-soc{margin-top:36px}
.foot-fine{display:flex;gap:24px;margin-top:38px;font-size:12.5px;color:rgba(247,241,230,.5);font-family:var(--font-geist-mono),monospace;letter-spacing:.05em}

/* whatsapp float */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:55;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -10px rgba(37,211,102,.7);transition:transform .25s}
.wa-float:hover{transform:scale(1.08)}

/* lightbox */
.lightbox{position:fixed;inset:0;z-index:80;background:rgba(15,11,8,.94);display:grid;place-items:center;padding:40px;animation:fade .25s}
.lightbox img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:8px}
.lb-close{position:absolute;top:20px;right:26px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer;line-height:1}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(247,241,230,.12);border:1px solid rgba(247,241,230,.25);color:#fff;width:52px;height:52px;border-radius:50%;font-size:28px;cursor:pointer;transition:background .2s}
.lb-nav:hover{background:rgba(247,241,230,.25)}
.lb-nav.prev{left:24px}.lb-nav.next{right:24px}

/* reveal */
.reveal{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.2,0,0,1)}
.reveal.in{opacity:1;transform:none}

/* responsive */
@media(max-width:900px){
  .nav-links{display:none}
  .burger{display:flex}
  .mobile-menu{display:flex;flex-direction:column;gap:6px;padding:18px 24px 26px;background:rgba(251,248,241,.98);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  .mobile-menu a:not(.btn){padding:12px 0;color:var(--ink);font-size:16px;border-bottom:1px solid var(--line)}
  .mobile-menu .btn{margin-top:10px;justify-content:center}
  .mobile-menu .soc{margin-top:14px;justify-content:center}
  .mobile-menu .soc a{color:var(--ink);border-color:var(--line)}
  .strip{grid-template-columns:repeat(2,1fr);transform:translateY(-30px)}
  .story{grid-template-columns:1fr}
  .story-badge{width:104px;height:104px;font-size:13px;right:12px;bottom:-14px}
  .sig-grid,.exp-grid,.rev-grid{grid-template-columns:1fr}
  .gal-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:170px}
  .gal-item.g0{grid-column:span 2}
  .hub-grid{grid-template-columns:1fr}
  .hub-row{grid-template-columns:1fr}
  .book-grid{grid-template-columns:1fr}
  .hero-pill{display:none}
}
@media(prefers-reduced-motion:reduce){
  .reveal{opacity:1;transform:none;transition:none}
  .hero-bg{animation:none}
}
`;
