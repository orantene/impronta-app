"use client";

// SettingsClientShell — prototype-fidelity settings page.
// Tabs: Workspace / Team / Plan / Advanced
// Accordion sections within each tab.

import { useState } from "react";
import type { WorkspaceTeamMember, WorkspaceAgencySummary, WorkspaceFieldGroup } from "../../_data-bridge";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  white:      "#ffffff",
  green:      "#2E7D5B",
  greenSoft:  "rgba(15,79,62,0.06)",
  greenDeep:  "#1A5E3C",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.10)",
  violet:     "#6B3EBB",
  violetSoft: "rgba(107,62,187,0.10)",
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const PLAN_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  free:    { bg: "rgba(82,96,109,0.10)",  color: "rgba(11,11,13,0.72)", label: "Free"    },
  studio:  { bg: "rgba(180,130,20,0.12)", color: "#7A5710",             label: "Studio"  },
  agency:  { bg: "rgba(15,79,62,0.10)",   color: "#0F4F3E",             label: "Agency"  },
  network: { bg: "rgba(91,60,140,0.10)",  color: "#5B3C8C",             label: "Network" },
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner:       { bg: C.violetSoft, color: C.violet },
  admin:       { bg: "rgba(27,110,156,0.10)", color: "#1B6E9C" },
  coordinator: { bg: C.amberSoft, color: C.amber },
  editor:      { bg: "rgba(46,125,91,0.10)", color: C.greenDeep },
  viewer:      { bg: "rgba(11,11,13,0.06)", color: C.inkMuted },
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const meta = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
        fontFamily: FONT,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(15,79,62,0.08)",
        color: C.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: FONT,
        letterSpacing: 0.3,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

