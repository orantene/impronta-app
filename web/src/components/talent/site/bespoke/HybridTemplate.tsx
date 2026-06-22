"use client";
/* eslint-disable @next/next/no-img-element -- bespoke template uses plain <img> with local, pre-sized assets for full layout control */

/**
 * Bespoke premium one-pager for MULTI-DISCIPLINE talent.
 *
 * The UX problem: one person selling several distinct crafts (e.g. a singer who
 * also gives massages; a chef who also bartends and does bodywork) without the
 * page feeling cluttered. The solution is a DISCIPLINE SWITCHER: a segmented
 * control (in the hero and the sticky nav) that "flips" the offer — hero image,
 * tagline, services, price list, gallery, and CTA all swap to the selected
 * craft, and the page's accent theme shifts with it. Shared sections (identity,
 * about, reviews, journal/blog, booking, integrations) stay constant so the page
 * still reads as one artist.
 *
 * ENGINE-READY: everything is a typed `HybridContent` object with a
 * `disciplines[]` array. The page builder composes any combination of crafts by
 * mapping a talent's profiles + media + integration settings onto this shape.
 *
 * Imagery: curated Unsplash sets under /public/talent-templates/demo/{singer,chef,bar,massage}.
 */
import { useEffect, useMemo, useRef, useState } from "react";

const D = "/talent-templates/demo";

const ig = "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.2.4.4 1 .4 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.2-1 .4-2.2.4-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-1-.4-.4-.7-.8-1-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.6A6.2 6.2 0 1 0 12 18.2 6.2 6.2 0 0 0 12 5.8Zm0 10.2A4 4 0 1 1 12 8a4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z";
const sp = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.8-2.2-11.2-1.2a.8.8 0 1 1-.3-1.6c4.8-1 9-.6 12.3 1.4.4.2.5.7.3 1.1Zm1.2-2.7a1 1 0 0 1-1.3.3C13.1 12 8 11.5 4.3 12.6a1 1 0 1 1-.6-1.9C8 9.5 13.6 10 17.5 12.4a1 1 0 0 1 .3 1.3Zm.1-2.8C14.4 8 8.2 7.8 4.7 8.9a1.2 1.2 0 1 1-.7-2.3C8.1 5.4 15 5.6 19.4 8.2a1.2 1.2 0 1 1-1.2 2Z";
const waPath = "M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5c-.2.2-.3.4-.1.6.5.8 1 1.4 1.7 1.9.6.4 1 .6 1.3.7.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.6-.1 1.1Z";

// Monoline stroke icons for the discipline switcher.
const DISC_ICON: Record<string, string> = {
  music: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z M6 12a6 6 0 0 0 12 0 M12 18v3 M8.5 21h7",
  bodywork: "M5 20c0-8 6-14 14-15 1 8-5 15-14 15Z M6 19c3-4 7-7 11-8",
  chef: "M8 21h8v-3H8z M8 18a4.5 4.5 0 1 1 1.2-8.8 3.6 3.6 0 0 1 6.6 0A4.5 4.5 0 1 1 16 18",
  bar: "M5 4h14l-7 8-7-8Z M12 12v6 M8.5 18h7",
  model: "M12 3l1.9 5.2 5.6.1-4.5 3.4 1.7 5.3L12 14.9 7.3 17l1.7-5.3L4.5 8.3l5.6-.1z",
  dj: "M4 14v-2a8 8 0 0 1 16 0v2 M4 14a2 2 0 0 1 2-2h2v6H6a2 2 0 0 1-2-2Z M20 14a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2Z",
};

type Track = { t: string; d: string };
type Discipline = {
  key: keyof typeof DISC_ICON | string;
  short: string;
  label: string;
  accent: string;
  accentInk: string;
  hero: string;
  tagline: string;
  sub: string;
  cta: { label: string; href: string };
  intro: string;
  services: { title: string; desc: string; img: string }[];
  offer: { heading: string; note?: string; items: { name: string; meta: string; detail?: string }[] };
  gallery: string[];
  player?: { album: string; cover: string; tracks: Track[]; href: string };
  shows?: { day: string; mon: string; venue: string; city: string }[];
};
export type HybridContent = {
  name: string;
  mark: string;
  roleLine: string;
  location: string;
  portrait: string;
  about: string[];
  disciplines: Discipline[];
  reviews: { quote: string; author: string; tag: string }[];
  blog: { cover: string; cat: string; date: string; title: string; excerpt: string; min: string }[];
  socials: { instagram: string; spotify: string; whatsapp: string; email: string };
};

