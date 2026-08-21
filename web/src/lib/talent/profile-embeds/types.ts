import type { ProfileEmbedProvider } from "./embed-url";

/**
 * Public render shapes for the Pro/Portfolio profile extras. Kept OUT of
 * repository.ts (which is `server-only`) so client and shared components can
 * import the types without dragging a server module into their graph.
 */

/** One embed as the public profile renders it. `src` is ALWAYS re-minted. */
export type PublicTalentEmbed = {
  id: string;
  provider: ProfileEmbedProvider;
  src: string;
  title: string | null;
};

/** One press clipping as the public profile renders it. */
export type PublicTalentPressItem = {
  id: string;
  outlet: string;
  title: string;
  url: string;
  publishedOn: string | null;
  quote: string | null;
};
