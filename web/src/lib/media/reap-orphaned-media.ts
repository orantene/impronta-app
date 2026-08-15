// ============================================================================
// reap-orphaned-media.ts — the storage reaper's MATCHING LOGIC (pure).
//
// Measured 2026-08-15 (see web/docs/media-pricing-pass-2026-08-15.md): the
// media bucket carries ~381 objects / ~81 MB that nothing renders. Media
// soft-delete sets `media_assets.deleted_at` but never removes the storage
// object, and until now no reaper existed. The project sits chronically near
// the Supabase free-tier storage ceiling.
//
// ─── THE RULE THIS FILE EXISTS TO ENFORCE ───────────────────────────────────
// NEVER delete an object you cannot POSITIVELY account for. "I found no
// reference" is not the same as "I proved there is no reference" — the second
// requires that every referencing source was queried and answered. If any
// lookup fails, the caller aborts the whole run; nothing in this module ever
// decides to delete on partial input.
//
// ─── WHY A `media_assets` LOOKUP ALONE IS NOT ENOUGH ────────────────────────
// `media_assets.storage_path` is the LARGEST referencing source, not the only
// one. Objects referenced from elsewhere carry NO `media_assets` row at all,
// so a naive "no row ⇒ orphan" reaper deletes live data. Confirmed against
// production 2026-08-15: all 30 no-row objects (15 in `media-public`, 15 in
// `media-originals`) are owned by a source outside `media_assets`, or by no
// source this reaper could identify at all:
//
//   `${talentProfileId}/documents/…`  talent contracts / comp cards. Referenced
//        from field-value JSON (`talent_profile_field_values`, field_key
//        `documents`, entries carrying `storagePath` + `bucketId`) — NOT from
//        `media_assets`. See talent-document-ref.ts and
//        `actionFinalizeDocumentUpload`. A media_assets-only reaper deletes
//        every talent document in the system. (Production currently holds no
//        objects under this prefix, and the field-value query returns zero
//        rows — so the prefix rule, not the query, is what protects them.)
//   `${talentProfileId}/originals/…`  private full-fidelity originals. The 15
//        in production match NO media_assets row by any shape, so their
//        reference source is unidentified — protected, never reaped.
//   `agency-logos/…`                  workspace logo + favicon, referenced from
//        `agencies.settings` / `agency_branding.theme_json` as full public URLs.
//   `avatars/…`, `talent-site-logos/…`, `review-media/…`, `tenant/…`,
//   `talent/…`, `…/staging/…`, `…/reel/…`   further non-media_assets owners.
//
// Two further traps, both proven against production and both covered below:
//   - CROSS-BUCKET: `signOriginal()` probes `media-originals` using the EXACT
//     path of a row whose `bucket_id` is `media-public`, so an object can be
//     pinned by a row naming a different bucket.
//   - RAW URL BINDINGS: page-builder image nodes store `props.src` as a public
//     URL inside a JSON tree, so a live page can render an image whose
//     `media_assets` row was soft-deleted in the media library.
//
// So this module treats those prefixes as STRUCTURALLY PROTECTED (below) and
// never reaps a no-row object unless the caller explicitly opts in.
//
// ─── DELETION PREDICATE ─────────────────────────────────────────────────────
// An object is deletable only when ALL hold:
//   (a) no live reference from ANY source — no live `media_assets` row on the
//       same (bucket, path), no external reference, no protected prefix;
//   (b) if it maps to `media_assets` rows, EVERY such row is soft-deleted with
//       `deleted_at` older than the grace period, AND its lineage is dead too:
//       a derivative is never reaped while its parent lives, and a parent is
//       never reaped while a derivative of it lives;
//   (c) if it maps to NO row at all it is "unaccounted" — kept by default, and
//       even under the explicit opt-in it must be older than the grace period
//       by storage `created_at`, so an upload still in flight (object written,
//       row not yet inserted — a real race) is never reaped.
// ============================================================================

/** Buckets the reaper is allowed to look at. `inquiry-files` is deliberately
 *  out of scope: it is owned entirely by the inquiry attachment tables. */