/* ── CONFIG 1 — Singer + Massage ─────────────────────────────────────────── */
export const HYBRID_SINGER_MASSAGE: HybridContent = {
  name: "Mara Vidal",
  mark: "MV",
  roleLine: "Live Vocalist · Massage Therapist",
  location: "Mexico City · available citywide",
  portrait: `${D}/singer/04-portrait.jpg`,
  about: [
    "Mara holds a room two ways — with her voice on a Friday night, and with her hands on a Sunday morning. Two crafts, one belief: people remember how you made them feel.",
    "Book her for the event, the recovery after, or both. Use the switch above to explore each side.",
  ],
  disciplines: [
    {
      key: "music",
      short: "Live music",
      label: "vocalist",
      accent: "#c2913a",
      accentInk: "#1a1408",
      hero: `${D}/singer/01-hero.jpg`,
      tagline: "The voice that turns a room into a night.",
      sub: "Soul, bossa and Latin pop — performed live for lounges, weddings and brand events. Solo, duo, or full band.",
      cta: { label: "Book a show", href: "#book" },
      intro: "Live sets for restaurants, weddings & events.",
      services: [
        { title: "Lounge & restaurant nights", desc: "Resident-style sets that set the mood without taking over the room.", img: `${D}/singer/05-perf.jpg` },
        { title: "Weddings", desc: "Ceremony, first dance, and the party — tailored, rehearsed, unforgettable.", img: `${D}/singer/07-perf.jpg` },
        { title: "Brand & private events", desc: "Polished standards or a high-energy band for launches and galas.", img: `${D}/singer/14-stage.jpg` },
      ],
      offer: {
        heading: "Sets & formats",
        note: "Travel within the city included",
        items: [
          { name: "Solo — voice & loop", meta: "from $420", detail: "2 × 45-min sets · own PA" },
          { name: "Duo — voice & guitar", meta: "from $680", detail: "Acoustic, intimate rooms" },
          { name: "Full band — 4 piece", meta: "from $1,800", detail: "Dance-floor energy, full production" },
        ],
      },
      gallery: [`${D}/singer/02-hero.jpg`, `${D}/singer/06-perf.jpg`, `${D}/singer/12-glam.jpg`, `${D}/singer/08-perf.jpg`, `${D}/singer/09-guitar.jpg`, `${D}/singer/15-perf.jpg`],
      player: { album: "Live & Lounge — Vol. III", cover: `${D}/singer/10-glam.jpg`, href: "https://open.spotify.com", tracks: [{ t: "Sway — live", d: "3:42" }, { t: "Corcovado", d: "4:10" }, { t: "Valerie", d: "3:55" }, { t: "At Last", d: "4:32" }] },
      shows: [
        { day: "14", mon: "DEC", venue: "Mistral Rooftop", city: "Mexico City" },
        { day: "31", mon: "DEC", venue: "NYE Gala · Hotel Costa", city: "Puerto Vallarta" },
        { day: "11", mon: "JAN", venue: "The Jazz Room", city: "Mexico City" },
      ],
    },
    {
      key: "bodywork",
      short: "Bodywork",
      label: "massage therapist",
      accent: "#6f8f6a",
      accentInk: "#ffffff",
      hero: `${D}/massage/01-hero.jpg`,
      tagline: "Hands that put the whole room at ease.",
      sub: "Certified deep-tissue, relaxation and recovery massage — in a calm studio or at your home, with everything brought to you.",
      cta: { label: "Book a session", href: "#book" },
      intro: "Deep-tissue & relaxation, studio or in-home.",
      services: [
        { title: "Deep tissue & sports", desc: "Targeted work for tension, training, and long desk weeks.", img: `${D}/massage/02-treatment.jpg` },
        { title: "Relaxation & de-stress", desc: "Slow, warm, full-body — the reset you keep postponing.", img: `${D}/massage/03-treatment.jpg` },
        { title: "In-home visits", desc: "Table, oils, music and calm — set up and packed down by Mara.", img: `${D}/massage/05-room.jpg` },
      ],
      offer: {
        heading: "Treatments",
        note: "In-home add-on +$25",
        items: [
          { name: "Express reset", meta: "$55", detail: "30 min · neck, shoulders, back" },
          { name: "Full body", meta: "$90", detail: "60 min · the classic" },
          { name: "Deep restore", meta: "$130", detail: "90 min · deep tissue + stretch" },
        ],
      },
      gallery: [`${D}/massage/02-treatment.jpg`, `${D}/massage/06-treatment.jpg`, `${D}/massage/04-oils.jpg`, `${D}/massage/07-foot.jpg`, `${D}/massage/05-room.jpg`, `${D}/massage/03-treatment.jpg`],
    },
  ],
  reviews: [
    { quote: "She sang at our wedding and came back to give us couples massages before the honeymoon. Obsessed.", author: "Sofía & Dani", tag: "Both" },
    { quote: "Best lounge vocalist we book — and somehow also the best massage I’ve had all year.", author: "Mistral Rooftop", tag: "Live music" },
    { quote: "Came to the house, set up a full table, and melted three months of stress away.", author: "Andrea P.", tag: "Bodywork" },
  ],
  blog: [
    { cover: `${D}/massage/04-oils.jpg`, cat: "Wellness", date: "Nov 2026", title: "How to actually unwind after a big event", excerpt: "Three things I tell every client the night before a wedding.", min: "4 min" },
    { cover: `${D}/singer/06-perf.jpg`, cat: "Music", date: "Oct 2026", title: "Building a set list that reads the room", excerpt: "Why the first three songs decide your whole night.", min: "5 min" },
    { cover: `${D}/massage/05-room.jpg`, cat: "Wellness", date: "Sep 2026", title: "What to expect from an in-home session", excerpt: "From setup to the last stretch — your first visit, explained.", min: "3 min" },
  ],
  socials: { instagram: "https://instagram.com", spotify: "https://open.spotify.com", whatsapp: "https://wa.me/520000000000", email: "mailto:hola@maravidal.com" },
};

