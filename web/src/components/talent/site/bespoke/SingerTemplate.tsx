"use client";
/* eslint-disable @next/next/no-img-element -- bespoke template uses plain <img> with local, pre-sized assets for full layout control */

/**
 * Bespoke premium talent one-pager — "Encore" (Live vocalist / lounge singer).
 *
 * Hand-built (NOT the section registry). Dark, music-forward, fully interactive:
 * hero image SLIDER, an interactive music player, an upcoming-SHOWS calendar,
 * real YouTube embeds (CSP-allowlisted youtube-nocookie), styled Spotify /
 * TikTok / Instagram hubs, gallery + lightbox, reviews, booking, footer, and a
 * floating WhatsApp button.
 *
 * ENGINE-READY: all content + imagery comes from a typed `SingerContent` object
 * passed as the `content` prop (defaults to the Estefy demo). The future Tulala
 * page builder maps a real talent's profile + media + integration settings onto
 * this shape — every banner, slider image, track, show, and video is swappable.
 *
 * Demo audio in the "Watch" embeds is NCS (NoCopyrightSounds), free to use.
 * Imagery: curated Unsplash photos in /public/talent-templates/demo/singer.
 */
import { useEffect, useRef, useState } from "react";

const IMG = "/talent-templates/demo/singer";

export type SingerShow = { day: string; mon: string; venue: string; city: string; type: string; cta: string; booked?: boolean };
export type SingerTrack = { t: string; d: string };
export type SingerVideo = { id: string; title: string; meta: string; thumb: string };
export type SingerContent = typeof ESTEFY;

const ESTEFY = {
  name: "Estefy Alon",
  mark: "EA",
  role: "Live Vocalist & Solo Dancer",
  location: "Mexico City · available worldwide",
  heroSlides: [`${IMG}/01-hero.jpg`, `${IMG}/02-hero.jpg`, `${IMG}/03-hero.jpg`],
  tagline: "The voice that turns a room into a night.",
  heroSub:
    "Restaurants, lounges, weddings, and brand events — soul, bossa, and Latin pop, performed live. Solo, duo, or full band.",
  portrait: `${IMG}/04-portrait.jpg`,
  stats: [
    { n: "300+", l: "Shows performed" },
    { n: "6 yrs", l: "On stage" },
    { n: "4", l: "Languages sung" },
    { n: "120+", l: "Songs in repertoire" },
  ],
  genres: ["Soul", "Bossa nova", "Jazz standards", "Latin pop", "Lounge", "Boleros", "Pop covers", "R&B"],
  venues: ["Mistral Rooftop", "Four Seasons", "Casa Origen", "The Jazz Room", "St. Regis"],
  player: {
    album: "Live & Lounge — Vol. III",
    cover: `${IMG}/10-glam.jpg`,
    tracks: [
      { t: "Sway — live session", d: "3:42" },
      { t: "Corcovado", d: "4:10" },
      { t: "Valerie", d: "3:55" },
      { t: "Quizás, Quizás, Quizás", d: "3:20" },
      { t: "At Last", d: "4:32" },
    ] as SingerTrack[],
    href: "https://open.spotify.com",
  },
  shows: [
    { day: "14", mon: "DEC", venue: "Mistral Rooftop Lounge", city: "Mexico City", type: "Lounge night", cta: "Reserve a table" },
    { day: "20", mon: "DEC", venue: "Casa Origen", city: "Guadalajara", type: "Private event", cta: "Enquire" },
    { day: "31", mon: "DEC", venue: "NYE Gala · Hotel Costa", city: "Puerto Vallarta", type: "Gala", cta: "Tickets" },
    { day: "11", mon: "JAN", venue: "The Jazz Room", city: "Mexico City", type: "Trio set", cta: "Reserve" },
    { day: "18", mon: "JAN", venue: "Hacienda Luz", city: "San Miguel de Allende", type: "Wedding", cta: "Booked", booked: true },
  ] as SingerShow[],
  bio: [
    "Estefy is a live vocalist and solo dancer who has spent six years making rooms feel like the best night of someone’s life — from candlelit lounges to 600-guest galas.",
    "She tailors every set to the moment: an intimate bossa duo for a rooftop dinner, a full-band party for a wedding, a polished standards set for a brand launch.",
  ],
  videos: [
    { id: "bXHfrdi_fsU", title: "Live at Mistral Lounge", meta: "Full set · highlight", thumb: `${IMG}/14-stage.jpg` },
    { id: "kGW5XXYqXkY", title: "Bossa & soul session", meta: "Studio · 5 min", thumb: `${IMG}/05-perf.jpg` },
    { id: "bXHfrdi_fsU", title: "Wedding first-dance", meta: "Highlight · 3 min", thumb: `${IMG}/07-perf.jpg` },
  ] as SingerVideo[],
  tiktoks: [
    { thumb: `${IMG}/06-perf.jpg`, cap: "Soundcheck → showtime ✨", likes: "48.2k" },
    { thumb: `${IMG}/11-glam.jpg`, cap: "That high note though 🎤", likes: "112k" },
    { thumb: `${IMG}/08-perf.jpg`, cap: "Wedding first dance 🥹", likes: "76.5k" },
  ],
  instagram: { handle: "@estefy.alon", tiles: [`${IMG}/05-perf.jpg`, `${IMG}/11-glam.jpg`, `${IMG}/07-perf.jpg`, `${IMG}/12-glam.jpg`, `${IMG}/08-perf.jpg`, `${IMG}/13-glam.jpg`] },
  gallery: [
    { src: `${IMG}/02-hero.jpg`, alt: "On stage" },
    { src: `${IMG}/12-glam.jpg`, alt: "Portrait in sequins" },
    { src: `${IMG}/06-perf.jpg`, alt: "Singing live" },
    { src: `${IMG}/14-stage.jpg`, alt: "Stage with band" },
    { src: `${IMG}/09-guitar.jpg`, alt: "With guitar" },
    { src: `${IMG}/13-glam.jpg`, alt: "Editorial portrait" },
    { src: `${IMG}/08-perf.jpg`, alt: "Mid-performance" },
    { src: `${IMG}/15-perf.jpg`, alt: "Intimate set" },
  ],
  reviews: [
    { quote: "Estefy didn’t just perform — she set the entire tone of the evening. Our guests would not sit down.", author: "Valentina · Events, Four Seasons", stars: 5 },
    { quote: "Booked her for a launch and re-booked within the week. Effortless, magnetic, completely professional.", author: "Marco · Brand Director", stars: 5 },
    { quote: "Our first dance with Estefy live is the moment everyone still mentions. Perfect.", author: "Sofía & Dani · Wedding", stars: 5 },
  ],
  faqs: [
    { q: "Solo, duo, or full band?", a: "All three. Solo with backing tracks or loop, an acoustic duo, or a 3–6 piece band — priced per format and event length." },
    { q: "Can you learn our song?", a: "Yes — a first-dance or a special request learned for your event is included with most bookings. Send it when you enquire." },
    { q: "What do you need on site?", a: "For most rooms I bring a compact PA. For larger events I’ll share a simple tech rider for your venue or AV team." },
  ],
  socials: {
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com",
    youtube: "https://youtube.com",
    spotify: "https://open.spotify.com",
    whatsapp: "https://wa.me/520000000000",
    email: "mailto:hola@estefyalon.com",
  },
};