export const MANAGED_BUCKETS = ["media-public", "media-originals"] as const;

/** Default grace period before a soft-deleted asset's object may be reaped. */
export const DEFAULT_GRACE_DAYS = 30;

/** Hard ceiling on deletions per run, so a first live run cannot cascade. */
export const DEFAULT_MAX_DELETIONS_PER_RUN = 500;

// ---------------------------------------------------------------------------
// Structurally protected paths — prefixes owned by a source OTHER than
// `media_assets`. Anything matching stays untouched regardless of every other
// signal. Adding a new upload surface that does not write a `media_assets` row
// MUST add a rule here.
// ---------------------------------------------------------------------------
export type ProtectedRule = {
  /** Stable id, surfaced in the dry-run report so the reason is legible. */
  id: string;
  /** Bucket the rule applies to, or "*" for every managed bucket. */
  bucketId: string;
  /** Why this prefix is owned elsewhere. */
  why: string;
  match: (storagePath: string) => boolean;
};

export const PROTECTED_RULES: ProtectedRule[] = [
  {
    id: "talent-documents",
    bucketId: "media-originals",
    why: "Talent contracts/comp cards; referenced from talent_profile_field_values (field_key 'documents'), never from media_assets.",
    // `${talentProfileId}/documents/…`
    match: (p) => /^[^/]+\/documents\//.test(p),
  },
  {
    id: "agency-logos",
    bucketId: "media-public",
    why: "Workspace logo/favicon; referenced from agencies.logo_url / favicon_url / theme_json as full public URLs.",
    match: (p) => p.startsWith("agency-logos/"),
  },
  {
    id: "review-media",
    bucketId: "media-public",
    why: "Review photo attachments; owned by the reviews tables, not media_assets.",
    match: (p) => p.startsWith("review-media/"),
  },
  {
    id: "tenant-assets",
    bucketId: "media-public",
    why: "Tenant-scoped assets written outside the media_assets pipeline.",
    match: (p) => p.startsWith("tenant/"),
  },
  {
    id: "talent-portfolio",
    bucketId: "media-public",
    why: "Legacy talent-portfolio uploads (roster extended-actions) that predate media_assets rows.",
    match: (p) => p.startsWith("talent/") || p.startsWith("talent-portfolio/"),
  },
  {
    id: "staging-uploads",
    bucketId: "*",
    why: "Staging prefix used by in-progress upload flows; the object exists before any row and the assign step may not have run yet.",
    match: (p) => /(^|\/)staging\//.test(p),
  },
  {
    id: "talent-reel",
    bucketId: "*",
    why: "Video reels referenced from talent profile columns rather than media_assets.",
    match: (p) => /(^|\/)reel\//.test(p),
  },
  {
    id: "private-originals",
    bucketId: "media-originals",
    why: "Full-fidelity originals under `{talentProfileId}/originals/`. signOriginal() reaches them by reusing a media_assets row's EXACT path, but the 15 in production match no row by any shape — the reference source could not be identified, so the whole prefix is protected rather than reaped.",
    match: (p) => /^[^/]+\/originals\//.test(p),
  },
  {
    id: "avatars",
    bucketId: "media-public",
    why: "User avatars; referenced only as a full public URL in profiles.avatar_url, with no media_assets row.",
    match: (p) => p.startsWith("avatars/"),
  },
  {
    id: "talent-site-logos",
    bucketId: "media-public",
    why: "Talent site logos; referenced only as a full public URL in talent_sites.logo_url.",
    match: (p) => p.startsWith("talent-site-logos/"),
  },
  {
    id: "builder-template-thumbnails",
    bucketId: "media-public",
    why: "Builder template thumbnails are written per version with upsert; older versions can still be pointed at by builder_templates.thumbnail_asset_id.",
    match: (p) => p.startsWith("builder-template-thumbnails/"),
  },
];