/* ── CONFIG 2 — Chef + Bar + Massage ─────────────────────────────────────── */
export const HYBRID_CHEF_MASSAGE: HybridContent = {
  name: "Tomás Vela",
  mark: "TV",
  roleLine: "Private Chef · Bartender · Massage Therapist",
  location: "Guadalajara · Riviera Nayarit",
  portrait: `${D}/bar/03-bartender.jpg`,
  about: [
    "Tomás is a host in every sense — he cooks the dinner, pours the cocktails, and the next morning works the knots out of the wedding party. One person, the whole experience.",
    "Pick a craft above to see menus, drinks, or treatments — or book the full package for your event.",
  ],
  disciplines: [
    {
      key: "chef",
      short: "Chef",
      label: "private chef",
      accent: "#c2603f",
      accentInk: "#ffffff",
      hero: `${D}/chef/01-hero.jpg`,
      tagline: "Restaurant nights, cooked at your table.",
      sub: "Seasonal tasting menus for intimate dinners, celebrations and events — sourced that morning, plated like a restaurant.",
      cta: { label: "Reserve a dinner", href: "#book" },
      intro: "Tasting menus & events, cooked in your home.",
      services: [
        { title: "Intimate dinners", desc: "2–12 guests. I shop, cook, serve, and leave the kitchen spotless.", img: `${D}/chef/08-action.jpg` },
        { title: "Events & celebrations", desc: "Up to 40 guests with service staff and styling.", img: `${D}/chef/10-table.jpg` },
        { title: "Hands-on classes", desc: "Cook a menu together, then sit down and eat it.", img: `${D}/chef/07-action.jpg` },
      ],
      offer: {
        heading: "Menus",
        note: "Wine pairing on request",
        items: [
          { name: "Tasting menu", meta: "from $95 / guest", detail: "5–7 seasonal courses" },
          { name: "Family-style", meta: "from $70 / guest", detail: "Generous shared plates" },
          { name: "Canapés & events", meta: "from $48 / guest", detail: "Passed bites & grazing" },
        ],
      },
      gallery: [`${D}/chef/03-dish.jpg`, `${D}/chef/04-dish.jpg`, `${D}/chef/05-dessert.jpg`, `${D}/chef/06-dish.jpg`, `${D}/chef/14-plate.jpg`, `${D}/chef/13-kitchen.jpg`],
    },
    {
      key: "bar",
      short: "Bar",
      label: "bartender",
      accent: "#8c5a3a",
      accentInk: "#ffffff",
      hero: `${D}/bar/01-hero.jpg`,
      tagline: "A craft bar that comes to you.",
      sub: "Signature cocktails, classics, and zero-proof — a full mobile bar with the kit, the ice, and the show.",
      cta: { label: "Book the bar", href: "#book" },
      intro: "Mobile cocktail bar & masterclasses.",
      services: [
        { title: "Cocktail service", desc: "A stocked mobile bar and a bartender who works the room.", img: `${D}/bar/03-bartender.jpg` },
        { title: "Masterclass", desc: "Hands-on cocktail-making for groups — make three, drink three.", img: `${D}/bar/05-garnish.jpg` },
        { title: "Event packages", desc: "Welcome drinks, pairings, and a signature for your night.", img: `${D}/bar/04-strain.jpg` },
      ],
      offer: {
        heading: "Signature cocktails",
        note: "Custom menus designed per event",
        items: [
          { name: "Smoked paloma", meta: "house", detail: "Mezcal, grapefruit, chili salt" },
          { name: "Oaxaca old fashioned", meta: "house", detail: "Tequila, mezcal, agave, bitters" },
          { name: "Garden spritz", meta: "zero-proof", detail: "Seedlip, cucumber, tonic" },
        ],
      },
      gallery: [`${D}/bar/02-cocktail.jpg`, `${D}/bar/06-drink.jpg`, `${D}/bar/04-strain.jpg`, `${D}/bar/05-garnish.jpg`, `${D}/bar/03-bartender.jpg`, `${D}/bar/01-hero.jpg`],
    },
    {
      key: "bodywork",
      short: "Massage",
      label: "massage therapist",
      accent: "#6f8f6a",
      accentInk: "#ffffff",
      hero: `${D}/massage/01-hero.jpg`,
      tagline: "Recovery, between the events.",
      sub: "Sports, relaxation and couples massage — the morning-after reset for hosts and guests alike, in-home.",
      cta: { label: "Book a session", href: "#book" },
      intro: "Sports & relaxation massage, in-home.",
      services: [
        { title: "Sports & recovery", desc: "Deep work for tired legs and long nights on your feet.", img: `${D}/massage/02-treatment.jpg` },
        { title: "Relaxation", desc: "Slow, warm, full-body — the morning-after reset.", img: `${D}/massage/03-treatment.jpg` },
        { title: "Couples & groups", desc: "Side-by-side sessions for the wedding party or a retreat.", img: `${D}/massage/05-room.jpg` },
      ],
      offer: {
        heading: "Treatments",
        note: "In-home included",
        items: [
          { name: "Express reset", meta: "$55", detail: "30 min · focus area" },
          { name: "Full body", meta: "$90", detail: "60 min · the classic" },
          { name: "Couples session", meta: "$170", detail: "60 min · two therapists" },
        ],
      },
      gallery: [`${D}/massage/02-treatment.jpg`, `${D}/massage/06-treatment.jpg`, `${D}/massage/04-oils.jpg`, `${D}/massage/07-foot.jpg`, `${D}/massage/05-room.jpg`, `${D}/massage/03-treatment.jpg`],
    },
  ],
  reviews: [
    { quote: "Dinner, cocktails, and recovery massages the next day — Tomás ran our whole retreat solo. Unreal.", author: "Casa Origen", tag: "Both" },
    { quote: "The tasting menu had us speechless and the mezcal old fashioned was the best I’ve had.", author: "The Herrera family", tag: "Chef" },
    { quote: "Booked the bar for a launch, kept him for massages the morning after. Re-booking everything.", author: "Studio Norte", tag: "Bar" },
  ],
  blog: [
    { cover: `${D}/chef/05-dessert.jpg`, cat: "Food", date: "Nov 2026", title: "How to plan a dinner party you can enjoy", excerpt: "The prep that lets the host sit down too.", min: "5 min" },
    { cover: `${D}/bar/02-cocktail.jpg`, cat: "Drinks", date: "Oct 2026", title: "Three cocktails every host should master", excerpt: "Crowd-pleasers you can build in under a minute.", min: "4 min" },
    { cover: `${D}/massage/04-oils.jpg`, cat: "Wellness", date: "Sep 2026", title: "Recovery for people who host for a living", excerpt: "What ten years on my feet taught me.", min: "3 min" },
  ],
  socials: { instagram: "https://instagram.com", spotify: "https://open.spotify.com", whatsapp: "https://wa.me/520000000000", email: "mailto:hola@tomasvela.com" },
};

