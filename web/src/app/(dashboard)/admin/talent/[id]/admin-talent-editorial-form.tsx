"use client";

/**
 * Editor for the 12 M8 editorial columns on talent_profiles.
 *
 * Simple shapes for v1:
 *   - comma-separated inputs for text[] fields (event_styles, destinations,
 *     languages) — parsed server-side.
 *   - plain text / textarea inputs for scalar fields.
 *   - JSON textareas for package_teasers / social_links / embedded_media,
 *     validated server-side. Help text describes the item shape.
 *
 * A richer row-by-row editor for the JSONB arrays is a future
 * improvement; v1 unblocks admins from populating the fields at all.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  saveTalentEditorialFields,
  type TalentEditorialActionState,
} from "./editorial-fields-actions";

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

function toJsonString(v: unknown): string {
  if (v == null) return "";
  try {
    const s = JSON.stringify(v, null, 2);
    // Empty arrays/objects render as "[]"/"{}" — keep them out of the
    // textarea so the placeholder shows; the server treats empty as [].
    if (s === "[]" || s === "{}") return "";
    return s;
  } catch {
    return "";
  }
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

      {/* ── JSONB arrays ── */}
      <details className="rounded-md border border-border/50 bg-muted/20 p-3" open={false}>
        <summary className="cursor-pointer select-none text-sm font-medium">
          Advanced (packages, social links, embedded media)
        </summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="package_teasers">
              Package teasers{" "}
              <span className="text-xs text-muted-foreground">
                JSON array of {`{label, detail}`}
              </span>
            </Label>
            <textarea
              id="package_teasers"
              name="package_teasers"
              defaultValue={toJsonString(initial.package_teasers)}
              placeholder='[{"label":"Essential","detail":"Trial + day-of"}]'
              className="min-h-[100px] w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs"
            />
            <FieldError messages={fieldErrors} name="package_teasers" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="social_links">
              Social links{" "}
              <span className="text-xs text-muted-foreground">
                JSON array of {`{label, href}`}
              </span>
            </Label>
            <textarea
              id="social_links"
              name="social_links"
              defaultValue={toJsonString(initial.social_links)}
              placeholder='[{"label":"Instagram","href":"https://instagram.com/..."}]'
              className="min-h-[100px] w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs"
            />
            <FieldError messages={fieldErrors} name="social_links" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="embedded_media">
              Embedded media{" "}
              <span className="text-xs text-muted-foreground">
                JSON array of {`{provider, url, label?}`} — provider ∈ {`spotify|soundcloud|vimeo|youtube`}
              </span>
            </Label>
            <textarea
              id="embedded_media"
              name="embedded_media"
              defaultValue={toJsonString(initial.embedded_media)}
              placeholder='[{"provider":"vimeo","url":"https://vimeo.com/…"}]'
              className="min-h-[100px] w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs"
            />
            <FieldError messages={fieldErrors} name="embedded_media" />
          </div>
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
