import Link from "next/link";

type Props = {
  profileCode: string;
};

export function TalentSiteNotPublished({ profileCode }: Props) {
  const profilePath = `/t/${encodeURIComponent(profileCode)}`;

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "80px auto",
        padding: "0 24px",
        fontFamily: '"Inter", system-ui, sans-serif',
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Personal site not published yet
      </h1>
      <p style={{ fontSize: 14, color: "rgba(11,11,13,0.55)", marginBottom: 20, lineHeight: 1.5 }}>
        This talent has not published a personal site. You can still view their standard Tulala
        profile.
      </p>
      <Link
        href={profilePath}
        style={{
          display: "inline-block",
          padding: "10px 18px",
          background: "#0B0B0D",
          color: "#fff",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        View profile
      </Link>
    </main>
  );
}
