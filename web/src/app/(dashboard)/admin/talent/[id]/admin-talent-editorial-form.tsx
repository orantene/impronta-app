"use client";

/**
 * Editor for the 12 M8 editorial columns on talent_profiles.
 *
 * Polish pass: the three JSONB arrays (package_teasers, social_links,
 * embedded_media) are now row editors instead of raw JSON textareas.
 * State travels to the server action as stringified JSON through a
 * hidden input so editorial-fields-actions didn't need changes.
 */

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  saveTalentEditorialFields,
  type TalentEditorialActionState,
} from "./editorial-fields-actions";

// ── JSONB row types ──────────────────────────────────────────────────────
interface PackageTeaser {
  label: string;
  detail?: string;
}
interface SocialLink {
  label: string;
  href: string;
}
type EmbeddedProvider = "spotify" | "soundcloud" | "vimeo" | "youtube";
interface EmbeddedMedia {
  provider: EmbeddedProvider;
  url: string;
  label?: string;
}

function coerceArray<T>(raw: unknown, narrow: (x: unknown) => x is T): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(narrow);
}
function isPackageTeaser(x: unknown): x is PackageTeaser {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { label?: unknown }).label === "string"
  );
}
function isSocialLink(x: unknown): x is SocialLink {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { label?: unknown }).label === "string" &&
    typeof (x as { href?: unknown }).href === "string"
  );
}
function isEmbeddedMedia(x: unknown): x is EmbeddedMedia {
  if (typeof x !== "object" || x === null) return false;
  const provider = (x as { provider?: unknown }).provider;
  const url = (x as { url?: unknown }).url;
  return (
    typeof url === "string" &&
    (provider === "spotify" ||
      provider === "soundcloud" ||
      provider === "vimeo" ||
      provider === "youtube")
  );
}

export interface EditorialInitial {
  intro_italic: string | null;
  event_styles: string[] | null;
  destinations: string[] | null;
  languages: string[] | null;
  travels_globally: boolean | null;
  team_size: string | null;
  lead_time_weeks: string | null;
  starting_from: string | null;
  booking_note: string | null;
  service_category_slug: string | null;
  package_teasers: unknown | null;
  social_links: unknown | null;
  embedded_media: unknown | null;
}

interface Props {
  talentId: string;
  initial: EditorialInitial;
}

function toCsv(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr.join(", ");
}

/** Server action accepts "" as empty array; send it as such when truly empty. */
function rowsToHiddenValue<T>(rows: T[]): string {
  if (!rows || rows.length === 0) return "";
  return JSON.stringify(rows);
}

function FieldError({
  messages,
  name,
}: {
  messages?: Record<string, string>;
  name: string;
}) {
  const msg = messages?.[name];
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{msg}</p>;
}