/* ── CONFIG 3 — Model + DJ ───────────────────────────────────────────────── */
export const HYBRID_MODEL_DJ: HybridContent = {
  name: "Nina Ferro",
  mark: "NF",
  roleLine: "Fashion Model · DJ",
  location: "Mexico City · Tulum · worldwide",
  portrait: `${D}/model/12-portrait.jpg`,
  about: [
    "Nina lives at two tempos — the stillness of a campaign and the pulse of a 2am set. Same instinct for a moment, two very different stages.",
    "Book her for the shoot, the booth, or a night that needs both.",
  ],
  disciplines: [
    {
      key: "model", short: "Model", label: "model", accent: "#b8866b", accentInk: "#ffffff",
      hero: `${D}/model/01-hero.jpg`, tagline: "The look that stops the room.",
      sub: "Runway, editorial and campaign — represented internationally, equally at home on a catwalk or a cover.",
      cta: { label: "Book a shoot", href: "#book" }, intro: "Runway, editorial & campaign.",
      services: [
        { title: "Runway", desc: "Fashion weeks, designer shows, presentations.", img: `${D}/model/03-runway.jpg` },
        { title: "Editorial", desc: "Covers, spreads, and brand stories.", img: `${D}/model/05-editorial.jpg` },
        { title: "Campaign", desc: "Lookbooks, e-commerce, and brand films.", img: `${D}/model/02-gown.jpg` },
      ],
      offer: { heading: "Digitals", note: "Full book on request", items: [
        { name: "Height", meta: "178 cm" }, { name: "Bust · Waist · Hips", meta: "82 · 61 · 89" },
        { name: "Shoe · Eyes", meta: "40 EU · Green" }, { name: "Represented", meta: "MX · NY · MI" },
      ] },
      gallery: [`${D}/model/02-gown.jpg`, `${D}/model/04-runway.jpg`, `${D}/model/06-runway.jpg`, `${D}/model/09-editorial.jpg`, `${D}/model/07-runway.jpg`, `${D}/model/10-editorial.jpg`],
    },
    {
      key: "dj", short: "DJ", label: "DJ", accent: "#7c5cff", accentInk: "#ffffff",
      hero: `${D}/dj/01-hero.jpg`, tagline: "From the runway to the booth.",
      sub: "Open-format, house and afterparty sets — fashion-party energy with a crowd-reading instinct.",
      cta: { label: "Book a set", href: "#book" }, intro: "Open-format, house & events.",
      services: [
        { title: "Club nights", desc: "Resident-quality sets for lounges and clubs.", img: `${D}/dj/05-crowd.jpg` },
        { title: "Festivals", desc: "Main-room energy for stages and pools.", img: `${D}/dj/06-stage.jpg` },
        { title: "Private & brand", desc: "Weddings, launches, and fashion afterparties.", img: `${D}/dj/03-dj.jpg` },
      ],
      offer: { heading: "Sets", note: "Own equipment available", items: [
        { name: "Open format", meta: "from $600", detail: "2 hours · any room" },
        { name: "House / electronic", meta: "from $800", detail: "Club & festival" },
        { name: "Afterparty", meta: "from $1,100", detail: "Extended late set" },
      ] },
      gallery: [`${D}/dj/02-mixer.jpg`, `${D}/dj/04-dark.jpg`, `${D}/dj/07-crowd.jpg`, `${D}/dj/08-mixer.jpg`, `${D}/dj/05-crowd.jpg`, `${D}/dj/06-stage.jpg`],
      player: { album: "Night Shift — Mixes", cover: `${D}/dj/04-dark.jpg`, href: "https://open.spotify.com", tracks: [{ t: "Sunset Set — Tulum", d: "58:20" }, { t: "House Sessions 04", d: "61:10" }, { t: "Fashion Week Afterparty", d: "72:40" }] },
      shows: [{ day: "21", mon: "DEC", venue: "Bagatelle", city: "Mexico City" }, { day: "28", mon: "DEC", venue: "Vagalume", city: "Tulum" }, { day: "04", mon: "JAN", venue: "Private launch", city: "Los Cabos" }],
    },
  ],
  reviews: [
    { quote: "She walked our show and then DJ’d the afterparty — the whole night had one heartbeat.", author: "Atelier Norte", tag: "Both" },
    { quote: "Magnetic on camera, completely professional on set.", author: "RevistaMX", tag: "Model" },
    { quote: "Read the room perfectly and kept the floor full till close.", author: "Bagatelle", tag: "DJ" },
  ],
  blog: [
    { cover: `${D}/dj/05-crowd.jpg`, cat: "Music", date: "Nov 2026", title: "Reading a fashion crowd", excerpt: "Why the first 20 minutes decide the night.", min: "4 min" },
    { cover: `${D}/model/05-editorial.jpg`, cat: "Fashion", date: "Oct 2026", title: "Backstage to booth in 20 minutes", excerpt: "How I switch gears on show nights.", min: "5 min" },
    { cover: `${D}/model/09-editorial.jpg`, cat: "Fashion", date: "Sep 2026", title: "Castings that actually book", excerpt: "What 200 castings taught me.", min: "3 min" },
  ],
  socials: { instagram: "https://instagram.com", spotify: "https://open.spotify.com", whatsapp: "https://wa.me/520000000000", email: "mailto:hola@ninaferro.com" },
};

