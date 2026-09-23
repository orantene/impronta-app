"use client";

/**
 * MaisonContact — the channels a visitor can reach her on.
 *
 * Every field maps to something the platform ALREADY stores, so this is a
 * presentation layer and not a new data model:
 *
 *   whatsapp / phone  → `talent_profiles.phone` (also a required key in the
 *                       free-website readiness checklist, so a talent who has
 *                       unlocked her site necessarily has one)
 *   instagram/tiktok  → `talent_integration_items` rows whose `provider_key`
 *                       is "instagram" / "tiktok" AND whose
 *                       `public_profile_enabled` is true
 *   email             → the inquiry rail; kept last on purpose, because the
 *                       thread in Messages is the channel she can actually
 *                       track
 *
 * Any channel that is absent simply does not render — a profile with no
 * socials shows fewer buttons, never an empty or dead one. That matters here:
 * Jorgelina has not confirmed a public handle, so the prototype marks them.
 *
 * Brand glyphs are inline paths because the icon set in use (lucide)
 * deliberately ships no brand marks.
 */

export type MaisonContactChannels = {
  /** Digits only, international format, no "+" — e.g. "5219841234567". */
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Handle without the "@". */
  instagram?: string | null;
  tiktok?: string | null;
  /** Shown under the row — e.g. that the handles are not confirmed yet. */
  note?: string | null;
  /**
   * Prototype mode. The buttons render exactly as they will, but every href
   * is inert: an unconfirmed handle must never link out, because
   * instagram.com/<guess> may well be a stranger's account.
   */
  demo?: boolean;
};

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.88 9.88 0 0 0 12.04 2Zm0 18.16h-.01a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.55 3.71-8.26 8.27-8.26a8.2 8.2 0 0 1 5.83 2.42 8.2 8.2 0 0 1 2.42 5.85c0 4.56-3.71 8.23-8.26 8.23Zm4.53-6.16c-.25-.13-1.47-.72-1.7-.8-.22-.09-.39-.13-.55.12-.17.25-.63.8-.78.97-.14.16-.28.18-.53.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.17 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.58.19 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.11-.22-.17-.47-.29Z"
      />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 3h-2.6v12.1a2.6 2.6 0 1 1-2.1-2.55V9.9a5.6 5.6 0 1 0 4.7 5.53V9.2a6.5 6.5 0 0 0 3.6 1.1V7.65a3.9 3.9 0 0 1-3.6-4.65Z"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m3.5 7.5 8.5 6 8.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MaisonContact({
  channels,
  heading,
  talentName,
}: {
  channels: MaisonContactChannels;
  heading: string;
  talentName: string;
}) {
  const links: { key: string; href: string; label: string; glyph: React.ReactNode }[] = [];

  if (channels.whatsapp) {
    links.push({
      key: "whatsapp",
      href: `https://wa.me/${channels.whatsapp.replace(/\D/g, "")}`,
      label: "WhatsApp",
      glyph: <WhatsAppGlyph />,
    });
  }
  if (channels.instagram) {
    links.push({
      key: "instagram",
      href: `https://instagram.com/${channels.instagram.replace(/^@/, "")}`,
      label: `@${channels.instagram.replace(/^@/, "")}`,
      glyph: <InstagramGlyph />,
    });
  }
  if (channels.tiktok) {
    links.push({
      key: "tiktok",
      href: `https://tiktok.com/@${channels.tiktok.replace(/^@/, "")}`,
      label: "TikTok",
      glyph: <TikTokGlyph />,
    });
  }
  if (channels.email) {
    links.push({
      key: "email",
      href: `mailto:${channels.email}`,
      label: heading,
      glyph: <MailGlyph />,
    });
  }

  if (links.length === 0) return null;

  return (
    <div className="mn-contact">
      <ul>
        {links.map((l) => (
          <li key={l.key}>
            <a
              href={channels.demo ? "#" : l.href}
              onClick={channels.demo ? (e) => e.preventDefault() : undefined}
              aria-disabled={channels.demo ? true : undefined}
              target={!channels.demo && l.href.startsWith("http") ? "_blank" : undefined}
              rel={!channels.demo && l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              aria-label={`${l.label} — ${talentName}`}
              data-mn-channel={l.key}
            >
              {l.glyph}
              <span>{l.label}</span>
            </a>
          </li>
        ))}
      </ul>
      {channels.note ? <p className="mn-contact-note">{channels.note}</p> : null}
    </div>
  );
}
