/**
 * Read and write a DOTTED PATH inside a node's props (`fields.3.label`,
 * `config.requestCta.label`).
 *
 * The inspector edits top-level props by key. Text one level down had no editor
 * at all: the panel showed the form's field labels in ENGLISH while the canvas
 * beside it rendered Spanish, because the inspector was reading the base prop
 * and the page was rendering the overlay. These helpers are what let ONE
 * generic field editor serve every nested path, instead of a bespoke locale UI
 * per component.
 *
 * Pure, and deliberately conservative: `setAtPath` only writes where a string
 * already lives, so an editor can translate existing copy but never invent
 * structure in a node it does not understand.
 */

/** The string at `path`, or undefined when the path is absent / not a string. */
export function getAtPath(root: unknown, path: string): string | undefined {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Immutably set `path`, cloning only the containers along it. Returns the input
 * unchanged when the path does not already resolve to a string.
 */
export function setAtPath<T>(root: T, path: string, value: string): T {
  const segments = path.split(".");
  if (getAtPath(root, path) === undefined) return root;
  const write = (node: unknown, i: number): unknown => {
    const seg = segments[i]!;
    if (i === segments.length - 1) {
      if (Array.isArray(node)) {
        const next = [...node];
        next[Number(seg)] = value;
        return next;
      }
      return { ...(node as Record<string, unknown>), [seg]: value };
    }
    if (Array.isArray(node)) {
      const idx = Number(seg);
      const next = [...node];
      next[idx] = write(next[idx], i + 1);
      return next;
    }
    const obj = node as Record<string, unknown>;
    return { ...obj, [seg]: write(obj[seg], i + 1) };
  };
  return write(root, 0) as T;
}

/** The top-level props key a dotted path lives under — the key a props patch
 *  must carry (`fields.3.label` → `fields`). */
export function rootKeyOf(path: string): string {
  return path.split(".")[0]!;
}

/**
 * A human label for a nested path: "Field 4 · label", "requestCta · label".
 * Array indexes are 1-based here because the row is read by an operator, not a
 * programmer.
 */
export function describeNestedPath(path: string): string {
  const parts = path.split(".");
  const leaf = parts[parts.length - 1]!;
  const container = parts[0]!;
  const index = parts.find((p) => /^\d+$/.test(p));
  const containerLabel = container.replace(/([a-z])([A-Z])/g, "$1 $2");
  return index === undefined
    ? `${containerLabel} · ${leaf}`
    : `${containerLabel} ${Number(index) + 1} · ${leaf}`;
}