function Stroke({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function Fill({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={d} /></svg>;
}

function Switcher({ disciplines, active, onPick, size = "lg" }: { disciplines: Discipline[]; active: number; onPick: (i: number) => void; size?: "lg" | "sm" }) {
  return (
    <div className={`switcher ${size}`} role="tablist" aria-label="Choose a craft">
      {disciplines.map((x, i) => (
        <button key={x.key} role="tab" aria-selected={i === active} className={`sw-pill ${i === active ? "on" : ""}`} onClick={() => onPick(i)} style={i === active ? { background: x.accent, color: x.accentInk, borderColor: x.accent } : undefined}>
          <Stroke d={DISC_ICON[x.key] ?? DISC_ICON.music} size={size === "lg" ? 17 : 15} />
          <span>{x.short}</span>
        </button>
      ))}
    </div>
  );
}
function Socials({ socials }: { socials: HybridContent["socials"] }) {
  const items: [string, string, string][] = [[socials.spotify, sp, "Spotify"], [socials.instagram, ig, "Instagram"]];
  return (
    <div className="soc">
      {items.map(([h, p, l]) => <a key={l} href={h} target="_blank" rel="noopener noreferrer" aria-label={l}><Fill d={p} /></a>)}
    </div>
  );
}

export function HybridTemplate({ content }: { content: HybridContent }) {
  const c = content;
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
    <div className="hyb-page" ref={root} style={rootStyle}>
      <style>{CSS}</style>

      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-in">
          <a href="#top" className="brand"><span className="brand-mark">{c.mark}</span><span className="brand-name">{c.name}</span></a>
          <div className="nav-switch"><Switcher disciplines={c.disciplines} active={active} onPick={pick} size="sm" /></div>
          <div className="nav-right">
            <a className="btn btn-sm btn-primary" href="#book">Book</a>
            <button className="burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}><span /><span /><span /></button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            <Switcher disciplines={c.disciplines} active={active} onPick={pick} size="sm" />
            <a className="btn btn-primary" href="#offer" onClick={() => setMenuOpen(false)}>See {d.short.toLowerCase()}</a>
            <a className="btn btn-outline" href="#book" onClick={() => setMenuOpen(false)}>Book</a>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        {c.disciplines.map((x, i) => <div key={x.key} className={`hero-slide ${i === active ? "on" : ""}`} style={{ backgroundImage: `url(${x.hero})` }} />)}
        <div className="hero-scrim" />
        <div className="hero-in">
          <div className="eyebrow on-dark">{c.roleLine}</div>
          <div className="hero-switch"><Switcher disciplines={c.disciplines} active={active} onPick={pick} /></div>
          <h1 className="serif hero-title" key={d.key}>{d.tagline}</h1>
          <p className="hero-sub">{d.sub}</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href={d.cta.href}>{d.cta.label}</a>
            <a className="btn btn-glass btn-lg" href="#offer">Explore {d.short.toLowerCase()}</a>
          </div>
        </div>
        <div className="hero-hint"><span className="hint-dot" /> One artist · {c.disciplines.length} crafts · tap to switch</div>
      </section>

      {/* ABOUT / CRAFTS */}
      <section className="section about" id="about">
        <div className="about-media reveal"><img src={c.portrait} alt={c.name} /></div>
        <div className="about-copy reveal">
          <div className="eyebrow">One artist, {c.disciplines.length} crafts</div>
          <h2 className="serif h2">{c.name}</h2>
          {c.about.map((p, i) => <p key={i} className="lede">{p}</p>)}
          <div className="craft-cards">
            {c.disciplines.map((x, i) => (
              <button key={x.key} className={`craft ${i === active ? "on" : ""}`} onClick={() => pick(i)} style={{ ["--c" as string]: x.accent }}>
                <span className="craft-ico" style={{ color: x.accent }}><Stroke d={DISC_ICON[x.key] ?? DISC_ICON.music} size={20} /></span>
                <span className="craft-name">{x.short}</span>
                <span className="craft-intro">{x.intro}</span>
                <span className="craft-go">{i === active ? "Viewing" : "View"} →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ACTIVE DISCIPLINE OFFER (swaps) */}
      <section className="section offer" id="offer">
        <div className="offer-inner" key={d.key}>
          <div className="sec-head reveal">
            <div className="eyebrow">As a {d.label}</div>
            <h2 className="serif h2">{d.cta.label.replace("Book ", "").replace("Reserve ", "")}{""}</h2>
            <h2 className="serif h2 offer-h">{d.short}</h2>
          </div>

          <div className="svc-grid">
            {d.services.map((s) => (
              <article key={s.title} className="svc reveal">
                <div className="svc-img"><img src={s.img} alt={s.title} /></div>
                <h3 className="serif svc-title">{s.title}</h3>
                <p className="muted">{s.desc}</p>
              </article>
            ))}
          </div>

          <div className="offer-split">
            <div className="price-card reveal">
              <div className="price-head"><span className="serif">{d.offer.heading}</span>{d.offer.note ? <span className="price-note">{d.offer.note}</span> : null}</div>
              <ul className="price-list">
                {d.offer.items.map((it) => (
                  <li key={it.name}><div><div className="pi-name">{it.name}</div>{it.detail ? <div className="pi-detail">{it.detail}</div> : null}</div><span className="pi-meta">{it.meta}</span></li>
                ))}
              </ul>
              <a className="btn btn-primary btn-block" href={d.cta.href}>{d.cta.label}</a>
            </div>

            {d.player ? (
              <div className="player reveal">
                <div className="player-top"><img src={d.player.cover} alt="" className="player-cover" /><div><div className="serif player-album">{d.player.album}</div><a className="btn btn-xs btn-spotify" href={d.player.href} target="_blank" rel="noopener noreferrer"><Fill d={sp} size={14} /> Spotify</a></div></div>
                <ul className="player-tracks">{d.player.tracks.map((t) => <li key={t.t}><span className="pt-play"><Fill d="M8 5v14l11-7z" size={12} /></span><span className="pt-name">{t.t}</span><span className="pt-d">{t.d}</span></li>)}</ul>
                {d.shows ? <div className="mini-shows">{d.shows.map((s, i) => <div key={i} className="mini-show"><span className="ms-date"><b>{s.day}</b>{s.mon}</span><span className="ms-venue">{s.venue}<i>{s.city}</i></span></div>)}</div> : null}
              </div>
            ) : (
              <div className="gal-tall reveal">
                {d.gallery.slice(0, 2).map((g, i) => <button key={i} className="gt-item" onClick={() => setLb(i)}><img src={g} alt="" /></button>)}
              </div>
            )}
          </div>

          <div className="gal-grid">
            {d.gallery.map((g, i) => <button key={i} className={`gal-item reveal g${i % 5}`} onClick={() => setLb(i)}><img src={g} alt={`${d.short} ${i + 1}`} /></button>)}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section reviews">
        <div className="sec-head reveal"><div className="eyebrow">Kind words</div><h2 className="serif h2">Booked across the board</h2></div>
        <div className="rev-grid">
          {c.reviews.map((r, i) => (
            <figure key={i} className="rev reveal"><span className="rev-tag">{r.tag}</span><blockquote className="serif">“{r.quote}”</blockquote><figcaption>{r.author}</figcaption></figure>
          ))}
        </div>
      </section>

      {/* JOURNAL / BLOG */}
      <section className="section journal" id="journal">
        <div className="sec-head between reveal"><div><div className="eyebrow">Journal</div><h2 className="serif h2">Notes &amp; stories</h2></div><a className="btn btn-ghost" href="#journal">All posts</a></div>
        <div className="blog-grid">
          {c.blog.map((b, i) => (
            <a key={i} className="post reveal" href="#journal">
              <div className="post-img"><img src={b.cover} alt={b.title} /><span className="post-cat">{b.cat}</span></div>
              <div className="post-body"><div className="post-meta">{b.date} · {b.min} read</div><h3 className="serif post-title">{b.title}</h3><p className="muted">{b.excerpt}</p><span className="post-go">Read →</span></div>
            </a>
          ))}
        </div>
      </section>

      {/* BOOK */}
      <section className="section book" id="book">
        <div className="book-grid">
          <div className="book-copy reveal">
            <div className="eyebrow">Booking</div>
            <h2 className="serif h2">One message, any craft.</h2>
            <p className="lede">Tell {c.name.split(" ")[0]} the date and what you need — a show, a dinner, a session, or all of it. Reply within 24 hours.</p>
            <div className="book-actions">
              <a className="btn btn-primary btn-lg" href={c.socials.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              <a className="btn btn-glass btn-lg" href={c.socials.email}>Email {c.name.split(" ")[0]}</a>
            </div>
            <Socials socials={c.socials} />
          </div>
          <form className="book-form reveal" onSubmit={(e) => e.preventDefault()}>
            <div className="field"><label>Your name</label><input placeholder="Jane Doe" /></div>
            <div className="field"><label>What do you need?</label>
              <select>{c.disciplines.map((x) => <option key={x.key}>{x.short}</option>)}<option>The full package</option></select>
            </div>
            <div className="field-row"><div className="field"><label>Date</label><input placeholder="Dec 31, 2026" /></div><div className="field"><label>Guests</label><input placeholder="40" /></div></div>
            <button className="btn btn-primary btn-block" type="submit">Request availability</button>
            <p className="form-note">No commitment — just a conversation.</p>
          </form>
        </div>
      </section>

      <footer className="footer" style={{ backgroundImage: `linear-gradient(rgba(26,20,16,.82),rgba(26,20,16,.92)), url(${d.hero})` }}>
        <div className="foot-in">
          <div className="eyebrow on-dark">{c.location}</div>
          <h2 className="serif foot-title">{c.name} — {c.roleLine}.</h2>
          <a className="btn btn-primary btn-lg" href="#book">Book {c.name.split(" ")[0]}</a>
          <Socials socials={c.socials} />
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
body{margin:0;background:#fbf8f1}
html{scroll-behavior:smooth}
.hyb-page{
  --bg:#fbf8f1; --card:#fff; --ink:#1c1611; --muted:#7a6f63; --line:rgba(28,22,17,.12); --espresso:#1a1410;
  --accent:#c2913a; --accent-ink:#1a1408;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-inter-body),var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.6; overflow-x:hidden;
}
.hyb-page *{box-sizing:border-box}
.hyb-page img{display:block;max-width:100%}
.hyb-page a{color:inherit;text-decoration:none}
.serif{font-family:var(--font-fraunces),"Hoefler Text",Garamond,Georgia,serif;font-weight:400;letter-spacing:-.01em}
.section{max-width:1200px;margin:0 auto;padding:clamp(58px,8vw,112px) 24px}
.h2{font-size:clamp(28px,4.2vw,50px);line-height:1.05;margin:6px 0 0}
.eyebrow{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px;transition:color .5s}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--accent);transition:background .5s}
.eyebrow.on-dark{color:#fff}.eyebrow.on-dark::before{background:rgba(255,255,255,.7)}
.muted{color:var(--muted)}
.lede{font-size:clamp(15px,1.4vw,18px);color:#4b4239;margin:14px 0 0;max-width:54ch}
.sec-head{margin-bottom:clamp(26px,4vw,46px)}
.sec-head.between{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}

.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:999px;font-weight:600;font-size:14px;padding:12px 22px;cursor:pointer;transition:transform .25s,background .4s,color .4s,border-color .4s;white-space:nowrap}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--accent);color:var(--accent-ink);box-shadow:0 12px 26px -14px rgba(0,0,0,.35)}
.btn-primary:hover{filter:brightness(.95)}
.btn-glass{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.32);backdrop-filter:blur(6px)}
.btn-glass:hover{background:rgba(255,255,255,.2)}
.btn-outline{background:transparent;color:var(--ink);border-color:var(--line)}
.btn-outline:hover{border-color:var(--accent);color:var(--accent)}
.btn-ghost{background:transparent;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.btn-spotify{background:#1db954;color:#04140a;border:0}
.btn-lg{padding:15px 28px;font-size:15px}.btn-sm{padding:9px 16px;font-size:13px}.btn-xs{padding:6px 12px;font-size:12px}
.btn-block{width:100%;justify-content:center}
.soc{display:flex;gap:11px;margin-top:28px}
.soc a{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.26);color:#fff;transition:all .2s}
.book-copy .soc a{border-color:var(--line);color:var(--ink)}
.soc a:hover{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);transform:translateY(-2px)}

/* switcher */
.switcher{display:inline-flex;gap:6px;padding:5px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);backdrop-filter:blur(8px)}
.sw-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;background:transparent;color:#fff;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;transition:all .35s;white-space:nowrap}
.switcher.sm .sw-pill{padding:7px 13px;font-size:12.5px;gap:6px}
.sw-pill:hover:not(.on){background:rgba(255,255,255,.12)}
.nav-switch .switcher{background:var(--bg);border-color:var(--line)}
.nav.scrolled .nav-switch .switcher{background:rgba(251,248,241,.6)}
.nav-switch .sw-pill{color:var(--ink)}
.nav-switch .sw-pill:hover:not(.on){background:rgba(28,22,17,.06)}

/* nav */
.nav{position:fixed;inset:0 0 auto;z-index:60;padding:16px 0;transition:all .35s}
.nav.scrolled{background:rgba(251,248,241,.86);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:9px 0}
.nav-in{max-width:1280px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:12px;color:#fff;transition:color .35s}
.nav.scrolled .brand{color:var(--ink)}
.brand-mark{font-family:var(--font-fraunces),serif;font-size:16px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor}
.brand-name{font-family:var(--font-fraunces),serif;font-size:16px}
.nav-right{display:flex;align-items:center;gap:12px}
.burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:6px}
.burger span{width:22px;height:2px;background:#fff}.nav.scrolled .burger span{background:var(--ink)}
.mobile-menu{display:none}

/* hero */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:120px 24px 90px;overflow:hidden;color:#fff}
.hero-slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1s ease,transform 7s ease;transform:scale(1.05)}
.hero-slide.on{opacity:1;transform:scale(1.1)}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,15,11,.5),rgba(20,15,11,.4) 35%,rgba(20,15,11,.84))}
.hero-in{position:relative;max-width:1200px;margin:0 auto;width:100%}
.hero-switch{margin:20px 0 4px}
.hero-title{font-size:clamp(38px,6.6vw,82px);line-height:1;margin:14px 0 0;max-width:16ch;text-shadow:0 2px 40px rgba(0,0,0,.4);animation:swap .5s ease}
@keyframes swap{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.hero-sub{font-size:clamp(15px,1.6vw,18px);color:rgba(255,255,255,.84);margin:18px 0 0;max-width:46ch}
.hero-cta{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.hero-hint{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,.8);font-family:var(--font-geist-mono),monospace;letter-spacing:.05em}
.hint-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 30%,transparent);transition:background .5s}

