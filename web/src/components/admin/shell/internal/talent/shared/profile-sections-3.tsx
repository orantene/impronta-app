import { COLORS, FONTS, type TalentLink } from "../../state";



function BookingStatCell({ label, value, accent }: { label: string; value: string; accent: "ink" | "green" | "amber" | "dim" }) {
  const colorMap = {
    ink: COLORS.ink,
    green: COLORS.successDeep,
    amber: COLORS.amberDeep,
    dim: COLORS.inkMuted,
  };
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600 }} className="text-admin-ink-muted">
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: -0.3,
          color: colorMap[accent],
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}


function RateLine({ label, range }: { label: string; range: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        padding: "3px 0",
      }}
    >
      <span style={{ flex: 1 }} className="text-admin-ink">{label}</span>
      <span style={{ fontSize: 12 }} className="text-admin-ink-muted">{range}</span>
    </div>
  );
}


function LinkChip({ link }: { link: TalentLink }) {
  const glyph: Record<TalentLink["kind"], string> = {
    instagram: "◉",
    tiktok: "♪",
    imdb: "▶",
    site: "🌐︎",
    linkedin: "in",
    youtube: "▶",
    spotify: "♫",
    other: "→",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(11,11,13,0.04)", borderRadius: 999, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500 }} className="text-admin-ink">
      <span style={{ fontSize: 11 }} className="text-admin-ink-muted">{glyph[link.kind]}</span>
      {link.label}
      {link.followers && (
        <span style={{ fontSize: 10.5, fontWeight: 500 }} className="text-admin-ink-muted">
          · {link.followers}
        </span>
      )}
    </span>
  );
}


function CompletenessBar({ value }: { value: number }) {
  return (
    <div>
      <div
        style={{
          height: 6,
          background: "rgba(11,11,13,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${value}%`, height: "100%", background: value >= 100 ? COLORS.green : COLORS.fill, }}
        />
      </div>
      <div
        style={{
          fontFamily: FONTS.body, fontSize: 11.5, marginTop: 6, letterSpacing: 0.2 }} className="text-admin-ink-muted">
        {value}% complete
      </div>
    </div>
  );
}
