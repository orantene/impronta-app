export interface LayoutOverflowRisk {
  path: string;
  token: string;
  length: number;
}

export const LAYOUT_OVERFLOW_BLOCKING_LENGTH = 72;

export interface BreakpointVisibilityRisk {
  path: string;
  breakpoint: "tablet" | "mobile";
  visibility: "hidden";
}

export interface BreakpointCascadeRisk {
  path: string;
  breakpoint: "mobile";
  field: string;
  reason: "missing-tablet-override";
}

export interface BreakpointOrderRisk {
  path: string;
  field: string;
  tabletValue: number;
  mobileValue: number;
  reason: "mobile-exceeds-tablet";
}

const KEY_EXCLUSIONS = ["url", "href", "link", "canonical", "slug"];
const MIN_OVERFLOW_TOKEN_LENGTH = 36;
const BREAKPOINT_KEYS = ["tablet", "mobile"] as const;
const CASCADE_FIELDS = [
  "align",
  "maxWidthPx",
  "marginTopPx",
  "marginBottomPx",
  "marginInlinePx",
  "marginLeftPx",
  "marginRightPx",
  "paddingTopPx",
  "paddingBottomPx",
  "paddingInlinePx",
  "paddingLeftPx",
  "paddingRightPx",
  "size",
  "tone",
  "visibility",
] as const;
const ORDER_FIELDS = [
  "maxWidthPx",
  "marginTopPx",
  "marginBottomPx",
  "marginInlinePx",
  "marginLeftPx",
  "marginRightPx",
  "paddingTopPx",
  "paddingBottomPx",
  "paddingInlinePx",
  "paddingLeftPx",
  "paddingRightPx",
] as const;

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

export function isLayoutOverflowRiskBlocking(risk: LayoutOverflowRisk): boolean {
  return risk.length >= LAYOUT_OVERFLOW_BLOCKING_LENGTH;
}

export function collectBreakpointVisibilityRisks(
  value: unknown,
  path = "props",
): BreakpointVisibilityRisk[] {
  const risks: BreakpointVisibilityRisk[] = [];

  function walk(current: unknown, currentPath: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;

    const record = current as Record<string, unknown>;
    const rawBreakpoints = record.breakpoints;
    if (
      rawBreakpoints &&
      typeof rawBreakpoints === "object" &&
      !Array.isArray(rawBreakpoints)
    ) {
      const breakpoints = rawBreakpoints as Record<string, unknown>;
      for (const key of BREAKPOINT_KEYS) {
        const bucket = breakpoints[key];
        if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
        const visibility = (bucket as Record<string, unknown>).visibility;
        if (visibility === "hidden") {
          risks.push({
            path: `${currentPath}.breakpoints.${key}.visibility`,
            breakpoint: key,
            visibility: "hidden",
          });
        }
      }
    }

    for (const [key, nested] of Object.entries(record)) {
      walk(nested, `${currentPath}.${key}`);
    }
  }

  walk(value, path);
  return risks;
}

export function collectBreakpointCascadeRisks(
  value: unknown,
  path = "props",
): BreakpointCascadeRisk[] {
  const risks: BreakpointCascadeRisk[] = [];

  function walk(current: unknown, currentPath: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;

    const record = current as Record<string, unknown>;
    const rawBreakpoints = record.breakpoints;
    if (
      rawBreakpoints &&
      typeof rawBreakpoints === "object" &&
      !Array.isArray(rawBreakpoints)
    ) {
      const breakpoints = rawBreakpoints as Record<string, unknown>;
      const tablet =
        breakpoints.tablet &&
        typeof breakpoints.tablet === "object" &&
        !Array.isArray(breakpoints.tablet)
          ? (breakpoints.tablet as Record<string, unknown>)
          : null;
      const mobile =
        breakpoints.mobile &&
        typeof breakpoints.mobile === "object" &&
        !Array.isArray(breakpoints.mobile)
          ? (breakpoints.mobile as Record<string, unknown>)
          : null;

      if (mobile) {
        for (const field of CASCADE_FIELDS) {
          if (!(field in mobile)) continue;
          if (tablet && field in tablet) continue;
          risks.push({
            path: `${currentPath}.breakpoints.mobile.${field}`,
            breakpoint: "mobile",
            field,
            reason: "missing-tablet-override",
          });
        }
      }
    }

    for (const [key, nested] of Object.entries(record)) {
      walk(nested, `${currentPath}.${key}`);
    }
  }

  walk(value, path);
  return risks;
}

export function collectBreakpointOrderRisks(
  value: unknown,
  path = "props",
): BreakpointOrderRisk[] {
  const risks: BreakpointOrderRisk[] = [];

  function walk(current: unknown, currentPath: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;

    const record = current as Record<string, unknown>;
    const rawBreakpoints = record.breakpoints;
    if (
      rawBreakpoints &&
      typeof rawBreakpoints === "object" &&
      !Array.isArray(rawBreakpoints)
    ) {
      const breakpoints = rawBreakpoints as Record<string, unknown>;
      const tablet =
        breakpoints.tablet &&
        typeof breakpoints.tablet === "object" &&
        !Array.isArray(breakpoints.tablet)
          ? (breakpoints.tablet as Record<string, unknown>)
          : null;
      const mobile =
        breakpoints.mobile &&
        typeof breakpoints.mobile === "object" &&
        !Array.isArray(breakpoints.mobile)
          ? (breakpoints.mobile as Record<string, unknown>)
          : null;

      if (tablet && mobile) {
        for (const field of ORDER_FIELDS) {
          const tabletValue = tablet[field];
          const mobileValue = mobile[field];
          if (
            typeof tabletValue !== "number" ||
            !Number.isFinite(tabletValue) ||
            typeof mobileValue !== "number" ||
            !Number.isFinite(mobileValue)
          ) {
            continue;
          }
          if (mobileValue > tabletValue) {
            risks.push({
              path: `${currentPath}.breakpoints.mobile.${field}`,
              field,
              tabletValue,
              mobileValue,
              reason: "mobile-exceeds-tablet",
            });
          }
        }
      }
    }

    for (const [key, nested] of Object.entries(record)) {
      walk(nested, `${currentPath}.${key}`);
    }
  }

  walk(value, path);
  return risks;
}