const NAV = [
  { id: "music", label: "Music" },
  { id: "shows", label: "Shows" },
  { id: "about", label: "About" },
  { id: "watch", label: "Watch" },
  { id: "gallery", label: "Gallery" },
  { id: "book", label: "Book" },
];

const ig = "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.2.4.4 1 .4 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.2-1 .4-2.2.4-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-1-.4-.4-.7-.8-1-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.6A6.2 6.2 0 1 0 12 18.2 6.2 6.2 0 0 0 12 5.8Zm0 10.2A4 4 0 1 1 12 8a4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z";
const tk = "M16.5 3c.3 2 1.5 3.6 3.5 3.9V10c-1.4 0-2.7-.4-3.9-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.07v3.1a2.6 2.6 0 1 0 1.8 2.5V3h3.3Z";
const yt = "M23 12s0-3.1-.4-4.6a2.4 2.4 0 0 0-1.7-1.7C19.4 5.3 12 5.3 12 5.3s-7.4 0-8.9.4A2.4 2.4 0 0 0 1.4 7.4C1 8.9 1 12 1 12s0 3.1.4 4.6a2.4 2.4 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.4 2.4 0 0 0 1.7-1.7C23 15.1 23 12 23 12ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z";
const sp = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.8-2.2-11.2-1.2a.8.8 0 1 1-.3-1.6c4.8-1 9-.6 12.3 1.4.4.2.5.7.3 1.1Zm1.2-2.7a1 1 0 0 1-1.3.3C13.1 12 8 11.5 4.3 12.6a1 1 0 1 1-.6-1.9C8 9.5 13.6 10 17.5 12.4a1 1 0 0 1 .3 1.3Zm.1-2.8C14.4 8 8.2 7.8 4.7 8.9a1.2 1.2 0 1 1-.7-2.3C8.1 5.4 15 5.6 19.4 8.2a1.2 1.2 0 1 1-1.2 2Z";

function I({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={d} /></svg>;
}
function Socials({ s }: { s: SingerContent["socials"] }) {
  const items = [
    [s.spotify, sp, "Spotify"], [s.instagram, ig, "Instagram"], [s.tiktok, tk, "TikTok"], [s.youtube, yt, "YouTube"],
  ] as const;
  return (
    <div className="soc">
      {items.map(([href, d, label]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}><I d={d} /></a>
      ))}
    </div>
  );
}

