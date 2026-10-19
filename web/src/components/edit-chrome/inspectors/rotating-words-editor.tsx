"use client";

/**
 * Inspector for W-10 rotating words on a heading. The words are talent-authored
 * and per-language (each row gets the ES/EN tabs through the injected localizable
 * field, overlay key `rotatingWords.<i>.text`). The heading text must contain the
 * `{rotate}` marker where the word goes.
 */
import type { BuilderHeadingNode } from "@/lib/site-admin/builder-node/types";
import { ROTATE_MARKER, ROTATE_MAX_CHARS, ROTATE_MAX_WORDS } from "@/lib/site-admin/builder-node/rotating-word-logic";

import { KIT } from "./kit/tokens";
import type { LocalizableTextFieldComponent } from "./builder-2027-node-content";

const HELP =
  "Put {rotate} in the heading where the word goes. The words take turns, in italics. Visitors who prefer reduced motion see the first word only.";
const NO_MARKER = "Add {rotate} to the heading text, or these words will not show.";

type CommitPatch = (patch: Record<string, unknown>) => void;

export function RotatingWordsEditor({
  node,
  tenantId,
  commitPatch,
  LocalizableTextField,
}: {
  node: BuilderHeadingNode;
  tenantId: string;
  commitPatch: CommitPatch;
  LocalizableTextField: LocalizableTextFieldComponent;
}) {
  const words = node.props.rotatingWords ?? [];
  const hasMarker = node.props.text.includes(ROTATE_MARKER);

  const setWord = (i: number, text: string) =>
    commitPatch({ rotatingWords: words.map((w, j) => (j === i ? { text: text.slice(0, ROTATE_MAX_CHARS) } : w)) });
  const remove = (i: number) => commitPatch({ rotatingWords: words.filter((_, j) => j !== i) });
  const add = () => commitPatch({ rotatingWords: [...words, { text: "" }] });

  return (
    <div className={KIT.field} data-rotating-words-editor>
      <label className={KIT.label}>Rotating words</label>
      <p className="mb-1 text-[12px] text-stone-500">{HELP}</p>
      {!hasMarker && words.length > 0 ? (
        <p className="mb-1 text-[12px] text-sky-700" role="status">
          {NO_MARKER}
        </p>
      ) : null}
      {words.map((w, i) => (
        <div key={i} className="mb-1 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <LocalizableTextField
              node={node}
              prop={`rotatingWords.${i}.text`}
              tenantId={tenantId}
              fieldKind="input"
              baseValue={w.text}
              ariaLabel={`Rotating word ${i + 1}`}
              className={KIT.input}
              onCommitBase={(next) => setWord(i, next)}
              patch={commitPatch}
            />
          </div>
          <button type="button" className="text-[12px] text-stone-600 underline" onClick={() => remove(i)} aria-label={`Remove word ${i + 1}`}>
            Remove
          </button>
        </div>
      ))}
      {words.length < ROTATE_MAX_WORDS ? (
        <button type="button" className="text-[13px] text-stone-800 underline" onClick={add}>
          Add a word
        </button>
      ) : null}
      {words.length > 0 ? (
        <div className="mt-2">
          <label className={KIT.label}>Seconds per word</label>
          <input
            type="number"
            min={1.5}
            max={8}
            step={0.5}
            className={KIT.input}
            defaultValue={(node.props.rotateMs ?? 3200) / 1000}
            aria-label="Seconds per word"
            onBlur={(e) => {
              const s = Number.parseFloat(e.currentTarget.value);
              if (Number.isFinite(s)) commitPatch({ rotateMs: Math.min(Math.max(Math.round(s * 1000), 1500), 8000) });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
