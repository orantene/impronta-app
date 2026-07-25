/**
 * Font-size ramps for the section's `nodePresentation` size tokens. Extracted
 * from Component.tsx so both the plain header and the lifestyle-banner header
 * share one scale (and to keep that file under the max-lines cap).
 */
export function eyebrowSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.68rem",
    md: "0.75rem",
    lg: "0.85rem",
    xl: "0.95rem",
    display: "1.1rem",
  }[size];
}

export function headingSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "1.9rem",
    md: "2.35rem",
    lg: "2.85rem",
    xl: "3.4rem",
    display: "clamp(3.5rem, 6vw, 6rem)",
  }[size];
}

export function paragraphSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.9rem",
    md: "1rem",
    lg: "1.12rem",
    xl: "1.25rem",
    display: "clamp(2rem, 4vw, 4.5rem)",
  }[size];
}