/* about */
.about{display:grid;grid-template-columns:0.85fr 1.15fr;gap:clamp(32px,6vw,72px);align-items:center}
.about-media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:18px}
.craft-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:30px}
.craft{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;cursor:pointer;transition:transform .25s,border-color .25s,box-shadow .25s;display:flex;flex-direction:column;gap:4px}
.craft:hover{transform:translateY(-4px);box-shadow:0 22px 44px -28px rgba(28,22,17,.4)}
.craft.on{border-color:var(--c);box-shadow:0 0 0 1.5px var(--c)}
.craft-ico{margin-bottom:6px}
.craft-name{font-weight:700;font-size:15px}
.craft-intro{font-size:12.5px;color:var(--muted);line-height:1.35;flex:1}
.craft-go{font-size:12px;font-weight:600;color:var(--accent);margin-top:8px;transition:color .4s}

/* offer (swaps) */
.offer-inner{animation:fade .55s ease}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.offer-h{color:var(--accent);transition:color .5s;margin-top:-6px}
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.svc{display:flex;flex-direction:column}
.svc-img{border-radius:14px;overflow:hidden;margin-bottom:14px}
.svc-img img{width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .6s}
.svc:hover .svc-img img{transform:scale(1.06)}
.svc-title{font-size:19px}
.offer-split{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}
.price-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;display:flex;flex-direction:column}
.price-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:6px}
.price-head .serif{font-size:22px}
.price-note{font-size:12px;color:var(--accent);transition:color .4s}
.price-list{list-style:none;margin:0 0 20px;padding:0;flex:1}
.price-list li{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:15px 0;border-bottom:1px solid rgba(28,22,17,.07)}
.pi-name{font-weight:600;font-size:15.5px}
.pi-detail{font-size:13px;color:var(--muted);margin-top:2px}
.pi-meta{font-family:var(--font-fraunces),serif;font-size:17px;color:var(--accent);white-space:nowrap;transition:color .4s}
/* player */
.player{background:var(--espresso);color:#f4efe6;border-radius:18px;padding:24px}
.player-top{display:flex;gap:14px;align-items:center;margin-bottom:16px}
.player-cover{width:64px;height:64px;border-radius:10px;object-fit:cover}
.player-album{font-size:18px}
.player-tracks{list-style:none;margin:0;padding:0}
.player-tracks li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(244,239,230,.1);font-size:14px}
.pt-play{width:26px;height:26px;border-radius:50%;background:rgba(244,239,230,.1);display:grid;place-items:center;flex:none;color:var(--accent)}
.pt-name{flex:1}.pt-d{color:rgba(244,239,230,.55);font-size:13px}
.mini-shows{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.mini-show{display:flex;gap:12px;align-items:center;font-size:13px}
.ms-date{display:flex;flex-direction:column;align-items:center;min-width:38px;line-height:1.1}
.ms-date b{font-family:var(--font-fraunces),serif;font-size:18px;color:var(--accent)}
.ms-date{font-size:10px;color:rgba(244,239,230,.55)}
.ms-venue{display:flex;flex-direction:column}.ms-venue i{font-style:normal;color:rgba(244,239,230,.55);font-size:12px}
.gal-tall{display:grid;grid-template-rows:1fr 1fr;gap:24px}
.gt-item{border:0;padding:0;cursor:pointer;border-radius:18px;overflow:hidden;background:#eee}
.gt-item img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.gt-item:hover img{transform:scale(1.05)}
.gal-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:190px;gap:14px;margin-top:24px}
.gal-item{padding:0;border:0;cursor:pointer;border-radius:14px;overflow:hidden;background:#eee}
.gal-item img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.gal-item:hover img{transform:scale(1.07)}
.gal-item.g0{grid-column:span 2;grid-row:span 2}.gal-item.g3{grid-row:span 2}

/* reviews */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.rev{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;margin:0}
.rev-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:999px;padding:4px 11px;margin-bottom:14px;transition:color .4s,border-color .4s}
.rev blockquote{font-size:18px;line-height:1.45;margin:0 0 18px}
.rev figcaption{font-size:13.5px;color:var(--muted)}

/* journal */
.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.post{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .3s,box-shadow .3s;display:flex;flex-direction:column}
.post:hover{transform:translateY(-5px);box-shadow:0 30px 56px -34px rgba(28,22,17,.42)}
.post-img{position:relative;overflow:hidden}
.post-img img{width:100%;aspect-ratio:3/2;object-fit:cover;transition:transform .6s}
.post:hover .post-img img{transform:scale(1.06)}
.post-cat{position:absolute;top:12px;left:12px;background:rgba(251,248,241,.92);color:var(--ink);font-size:11px;font-weight:600;padding:5px 11px;border-radius:999px}
.post-body{padding:22px;display:flex;flex-direction:column;flex:1}
.post-meta{font-size:12px;color:var(--muted)}
.post-title{font-size:19px;margin:6px 0 0}
.post-go{font-size:13px;font-weight:600;color:var(--accent);margin-top:14px;transition:color .4s}

/* book */
.book-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,60px);align-items:center}
.book-form{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.field input,.field select{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--ink);font-size:14px;font-family:inherit}
.field input:focus,.field select:focus{outline:none;border-color:var(--accent)}
.form-note{font-size:12px;color:var(--muted);text-align:center;margin:4px 0 0}

