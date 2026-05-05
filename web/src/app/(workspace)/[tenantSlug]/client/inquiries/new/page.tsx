import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadWorkspaceRosterEnriched,
} from "../../../_data-bridge";
import { createClientWorkspaceInquiryAction } from "./actions";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ talent?: string; err?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FIELD_STYLE = {
  width: "100%",
  minHeight: 36,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: FONT,
  color: C.ink,
  background: "#fff",
  boxSizing: "border-box" as const,
};

export default async function NewClientInquiryPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { talent, err } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const client = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!client) notFound();

  const roster = (await loadWorkspaceRosterEnriched(scope.tenantId)).filter(
    (item) => item.state === "published",
  );
  const selectedTalent = talent ? roster.find((item) => item.id === talent) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
            New inquiry
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: C.ink, letterSpacing: 0 }}>
            Request booking
          </h1>
          <p style={{ margin: "6px 0 0", maxWidth: 620, fontSize: 13, lineHeight: 1.5, color: C.inkMuted }}>
            Send the workspace enough context to start coordination.
          </p>
        </div>
        <Link
          href={`/${tenantSlug}/client/discover`}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${C.borderSoft}`,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            color: C.ink,
            fontSize: 12.5,
          }}
        >
          Back to discover
        </Link>
      </div>

      {err ? (
        <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.redSoft, color: C.red, padding: "9px 12px", fontSize: 12.5 }}>
          {err}
        </div>
      ) : null}

      <form
        action={createClientWorkspaceInquiryAction}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <input type="hidden" name="tenantSlug" value={tenantSlug} />

        <section
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            background: C.cardBg,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Contact name
            <input name="contactName" required defaultValue={client.displayName} style={FIELD_STYLE} />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Company
            <input name="company" defaultValue={client.company ?? ""} style={FIELD_STYLE} />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Talent
            <select name="talentProfileId" defaultValue={selectedTalent?.id ?? ""} style={FIELD_STYLE}>
              <option value="">No preference</option>
              {roster.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.primaryTypeLabel ? ` - ${item.primaryTypeLabel}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              Event date
              <input name="eventDate" type="date" style={FIELD_STYLE} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              Quantity
              <input name="quantity" type="number" min={1} inputMode="numeric" style={FIELD_STYLE} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Location
            <input name="eventLocation" placeholder="Tulum, CDMX, Cancun..." style={FIELD_STYLE} />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Message
            <textarea
              name="message"
              required
              rows={6}
              placeholder="Tell the agency what you are planning, date flexibility, usage, call time, styling, and anything already confirmed."
              style={{ ...FIELD_STYLE, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>

          <button
            type="submit"
            style={{
              height: 38,
              border: "none",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Send inquiry
          </button>
        </section>

        <aside
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            background: C.accentSoft,
            padding: 14,
            color: C.ink,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {selectedTalent ? selectedTalent.name : client.agencyName}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.inkMuted }}>
            {selectedTalent
              ? `${selectedTalent.primaryTypeLabel ?? "Talent"}${selectedTalent.city ? ` in ${selectedTalent.city}` : ""}`
              : "The agency can recommend the right roster fit after reviewing your request."}
          </p>
        </aside>
      </form>
    </div>
  );
}
