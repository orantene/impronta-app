import type { ReactNode } from "react";

/** Title props use `{i}…{/i}` for the italic span. Markers never reach the page. */
export function renderItalicMarkedTitle(raw: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /\{i\}([\s\S]*?)\{\/i\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(raw))) {
    if (match.index > last) nodes.push(raw.slice(last, match.index));
    nodes.push(<em key={key++}>{match[1]}</em>);
    last = match.index + match[0].length;
  }
  if (last < raw.length) nodes.push(raw.slice(last));
  return nodes.length > 0 ? nodes : raw.replace(/\{\/?i\}/g, "");
}

export function orderCategoryNames(names: string[], saved: readonly string[] | undefined): string[] {
  if (!saved?.length) return names;
  const remaining = [...names];
  const out: string[] = [];
  for (const wanted of saved) {
    const i = remaining.findIndex((name) => name === wanted);
    if (i >= 0) {
      out.push(remaining[i]);
      remaining.splice(i, 1);
    }
  }
  return [...out, ...remaining];
}

export function catalogDurationPhrase(minutes: number, locale: string): string {
  const es = locale.startsWith("es");
  const estimated = es ? "duración estimada" : "estimated duration";
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60} h · ${estimated}`;
  }
  return `${minutes} min · ${estimated}`;
}

/** Jump-nav fragment id — pure string helper (never pass a function across RSC). */
export function catalogCategoryJumpId(nodeId: string, categoryName: string): string {
  const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${nodeId}-${slug || "_"}`;
}
