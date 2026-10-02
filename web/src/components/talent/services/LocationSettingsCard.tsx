"use client";

/**
 * Services > Defaults > "Where you work": the address and location settings.
 * One source of truth (`talent_location_settings`), read by the location
 * section on every design. The exact address typed here is private: the public
 * site only ever receives it when the mode below is "Public address".
 */

import { useCallback, useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { loadLocationSettings, saveLocationSettings } from "@/lib/talent/location-settings-actions";
import {
  ADDRESS_MODES,
  ADDRESS_MODE_LABELS,
  DEFAULT_LOCATION_SETTINGS,
  LOCATION_LIMITS,
  STUDIO_KINDS,
  STUDIO_KIND_LABELS,
  type LocationSettings,
} from "@/lib/talent/location-settings";

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim";
const inputBox =
  "mt-1.5 flex h-10 w-full items-center rounded-lg border border-admin-border-soft bg-white px-3 text-[14px] text-admin-ink focus-within:border-emerald-900";
const bareInput = "w-full min-w-0 bg-transparent outline-none";
const noteBox = "rounded-lg bg-black/[0.03] px-3.5 py-3 text-[12.5px] leading-relaxed text-admin-ink-muted";

/** Load once, edit locally, save with the Defaults screen's Save button. */
export function useLocationSettings(talentId: string) {
  const [location, setLocation] = useState<LocationSettings | null>(null);
  useEffect(() => {
    let live = true;
    void loadLocationSettings(talentId).then((r) => {
      if (live) setLocation(r.ok ? r.settings : { ...DEFAULT_LOCATION_SETTINGS });
    });
    return () => {
      live = false;
    };
  }, [talentId]);
  const save = useCallback(
    async (): Promise<{ ok: boolean; error?: string }> =>
      location ? saveLocationSettings(talentId, location) : { ok: true },
    [talentId, location],
  );
  return { location, setLocation, save };
}

function Choice({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        on
          ? "rounded-md bg-emerald-900/[0.08] px-3 py-1.5 text-[13px] font-semibold text-emerald-900"
          : "rounded-md bg-black/[0.04] px-3 py-1.5 text-[13px] font-medium text-admin-ink-muted hover:text-admin-ink"
      }
    >
      {label}
    </button>
  );
}

export function LocationSettingsCard({
  value,
  onChange,
}: {
  value: LocationSettings;
  onChange: (next: LocationSettings) => void;
}) {
  const copy = useDashboardText();
  const patch = (p: Partial<LocationSettings>) => onChange({ ...value, ...p });
  const isPublic = value.addressMode === "public";

  return (
    <section className="rounded-xl border border-admin-border-soft bg-white" data-location-settings>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-admin-border-soft px-5 py-4">
        <h2 className="text-[15px] font-semibold text-admin-ink">{copy.t("Location on your site")}</h2>
        <span className="text-[12.5px] text-admin-ink-dim">{copy.t("Who sees your address")}</span>
      </header>
      <div className="space-y-4 px-5 py-5">
        <div>
          <span className={fieldLabel}>{copy.t("What you offer")}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {STUDIO_KINDS.map((k) => (
              <Choice
                key={k}
                on={value.studioKind === k}
                label={copy.t(STUDIO_KIND_LABELS[k])}
                onClick={() => patch({ studioKind: k })}
              />
            ))}
          </div>
        </div>

        <div>
          <span className={fieldLabel}>{copy.t("Address visibility")}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ADDRESS_MODES.map((m) => (
              <Choice
                key={m}
                on={value.addressMode === m}
                label={copy.t(ADDRESS_MODE_LABELS[m].label)}
                onClick={() => patch({ addressMode: m })}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">{copy.t(ADDRESS_MODE_LABELS[value.addressMode].hint)}</p>
        </div>

        <div>
          <span className={fieldLabel}>{copy.t("Neighbourhood")}</span>
          <div className={inputBox}>
            <input
              aria-label={copy.t("Neighbourhood")}
              className={bareInput}
              maxLength={LOCATION_LIMITS.zoneNeighbourhood}
              value={value.zoneNeighbourhood}
              onChange={(e) => patch({ zoneNeighbourhood: e.target.value })}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">
            {copy.t("Shown with your city from your profile. Keep it to the area, not the street.")}
          </p>
        </div>

        <div>
          <span className={fieldLabel}>{copy.t("Exact address (private)")}</span>
          <div className={inputBox}>
            <input
              aria-label={copy.t("Exact address (private)")}
              autoComplete="off"
              className={bareInput}
              maxLength={LOCATION_LIMITS.exactAddress}
              value={value.exactAddress}
              onChange={(e) => patch({ exactAddress: e.target.value })}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">
            {isPublic
              ? copy.t("This address is shown on your site.")
              : copy.t("Only you can see this. It is never shown on your site in this mode.")}
          </p>
        </div>

        <div>
          <span className={fieldLabel}>{copy.t("How to find you")}</span>
          <textarea
            aria-label={copy.t("How to find you")}
            rows={3}
            maxLength={LOCATION_LIMITS.arrivalNote}
            className="mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2 text-[14px] text-admin-ink outline-none focus:border-emerald-900"
            value={value.arrivalNote}
            onChange={(e) => patch({ arrivalNote: e.target.value })}
          />
          <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">
            {copy.t("Shown to everyone. Do not write the street address here unless it is public.")}
          </p>
        </div>

        <div>
          <span className={fieldLabel}>{copy.t("Arrival photo (optional)")}</span>
          <div className={inputBox}>
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-label={copy.t("Arrival photo (optional)")}
              className={bareInput}
              maxLength={LOCATION_LIMITS.arrivalPhotoUrl}
              value={value.arrivalPhotoUrl}
              onChange={(e) => patch({ arrivalPhotoUrl: e.target.value })}
            />
          </div>
        </div>

        <p className={noteBox}>
          {copy.t("Your location section and the map area on every design read these settings.")}
        </p>
      </div>
    </section>
  );
}
