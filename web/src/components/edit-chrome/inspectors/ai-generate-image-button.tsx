"use client";

/**
 * Per-node "Generate with AI" control for an image block. Calls the staff-gated,
 * quota-bounded generateNodeImageAction, and on success hands the hosted media
 * URL back to the caller, which patches the node's `src` through the normal
 * commitPatch chokepoint (snapshot + undo inherited). The action enforces the
 * per-tenant monthly image quota BEFORE the paid call, so cost stays bounded.
 */

import { useState, useTransition } from "react";

import { generateNodeImageAction } from "@/lib/site-admin/builder-core/ai/generate-node-image-action";
import { CHROME } from "../kit";

export function AiGenerateImageButton({
  defaultSubject,
  onGenerated,
}: {
  defaultSubject?: string;
  onGenerated: (result: { url: string; mediaId: string; alt: string }) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    const s = subject.trim();
    if (s.length < 2) {
      setError("Describe the image in a few words.");
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await generateNodeImageAction({ subject: s });
      if (r.ok) {
        onGenerated({ url: r.url, mediaId: r.mediaId, alt: s });
        setInfo(`Added. ${r.remaining} image${r.remaining === 1 ? "" : "s"} left this month.`);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            if (error) setError(null);
          }}
          disabled={pending}
          maxLength={400}
          placeholder="e.g. a model on a Tulum beach at golden hour"
          aria-label="Describe the image to generate"
          className="min-w-0 flex-1 px-2.5 py-2 text-[13px] outline-none transition placeholder:text-stone-400 disabled:opacity-60"
          style={{
            borderRadius: 8,
            border: `1px solid ${CHROME.controlBorder}`,
            background: CHROME.controlFill,
            color: CHROME.ink,
          }}
        />
        <button
          type="button"
          onClick={generate}
          disabled={pending || subject.trim().length < 2}
          className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderRadius: 8, background: CHROME.accent }}
        >
          {pending ? (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Generating…
            </>
          ) : (
            "Generate"
          )}
        </button>
      </div>
      {error ? (
        <div
          role="alert"
          className="px-2.5 py-1.5 text-[11.5px]"
          style={{ borderRadius: 8, border: `1px solid ${CHROME.roseLine}`, background: CHROME.roseBg, color: CHROME.rose }}
        >
          {error}
        </div>
      ) : info ? (
        <div className="text-[11.5px]" style={{ color: CHROME.muted }}>
          {info}
        </div>
      ) : null}
    </div>
  );
}
