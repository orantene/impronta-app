"use client";

import { useState, type ChangeEvent } from "react";
import type { SectionEditorProps } from "../types";
import type { HeroV1 } from "./schema";

/**
 * Minimal hero section editor. M4 wires registry-driven forms per-type;
 * this is the reference implementation shipped in M0.
 */
export function HeroEditor({ initial, onChange }: SectionEditorProps<HeroV1>) {
  const [state, setState] = useState<HeroV1>(initial);

  function update<K extends keyof HeroV1>(key: K, value: HeroV1[K]) {
    const next = { ...state, [key]: value };
    setState(next);
    onChange(next);
  }

  return (
    <div className="site-admin-section-editor">
      <label className="site-admin-field">
        <span>Headline</span>
        <input
          type="text"
          value={state.headline ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("headline", e.target.value)
          }
        />
      </label>
      <label className="site-admin-field">
        <span>Sub-headline</span>
        <input
          type="text"
          value={state.subheadline ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("subheadline", e.target.value || undefined)
          }
        />
      </label>
    </div>
  );
}
