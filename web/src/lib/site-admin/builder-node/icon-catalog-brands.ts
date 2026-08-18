/**
 * Brand and contact marks.
 *
 * NOT generated: lucide dropped brand icons years ago, so these paths are the
 * repo's own — promoted verbatim out of `SocialGlyph` (render.tsx) and
 * `ClusterIcon` (site_header/header-cluster-icon.tsx), which carried the same
 * markup twice. Putting them in the registry is what lets those two switches
 * become shims over one table instead of two copies drifting apart.
 *
 * Brand marks are SOLID (`render: "fill"`): a stroked wordmark reads as a
 * sketch of the logo rather than the logo. Contact glyphs (email, phone) stay
 * stroked to sit correctly beside the generated set.
 *
 * The platform list is the UNION of the two enums that had drifted — the
 * `social_links` node's 8 and the curated footer's 11 (which had `twitter`
 * where the node had `x`, plus pinterest/vimeo/spotify/github, and was missing
 * whatsapp). One table, so a platform cannot exist in one surface and not the
 * other again.
 */

import type { BuilderIconCatalogEntry } from "./icon-registry-types";

export const ICON_CATALOG_BRANDS = [
  {
    name: "instagram",
    label: "Instagram",
    category: "social",
    keywords: ["social", "ig"],
    paths: [],
    rects: [{ x: 2, y: 2, width: 20, height: 20, rx: 5.5 }],
    circles: [
      { cx: 12, cy: 12, r: 4.2 },
      { cx: 17.6, cy: 6.4, r: 1.2, fill: true },
    ],
  },
  {
    name: "tiktok",
    label: "TikTok",
    category: "social",
    keywords: ["social", "video"],
    render: "fill",
    paths: [
      "M16.5 1.5h-3v14.2a3.1 3.1 0 11-2.3-3v-3.1a6.2 6.2 0 105.3 6.1V8.4a7.3 7.3 0 004.3 1.4V6.7a4.3 4.3 0 01-4.3-4.3v-.9z",
    ],
  },
  {
    name: "facebook",
    label: "Facebook",
    category: "social",
    keywords: ["social", "fb", "meta"],
    render: "fill",
    paths: [
      "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z",
    ],
  },
  {
    name: "youtube",
    label: "YouTube",
    category: "social",
    keywords: ["social", "video", "channel"],
    render: "fill",
    paths: [
      "M22.5 7.1a2.7 2.7 0 0 0-1.9-1.9C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.1 28 28 0 0 0 1 12a28 28 0 0 0 .5 4.9 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 23 12a28 28 0 0 0-.5-4.9zM9.8 15.3V8.7l5.7 3.3z",
    ],
  },
  {
    name: "linkedin",
    label: "LinkedIn",
    category: "social",
    keywords: ["social", "work", "professional"],
    render: "fill",
    paths: [
      "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z",
    ],
  },
  {
    name: "x",
    label: "X",
    category: "social",
    keywords: ["social", "twitter", "tweet"],
    render: "fill",
    paths: [
      "M18.9 2h3.3l-7.2 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.7-8.8L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.1 3.9H5.2z",
    ],
  },
  {
    name: "whatsapp",
    label: "WhatsApp",
    category: "social",
    keywords: ["social", "chat", "message", "wa"],
    render: "fill",
    paths: [
      "M.06 24l1.69-6.16a11.87 11.87 0 01-1.59-5.95C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 018.41 3.49 11.82 11.82 0 013.48 8.41c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 01-5.69-1.45L.06 24zM6.6 20.13c1.68 1 3.28 1.6 5.45 1.6 5.45 0 9.89-4.43 9.89-9.88a9.83 9.83 0 00-2.9-7 9.78 9.78 0 00-6.98-2.9c-5.46 0-9.9 4.44-9.9 9.89a9.82 9.82 0 001.51 5.26l-.99 3.6 3.92-1.02zm11.39-5.7c-.07-.12-.27-.2-.56-.34-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.29-.76.96-.94 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.34.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.47s1.07 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z",
    ],
  },
  {
    name: "pinterest",
    label: "Pinterest",
    category: "social",
    keywords: ["social", "pin", "moodboard"],
    render: "fill",
    paths: [
      "M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.5 1.8-2.5.9 0 1.3.6 1.3 1.4 0 .9-.6 2.2-.9 3.4-.2 1 .5 1.8 1.5 1.8 1.8 0 3.1-1.9 3.1-4.6 0-2.4-1.7-4.1-4.2-4.1-2.9 0-4.5 2.1-4.5 4.3 0 .9.3 1.8.7 2.3l.1.4-.3 1c0 .2-.2.3-.4.2-1.3-.6-2.1-2.5-2.1-4 0-3.3 2.4-6.3 6.9-6.3 3.6 0 6.4 2.6 6.4 6 0 3.6-2.2 6.5-5.4 6.5-1 0-2-.6-2.4-1.2l-.6 2.5c-.2.9-.8 2-1.2 2.6A10 10 0 1 0 12 2z",
    ],
  },
  {
    name: "vimeo",
    label: "Vimeo",
    category: "social",
    keywords: ["social", "video", "film"],
    render: "fill",
    paths: [
      "M23 7.4c-.1 2.2-1.7 5.3-4.7 9.2-3.1 4.1-5.7 6.1-7.8 6.1-1.3 0-2.5-1.2-3.4-3.7l-1.9-6.8c-.7-2.5-1.4-3.7-2.2-3.7-.2 0-.8.4-1.9 1.1L0 8.2c1.2-1 2.4-2.1 3.5-3.2C5.1 3.6 6.3 3 7.1 3c1.9-.2 3 1.1 3.5 3.8.5 3 .8 4.8 1 5.5.6 2.5 1.2 3.8 1.9 3.8.5 0 1.3-.9 2.4-2.6 1-1.7 1.6-3 1.7-3.9.1-1.3-.4-2-1.7-2-.6 0-1.2.1-1.8.4C15.3 4.2 17.6 2.4 21 2.5c2.1.1 3.1 1.7 3 4.9z",
    ],
  },
  {
    name: "spotify",
    label: "Spotify",
    category: "social",
    keywords: ["social", "music", "playlist", "dj"],
    render: "fill",
    paths: [
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.3-.5 10 1.1.3.2.4.6.2.9zm1.2-2.7a.8.8 0 0 1-1 .3c-2.7-1.7-6.9-2.2-10.1-1.2a.8.8 0 1 1-.4-1.5c3.7-1.1 8.3-.6 11.4 1.4.3.2.4.7.1 1zm.1-2.8C14.7 8.9 9.4 8.7 6.3 9.6a.9.9 0 1 1-.5-1.8c3.6-1.1 9.4-.9 13.1 1.3a.9.9 0 1 1-1 1.5z",
    ],
  },
  {
    name: "github",
    label: "GitHub",
    category: "social",
    keywords: ["social", "code", "repo"],
    render: "fill",
    paths: [
      "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .3.3.7 1 .7 2v2.9c0 .3.2.6.7.5A10 10 0 0 0 12 2z",
    ],
  },
  {
    name: "email",
    label: "Email",
    category: "communication",
    keywords: ["mail", "contact", "message", "write"],
    paths: ["m3 6 9 6.5L21 6"],
    rects: [{ x: 2.5, y: 4.5, width: 19, height: 15, rx: 2 }],
  },
  {
    name: "web_link",
    label: "Website",
    category: "social",
    keywords: ["link", "url", "generic", "other"],
    paths: [
      "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 9a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0",
    ],
  },
] as const satisfies ReadonlyArray<BuilderIconCatalogEntry>;
