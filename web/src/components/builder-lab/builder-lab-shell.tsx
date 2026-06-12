"use client";

/**
 * BuilderLabShell (WS5) — the Platform Builder Lab dashboard.
 *
 * Three areas:
 *   - Talent Lab    — pick a real talent → open the editor with the
 *                     `platform_lab` adapter + previewSubjectKind="talent".
 *   - Workspace Lab — pick a real workspace → editor with
 *                     previewSubjectKind="workspace".
 *   - Templates     — the full `builder_templates` lifecycle manager.
 *
 * In Talent/Workspace areas the operator first picks a subject (cross-tenant
 * search), then "Open editor" mounts `BuilderLabStage`, which mounts the ONE
 * Page Builder Core via `BuilderEditorMount`. Persistence is EPHEMERAL — the
 * only durable output is a `builder_templates` row written through the WS2
 * registry actions (Templates tab / header wiring), never a homepage / page.
 */

import { useState } from "react";

import { PreviewSubjectPicker, type PreviewSubject } from "./preview-subject-picker";
import { BuilderLabStage } from "./builder-lab-stage";
import { TemplateManager } from "./template-manager";
import { SiteDefaultsEditor } from "./site-defaults-editor";

type LabTab = "talent" | "workspace" | "templates" | "site-defaults";

const T = {
  bg: "#0F0F11",
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
};

const TABS: Array<{ id: LabTab; label: string; blurb: string }> = [
  { id: "talent", label: "Talent Lab", blurb: "Author + test templates against a real talent profile." },
  { id: "workspace", label: "Workspace Lab", blurb: "Author + test against a real workspace / hub." },
  { id: "templates", label: "Templates", blurb: "Publish into the gallery. Full lifecycle + metadata." },
  { id: "site-defaults", label: "Site Defaults", blurb: "Edit the platform default theme every new tenant + talent page inherits." },
];

export function BuilderLabShell({
  tenantId,
  workspacePlan,
  locale,
}: {
  /** Active platform tenant id (builder credentials/scope for the mount). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
}) {
  const [tab, setTab] = useState<LabTab>("talent");
  const [talentSubject, setTalentSubject] = useState<PreviewSubject | null>(null);
  const [workspaceSubject, setWorkspaceSubject] = useState<PreviewSubject | null>(null);
  const [editing, setEditing] = useState(false);

  // When the editor is open, render the stage full-bleed (its own chrome).
  if (editing && (tab === "talent" || tab === "workspace")) {
    const subject = tab === "talent" ? talentSubject : workspaceSubject;
    return (
      <BuilderLabStage
        area={tab}
        subject={subject}
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        onExit={() => setEditing(false)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tabs */}
      <div style={{ display: "inline-flex", background: T.cardSoft, borderRadius: 999, padding: 3, alignSelf: "flex-start" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: active ? T.ink : "transparent",
                color: active ? "#0F0F11" : T.inkMuted,
                border: "none",
                fontSize: 12.5,
                fontWeight: 600,
                padding: "7px 16px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12.5, color: T.inkMuted }}>
        {TABS.find((t) => t.id === tab)?.blurb}
      </div>

      {tab === "templates" ? (
        <Panel>
          <TemplateManager />
        </Panel>
      ) : tab === "site-defaults" ? (
        <Panel title="Platform default theme">
          <SiteDefaultsEditor />
        </Panel>
      ) : (
        <SubjectArea
          key={tab}
          area={tab}
          subject={tab === "talent" ? talentSubject : workspaceSubject}
          onSelect={(s) => (tab === "talent" ? setTalentSubject(s) : setWorkspaceSubject(s))}
          onOpenEditor={() => setEditing(true)}
        />
      )}
    </div>
  );
}

function SubjectArea({
  area,
  subject,
  onSelect,
  onOpenEditor,
}: {
  area: "talent" | "workspace";
  subject: PreviewSubject | null;
  onSelect: (s: PreviewSubject) => void;
  onOpenEditor: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) 1fr", gap: 16, alignItems: "start" }}>
      <Panel title={area === "talent" ? "Pick a talent" : "Pick a workspace"}>
        <PreviewSubjectPicker
          kind={area}
          selectedId={subject?.id ?? null}
          onSelect={onSelect}
        />
      </Panel>

      <Panel title="Preview subject">
        {subject ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                aria-hidden
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: T.cardSoft,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 600,
                  color: T.inkMuted,
                }}
              >
                {subject.kind === "talent" && subject.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={subject.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  subject.label.slice(0, 2).toUpperCase()
                )}
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{subject.label}</div>
                <div style={{ fontSize: 11.5, color: T.inkMuted, textTransform: "capitalize" }}>
                  {subject.kind} subject
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.55, margin: 0 }}>
              The editor will hydrate connected components against this {subject.kind}&apos;s real
              data. Nothing you build here is saved to a page — the canvas is ephemeral.
              Publish a reusable template from the <strong>Templates</strong> tab.
            </p>
            <button
              type="button"
              onClick={onOpenEditor}
              style={{
                alignSelf: "flex-start",
                padding: "9px 18px",
                borderRadius: 9,
                border: "none",
                background: T.accent,
                color: "#0F0F11",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open editor →
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.inkMuted, padding: "10px 0" }}>
            Pick a {area} on the left to load it as the canvas preview subject.
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: T.card,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 10.5,
            color: T.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}