export function AdminTalentEditorialForm({ talentId, initial }: Props) {
  const [state, action, pending] = useActionState<
    TalentEditorialActionState,
    FormData
  >(saveTalentEditorialFields, undefined);

  const initialPackages = useMemo(
    () => coerceArray(initial.package_teasers, isPackageTeaser),
    [initial.package_teasers],
  );
  const initialSocial = useMemo(
    () => coerceArray(initial.social_links, isSocialLink),
    [initial.social_links],
  );
  const initialEmbedded = useMemo(
    () => coerceArray(initial.embedded_media, isEmbeddedMedia),
    [initial.embedded_media],
  );

  const [packages, setPackages] = useState<PackageTeaser[]>(initialPackages);
  const [socials, setSocials] = useState<SocialLink[]>(initialSocial);
  const [embedded, setEmbedded] = useState<EmbeddedMedia[]>(initialEmbedded);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="talent_id" value={talentId} />

      {state?.ok ? (
        <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {state.message}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {/* ── Scalars ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="intro_italic">
            Italic intro <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="intro_italic"
            name="intro_italic"
            maxLength={240}
            defaultValue={initial.intro_italic ?? ""}
            placeholder="Short italic-serif line shown under the name on editorial profiles."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="team_size">Team size</Label>
          <Input
            id="team_size"
            name="team_size"
            maxLength={80}
            defaultValue={initial.team_size ?? ""}
            placeholder="1–3 artists"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead_time_weeks">Lead time</Label>
          <Input
            id="lead_time_weeks"
            name="lead_time_weeks"
            maxLength={80}
            defaultValue={initial.lead_time_weeks ?? ""}
            placeholder="8–12 weeks"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="starting_from">Starting from (display-only)</Label>
          <Input
            id="starting_from"
            name="starting_from"
            maxLength={60}
            defaultValue={initial.starting_from ?? ""}
            placeholder="From US$1,400"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service_category_slug">Primary service slug</Label>
          <Input
            id="service_category_slug"
            name="service_category_slug"
            maxLength={120}
            defaultValue={initial.service_category_slug ?? ""}
            placeholder="bridal-makeup"
          />
          <p className="text-xs text-muted-foreground">
            Must match a taxonomy.services slug — drives the{" "}
            <code>featured_talent</code> auto-by-service filter.
          </p>
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="booking_note">Booking note</Label>
          <textarea
            id="booking_note"
            name="booking_note"
            maxLength={400}
            defaultValue={initial.booking_note ?? ""}
            placeholder="Inclusions, lead-time caveats, travel notes."
            className="min-h-[72px] w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="travels_globally"
            name="travels_globally"
            defaultChecked={initial.travels_globally ?? false}
            className="size-4 rounded border-border/60"
          />
          <Label htmlFor="travels_globally" className="cursor-pointer">
            Available for destination events
          </Label>
          <span className="text-xs text-muted-foreground">
            Toggles the Destination-Ready ribbon on the card + profile.
          </span>
        </div>
      </div>

      {/* ── Chip arrays (comma-separated) ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="event_styles">Event styles</Label>
          <Input
            id="event_styles"
            name="event_styles"
            defaultValue={toCsv(initial.event_styles)}
            placeholder="Beachfront ceremonies, Editorial weddings"
          />
          <p className="text-xs text-muted-foreground">Comma-separated.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destinations">Destinations</Label>
          <Input
            id="destinations"
            name="destinations"
            defaultValue={toCsv(initial.destinations)}
            placeholder="Tulum, Ibiza, Amalfi Coast"
          />
          <p className="text-xs text-muted-foreground">Comma-separated slugs.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="languages">Languages</Label>
          <Input
            id="languages"
            name="languages"
            defaultValue={toCsv(initial.languages)}
            placeholder="English, Spanish"
          />
          <p className="text-xs text-muted-foreground">Comma-separated.</p>
        </div>
      </div>

      {/* ── JSONB arrays (row editors) ── */}
      {/* Hidden inputs carry the stringified JSON to the server action,
          which validates each row against its Zod schema. */}
      <input
        type="hidden"
        name="package_teasers"
        value={rowsToHiddenValue(packages)}
      />
      <input
        type="hidden"
        name="social_links"
        value={rowsToHiddenValue(socials)}
      />
      <input
        type="hidden"
        name="embedded_media"
        value={rowsToHiddenValue(embedded)}
      />

      <details
        className="rounded-md border border-border/50 bg-muted/20 p-3"
        open={
          packages.length > 0 ||
          socials.length > 0 ||
          embedded.length > 0 ||
          Boolean(
            fieldErrors?.package_teasers ||
              fieldErrors?.social_links ||
              fieldErrors?.embedded_media,
          )
        }
      >
        <summary className="cursor-pointer select-none text-sm font-medium">
          Packages, social links, embedded media
        </summary>

        <div className="mt-4 space-y-5">
          {/* Package teasers */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Package teasers</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPackages((rows) => [...rows, { label: "", detail: "" }])
                }
              >
                + Add package
              </Button>
            </div>
            {packages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No packages yet. Each package shows as a small card on the
                editorial profile (e.g. "Essential — Trial + day-of").
              </p>
            ) : (
              <ul className="space-y-2">
                {packages.map((row, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-md border border-border/40 bg-background/40 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                  >
                    <Input
                      value={row.label}
                      placeholder="Label (e.g. Essential)"
                      maxLength={140}
                      onChange={(e) =>
                        setPackages((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      value={row.detail ?? ""}
                      placeholder="Detail (e.g. Trial + day-of)"
                      maxLength={360}
                      onChange={(e) =>
                        setPackages((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, detail: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPackages((rows) => rows.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove package ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FieldError messages={fieldErrors} name="package_teasers" />
          </section>

          {/* Social links */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Social links</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSocials((rows) => [...rows, { label: "", href: "" }])
                }
              >
                + Add link
              </Button>
            </div>
            {socials.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                External portfolio + social presence. Rendered in the
                profile footer.
              </p>
            ) : (
              <ul className="space-y-2">
                {socials.map((row, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-md border border-border/40 bg-background/40 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                  >
                    <Input
                      value={row.label}
                      placeholder="Label (e.g. Instagram)"
                      maxLength={60}
                      onChange={(e) =>
                        setSocials((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      type="url"
                      value={row.href}
                      placeholder="https://instagram.com/…"
                      maxLength={500}
                      onChange={(e) =>
                        setSocials((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, href: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSocials((rows) => rows.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove social link ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FieldError messages={fieldErrors} name="social_links" />
          </section>

          {/* Embedded media */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Embedded media</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setEmbedded((rows) => [
                    ...rows,
                    { provider: "vimeo", url: "", label: "" },
                  ])
                }
              >
                + Add embed
              </Button>
            </div>
            {embedded.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Audio / video showreels. Supported providers: Spotify,
                SoundCloud, Vimeo, YouTube.
              </p>
            ) : (
              <ul className="space-y-2">
                {embedded.map((row, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-md border border-border/40 bg-background/40 p-2 md:grid-cols-[minmax(0,120px)_minmax(0,2fr)_minmax(0,1fr)_auto]"
                  >
                    <select
                      value={row.provider}
                      className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
                      onChange={(e) =>
                        setEmbedded((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  provider: e.target
                                    .value as EmbeddedProvider,
                                }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="vimeo">Vimeo</option>
                      <option value="youtube">YouTube</option>
                      <option value="spotify">Spotify</option>
                      <option value="soundcloud">SoundCloud</option>
                    </select>
                    <Input
                      type="url"
                      value={row.url}
                      placeholder="https://…"
                      maxLength={500}
                      onChange={(e) =>
                        setEmbedded((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, url: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      value={row.label ?? ""}
                      placeholder="Label (optional)"
                      maxLength={120}
                      onChange={(e) =>
                        setEmbedded((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEmbedded((rows) => rows.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove embed ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FieldError messages={fieldErrors} name="embedded_media" />
          </section>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save editorial fields"}
        </Button>
      </div>
    </form>
  );
}