export function SingerTemplate({ content = ESTEFY }: { content?: SingerContent }) {
  const c = content;
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState<number | null>(0);
  const [video, setVideo] = useState<string | null>(null);
  const [lb, setLb] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % c.heroSlides.length), 5200);
    return () => clearInterval(t);
  }, [c.heroSlides.length]);

  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal");
    if (!els) return;
    const io = new IntersectionObserver(
      (en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLb(null); setVideo(null); }
      if (lb !== null && e.key === "ArrowRight") setLb((i) => (i === null ? 0 : (i + 1) % c.gallery.length));
      if (lb !== null && e.key === "ArrowLeft") setLb((i) => (i === null ? 0 : (i - 1 + c.gallery.length) % c.gallery.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb, c.gallery.length]);

  const close = () => setMenuOpen(false);

  return (
    <div className="singer-page" ref={root}>
      <style>{CSS}</style>

      {/* NAV */}
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-in">
          <a href="#top" className="brand" onClick={close}><span className="brand-mark">{c.mark}</span><span className="brand-name">{c.name}</span></a>
          <nav className="nav-links">{NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={close}>{n.label}</a>)}</nav>
          <div className="nav-right">
            <a className="btn btn-sm btn-primary" href="#book">Book Estefy</a>
            <button className="burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}><span /><span /><span /></button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={close}>{n.label}</a>)}
            <a className="btn btn-primary" href="#book" onClick={close}>Book Estefy</a>
            <Socials s={c.socials} />
          </div>
        )}
      </header>

      {/* HERO SLIDER */}
      <section className="hero" id="top">
        {c.heroSlides.map((src, i) => (
          <div key={src} className={`hero-slide ${i === slide ? "on" : ""}`} style={{ backgroundImage: `url(${src})` }} />
        ))}
        <div className="hero-scrim" />
        <div className="hero-glow" />
        <div className="hero-in">
          <div className="eyebrow">{c.role}</div>
          <h1 className="serif hero-title">{c.tagline}</h1>
          <p className="hero-sub">{c.heroSub}</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#book">Book Estefy</a>
            <a className="btn btn-glass btn-lg" href="#music"><I d="M8 5v14l11-7z" size={15} /> Listen</a>
          </div>
          <Socials s={c.socials} />
        </div>
        <div className="hero-next">
          <span className="live-dot" /> Next show · {c.shows[0].mon} {c.shows[0].day} · {c.shows[0].venue}
        </div>
        <div className="hero-dots">
          {c.heroSlides.map((_, i) => (
            <button key={i} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      </section>

      {/* GENRE MARQUEE */}
      <div className="marquee"><div className="marquee-track">{[...c.genres, ...c.genres].map((g, i) => <span key={i}>{g}<i>✦</i></span>)}</div></div>

      {/* STATS */}
      <section className="strip">
        {c.stats.map((s) => <div key={s.l} className="stat reveal"><div className="serif stat-n">{s.n}</div><div className="stat-l">{s.l}</div></div>)}
      </section>

      {/* MUSIC PLAYER */}
      <section className="section music" id="music">
        <div className="sec-head reveal"><div className="eyebrow">Listen</div><h2 className="serif h2">Press play</h2></div>
        <div className="player reveal">
          <div className="player-cover"><img src={c.player.cover} alt={c.player.album} /><span className={`cover-eq ${playing !== null ? "on" : ""}`}><i /><i /><i /><i /></span></div>
          <div className="player-body">
            <div className="player-top">
              <div><div className="player-album serif">{c.player.album}</div><div className="player-by">{c.name}</div></div>
              <a className="btn btn-spotify" href={c.player.href} target="_blank" rel="noopener noreferrer"><I d={sp} size={16} /> Spotify</a>
            </div>
            <ul className="tracks">
              {c.player.tracks.map((tr, i) => (
                <li key={tr.t} className={`track ${playing === i ? "on" : ""}`} onClick={() => setPlaying(playing === i ? null : i)}>
                  <button className="track-play" aria-label="Play">{playing === i ? <I d="M6 5h4v14H6zM14 5h4v14h-4z" size={14} /> : <I d="M8 5v14l11-7z" size={14} />}</button>
                  <span className="track-name">{tr.t}</span>
                  {playing === i ? <span className="eq"><i /><i /><i /></span> : <span className="track-d">{tr.d}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* SHOWS */}
      <section className="section shows" id="shows">
        <div className="sec-head between reveal">
          <div><div className="eyebrow">On tour</div><h2 className="serif h2">Upcoming shows</h2></div>
          <a className="btn btn-ghost" href="#book">Book a private date</a>
        </div>
        <div className="show-list">
          {c.shows.map((s, i) => (
            <div key={i} className={`show reveal ${s.booked ? "is-booked" : ""}`}>
              <div className="show-date"><span className="serif show-day">{s.day}</span><span className="show-mon">{s.mon}</span></div>
              <div className="show-main">
                <div className="show-venue">{s.venue}</div>
                <div className="show-meta">{s.city} · <span className="show-type">{s.type}</span></div>
              </div>
              {s.booked
                ? <span className="show-booked">Sold out</span>
                : <a className="btn btn-sm btn-outline" href="#book">{s.cta}</a>}
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="section about" id="about">
        <div className="about-media reveal"><img src={c.portrait} alt={c.name} /></div>
        <div className="about-copy reveal">
          <div className="eyebrow">The artist</div>
          <h2 className="serif h2">{c.name}</h2>
          {c.bio.map((p, i) => <p key={i} className="lede">{p}</p>)}
          <div className="venues"><span className="venues-l">Heard at</span>{c.venues.map((v) => <span key={v} className="venue-chip">{v}</span>)}</div>
          <a className="link-arrow" href="#book">Enquire about a date <I d="M5 12h14M13 6l6 6-6 6" size={15} /></a>
        </div>
      </section>

      {/* WATCH */}
      <section className="section watch" id="watch">
        <div className="sec-head reveal"><div className="eyebrow">Watch</div><h2 className="serif h2">Live, on camera</h2></div>
        <div className="watch-grid">
          <div className="watch-main reveal">
            {video ? (
              <iframe className="yt-frame" src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1&rel=0`} title="Performance" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            ) : (
              <button className="yt-facade" onClick={() => setVideo(c.videos[0].id)} aria-label="Play video">
                <img src={c.videos[0].thumb} alt={c.videos[0].title} />
                <span className="play-lg"><I d="M8 5v14l11-7z" size={26} /></span>
                <span className="yt-cap"><strong>{c.videos[0].title}</strong>{c.videos[0].meta}</span>
              </button>
            )}
          </div>
          <div className="watch-side">
            {c.videos.slice(1).map((v, i) => (
              <button key={i} className="watch-thumb reveal" onClick={() => setVideo(v.id)}>
                <img src={v.thumb} alt={v.title} /><span className="play-sm"><I d="M8 5v14l11-7z" size={15} /></span>
                <span className="wt-cap"><strong>{v.title}</strong>{v.meta}</span>
              </button>
            ))}
            <div className="watch-note">Demo clips · NCS (free-to-use audio)</div>
          </div>
        </div>
      </section>

      {/* SOCIAL HUB (tiktok + instagram) */}
      <section className="section hub">
        <div className="hub-grid">
          <div className="hub-tiktok reveal">
            <div className="hub-head"><span className="hub-ico tk"><I d={tk} /></span><div><div className="hub-t">TikTok</div><div className="hub-m">{c.instagram.handle}</div></div><a className="btn btn-xs btn-outline" href={c.socials.tiktok} target="_blank" rel="noopener noreferrer">Follow</a></div>
            <div className="tk-row">
              {c.tiktoks.map((t, i) => (
                <a key={i} href={c.socials.tiktok} target="_blank" rel="noopener noreferrer" className="tk-card">
                  <img src={t.thumb} alt="" /><span className="tk-likes"><I d="M12 21s-7-4.5-9.5-9C1 9 2.5 6 5.5 6 7.5 6 9 7.5 12 10c3-2.5 4.5-4 6.5-4 3 0 4.5 3 3 6-2.5 4.5-9.5 9-9.5 9Z" size={12} /> {t.likes}</span><span className="tk-cap">{t.cap}</span>
                </a>
              ))}
            </div>
          </div>
          <div className="hub-ig reveal">
            <div className="hub-head"><span className="hub-ico ig"><I d={ig} /></span><div><div className="hub-t">Instagram</div><div className="hub-m">{c.instagram.handle}</div></div><a className="btn btn-xs btn-outline" href={c.socials.instagram} target="_blank" rel="noopener noreferrer">Follow</a></div>
            <div className="ig-grid">
              {c.instagram.tiles.map((t, i) => <a key={i} href={c.socials.instagram} target="_blank" rel="noopener noreferrer" className="ig-tile"><img src={t} alt="" /></a>)}
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section className="section gallery" id="gallery">
        <div className="sec-head reveal"><div className="eyebrow">Gallery</div><h2 className="serif h2">From the stage</h2></div>
        <div className="gal-grid">
          {c.gallery.map((g, i) => <button key={i} className={`gal-item reveal g${i % 5}`} onClick={() => setLb(i)}><img src={g.src} alt={g.alt} /></button>)}
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section reviews">
        <div className="sec-head reveal"><div className="eyebrow">Kind words</div><h2 className="serif h2">Booked again &amp; again</h2></div>
        <div className="rev-grid">
          {c.reviews.map((r, i) => (
            <figure key={i} className="rev reveal"><div className="stars">{"★".repeat(r.stars)}</div><blockquote className="serif">“{r.quote}”</blockquote><figcaption>{r.author}</figcaption></figure>
          ))}
        </div>
      </section>

      {/* BOOK */}
      <section className="section book" id="book">
        <div className="book-grid">
          <div className="book-copy reveal">
            <div className="eyebrow">Booking</div>
            <h2 className="serif h2">Bring Estefy to your night</h2>
            <p className="lede">Tell me the date, the room, and the vibe. I’ll reply within 24 hours with availability, formats, and a quote.</p>
            <div className="book-actions">
              <a className="btn btn-primary btn-lg" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              <a className="btn btn-glass btn-lg" href={c.socials.email}>Email Estefy</a>
            </div>
            <Socials s={c.socials} />
          </div>
          <form className="book-form reveal" onSubmit={(e) => e.preventDefault()}>
            <div className="field"><label>Your name</label><input placeholder="Jane Doe" /></div>
            <div className="field-row">
              <div className="field"><label>Date</label><input placeholder="Dec 31, 2026" /></div>
              <div className="field"><label>Guests</label><input placeholder="80" /></div>
            </div>
            <div className="field"><label>Type of event</label>
              <select><option>Lounge / restaurant</option><option>Wedding</option><option>Corporate / brand</option><option>Private party</option><option>Gala</option></select>
            </div>
            <button className="btn btn-primary btn-block" type="submit">Request availability</button>
            <p className="form-note">No commitment — just a conversation.</p>
          </form>
        </div>
      </section>

      {/* FAQ */}
      <section className="section faq">
        <div className="faq-list">
          {c.faqs.map((f, i) => (
            <details key={i} className="faq-item reveal" open={i === 0}>
              <summary>{f.q}<span className="faq-plus" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer" style={{ backgroundImage: `linear-gradient(rgba(10,9,14,.78),rgba(10,9,14,.92)), url(${c.heroSlides[1]})` }}>
        <div className="foot-in">
          <div className="eyebrow">{c.location}</div>
          <h2 className="serif foot-title">Let’s make a night to remember.</h2>
          <a className="btn btn-primary btn-lg" href="#book">Book Estefy</a>
          <Socials s={c.socials} />
          <div className="foot-fine"><span>© {c.name}</span><span>Made on Tulala</span></div>
        </div>
      </footer>

      <a className="wa-float" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5c-.2.2-.3.4-.1.6.5.8 1 1.4 1.7 1.9.6.4 1 .6 1.3.7.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.6-.1 1.1Z" /></svg>
      </a>

      {video && (
        <button className="vid-close" onClick={() => setVideo(null)} aria-label="Close video">Close ×</button>
      )}

      {lb !== null && (
        <div className="lightbox" onClick={() => setLb(null)}>
          <button className="lb-close" onClick={() => setLb(null)} aria-label="Close">×</button>
          <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + c.gallery.length) % c.gallery.length); }} aria-label="Previous">‹</button>
          <img src={c.gallery[lb].src} alt={c.gallery[lb].alt} onClick={(e) => e.stopPropagation()} />
          <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % c.gallery.length); }} aria-label="Next">›</button>
        </div>
      )}
    </div>
  );
}

const CSS = `
body{margin:0;background:#0c0b10}
html{scroll-behavior:smooth}
.singer-page{
  --bg:#0c0b10; --bg-2:#131119; --card:#17151f; --line:rgba(244,239,230,.12);
  --ink:#f4efe6; --muted:rgba(244,239,230,.6); --accent:#d8b46a; --accent-d:#c79f4f; --rose:#c95f86;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-inter-body),var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.6; overflow-x:hidden;
}
.singer-page *{box-sizing:border-box}
.singer-page img{display:block;max-width:100%}
.singer-page a{color:inherit;text-decoration:none}
.serif{font-family:var(--font-fraunces),"Hoefler Text",Garamond,Georgia,serif;font-weight:400;letter-spacing:-.01em}
.section{max-width:1200px;margin:0 auto;padding:clamp(60px,8vw,116px) 24px}
.h2{font-size:clamp(30px,4.4vw,52px);line-height:1.04;margin:8px 0 0}
.eyebrow{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--accent)}
.muted{color:var(--muted)}
.lede{font-size:clamp(15px,1.4vw,18px);color:rgba(244,239,230,.78);margin:16px 0 0;max-width:54ch}
.sec-head{margin-bottom:clamp(26px,4vw,46px)}
.sec-head.between{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}

.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:999px;font-weight:600;font-size:14px;padding:12px 22px;cursor:pointer;transition:transform .25s,background .25s,color .25s,border-color .25s;white-space:nowrap}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--accent);color:#1a1408;box-shadow:0 12px 28px -14px rgba(216,180,106,.7)}
.btn-primary:hover{background:var(--accent-d)}
.btn-glass{background:rgba(244,239,230,.08);color:var(--ink);border-color:rgba(244,239,230,.26);backdrop-filter:blur(6px)}
.btn-glass:hover{background:rgba(244,239,230,.16)}
.btn-outline{background:transparent;color:var(--ink);border-color:rgba(244,239,230,.32)}
.btn-outline:hover{border-color:var(--accent);color:var(--accent)}
.btn-ghost{background:transparent;color:var(--accent);border-color:rgba(216,180,106,.4)}
.btn-ghost:hover{background:rgba(216,180,106,.1)}
.btn-spotify{background:#1db954;color:#04140a;border:0}
.btn-lg{padding:15px 28px;font-size:15px}
.btn-sm{padding:9px 16px;font-size:13px}
.btn-xs{padding:6px 13px;font-size:12px}
.btn-block{width:100%;justify-content:center;margin-top:6px}
.link-arrow{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;font-size:14px;margin-top:24px;transition:gap .2s}
.link-arrow:hover{gap:12px}
.soc{display:flex;gap:11px;margin-top:30px}
.soc a{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(244,239,230,.24);color:var(--ink);transition:all .2s}
.soc a:hover{background:var(--accent);color:#1a1408;border-color:var(--accent);transform:translateY(-2px)}

/* nav */
.nav{position:fixed;inset:0 0 auto;z-index:60;padding:18px 0;transition:all .35s}
.nav.scrolled{background:rgba(12,11,16,.82);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:11px 0}
.nav-in{max-width:1240px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:12px}
.brand-mark{font-family:var(--font-fraunces),serif;font-size:17px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--accent);color:var(--accent)}
.brand-name{font-family:var(--font-fraunces),serif;font-size:17px}
.nav-links{display:flex;gap:28px}
.nav-links a{font-size:14px;color:rgba(244,239,230,.8);position:relative;transition:color .2s}
.nav-links a::after{content:"";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:var(--accent);transition:width .25s}
.nav-links a:hover{color:var(--accent)}.nav-links a:hover::after{width:100%}
.nav-right{display:flex;align-items:center;gap:14px}
.burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:6px}
.burger span{width:22px;height:2px;background:var(--ink)}
.mobile-menu{display:none}

/* hero */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:120px 24px 96px;overflow:hidden}
.hero-slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transform:scale(1.06);transition:opacity 1.4s ease,transform 6s ease}
.hero-slide.on{opacity:1;transform:scale(1.12)}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,9,14,.55),rgba(10,9,14,.4) 30%,rgba(10,9,14,.86))}
.hero-glow{position:absolute;inset:0;background:radial-gradient(120% 80% at 80% 0%,rgba(201,95,134,.28),transparent 50%),radial-gradient(80% 60% at 10% 100%,rgba(216,180,106,.18),transparent 55%);mix-blend-mode:screen;pointer-events:none}
.hero-in{position:relative;max-width:1200px;margin:0 auto;width:100%}
.hero-title{font-size:clamp(40px,7.4vw,92px);line-height:.98;margin:18px 0 0;max-width:15ch;text-shadow:0 2px 40px rgba(0,0,0,.4)}
.hero-sub{font-size:clamp(15px,1.6vw,19px);color:rgba(244,239,230,.82);margin:22px 0 0;max-width:46ch}
.hero-cta{display:flex;gap:14px;margin-top:32px;flex-wrap:wrap}
.hero-next{position:absolute;top:120px;right:24px;display:flex;align-items:center;gap:9px;background:rgba(244,239,230,.1);border:1px solid rgba(244,239,230,.2);backdrop-filter:blur(8px);padding:9px 15px;border-radius:999px;font-size:12px}
.live-dot{width:8px;height:8px;border-radius:50%;background:var(--rose);box-shadow:0 0 0 4px rgba(201,95,134,.25);animation:pulse 1.8s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 7px rgba(201,95,134,0)}}
.hero-dots{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);display:flex;gap:10px}
.hero-dots button{width:9px;height:9px;border-radius:50%;border:1px solid rgba(244,239,230,.5);background:transparent;cursor:pointer;transition:all .3s;padding:0}
.hero-dots button.on{background:var(--accent);border-color:var(--accent);width:26px;border-radius:6px}

/* marquee */
.marquee{background:var(--bg-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:hidden;padding:16px 0}
.marquee-track{display:flex;gap:0;white-space:nowrap;animation:scroll 26s linear infinite;width:max-content}
.marquee-track span{font-family:var(--font-fraunces),serif;font-size:22px;color:rgba(244,239,230,.78);display:inline-flex;align-items:center}
.marquee-track i{color:var(--accent);margin:0 28px;font-style:normal;font-size:12px}
@keyframes scroll{to{transform:translateX(-50%)}}

/* strip */
.strip{max-width:1200px;margin:0 auto;padding:clamp(48px,7vw,80px) 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.stat{text-align:center}
.stat-n{font-size:clamp(30px,3.4vw,46px);color:var(--accent)}
.stat-l{font-size:13px;color:var(--muted);margin-top:4px}

/* music player */
.player{display:grid;grid-template-columns:300px 1fr;gap:0;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.player-cover{position:relative;min-height:300px}
.player-cover img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.cover-eq{position:absolute;left:18px;bottom:18px;display:flex;gap:4px;align-items:flex-end;height:26px;opacity:0;transition:opacity .3s}
.cover-eq.on{opacity:1}
.cover-eq i{width:4px;background:var(--accent);border-radius:2px;height:8px;animation:eq 1s ease-in-out infinite}
.cover-eq i:nth-child(2){animation-delay:.2s}.cover-eq i:nth-child(3){animation-delay:.4s}.cover-eq i:nth-child(4){animation-delay:.1s}
@keyframes eq{0%,100%{height:7px}50%{height:24px}}
.player-body{padding:26px}
.player-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.player-album{font-size:22px}
.player-by{font-size:13px;color:var(--muted)}
.tracks{list-style:none;margin:0;padding:0}
.track{display:flex;align-items:center;gap:14px;padding:13px 12px;border-radius:10px;cursor:pointer;transition:background .2s}
.track:hover{background:rgba(244,239,230,.05)}
.track.on{background:rgba(216,180,106,.1)}
.track-play{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink);display:grid;place-items:center;cursor:pointer;flex:none}
.track.on .track-play{background:var(--accent);color:#1a1408;border-color:var(--accent)}
.track-name{flex:1;font-size:14.5px}
.track.on .track-name{color:var(--accent)}
.track-d{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.eq{display:flex;gap:3px;align-items:flex-end;height:16px}
.eq i{width:3px;background:var(--accent);border-radius:2px;height:6px;animation:eq .9s ease-in-out infinite}
.eq i:nth-child(2){animation-delay:.2s}.eq i:nth-child(3){animation-delay:.4s}

/* shows */
.show-list{display:flex;flex-direction:column;gap:12px}
.show{display:flex;align-items:center;gap:22px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px;transition:border-color .25s,transform .25s}
.show:hover{border-color:rgba(216,180,106,.4);transform:translateX(4px)}
.show.is-booked{opacity:.55}
.show-date{display:flex;flex-direction:column;align-items:center;min-width:54px}
.show-day{font-size:26px;line-height:1;color:var(--accent)}
.show-mon{font-size:11px;letter-spacing:.15em;color:var(--muted)}
.show-main{flex:1}
.show-venue{font-size:17px;font-weight:600}
.show-meta{font-size:13.5px;color:var(--muted);margin-top:2px}
.show-type{color:rgba(244,239,230,.78)}
.show-booked{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}

/* about */
.about{display:grid;grid-template-columns:0.9fr 1.1fr;gap:clamp(32px,6vw,80px);align-items:center}
.about-media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:18px}
.venues{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:24px}
.venues-l{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-right:6px}
.venue-chip{font-size:12.5px;border:1px solid var(--line);border-radius:999px;padding:6px 13px;color:rgba(244,239,230,.82)}

/* watch */
.watch-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:22px}
.watch-main{border-radius:16px;overflow:hidden;background:#000;aspect-ratio:16/9;position:relative}
.yt-frame{width:100%;height:100%;border:0;display:block}
.yt-facade{width:100%;height:100%;padding:0;border:0;cursor:pointer;position:relative;background:#000}
.yt-facade img{width:100%;height:100%;object-fit:cover;opacity:.86;transition:opacity .3s,transform .6s}
.yt-facade:hover img{opacity:.7;transform:scale(1.03)}
.play-lg{position:absolute;inset:0;margin:auto;width:74px;height:74px;border-radius:50%;background:rgba(216,180,106,.95);color:#1a1408;display:grid;place-items:center;box-shadow:0 12px 36px -8px rgba(0,0,0,.7);transition:transform .3s}
.yt-facade:hover .play-lg{transform:scale(1.1)}
.yt-cap,.wt-cap{position:absolute;left:18px;bottom:16px;display:flex;flex-direction:column;color:#fff;text-align:left;text-shadow:0 1px 10px rgba(0,0,0,.8);font-size:12.5px;gap:1px}
.yt-cap strong,.wt-cap strong{font-size:16px;font-weight:600}
.watch-side{display:flex;flex-direction:column;gap:14px}
.watch-thumb{position:relative;border:0;padding:0;cursor:pointer;border-radius:12px;overflow:hidden;background:#000;flex:1;min-height:96px}
.watch-thumb img{width:100%;height:100%;object-fit:cover;opacity:.8;transition:all .4s;min-height:96px}
.watch-thumb:hover img{opacity:.6}
.play-sm{position:absolute;inset:0;margin:auto;width:42px;height:42px;border-radius:50%;background:rgba(216,180,106,.95);color:#1a1408;display:grid;place-items:center}
.wt-cap{font-size:11.5px}.wt-cap strong{font-size:14px}
.watch-note{font-size:11px;color:var(--muted);text-align:center;padding-top:2px}
.vid-close{position:fixed;top:18px;right:18px;z-index:70;background:rgba(12,11,16,.9);color:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 16px;font-size:13px;cursor:pointer}

/* hub */
.hub-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.hub-tiktok,.hub-ig{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
.hub-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.hub-ico{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:#fff;flex:none}
.hub-ico.tk{background:#111}.hub-ico.ig{background:linear-gradient(135deg,#feda75,#d62976 45%,#962fbf)}
.hub-t{font-weight:600;font-size:15px}.hub-m{font-size:12.5px;color:var(--muted)}
.hub-head .btn{margin-left:auto}
.tk-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tk-card{position:relative;aspect-ratio:9/16;border-radius:12px;overflow:hidden;background:#000}
.tk-card img{width:100%;height:100%;object-fit:cover;opacity:.9;transition:all .4s}
.tk-card:hover img{transform:scale(1.05)}
.tk-likes{position:absolute;top:10px;right:10px;color:#fff;font-size:11px;font-weight:600;display:flex;align-items:center;gap:3px;text-shadow:0 1px 6px rgba(0,0,0,.7)}
.tk-cap{position:absolute;left:10px;right:10px;bottom:10px;color:#fff;font-size:11.5px;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.9)}
.ig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ig-tile{aspect-ratio:1;border-radius:8px;overflow:hidden}
.ig-tile img{width:100%;height:100%;object-fit:cover;transition:transform .5s}
.ig-tile:hover img{transform:scale(1.08)}

/* gallery */
.gal-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:200px;gap:14px}
.gal-item{padding:0;border:0;cursor:pointer;border-radius:14px;overflow:hidden;background:#222}
.gal-item img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.gal-item:hover img{transform:scale(1.07)}
.gal-item.g0{grid-column:span 2;grid-row:span 2}
.gal-item.g3{grid-row:span 2}

/* reviews */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.rev{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px;margin:0}
.stars{color:var(--accent);letter-spacing:3px;font-size:14px}
.rev blockquote{font-size:18px;line-height:1.45;margin:16px 0 22px}
.rev figcaption{font-size:13.5px;color:var(--muted)}

/* book */
.book-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,60px);align-items:center}
.book-form{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.field input,.field select{background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--ink);font-size:14px;font-family:inherit}
.field input:focus,.field select:focus{outline:none;border-color:var(--accent)}
.form-note{font-size:12px;color:var(--muted);text-align:center;margin:4px 0 0}

/* faq */
.faq-list{max-width:780px;margin:0 auto}
.faq-item{border-bottom:1px solid var(--line)}
.faq-item summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px 0;font-size:clamp(16px,1.6vw,19px);font-weight:600}
.faq-item summary::-webkit-details-marker{display:none}
.faq-plus{position:relative;width:16px;height:16px;flex:none}
.faq-plus::before,.faq-plus::after{content:"";position:absolute;background:var(--accent);transition:transform .3s}
.faq-plus::before{top:7px;left:0;width:16px;height:2px}
.faq-plus::after{top:0;left:7px;width:2px;height:16px}
.faq-item[open] .faq-plus::after{transform:rotate(90deg);opacity:0}
.faq-item p{color:var(--muted);margin:0 0 22px;max-width:64ch}

/* footer */
.footer{background-size:cover;background-position:center;text-align:center}
.foot-in{max-width:760px;margin:0 auto;padding:clamp(72px,11vw,140px) 24px;display:flex;flex-direction:column;align-items:center}
.foot-title{font-size:clamp(30px,5vw,56px);line-height:1.05;margin:14px 0 30px}
.foot-in .soc{margin-top:34px}
.foot-fine{display:flex;gap:24px;margin-top:36px;font-size:12.5px;color:var(--muted);font-family:var(--font-geist-mono),monospace}

/* whatsapp + lightbox */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:55;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -10px rgba(37,211,102,.7);transition:transform .25s}
.wa-float:hover{transform:scale(1.08)}
.lightbox{position:fixed;inset:0;z-index:80;background:rgba(8,7,11,.95);display:grid;place-items:center;padding:40px}
.lightbox img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:8px}
.lb-close{position:absolute;top:20px;right:26px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(244,239,230,.12);border:1px solid rgba(244,239,230,.25);color:#fff;width:52px;height:52px;border-radius:50%;font-size:28px;cursor:pointer}
.lb-nav.prev{left:24px}.lb-nav.next{right:24px}

/* reveal */
.reveal{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.2,0,0,1)}
.reveal.in{opacity:1;transform:none}

@media(max-width:900px){
  .nav-links{display:none}.burger{display:flex}
  .mobile-menu{display:flex;flex-direction:column;gap:6px;padding:18px 24px 24px;background:rgba(12,11,16,.98);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  .mobile-menu a:not(.btn){padding:12px 0;font-size:16px;border-bottom:1px solid var(--line)}
  .mobile-menu .btn{margin-top:10px;justify-content:center}.mobile-menu .soc{justify-content:center}
  .strip{grid-template-columns:repeat(2,1fr)}
  .player{grid-template-columns:1fr}.player-cover{min-height:220px;aspect-ratio:16/10}
  .about{grid-template-columns:1fr}
  .watch-grid{grid-template-columns:1fr}
  .hub-grid{grid-template-columns:1fr}
  .gal-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:160px}.gal-item.g0{grid-column:span 2}
  .rev-grid{grid-template-columns:1fr}
  .book-grid{grid-template-columns:1fr}
  .hero-next{display:none}
}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.hero-slide{transition:opacity .4s}.marquee-track{animation:none}}
`;
