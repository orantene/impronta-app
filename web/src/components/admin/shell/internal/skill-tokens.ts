// ============================================================================
// _skill-tokens.ts — Shared style tokens for the multi-skill panel.
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// component refactor. Kept as plain constants (no "use client") so they can
// be imported from server-side modules too.
//
// PALETTE NOTE: T.gold / T.amber are legacy accents. The product feedback
// memo `feedback_admin_aesthetics.md` flags gold/rust as unwanted. They're
// kept here for behavioral parity during the refactor; a follow-up PR
// should replace them with neutral or accent tones.
// ============================================================================

export const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  surfaceWarm: "#F9F7F1",
  border: "#D5D2C7",
  borderSoft: "rgba(11,11,13,0.08)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.12)",
  red: "#A4361A",
  redSoft: "rgba(164,54,26,0.1)",
  amber: "#9B6D1F",
  amberSoft: "rgba(155,109,31,0.12)",
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.12)",
  indigoDeep: "#3B4A75",
  gold: "#C99A4F",
  goldSoft: "rgba(201,154,79,0.16)",
} as const;

export const F_BODY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const PARENT_EMOJI: Record<string, string> = {
  models: "👤",
  "hosts-promo": "🎤",
  performers: "✨",
  "music-djs": "🎧",
  "chefs-culinary": "👨‍🍳",
  "wellness-beauty": "🌿",
  "photo-video-creative": "📷",
  "influencers-creators": "📱",
  "event-staff": "🛎",
  "hospitality-property": "🏨",
  "travel-concierge": "🧭",
  transportation: "🚙",
  "home-technical-services": "🛠",
  "security-protection": "🛡",
  "sports-fitness": "🏃",
  "kids-family-services": "👨‍👩‍👧",
  "speakers-coaches-experts": "🎙",
  "production-bts": "🎬",
  "animals-specialty-acts": "🐾",
};
