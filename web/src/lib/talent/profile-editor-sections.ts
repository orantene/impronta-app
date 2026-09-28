/**
 * Pure helpers behind the talent "Edit your profile" and "Reviews" pages.
 *
 * The profile page reads its completion from ONE value: the website
 * eligibility result (`getWebsiteEligibility` via `useWebsiteEligibility`).
 * These helpers only reshape that value into the editor's sections; they
 * never compute a second percent.
 */

import type { WebsiteSlice, WebsiteSliceKey } from "./website-eligibility";

export type ProfileEditorSectionKey =
  | "nameTrade"
  | "intro"
  | "where"
  | "photos"
  | "languages"
  | "contact";

/** Section of the existing talent-profile-shell drawer each card opens. */
export const PROFILE_EDITOR_SHELL_SECTION: Record<ProfileEditorSectionKey, string> = {
  nameTrade: "identity",
  intro: "about",
  where: "location",
  photos: "albums",
  languages: "about",
  contact: "identity",
};

/** Eligibility slice that decides whether a section is done (if any). */
const SECTION_SLICE: Partial<Record<ProfileEditorSectionKey, WebsiteSliceKey>> = {
  nameTrade: "who",
  intro: "intro",
  where: "where",
  photos: "photos",
};

export const PROFILE_EDITOR_SECTION_ORDER: readonly ProfileEditorSectionKey[] = [
  "nameTrade",
  "intro",
  "where",
  "photos",
  "languages",
  "contact",
];

export type ProfileEditorSectionState = "done" | "todo" | "unknown" | "optional";

export type ProfileEditorSection = {
  key: ProfileEditorSectionKey;
  shellSection: string;
  state: ProfileEditorSectionState;
  /** True when the website eligibility counts this section as required. */
  counts: boolean;
};

export function buildProfileEditorSections(slices: readonly WebsiteSlice[]): ProfileEditorSection[] {
  return PROFILE_EDITOR_SECTION_ORDER.map((key) => {
    const sliceKey = SECTION_SLICE[key];
    const slice = sliceKey ? slices.find((s) => s.key === sliceKey) : undefined;
    let state: ProfileEditorSectionState = "optional";
    if (slice && slice.required) {
      state = slice.done == null ? "unknown" : slice.done ? "done" : "todo";
    }
    return {
      key,
      shellSection: PROFILE_EDITOR_SHELL_SECTION[key],
      state,
      counts: Boolean(slice?.required),
    };
  });
}

export type EligibilitySummary = {
  percent: number | null;
  left: number;
  total: number;
  /** First required slice that is not done, for a "finish" deep link. */
  firstOpen: WebsiteSliceKey | null;
};

/** Reshape the one eligibility value into the ready card's numbers. */
export function summarizeEligibility(input: {
  percent: number | null;
  slices: readonly WebsiteSlice[];
}): EligibilitySummary {
  const required = input.slices.filter((s) => s.required);
  const open = required.filter((s) => s.done === false);
  return {
    percent: input.percent,
    left: open.length,
    total: required.length,
    firstOpen: open[0]?.key ?? null,
  };
}

/** Shell section to open for an eligibility slice. */
export const SLICE_SHELL_SECTION: Record<WebsiteSliceKey, string> = {
  who: "identity",
  photos: "albums",
  offer: "services",
  intro: "about",
  when: "availability",
  where: "location",
};

// ─── Reviews ────────────────────────────────────────────────────────────────

export type ReviewTab = "all" | "needReply" | "replied" | "flagged";

export type ReviewLike = {
  id: string;
  status: "published" | "hidden";
  replyBody: string | null;
  bookingId: string | null;
};

function hasReply(r: ReviewLike, localReplies: ReadonlySet<string>): boolean {
  return Boolean(r.replyBody && r.replyBody.trim()) || localReplies.has(r.id);
}

function isFlagged(r: ReviewLike, reported: ReadonlySet<string>): boolean {
  return r.status === "hidden" || reported.has(r.id);
}

export function reviewMatchesTab(
  r: ReviewLike,
  tab: ReviewTab,
  reported: ReadonlySet<string> = new Set(),
  localReplies: ReadonlySet<string> = new Set(),
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "needReply":
      return !hasReply(r, localReplies) && r.status !== "hidden";
    case "replied":
      return hasReply(r, localReplies);
    case "flagged":
      return isFlagged(r, reported);
  }
}

export function reviewTabCounts(
  reviews: readonly ReviewLike[],
  reported: ReadonlySet<string> = new Set(),
  localReplies: ReadonlySet<string> = new Set(),
): Record<ReviewTab, number> {
  const tabs: ReviewTab[] = ["all", "needReply", "replied", "flagged"];
  const out = { all: 0, needReply: 0, replied: 0, flagged: 0 } as Record<ReviewTab, number>;
  for (const tab of tabs) {
    out[tab] = reviews.filter((r) => reviewMatchesTab(r, tab, reported, localReplies)).length;
  }
  return out;
}

/** "verified" when the review is tied to a booking; "noBooking" otherwise. */
export function reviewSourceKind(r: Pick<ReviewLike, "bookingId">): "verified" | "noBooking" {
  return r.bookingId ? "verified" : "noBooking";
}
