import type { ComponentType } from "react";

export type InspectorJob = "context" | "suggestions" | "actions";

/** Client-side route + URL context for inspector modules. */
export type InspectorContext = {
  pathname: string;
  searchParams: URLSearchParams;
  apanel: string | null;
  aid: string | null;
};

export type InspectorModuleDefinition = {
  key: string;
  title: string;
  job: InspectorJob;
  /** When true, module calls a real AI/search pipeline (documented in module UI). */
  requiresAiPipeline?: boolean;
  visible: (ctx: InspectorContext) => boolean;
  Component: ComponentType<{ ctx: InspectorContext }>;
};
