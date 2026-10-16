import { notFound } from "next/navigation";

// TUL-670: an unmatched /talent/* URL has no route, so Next fell through to the
// ROOT not-found (English, outside the dashboard shell, English tab title).
// This catch-all matches only what no real page matches and throws notFound()
// from INSIDE the talent layout, so the segment not-found.tsx renders in the
// shell with the dashboard language.
export default function TalentMissingPage(): never {
  notFound();
}
