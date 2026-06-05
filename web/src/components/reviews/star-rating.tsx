"use client";

/**
 * Shared star primitives for the two-sided reviews feature (W8).
 *
 * - <StaticStars> renders a read-only 1–5 rating.
 * - <StarPicker> is an interactive radiogroup star input (keyboard-navigable),
 *   extracted from W7's LeaveReviewCard so the talent's "Rate the client" form
 *   and any other surface can reuse the exact same visual + a11y behaviour.
 *
 * Plain component module (no server imports) so it composes into the client
 * shell, the admin-shell drawer, and standalone pages alike. Self-contained
 * styling — the star gold (#E8A700) is the same literal W7 uses.
 */

import { useId } from "react";

const STAR_GOLD = "#E8A700";
const STAR_DIM = "rgba(11,11,13,0.18)";

const STAR_PATH =
  "M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z";

export function StaticStars({
  rating,
  size = 13,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <span
      style={{ display: "inline-flex", gap: 1 }}
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={n <= rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          aria-hidden
          style={{ color: n <= rating ? STAR_GOLD : STAR_DIM }}
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

export function StarPicker({
  rating,
  hover,
  disabled = false,
  label,
  fontFamily,
  onSelect,
  onHover,
}: {
  rating: number;
  hover: number;
  disabled?: boolean;
  /** Accessible group label, e.g. "Star rating for Acme Events". */
  label: string;
  fontFamily?: string;
  onSelect: (n: number) => void;
  onHover: (n: number) => void;
}) {
  const groupId = useId();
  const display = hover || rating;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onSelect(Math.min(5, (rating || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onSelect(Math.max(1, (rating || 1) - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      onSelect(1);
    } else if (e.key === "End") {
      e.preventDefault();
      onSelect(5);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={() => onHover(0)}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: "2px 2px 4px",
        borderRadius: 8,
        outline: "none",
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= display;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            id={`${groupId}-star-${n}`}
            disabled={disabled}
            onClick={() => onSelect(n)}
            onMouseEnter={() => onHover(n)}
            onMouseLeave={() => onHover(0)}
            style={{
              background: "transparent",
              border: "none",
              cursor: disabled ? "default" : "pointer",
              padding: 1,
              lineHeight: 0,
              color: active ? STAR_GOLD : STAR_DIM,
              transition: "color 0.12s ease, transform 0.08s ease",
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill={active ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={STAR_PATH} />
            </svg>
          </button>
        );
      })}
      <span
        aria-hidden
        style={{
          alignSelf: "center",
          marginLeft: 8,
          fontSize: 12,
          fontWeight: 600,
          color: rating > 0 ? "#0B0B0D" : STAR_DIM,
          fontVariantNumeric: "tabular-nums",
          fontFamily,
        }}
      >
        {rating > 0 ? `${rating}/5` : "Tap to rate"}
      </span>
    </div>
  );
}
