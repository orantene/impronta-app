"use client";

/**
 * Venue and spaces — where this workspace is, and therefore what time it is.
 *
 * WHY THIS SCREEN EXISTS: S1 gave the platform a venue with a timezone and one
 * resolver, and every workspace in production stayed on UTC because there was
 * nowhere to change it. Reminders, receipts and booking pages were all correct
 * about a timezone nobody had ever chosen.
 *
 * WHY THE TIMEZONE IS FIRST AND THE ADDRESS IS FOLDED AWAY: an operator opens
 * this once, and the only field that changes what the product DOES is the zone.
 * The address is for receipts and a map link later. So the question is asked in
 * the order it matters, and the rest is behind a disclosure. (Settings must not
 * overwhelm: a barber must never have to open the advanced panel.)
 *
 * The browser's own zone is offered as a suggestion, never applied silently. It
 * is where the person sitting here is, which is usually but not always where
 * the venue is — an agency in Madrid can run a beach club in Tulum.
 *
 * Rooms, tables and layouts land in this group in S2. This card is the venue
 * half only, which is why the group is already named for both.
 *
 * Lives OUTSIDE components/admin/shell (inline-style ratchet).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  loadVenueSettings,
  updateVenueSettings,
  type VenueSettings,
} from "@/lib/server-actions/venue-settings";
import { timeZoneOptions, type TimezoneSource } from "@/lib/spaces/venue-timezone";
import { useT } from "@/i18n/use-t";
import { SpacesEditor } from "./SpacesEditor";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface: "rgba(24,24,27,0.03)",
  error: "#dc2626",
  success: "#16a34a",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.venue";

const EMPTY: VenueSettings = {
  id: null,
  name: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  timezone: "UTC",
};

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function nowIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).format(new Date());
  } catch {
    return "";
  }
}

export function VenueSettingsCard({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [venue, setVenue] = useState<VenueSettings>(EMPTY);
  const [source, setSource] = useState<TimezoneSource>("platform");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [pending, startTransition] = useTransition();

  const zones = useMemo(() => timeZoneOptions(venue.timezone), [venue.timezone]);
  const suggestion = useMemo(() => browserTimeZone(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadVenueSettings(tenantSlug)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setVenue(res.venue);
          setSource(res.resolved.source);
        } else {
          setError(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  function set<K2 extends keyof VenueSettings>(key: K2, value: VenueSettings[K2]) {
    setVenue((v) => ({ ...v, [key]: value }));
    setSavedOk(false);
  }

  function save() {
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateVenueSettings(tenantSlug, {
        name: venue.name,
        addressLine1: venue.addressLine1,
        addressLine2: venue.addressLine2,
        city: venue.city,
        region: venue.region,
        postalCode: venue.postalCode,
        countryCode: venue.countryCode,
        timezone: venue.timezone,
      });
      if (res.ok) {
        setVenue(res.venue);
        setSource(res.resolved.source);
        setSavedOk(true);
      } else {
        setError(res.error);
      }
    });
  }

  if (loading) {
    return (
      <div style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, padding: "8px 0" }}>
        {t(`${K}.loading`)}
      </div>
    );
  }

  const localNow = nowIn(venue.timezone);
  const suggestionWorthOffering =
    suggestion && suggestion !== venue.timezone && zones.includes(suggestion);

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label={t(`${K}.nameLabel`)} hint={t(`${K}.nameHint`)}>
        <input
          type="text"
          value={venue.name}
          onChange={(e) => set("name", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label={t(`${K}.timezoneLabel`)} hint={t(`${K}.timezoneHint`)}>
        <select
          value={venue.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          style={{ ...inputStyle, minWidth: 0 }}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        {localNow ? (
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 6 }}>
            {t(`${K}.itIsNow`)} {localNow}
          </div>
        ) : null}
        {suggestionWorthOffering ? (
          <button
            type="button"
            onClick={() => set("timezone", suggestion)}
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.ink,
              cursor: "pointer",
            }}
          >
            {t(`${K}.useBrowserZone`)} {suggestion}
          </button>
        ) : null}
        {source !== "venue" ? (
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 8 }}>
            {t(`${K}.notFromVenueYet`)}
          </div>
        ) : null}
      </Field>

      <button
        type="button"
        onClick={() => setShowAddress((v) => !v)}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          border: "none",
          padding: 0,
          fontSize: 13,
          fontWeight: 600,
          color: C.ink,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {showAddress ? t(`${K}.hideAddress`) : t(`${K}.showAddress`)}
      </button>

      {showAddress ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Field label={t(`${K}.addressLine1`)}>
            <input
              type="text"
              value={venue.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t(`${K}.addressLine2`)}>
            <input
              type="text"
              value={venue.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t(`${K}.city`)}>
            <input
              type="text"
              value={venue.city}
              onChange={(e) => set("city", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t(`${K}.region`)}>
            <input
              type="text"
              value={venue.region}
              onChange={(e) => set("region", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t(`${K}.postalCode`)}>
            <input
              type="text"
              value={venue.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t(`${K}.countryCode`)}>
            <input
              type="text"
              value={venue.countryCode}
              onChange={(e) => set("countryCode", e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{
            background: C.ink,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? t(`${K}.saving`) : t(`${K}.save`)}
        </button>
        {savedOk ? (
          <span style={{ fontSize: 13, color: C.success }}>{t(`${K}.saved`)}</span>
        ) : null}
        {error ? <span style={{ fontSize: 13, color: C.error }}>{error}</span> : null}
      </div>

      {/* Rooms, tables and groups. Below the venue because a space needs a venue
          to hang off, and the timezone is the field that changes behaviour. */}
      <hr style={{ border: "none", borderTop: `1px solid ${C.borderSoft}`, margin: "4px 0" }} />
      <SpacesEditor tenantSlug={tenantSlug} />
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minWidth: 0,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: FONT,
  color: C.ink,
  background: "#fff",
} as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
      {hint ? <span style={{ fontSize: 12.5, color: C.inkMuted }}>{hint}</span> : null}
      {children}
    </label>
  );
}
