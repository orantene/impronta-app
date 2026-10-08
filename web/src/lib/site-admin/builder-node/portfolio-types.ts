/**
 * Live portfolio shot DTO for the W-12 `portfolio` builder node.
 * Resolved server-side from `media_assets` (+ optional `talent_offering_media`
 * reverse map). The renderer never queries.
 */
export type TalentPortfolioShot = {
  id: string;
  url: string;
  alt: string;
  /** Optional caption from asset metadata or editor override. */
  caption?: string | null;
  /** Non-empty per-language captions (`metadata.caption_i18n`); drives the language hint. */
  captionI18n?: Readonly<Record<string, string>> | null;
  /** Service this photo shows, when known. */
  offeringId?: string | null;
  offeringTitle?: string | null;
  /** Talent media album id from `media_assets.metadata.albumId`. */
  albumId?: string | null;
  width?: number | null;
  height?: number | null;
  sortOrder?: number;
};