/* footer */
.footer{background-size:cover;background-position:center;color:#fff;text-align:center}
.foot-in{max-width:760px;margin:0 auto;padding:clamp(70px,11vw,136px) 24px;display:flex;flex-direction:column;align-items:center}
.foot-title{font-size:clamp(28px,4.6vw,52px);line-height:1.08;margin:14px 0 28px}
.foot-in .soc{margin-top:30px}
.foot-fine{display:flex;gap:24px;margin-top:34px;font-size:12.5px;color:rgba(255,255,255,.5);font-family:var(--font-geist-mono),monospace}

/* wa + lightbox */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:55;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -10px rgba(37,211,102,.7);transition:transform .25s}
.wa-float:hover{transform:scale(1.08)}
.lightbox{position:fixed;inset:0;z-index:80;background:rgba(16,12,9,.95);display:grid;place-items:center;padding:40px}
.lightbox img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:8px}
.lb-close{position:absolute;top:20px;right:26px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;width:52px;height:52px;border-radius:50%;font-size:28px;cursor:pointer}
.lb-nav.prev{left:24px}.lb-nav.next{right:24px}

.reveal{opacity:0;transform:translateY(26px);transition:opacity .8s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.2,0,0,1)}
.reveal.in{opacity:1;transform:none}

@media(max-width:920px){
  .nav-switch{display:none}
  .burger{display:flex}
  .mobile-menu{display:flex;flex-direction:column;gap:12px;padding:18px 24px 24px;background:rgba(251,248,241,.98);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  .mobile-menu .switcher{background:var(--bg);border-color:var(--line);flex-wrap:wrap}
  .mobile-menu .sw-pill{color:var(--ink)}
  .mobile-menu .btn{justify-content:center}
  .about{grid-template-columns:1fr}
  .svc-grid{grid-template-columns:1fr}
  .offer-split{grid-template-columns:1fr}
  .gal-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:150px}.gal-item.g0{grid-column:span 2}
  .rev-grid,.blog-grid{grid-template-columns:1fr}
  .book-grid{grid-template-columns:1fr}
  .hero-hint{display:none}
}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.hero-slide{transition:opacity .4s}.hero-title,.offer-inner{animation:none}}
`;
