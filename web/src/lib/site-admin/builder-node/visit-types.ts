/**
 * Live visit-fact DTO for the shared `visit` builder node.
 * Resolved server-side from service areas + languages (+ optional hours).
 * The renderer never queries and never invents facts.
 */
export type TalentVisitFactIcon =
  | "place"
  | "travel"
  | "languages"
  | "hours"
  | "remote"
  | "changes"
  | "note";

export type TalentVisitFact = {
  /** Short label (Where / Travels / Languages / Days). */
  label: string;
  /** Human value; empty facts are dropped before render. */
  value: string;
  icon: TalentVisitFactIcon;
  /** Optional small second line under the value. */
  note?: string;
  /** Travel facts: the same places as separate names (the area card renders chips). */
  chips?: string[];
};

export type TalentVisitFacts = {
  facts: TalentVisitFact[];
};
