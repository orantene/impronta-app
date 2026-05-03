"use client";

// OverviewGreeting — renders time-based greeting + current date.
// Must be a client component so new Date() uses the browser's local time.

const FONT_BODY = '"Inter", system-ui, sans-serif';

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function OverviewGreeting({ userName }: { userName: string }) {
  return (
    <div>
      <h1
        style={{
          fontFamily: FONT_BODY,
          fontSize: 28,
          fontWeight: 600,
          color: "#0B0B0D",
          letterSpacing: -0.4,
          lineHeight: 1.2,
          margin: 0,
        }}
      >
        {timeOfDay()}, {userName}
      </h1>
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13,
          color: "rgba(11,11,13,0.50)",
          marginTop: 4,
          letterSpacing: 0,
        }}
      >
        {formatDate()}
      </p>
    </div>
  );
}
