/**
 * Publish preflight for the ticker (`marquee`) source.
 *
 * A ticker that follows her services falls back to its own words when she has
 * no published services, so it only needs words of its own to never run empty.
 * Static (tree only, no database read), like the other tree collectors.
 *
 * Fails closed: an unknown `source` value reads as "own words" at render time,
 * so it is flagged here as a warning instead of silently changing meaning.
 */

export interface TickerPreflightIssue {
  severity: "warn";
  category: "ticker_source";
  nodeId: string;
  message: string;
}

type Loose = { id?: unknown; kind?: unknown; props?: unknown; children?: unknown };

export function collectTickerPreflightIssues(nodes: unknown): TickerPreflightIssue[] {
  const out: TickerPreflightIssue[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list as Loose[]) {
      if (!raw || typeof raw !== "object") continue;
      const id = typeof raw.id === "string" ? raw.id : "";
      if (raw.kind === "marquee") {
        const props = (raw.props ?? {}) as { source?: unknown; items?: unknown };
        const source = props.source;
        if (source !== undefined && source !== "services" && source !== "custom") {
          out.push({
            severity: "warn",
            category: "ticker_source",
            nodeId: id,
            message:
              "Your ticker has a word source we do not recognise, so it shows the words you wrote. Pick My services or Words I write myself.",
          });
        } else if (source === "services") {
          const words = Array.isArray(props.items) ? props.items.length : 0;
          if (words === 0) {
            out.push({
              severity: "warn",
              category: "ticker_source",
              nodeId: id,
              message:
                "Your ticker follows your services but has no words of its own. Until you publish a service it will show nothing.",
            });
          }
        }
      }
      walk(raw.children);
    }
  };
  walk(nodes);
  return out;
}
