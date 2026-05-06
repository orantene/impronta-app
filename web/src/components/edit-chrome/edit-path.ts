export type PublicSurfaceOwnership =
  | { kind: "builder_page"; pageSlug: string | null }
  | { kind: "site_shell" }
  | { kind: "directory" }
  | { kind: "profile" }
  | { kind: "platform_route" };

type ResolvePathInput = {
  rawPathname: string;
  supportedLocales: ReadonlyArray<string>;
  publicPathPrefix?: string | null;
};

const PLATFORM_ROUTE_SEGMENTS = new Set<string>([
  "admin",
  "api",
  "auth",
  "account",
  "client",
  "talent",
  "login",
  "register",
  "onboarding",
  "share",
  "invite",
  "waitlist",
  "forgot-password",
  "update-password",
  "dev",
  "prototypes",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

function resolveStorefrontPathSegments(input: ResolvePathInput): string[] {
  let segs = (input.rawPathname.split("?")[0] ?? "/")
    .split("/")
    .filter(Boolean);

  if (segs.length > 0 && input.supportedLocales.includes(segs[0]!)) {
    segs = segs.slice(1);
  }

  const prefixSegs = (input.publicPathPrefix ?? "")
    .split("/")
    .filter(Boolean);
  if (
    prefixSegs.length > 0 &&
    prefixSegs.every((seg, index) => segs[index] === seg)
  ) {
    segs = segs.slice(prefixSegs.length);
  }

  return segs;
}

export function resolvePublicSurfaceOwnershipFromPath(
  input: ResolvePathInput,
): PublicSurfaceOwnership {
  const segs = resolveStorefrontPathSegments(input);
  if (segs.length === 0) {
    return { kind: "builder_page", pageSlug: null };
  }

  const [first, second] = segs;
  if (first === "directory") return { kind: "directory" };
  if (first === "t") return { kind: "profile" };

  if (first === "p") {
    if (second === "__site_shell__") return { kind: "site_shell" };
    if (!second) return { kind: "platform_route" };
    return { kind: "builder_page", pageSlug: second };
  }

  if (first === "__site_shell__") return { kind: "site_shell" };

  if (
    PLATFORM_ROUTE_SEGMENTS.has(first) ||
    first.startsWith("_") ||
    first.includes(".")
  ) {
    return { kind: "platform_route" };
  }

  return { kind: "builder_page", pageSlug: first };
}

export function resolveEditPageSlugFromPath(input: ResolvePathInput): string | null {
  const ownership = resolvePublicSurfaceOwnershipFromPath(input);
  return ownership.kind === "builder_page" ? ownership.pageSlug : null;
}