export function matchProtectedRule(
  bucketId: string,
  storagePath: string,
): ProtectedRule | null {
  for (const rule of PROTECTED_RULES) {
    if (rule.bucketId !== "*" && rule.bucketId !== bucketId) continue;
    if (rule.match(storagePath)) return rule;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One row from `storage.objects`, narrowed to what the predicate needs. */
export type StorageObject = {
  bucketId: string;
  /** Object key inside the bucket (`storage.objects.name`). */
  name: string;
  sizeBytes: number;
  /** `storage.objects.created_at` as an ISO string. */
  createdAt: string;
};

/** One row from `public.media_assets`, narrowed to what the predicate needs. */
export type MediaAssetRow = {
  id: string;
  bucketId: string;
  storagePath: string;
  /** null = live. */
  deletedAt: string | null;
  /** Parent asset for a derivative (thumbnail, watermarked rendition, …). */
  sourceMediaAssetId: string | null;
  variantKind: string | null;
};

/**
 * A reference held by a source OTHER than `media_assets`, already resolved to
 * a concrete (bucket, path). Produced by the scan layer, which must prove each
 * source answered before handing these over.
 */
export type ExternalReference = {
  bucketId: string;
  storagePath: string;
  /** Which source produced it, e.g. "talent_documents", "agency_branding". */
  source: string;
};

export type ClassifyInput = {
  objects: StorageObject[];
  assets: MediaAssetRow[];
  externalReferences: ExternalReference[];
  /** Evaluation instant, injected so tests are deterministic. */
  now: Date;
  graceDays?: number;
  maxDeletions?: number;
  /**
   * Opt-in for predicate (c): reap objects that map to NO `media_assets` row.
   * OFF by default — a no-row object is by definition not positively
   * accounted for, and in production every such object was live data.
   */
  allowUnaccounted?: boolean;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type KeepReason =
  | "live_asset_row"
  | "live_parent_asset"
  | "live_derivative_asset"
  | "within_grace_period"
  | "external_reference"
  | "protected_prefix"
  | "unaccounted_no_asset_row"
  | "unaccounted_within_grace"
  | "over_deletion_cap";

export type ObjectVerdict = {
  bucketId: string;
  storagePath: string;
  sizeBytes: number;
  /** Present for kept objects; absent for deletable ones. */
  keepReason?: KeepReason;
  /** Extra context for the report (rule id, source name, …). */
  detail?: string;
};

export type ReapPlan = {
  deletable: ObjectVerdict[];
  kept: ObjectVerdict[];
  deletableBytes: number;
  /** Everything that matched the predicate BEFORE the per-run cap applied. */
  eligibleCount: number;
  eligibleBytes: number;
  keptByReason: Record<string, number>;
  graceDays: number;
  maxDeletions: number;
  cappedByLimit: boolean;
};

// ---------------------------------------------------------------------------
// Predicate
// ---------------------------------------------------------------------------

function refKey(bucketId: string, path: string): string {
  return `${bucketId} ${path}`;
}

/** A soft-deleted row is "expired" once `deleted_at` is older than the grace
 *  cutoff. A row with no `deleted_at` is live and never expired. */
function isExpired(row: MediaAssetRow, cutoffMs: number): boolean {
  if (!row.deletedAt) return false;
  const t = Date.parse(row.deletedAt);
  return Number.isFinite(t) && t < cutoffMs;
}

/**
 * Classify every storage object into deletable / kept.
 *
 * Pure and total: it never throws on well-formed input and never consults the
 * network. The caller is responsible for having PROVEN that `assets` and
 * `externalReferences` are complete before calling; this function assumes it.
 */
export function classifyStorageObjects(input: ClassifyInput): ReapPlan {
  const graceDays = input.graceDays ?? DEFAULT_GRACE_DAYS;
  const maxDeletions = input.maxDeletions ?? DEFAULT_MAX_DELETIONS_PER_RUN;
  const cutoffMs = input.now.getTime() - graceDays * 24 * 60 * 60 * 1000;

  // Index the asset rows three ways: by (bucket, path), by id, and by parent.
  const rowsByPath = new Map<string, MediaAssetRow[]>();
  const rowById = new Map<string, MediaAssetRow>();
  const childrenByParent = new Map<string, MediaAssetRow[]>();
  // CROSS-BUCKET derived reference: `signOriginal()` probes `media-originals`
  // using the SAME key as a row whose bucket_id is `media-public`, so an object
  // can be pinned by a row that names a DIFFERENT bucket. Matching on
  // (bucket, path) alone would miss that and delete a live original. This index
  // is keyed on the path only.
  const nonExpiredBucketsByPath = new Map<string, Set<string>>();
  for (const row of input.assets) {
    const key = refKey(row.bucketId, row.storagePath);
    const list = rowsByPath.get(key);
    if (list) list.push(row);
    else rowsByPath.set(key, [row]);

    rowById.set(row.id, row);
    if (!isExpired(row, cutoffMs)) {
      const buckets = nonExpiredBucketsByPath.get(row.storagePath);
      if (buckets) buckets.add(row.bucketId);
      else nonExpiredBucketsByPath.set(row.storagePath, new Set([row.bucketId]));
    }
    if (row.sourceMediaAssetId) {
      const kids = childrenByParent.get(row.sourceMediaAssetId);
      if (kids) kids.push(row);
      else childrenByParent.set(row.sourceMediaAssetId, [row]);
    }
  }

  const externalByKey = new Map<string, string>();
  for (const ref of input.externalReferences) {
    externalByKey.set(refKey(ref.bucketId, ref.storagePath), ref.source);
  }

  const eligible: ObjectVerdict[] = [];
  const kept: ObjectVerdict[] = [];

  for (const obj of input.objects) {
    const base = {
      bucketId: obj.bucketId,
      storagePath: obj.name,
      sizeBytes: obj.sizeBytes,
    };
    const key = refKey(obj.bucketId, obj.name);

    // (a) An external source claims it. Never reap.
    const externalSource = externalByKey.get(key);
    if (externalSource) {
      kept.push({ ...base, keepReason: "external_reference", detail: externalSource });
      continue;
    }

    // (a) A structurally protected prefix. Never reap, regardless of rows.
    const protectedRule = matchProtectedRule(obj.bucketId, obj.name);
    if (protectedRule) {
      kept.push({ ...base, keepReason: "protected_prefix", detail: protectedRule.id });
      continue;
    }

    // (a) A non-expired row claiming this PATH in a DIFFERENT bucket pins the
    // object, because of the cross-bucket derived probe described above.
    // Same-bucket rows fall through to the precise checks below.
    const pinningBuckets = nonExpiredBucketsByPath.get(obj.name);
    if (pinningBuckets && [...pinningBuckets].some((b) => b !== obj.bucketId)) {
      kept.push({ ...base, keepReason: "live_asset_row", detail: "cross_bucket" });
      continue;
    }

    const rows = rowsByPath.get(key) ?? [];

    // (c) No row at all — not positively accounted for.
    if (rows.length === 0) {
      if (!input.allowUnaccounted) {
        kept.push({ ...base, keepReason: "unaccounted_no_asset_row" });
        continue;
      }
      // Even under the opt-in: never reap a just-uploaded object. An upload in
      // flight has written the object but not yet inserted its row.
      const createdMs = Date.parse(obj.createdAt);
      if (!Number.isFinite(createdMs) || createdMs >= cutoffMs) {
        kept.push({ ...base, keepReason: "unaccounted_within_grace" });
        continue;
      }
      eligible.push(base);
      continue;
    }

    // (a) Any LIVE row on this exact path pins the object. Two rows can share
    // one path (dedup / re-link); production had exactly one such pair where a
    // soft-deleted row shares its path with a live one.
    if (rows.some((r) => r.deletedAt === null)) {
      kept.push({ ...base, keepReason: "live_asset_row" });
      continue;
    }

    // (b) Every row is soft-deleted. All must be out of the grace period.
    if (!rows.every((r) => isExpired(r, cutoffMs))) {
      kept.push({ ...base, keepReason: "within_grace_period" });
      continue;
    }

    // (b) Lineage. A derivative must not be reaped while its parent lives, and
    // a parent must not be reaped while any derivative of it lives. "Lives"
    // here means live OR still inside the grace period — a parent whose
    // deletion is still reversible keeps its renditions around too.
    let livingParent: MediaAssetRow | null = null;
    let livingChild: MediaAssetRow | null = null;
    for (const row of rows) {
      if (row.sourceMediaAssetId) {
        const parent = rowById.get(row.sourceMediaAssetId);
        if (parent && !isExpired(parent, cutoffMs)) {
          livingParent = parent;
          break;
        }
      }
      for (const child of childrenByParent.get(row.id) ?? []) {
        if (!isExpired(child, cutoffMs)) {
          livingChild = child;
          break;
        }
      }
      if (livingChild) break;
    }
    if (livingParent) {
      kept.push({ ...base, keepReason: "live_parent_asset", detail: livingParent.id });
      continue;
    }
    if (livingChild) {
      kept.push({ ...base, keepReason: "live_derivative_asset", detail: livingChild.id });
      continue;
    }

    eligible.push(base);
  }

  // Deterministic order so a capped run is reproducible: oldest-path-first.
  eligible.sort((a, b) =>
    a.bucketId === b.bucketId
      ? a.storagePath.localeCompare(b.storagePath)
      : a.bucketId.localeCompare(b.bucketId),
  );

  const eligibleBytes = eligible.reduce((n, o) => n + o.sizeBytes, 0);
  const deletable = eligible.slice(0, maxDeletions);
  for (const over of eligible.slice(maxDeletions)) {
    kept.push({ ...over, keepReason: "over_deletion_cap" });
  }

  const keptByReason: Record<string, number> = {};
  for (const k of kept) {
    const r = k.keepReason ?? "unknown";
    keptByReason[r] = (keptByReason[r] ?? 0) + 1;
  }

  return {
    deletable,
    kept,
    deletableBytes: deletable.reduce((n, o) => n + o.sizeBytes, 0),
    eligibleCount: eligible.length,
    eligibleBytes,
    keptByReason,
    graceDays,
    maxDeletions,
    cappedByLimit: eligible.length > deletable.length,
  };
}

// ---------------------------------------------------------------------------
// Public-URL → storage path. Branding stores FULL public URLs
// (`${SUPABASE_URL}/storage/v1/object/public/<bucket>/<path>`), so the scan
// layer has to translate before it can compare against `storage.objects.name`.
// ---------------------------------------------------------------------------
export function storagePathFromPublicUrl(
  url: string,
): { bucketId: string; storagePath: string } | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const marker = "/storage/v1/object/";
  const at = url.indexOf(marker);
  if (at === -1) return null;
  let rest = url.slice(at + marker.length);
  // `public/<bucket>/…`, `sign/<bucket>/…` and bare `<bucket>/…` all occur.
  rest = rest.replace(/^(public|sign|authenticated)\//, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucketId = rest.slice(0, slash);
  // Drop any query string (signed URLs carry a token).
  const storagePath = decodeURIComponent(rest.slice(slash + 1).split("?")[0]);
  if (!storagePath) return null;
  return { bucketId, storagePath };
}

/** Recursively harvest every storage reference inside an arbitrary JSON blob
 *  (theme_json, page-builder bindings, document entry lists). Handles both the
 *  full-public-URL shape and the `{ bucketId, storagePath }` entry shape. */
export function collectStorageRefsFromJson(
  value: unknown,
  source: string,
  out: ExternalReference[] = [],
): ExternalReference[] {
  if (value == null) return out;
  if (typeof value === "string") {
    const parsed = storagePathFromPublicUrl(value);
    if (parsed) out.push({ ...parsed, source });
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStorageRefsFromJson(item, source, out);
    return out;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const path = rec.storagePath ?? rec.storage_path;
    const bucket = rec.bucketId ?? rec.bucket_id;
    if (typeof path === "string" && path.length > 0) {
      out.push({
        bucketId: typeof bucket === "string" && bucket ? bucket : "media-public",
        storagePath: path,
        source,
      });
    }
    for (const v of Object.values(rec)) collectStorageRefsFromJson(v, source, out);
  }
  return out;
}
