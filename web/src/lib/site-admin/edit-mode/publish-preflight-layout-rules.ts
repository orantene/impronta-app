export interface LayoutOverflowRisk {
  path: string;
  token: string;
  length: number;
}

const KEY_EXCLUSIONS = ["url", "href", "link", "canonical", "slug"];
const MIN_OVERFLOW_TOKEN_LENGTH = 36;

function shouldIgnorePath(path: string): boolean {
  const lower = path.toLowerCase();
  return KEY_EXCLUSIONS.some((piece) => lower.includes(piece));
}

function longestUnbrokenToken(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean);
  let longest = "";
  for (const token of tokens) {
    if (token.length > longest.length) longest = token;
  }
  return longest;
}

export function collectLayoutOverflowRisks(
  value: unknown,
  path = "props",
): LayoutOverflowRisk[] {
  const risks: LayoutOverflowRisk[] = [];

  function walk(current: unknown, currentPath: string): void {
    if (typeof current === "string") {
      if (shouldIgnorePath(currentPath)) return;
      const token = longestUnbrokenToken(current);
      if (token.length >= MIN_OVERFLOW_TOKEN_LENGTH) {
        risks.push({
          path: currentPath,
          token,
          length: token.length,
        });
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        walk(item, `${currentPath}[${index}]`);
      });
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
        walk(nested, `${currentPath}.${key}`);
      }
    }
  }

  walk(value, path);
  return risks;
}