function AccordionItem({
  id,
  label,
  desc,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  desc: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 8,
        background: C.white,
        border: `1px solid ${open ? C.border : C.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: open ? "0 1px 3px rgba(11,11,13,0.04)" : "none",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: FONT,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.02)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: C.inkMuted,
              marginTop: 2,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {desc}
          </div>
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            color: C.inkMuted,
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-flex",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function SettingsRow({
  title,
  desc,
  action,
  onClick,
  disabled,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        marginBottom: 8,
        background: hover && onClick ? "rgba(11,11,13,0.02)" : C.white,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        cursor: onClick ? "pointer" : "default",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s",
        fontFamily: FONT,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{desc}</div>
      </div>
      {action ?? (
        onClick && !disabled ? (
          <span style={{ fontSize: 12, color: C.inkMuted, flexShrink: 0 }}>
            Configure →
          </span>
        ) : null
      )}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

type SettingsTab = "workspace" | "roster" | "team" | "plan" | "fields" | "advanced";

export function SettingsClientShell({
  summary,
  teamMembers,
  canManageTeam,
  tenantSlug,
  fieldGroups,
}: {
  summary: WorkspaceAgencySummary | null;
  teamMembers: WorkspaceTeamMember[];
  canManageTeam: boolean;
  tenantSlug: string;
  /** F2 — field catalog from profile_field_definitions with workspace overrides */
  fieldGroups: WorkspaceFieldGroup[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["account"])
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const planChip = PLAN_CHIP[summary?.plan ?? "free"] ?? PLAN_CHIP.free;

  const TABS: { id: SettingsTab; label: string; emoji: string }[] = [
    { id: "workspace", label: "Workspace",           emoji: "🏛" },
    { id: "roster",    label: "Roster",              emoji: "🎯" },
    { id: "team",      label: "Team & legal",        emoji: "👥" },
    { id: "plan",      label: "Plan & integrations", emoji: "💳" },
    { id: "fields",    label: "Fields",              emoji: "📋" },
    { id: "advanced",  label: "Advanced",            emoji: "⚙" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
          Configuration
        </p>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.4,
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
          Plan, team, branding, and workspace identity.
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 20,
          maxWidth: 600,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? C.white : "transparent",
                color: active ? C.ink : C.inkMuted,
                fontFamily: FONT,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden style={{ fontSize: 13 }}>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 680 }}>

        {/* ── Workspace tab ── */}
        {activeTab === "workspace" && (
          <>
            <AccordionItem
              id="account"
              label="Account"
              desc="Workspace name, slug, and contact info."
              open={openSections.has("account")}
              onToggle={() => toggleSection("account")}
            >
              <SettingsRow
                title={summary?.displayName ?? "Your workspace"}
                desc={`${summary?.slug ?? tenantSlug} · ${summary?.contactEmail ?? "No contact email set"}`}
                onClick={() => {}}
              />
            </AccordionItem>

            <AccordionItem
              id="domain"
              label="Domain"
              desc="Run your storefront at your own domain."
              open={openSections.has("domain")}
              onToggle={() => toggleSection("domain")}
            >
              <SettingsRow
                title="Custom domain"
                desc={summary?.addressCity ? `${summary.addressCity}${summary.addressCountry ? ", " + summary.addressCountry : ""}` : "No custom domain connected yet"}
                onClick={() => {}}
              />
            </AccordionItem>

            <AccordionItem
              id="branding"
              label="Branding"
              desc="Logo, colors, and email identity."
              open={openSections.has("branding")}
              onToggle={() => toggleSection("branding")}
            >
              <SettingsRow
                title="Brand identity"
                desc="Logo · Colors · Email signature"
                action={
                  <a
                    href={`/${tenantSlug}/admin/site`}
                    style={{
                      fontSize: 12,
                      color: C.accent,
                      fontFamily: FONT,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Go to Site →
                  </a>
                }
              />
            </AccordionItem>
          </>
        )}

        {/* ── Roster tab ── */}
        {activeTab === "roster" && (
          <>
            <AccordionItem
              id="talent-types"
              label="Talent types"
              desc="Manage categories, specialties, and taxonomy for your roster."
              open={openSections.has("talent-types")}
              onToggle={() => toggleSection("talent-types")}
            >
              <SettingsRow
                title="Manage talent types"
                desc="Categories and specialties used to classify your roster"
                action={
                  <a
                    href="/admin/taxonomy"
                    style={{ fontSize: 12, color: C.accent, fontFamily: FONT, fontWeight: 600, textDecoration: "none" }}
                  >
                    Open taxonomy →
                  </a>
                }
              />
            </AccordionItem>

            <AccordionItem
              id="custom-fields"
              label="Custom fields"
              desc="Extra fields on talent profiles — height, measurements, languages, and more."
              open={openSections.has("custom-fields")}
              onToggle={() => toggleSection("custom-fields")}
            >
              <SettingsRow
                title="Manage fields"
                desc="Add, edit, and reorder profile fields"
                action={
                  <a
                    href="/admin/fields"
                    style={{ fontSize: 12, color: C.accent, fontFamily: FONT, fontWeight: 600, textDecoration: "none" }}
                  >
                    Open field catalog →
                  </a>
                }
              />
            </AccordionItem>
          </>
        )}

        {/* ── Team tab ── */}
        {activeTab === "team" && (
          <AccordionItem
            id="team"
            label="Team members"
            desc={`${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""} in this workspace.`}
            open={openSections.has("team")}
            onToggle={() => toggleSection("team")}
          >
            {teamMembers.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT }}>
                No team members found.
              </div>
            ) : (
              <div
                style={{
                  background: C.white,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {teamMembers.map((member, i) => (
                  <div
                    key={member.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                    }}
                  >
                    <Avatar name={member.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {member.name}
                      </div>
                    </div>
                    {member.status === "pending_acceptance" && (
                      <span
                        style={{
                          fontSize: 10.5,
                          color: C.inkMuted,
                          background: "rgba(11,11,13,0.05)",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontFamily: FONT,
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        Pending
                      </span>
                    )}
                    <RolePill role={member.role} />
                  </div>
                ))}
              </div>
            )}

            {canManageTeam && (
              <div style={{ marginTop: 12 }}>
                <a
                  href={`/${tenantSlug}/admin/settings`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: `1px solid ${C.borderSoft}`,
                    background: "transparent",
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Invite & manage team →
                </a>
              </div>
            )}
          </AccordionItem>
        )}

        {/* ── Plan tab ── */}
        {activeTab === "plan" && (
          <>
            <AccordionItem
              id="plan"
              label="Current plan"
              desc="Usage, limits, and upgrade options."
              open={openSections.has("plan")}
              onToggle={() => toggleSection("plan")}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: C.white,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    background: planChip.bg,
                    color: planChip.color,
                    fontFamily: FONT,
                    flexShrink: 0,
                  }}
                >
                  {planChip.label}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                    {planChip.label} plan
                  </div>
                  {summary && (
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, fontFamily: FONT }}>
                      {summary.talentCount} talent
                      {summary.talentLimit != null
                        ? ` of ${summary.talentLimit} seats used`
                        : " · unlimited seats"}
                    </div>
                  )}
                </div>
              </div>

              <a
                href={`/${tenantSlug}/admin/account`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  background: C.accent,
                  color: "#fff",
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Manage plan & billing →
              </a>
            </AccordionItem>

            <AccordionItem
              id="integrations"
              label="Integrations"
              desc="Connect email, calendar, and third-party apps."
              open={openSections.has("integrations")}
              onToggle={() => toggleSection("integrations")}
            >
              <div style={{ padding: "8px 0", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT }}>
                Integrations available via workspace settings.
              </div>
            </AccordionItem>
          </>
        )}

        {/* ── Fields tab (F2 cutover — reads profile_field_definitions) ── */}
        {activeTab === "fields" && (
          <>
            {/* Intro */}
            <div
              style={{
                padding: "14px 16px",
                background: C.white,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3, fontFamily: FONT }}>
                Profile field catalog
              </div>
              <div style={{ fontSize: 12.5, color: C.inkMuted, fontFamily: FONT, lineHeight: 1.5 }}>
                These fields power talent profile pages, the directory, and registration flows.
                Universal fields are always active. Global and type-specific fields can be
                enabled or disabled for your workspace. Workspace-level overrides do not affect
                the platform catalog — only your agency's views.
              </div>
            </div>

            {/* One accordion per tier group */}
            {fieldGroups.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center", color: C.inkMuted, fontSize: 13, fontFamily: FONT }}>
                Field catalog unavailable.
              </div>
            ) : (
              fieldGroups.map((group) => {
                const TIER_LABELS: Record<string, string> = {
                  universal:     "Universal",
                  global:        "Global",
                  "type-specific": "Type-Specific",
                };
                const TIER_DESC: Record<string, string> = {
                  universal:     "Required for all talent — cannot be disabled.",
                  global:        "Cross-type optional fields. Most talent fill these over time.",
                  "type-specific": "Only relevant for specific talent types.",
                };
                return (
                  <AccordionItem
                    key={group.tier}
                    id={`fields-${group.tier}`}
                    label={`${TIER_LABELS[group.tier] ?? group.tier} (${group.fields.length})`}
                    desc={TIER_DESC[group.tier] ?? ""}
                    open={openSections.has(`fields-${group.tier}`)}
                    onToggle={() => toggleSection(`fields-${group.tier}`)}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,2fr) 100px 80px 80px",
                        gap: 10,
                        padding: "7px 16px",
                        background: "rgba(11,11,13,0.02)",
                        borderBottom: `1px solid ${C.borderSoft}`,
                        fontFamily: FONT,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        color: C.inkMuted,
                      }}
                    >
                      <span>Field</span>
                      <span>Kind</span>
                      <span>Public</span>
                      <span>Status</span>
                    </div>
                    {group.fields.map((f, i) => (
                      <div
                        key={f.fieldKey}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,2fr) 100px 80px 80px",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 16px",
                          borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                          fontFamily: FONT,
                        }}
                      >
                        {/* Field name + key */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: 11, color: C.inkDim, fontFamily: '"Fira Code", monospace', marginTop: 1 }}>
                            {f.fieldKey}
                          </div>
                        </div>
                        {/* Kind */}
                        <div style={{ fontSize: 11.5, color: C.inkMuted, textTransform: "capitalize" }}>
                          {f.kind.replace(/_/g, " ")}
                        </div>
                        {/* Public */}
                        <div>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              color: f.showInPublic ? C.greenDeep : C.inkDim,
                            }}
                          >
                            {f.showInPublic ? "Yes" : "No"}
                          </span>
                        </div>
                        {/* Status */}
                        <div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 7px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 600,
                              background: f.enabled
                                ? "rgba(46,125,91,0.08)"
                                : "rgba(11,11,13,0.05)",
                              color: f.enabled ? C.greenDeep : C.inkMuted,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: f.enabled ? C.green : C.inkMuted,
                              }}
                            />
                            {f.enabled ? "Active" : "Off"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </AccordionItem>
                );
              })
            )}

            <div style={{ padding: "10px 16px", color: C.inkDim, fontSize: 11.5, fontFamily: FONT, lineHeight: 1.5 }}>
              Full field configuration (required/optional overrides, custom labels, workspace-specific order) available in a future release.
            </div>
          </>
        )}

        {/* ── Advanced tab ── */}
        {activeTab === "advanced" && (
          <>
            <AccordionItem
              id="features"
              label="Feature controls"
              desc="Turn platform features on or off for your workspace."
              open={openSections.has("features")}
              onToggle={() => toggleSection("features")}
            >
              <div style={{ padding: "8px 0", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Feature controls available in future platform releases.
              </div>
            </AccordionItem>

            <AccordionItem
              id="compliance"
              label="Compliance & legal"
              desc="Legal agreements, data export, and deletion requests."
              open={openSections.has("compliance")}
              onToggle={() => toggleSection("compliance")}
            >
              <div style={{ color: C.inkMuted, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Data export and account deletion requests — contact support.
              </div>
            </AccordionItem>

            <AccordionItem
              id="danger"
              label="Danger zone"
              desc="Irreversible operations — proceed with care."
              open={openSections.has("danger")}
              onToggle={() => toggleSection("danger")}
            >
              <div style={{ padding: "8px 0", color: "#DC2626", fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Workspace deletion and data wipe — contact support to proceed.
              </div>
            </AccordionItem>
          </>
        )}
      </div>
    </div>
  );
}
