/**
 * Shared header icon set for the site_header cluster + freeform regions.
 * Extracted from Component.tsx so both the classic cluster and the WF-5
 * freeform items render the same icons (and to keep Component.tsx under the
 * line cap). Pure presentational; no client deps.
 */
export function ClusterIcon({ name }: { name: string }) {
  const cls = "site-header__cluster-icon";
  const stroke = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };
  const solid = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    focusable: "false" as const,
  };
  switch (name) {
    case "whatsapp":
      return (
        <svg {...solid}>
          <path d="M.06 24l1.69-6.16a11.87 11.87 0 01-1.59-5.95C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 018.41 3.49 11.82 11.82 0 013.48 8.41c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 01-5.69-1.45L.06 24zM6.6 20.13c1.68 1 3.28 1.6 5.45 1.6 5.45 0 9.89-4.43 9.89-9.88a9.83 9.83 0 00-2.9-7 9.78 9.78 0 00-6.98-2.9c-5.46 0-9.9 4.44-9.9 9.89a9.82 9.82 0 001.51 5.26l-.99 3.6 3.92-1.02zm11.39-5.7c-.07-.12-.27-.2-.56-.34-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.29-.76.96-.94 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.34.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.47s1.07 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...stroke}>
          <rect x="2" y="2" width="20" height="20" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...solid}>
          <path d="M16.5 1.5h-3v14.2a3.1 3.1 0 11-2.3-3v-3.1a6.2 6.2 0 105.3 6.1V8.4a7.3 7.3 0 004.3 1.4V6.7a4.3 4.3 0 01-4.3-4.3v-.9z" />
        </svg>
      );
    case "phone":
      return (
        <svg {...stroke}>
          <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" />
        </svg>
      );
    case "email":
      return (
        <svg {...stroke}>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
          <path d="m3 6 9 6.5L21 6" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...solid}>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...solid}>
          <path d="M22.5 7.1a2.7 2.7 0 0 0-1.9-1.9C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.1 28 28 0 0 0 1 12a28 28 0 0 0 .5 4.9 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 23 12a28 28 0 0 0-.5-4.9zM9.8 15.3V8.7l5.7 3.3z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...solid}>
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z" />
        </svg>
      );
    case "x":
      return (
        <svg {...solid}>
          <path d="M18.9 2h3.3l-7.2 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.7-8.8L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.1 3.9H5.2z" />
        </svg>
      );
    case "inquiry":
      // Paper plane — the inquiry / cart action.
      return (
        <svg {...stroke}>
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4z" />
        </svg>
      );
    case "saved":
      // Bookmark — the saved / favourites action.
      return (
        <svg {...stroke}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg {...stroke}>
          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 9a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0" />
        </svg>
      );
  }
}
