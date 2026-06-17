"use client";

/**
 * Interactive "Try again" control for the /offline fallback page.
 *
 * The offline page is a Server Component (it exports `metadata`), so its
 * `onClick` handler can't live inline there — React throws
 * "Event handlers cannot be passed to Client Component props" and the whole
 * page 500s. Keeping the one interactive element in this tiny Client
 * Component lets the page stay a static Server Component while the button
 * still works after hydration.
 */
export function TryAgainButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "9px 18px",
        borderRadius: 999,
        background: "#0F4F3E",
        color: "#ffffff",
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize: 13.5,
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
      }}
    >
      Try again
    </button>
  );
}
