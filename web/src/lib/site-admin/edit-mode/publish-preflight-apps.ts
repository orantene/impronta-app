/**
 * Publish preflight for Apps (interactive mini-tools such as the Nail Designer).
 *
 * Pure tree walk, kept out of the "use server" action file so it is unit
 * testable and importable by both preflight paths. An app with nothing to pick
 * would render hidden on the live page, so the author is warned (not blocked):
 * the page is valid, the block is just invisible.
 */
import { nailOfferedCount, resolveNailOffered } from "@/lib/site-admin/builder-node/nail-designer-model";

export interface AppPreflightIssue {
  severity: "warn";
  category: "app_config";
  nodeId: string;
  message: string;
}

/** English source string; the drawer translates it through t(). */
export const NAIL_DESIGNER_EMPTY_MESSAGE =
  "The Nail Designer has no options switched on, so visitors will not see it. Turn on at least one shape, colour, finish, nail art or charm.";

export function collectAppPreflightIssues(nodes: unknown): AppPreflightIssue[] {
  const out: AppPreflightIssue[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (!value || typeof value !== "object") return;
    const n = value as { id?: unknown; kind?: unknown; props?: unknown; children?: unknown };
    if (n.kind === "app_nail_designer") {
      const props = (n.props ?? {}) as Parameters<typeof resolveNailOffered>[0];
      if (nailOfferedCount(resolveNailOffered(props)) === 0) {
        out.push({
          severity: "warn",
          category: "app_config",
          nodeId: typeof n.id === "string" ? n.id : "",
          message: NAIL_DESIGNER_EMPTY_MESSAGE,
        });
      }
    }
    walk(n.children);
  };
  walk(nodes);
  return out;
}
