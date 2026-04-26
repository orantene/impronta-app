/**
 * Public talent share-card landing page.
 *
 * Coordinators copy a shareable URL from the workspace TalentShareCard
 * drawer; recipients land here. Renders a standalone client-friendly
 * page with photos, basic info, and a tracked-link "Send inquiry" CTA
 * that prefills the composer with attribution metadata.
 *
 * The prototype version is mock-driven — slug is taken at face value
 * and rendered against a static talent record. Production version will
 * resolve the slug to a live talent row, log a `profile_view` event
 * (with referrer + UTM), and POST to `/api/inquiries/from-share` with
 * the attribution chain.
 */

import type { Metadata } from "next";
import Link from "next/link";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Mock talent — keyed by slug. Replace with a Supabase query.
const MOCK_TALENT: Record<
  string,
  {
    name: string;
    headline: string;
    location: string;
    height: string;
    specialty: string;
    bio: string;
    repAgency: string;
    coverEmoji: string;
  }
> = {
  "marta-reyes": {
    name: "Marta Reyes",
    headline: "Editorial · Runway · Commercial",
    location: "Madrid · Available worldwide",
    height: "5'10\" · 178cm",
    specialty: "Editorial, runway, beauty",
    bio: "Madrid-based, signed with Atelier Roma. Recent: Vogue Italia spring spread, Mango lookbook, Bvlgari jewelry campaign.",
    repAgency: "Atelier Roma",
    coverEmoji: "✨",
  },
};

const FALLBACK = {
  name: "Talent",
  headline: "Editorial · Runway · Commercial",
  location: "Available worldwide",
  height: "—",
  specialty: "—",
  bio: "Profile loading. In production this resolves the slug to a live talent record.",
  repAgency: "Tulala roster",
  coverEmoji: "✨",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const t = MOCK_TALENT[slug] ?? FALLBACK;
  return {
    title: `${t.name} · Tulala`,
    description: `${t.headline}. ${t.bio}`,
    openGraph: {
      title: `${t.name} — talent profile`,
      description: t.headline,
      type: "profile",
    },
  };
}

export default async function TalentSharePage({ params }: PageProps) {
  const { slug } = await params;
  const t = MOCK_TALENT[slug] ?? FALLBACK;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAFAF7",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        color: "#0B0B0D",
        padding: "24px 16px 48px",
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#fff",
          border: "1px solid rgba(24,24,27,0.06)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 12px 36px rgba(11,11,13,0.08)",
        }}
      >
        {/* Cover */}
        <div
          style={{
            background: "linear-gradient(135deg, #F2F2EE 0%, #E5E1D7 100%)",
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 80,
            color: "#0F4F3E",
          }}
        >
          {t.coverEmoji}
        </div>

        {/* Identity */}
        <div style={{ padding: "24px 28px 28px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "rgba(11,11,13,0.55)",
            }}
          >
            Represented by {t.repAgency}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: -0.6,
              margin: "6px 0 0",
              lineHeight: 1.1,
            }}
          >
            {t.name}
          </h1>
          <div
            style={{
              fontSize: 15,
              color: "rgba(11,11,13,0.62)",
              marginTop: 6,
              lineHeight: 1.55,
            }}
          >
            {t.headline}
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginTop: 24,
              padding: "16px 0",
              borderTop: "1px solid rgba(24,24,27,0.06)",
              borderBottom: "1px solid rgba(24,24,27,0.06)",
            }}
          >
            <Stat label="Based in" value={t.location.split(" · ")[0] ?? t.location} />
            <Stat label="Height" value={t.height} />
            <Stat label="Specialty" value={t.specialty} />
          </div>

          {/* Bio */}
          <p
            style={{
              fontSize: 14,
              color: "#0B0B0D",
              lineHeight: 1.65,
              marginTop: 20,
              maxWidth: 560,
            }}
          >
            {t.bio}
          </p>

          {/* Photo grid placeholder */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 20,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: "3 / 4",
                  background: "#F2F2EE",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "rgba(11,11,13,0.38)",
                }}
              >
                Photo {i + 1}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div
            style={{
              marginTop: 28,
              padding: 20,
              background: "rgba(15,79,62,0.06)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "#093328" }}>
              Want to book {t.name.split(" ")[0]}?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(9,51,40,0.78)",
                marginTop: 6,
                lineHeight: 1.55,
              }}
            >
              Tell us about your project — dates, brief, and budget. {t.repAgency} replies
              within the hour.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <Link
                href={`/?inquiry=${slug}&utm_source=share`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  background: "#0F4F3E",
                  color: "#fff",
                  borderRadius: 9,
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Send inquiry →
              </Link>
              <Link
                href={`/?talent=${slug}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 18px",
                  background: "transparent",
                  color: "#093328",
                  border: "1px solid rgba(9,51,40,0.22)",
                  borderRadius: 9,
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                See more talent
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 28px",
            borderTop: "1px solid rgba(24,24,27,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11.5,
            color: "rgba(11,11,13,0.55)",
          }}
        >
          <span>Powered by Tulala</span>
          <Link href="/" style={{ color: "rgba(11,11,13,0.55)", textDecoration: "none" }}>
            How it works →
          </Link>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "rgba(11,11,13,0.55)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#0B0B0D", marginTop: 2, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
