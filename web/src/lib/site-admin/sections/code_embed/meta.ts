import type { SectionMeta } from "../types";

export const codeEmbedMeta: SectionMeta = {
  key: "code_embed",
  label: "Embed",
  description:
    "Sandboxed iframe embed (Calendly, YouTube, Vimeo, Spotify). Operator pastes the URL — we never inject raw HTML.",
  businessPurpose: "feature",
  visibleToAgency: true,
};
