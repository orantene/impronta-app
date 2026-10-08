/**
 * Content inspectors for the Gridline `utility_bar` and `alert_band` blocks.
 * Every prop the renderers read has a control here. The status flag and the
 * call number are NOT authored here: the flag is the talent's live toggle and
 * the number is the opt-in "Show a call button" setting.
 */
"use client";

import type { ReactNode } from "react";

import type { BuilderAlertBandNode, BuilderUtilityBarNode } from "@/lib/site-admin/builder-node/types";

import { KIT, InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : title}</h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{label}</label>
      <input className={KIT.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function UtilityBarContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderUtilityBarNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="utility_bar" data-utility-bar-inspector="content">
      <Section title="Header">
        <TextField label="Name" value={p.name ?? ""} onChange={(v) => commitPatch({ name: v })} />
        <TextField
          label="Subtitle"
          value={p.subtitle ?? ""}
          placeholder="Electrician · Monterrey"
          onChange={(v) => commitPatch({ subtitle: v })}
        />
        <TextField
          label="Logo image URL"
          value={p.logoUrl ?? ""}
          placeholder="Optional"
          onChange={(v) => commitPatch({ logoUrl: v })}
        />
      </Section>
      <Section
        title="Emergencies pill"
        info="Shows whether you take emergencies today. It follows your live Emergencies today switch."
      >
        <Check label="Show the pill" checked={p.showStatus !== false} onChange={(v) => commitPatch({ showStatus: v })} />
        <TextField
          label="Label when on"
          value={p.statusOnLabel ?? ""}
          placeholder="Emergencies today"
          onChange={(v) => commitPatch({ statusOnLabel: v })}
        />
        <TextField
          label="Label when off"
          value={p.statusOffLabel ?? ""}
          placeholder="No emergencies today"
          onChange={(v) => commitPatch({ statusOffLabel: v })}
        />
      </Section>
      <Section
        title="Call button"
        info="The button appears only when you have set a public call number in your site settings."
      >
        <Check label="Show the call button" checked={p.showCall !== false} onChange={(v) => commitPatch({ showCall: v })} />
        <TextField
          label="Call button label"
          value={p.callLabel ?? ""}
          placeholder="Call"
          onChange={(v) => commitPatch({ callLabel: v })}
        />
      </Section>
      <Section title="Action" info="A button shown on desktop only. Leave the label empty to hide it.">
        <TextField label="Action label" value={p.ctaLabel ?? ""} onChange={(v) => commitPatch({ ctaLabel: v })} />
        <TextField label="Action link" value={p.ctaHref ?? ""} placeholder="/contact" onChange={(v) => commitPatch({ ctaHref: v })} />
      </Section>
    </div>
  );
}

export function AlertBandContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderAlertBandNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="alert_band" data-alert-band-inspector="content">
      <Section
        title="Alert"
        info="This band shows only while your Emergencies today switch is on. When it is off, nothing is shown."
      >
        <TextField label="Headline" value={p.title ?? ""} onChange={(v) => commitPatch({ title: v })} />
        <TextField label="Text" value={p.body ?? ""} onChange={(v) => commitPatch({ body: v })} />
      </Section>
      <Section title="Safety note" info="Advice for the client while they wait. Empty hides the note.">
        <TextField label="Note label" value={p.safetyLabel ?? ""} placeholder="Meanwhile:" onChange={(v) => commitPatch({ safetyLabel: v })} />
        <TextField label="Safety note text" value={p.safetyNote ?? ""} onChange={(v) => commitPatch({ safetyNote: v })} />
      </Section>
      <Section title="Action">
        <TextField label="Action label" value={p.ctaLabel ?? ""} onChange={(v) => commitPatch({ ctaLabel: v })} />
        <TextField label="Action link" value={p.ctaHref ?? ""} placeholder="/contact" onChange={(v) => commitPatch({ ctaHref: v })} />
      </Section>
    </div>
  );
}
