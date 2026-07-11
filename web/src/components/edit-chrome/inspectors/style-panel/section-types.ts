/**
 * StylePanel — shared types for the extracted domain sub-sections (W5-C1).
 *
 * The standalone-node Style groups (Typography / Dimensions / Appearance /
 * Spacing / Position & layout / Effects & motion) were carved out of the
 * ~9.5k-line style-panel.tsx render body into their own components. They
 * receive the exact closure values the parent held; this module holds the
 * type aliases they share so the prop contracts stay in one place.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node";

export type StandaloneStyleNode = Exclude<BuilderNode, { kind: "section" }>;
