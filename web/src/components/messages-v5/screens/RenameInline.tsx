"use client";

/**
 * RenameInline (D13, M09): the subject line becomes a field with Save /
 * Cancel. Calls the shell's `onSave(name, expectedVersion)`, which the shell
 * wires to `messagingRename`. An empty/whitespace-only name is refused
 * locally (never sent) as `invalid`, mirroring the engine's own rule
 * (`messaging-engine.ts` trims and requires `min(1)`) so the sentence is
 * consistent whether the refusal comes from here or from a round trip. A
 * server `conflict` (someone else saved first) keeps the client's typed text
 * on screen with the refusal line underneath, rather than discarding it.
 *
 * Split in two on purpose: `RenameInlineView` is a pure, fully prop-driven
 * presentational component (every render test targets it directly — idle,
 * saving, refused, and the generated-name hint, exactly the states the lane
 * brief asks for); `RenameInline` is the thin stateful wrapper that satisfies
 * the L2 contract (`contracts.ts`) and owns the async round trip.
 */

import { useEffect, useState } from "react";

import type { MessagingRefusal } from "@/lib/messaging/types";

import { SystemLine } from "../kit/MessageBubble";
import { Btn } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import type { KitCopy } from "../kit/copy";
import type { RenameInlineProps, ScreenVariant } from "./contracts";

export type RenameInlinePhase = "idle" | "saving" | "refused";

export type RenameInlineViewProps = {
  readonly value: string;
  readonly phase: RenameInlinePhase;
  readonly refusalCode: MessagingRefusal | null;
  readonly generated?: boolean;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
};

export function RenameInlineView({ value, phase, refusalCode, generated, copy, variant, onChange, onSave, onCancel }: RenameInlineViewProps) {
  const c = copy.rename;
  const busy = phase === "saving";
  const inputId = `msgv5-rename-${variant}`;
  return (
    <div className={variant === "mobile" ? "mx-rename" : "rename"} data-rename-inline data-rename-phase={phase} aria-busy={busy || undefined}>
      <div className="fld">
        <input
          id={inputId}
          className="in"
          value={value}
          aria-label={c.label}
          placeholder={c.placeholder}
          disabled={busy}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          data-rename-input
        />
      </div>
      <div className="rename-acts">
        <Btn size="sm" variant="secondary" disabled={busy} onClick={onCancel} data-rename-cancel>
          {c.cancel}
        </Btn>
        <Btn size="sm" variant="primary" busy={busy} onClick={onSave} data-rename-save>
          {busy ? c.saving : c.save}
        </Btn>
      </div>
      {generated && phase !== "refused" ? <SystemLine text={c.generatedHint} variant={variant} /> : null}
      {phase === "refused" && refusalCode ? <RefusalLine code={refusalCode} copy={copy} variant={variant} /> : null}
    </div>
  );
}

export function RenameInline({ name, version, onSave, onCancel, copy, variant, generated }: RenameInlineProps) {
  const [value, setValue] = useState(name);
  const [phase, setPhase] = useState<RenameInlinePhase>("idle");
  const [refusalCode, setRefusalCode] = useState<MessagingRefusal | null>(null);
  const [liveVersion, setLiveVersion] = useState(version);

  useEffect(() => {
    setValue(name);
    setLiveVersion(version);
  }, [name, version]);

  async function save() {
    const trimmed = value.trim();
    if (trimmed === "") {
      setPhase("refused");
      setRefusalCode("invalid");
      return;
    }
    if (trimmed === name) {
      onCancel();
      return;
    }
    setPhase("saving");
    const result = await onSave(trimmed, liveVersion);
    if (result.ok) {
      setPhase("idle");
      setRefusalCode(null);
      return;
    }
    setPhase("refused");
    setRefusalCode(result.reason);
    if (result.reason === "conflict") {
      // Reload the lock only; keep the client's typed text visible above the
      // refusal line so a second Save is not doomed to the same conflict.
      setLiveVersion(version);
    }
  }

  return (
    <RenameInlineView
      value={value}
      phase={phase}
      refusalCode={refusalCode}
      generated={generated}
      copy={copy}
      variant={variant}
      onChange={(next) => {
        setValue(next);
        if (phase === "refused") setPhase("idle");
      }}
      onSave={() => void save()}
      onCancel={onCancel}
    />
  );
}
