"use client";

/**
 * Gridline G13: the service's intake questions on the sheet's first step
 * (every mode: instant, request, inquiry). Answers live on the sheet's
 * `detail.answers`, so the CH-3 resume snapshot keeps them, and leave only on
 * submit through `briefFromDetail` (→ the inquiry funnel). Renders nothing for
 * a service without questions, so those designs are unchanged.
 *
 * Upload honours the platform image rules (`validateImageUpload`: JPEG, PNG,
 * WebP, GIF, 8 MB). The file name is recorded on the request; the file itself
 * is not transferred here (no guest upload lane exists before the inquiry).
 */
import { useState } from "react";

import {
  INTAKE_AREA_MAX,
  INTAKE_TEXT_MAX,
  INTAKE_UPLOAD_MAX_FILES,
  intakeCopy,
  type IntakeAnswers,
  type IntakeQuestion,
} from "@/lib/talent/offering-intake";
import { validateImageUpload } from "@/lib/site-admin/media/validation";

export function CatalogIntakeFields({
  questions,
  answers,
  locale,
  onChange,
}: {
  questions: IntakeQuestion[] | undefined;
  answers: IntakeAnswers | undefined;
  locale: string;
  onChange: (next: IntakeAnswers) => void;
}) {
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  if (!questions?.length) return null;
  const copy = intakeCopy(locale);
  const a = answers ?? {};
  const set = (key: string, value: string | string[]) => onChange({ ...a, [key]: value });
  const list = (key: string): string[] => {
    const v = a[key];
    return Array.isArray(v) ? v : [];
  };
  const text = (key: string): string => {
    const v = a[key];
    return typeof v === "string" ? v : "";
  };

  return (
    <fieldset className="jb-group" data-catalog-intake="">
      <legend>
        {copy.legend} <span className="jb-opt-tag">{copy.optional}</span>
      </legend>
      {questions.map((q) => {
        const id = `cb-intake-${q.key}`;
        if (q.type === "chips") {
          const on = list(q.key);
          return (
            <div key={q.key} className="jb-field" data-intake-field="chips" data-intake-key={q.key}>
              <span id={id}>{q.label}</span>
              <div className="jb-chips" role="group" aria-labelledby={id}>
                {(q.options ?? []).map((o) => {
                  const pressed = on.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      className="jb-chip"
                      aria-pressed={pressed}
                      onClick={() => set(q.key, pressed ? on.filter((x) => x !== o) : [...on, o])}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              {q.help ? <small className="jb-fixture">{q.help}</small> : null}
            </div>
          );
        }
        if (q.type === "select") {
          return (
            <label key={q.key} className="jb-field" data-intake-field="select" data-intake-key={q.key}>
              <span>{q.label}</span>
              <select value={text(q.key)} onChange={(e) => set(q.key, e.target.value)}>
                <option value="">{q.placeholder || copy.selectPlaceholder}</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {q.help ? <small className="jb-fixture">{q.help}</small> : null}
            </label>
          );
        }
        if (q.type === "upload") {
          const files = list(q.key);
          const err = uploadError[q.key];
          return (
            <div key={q.key} className="jb-field" data-intake-field="upload" data-intake-key={q.key}>
              <span id={id}>{q.label}</span>
              {files.length < INTAKE_UPLOAD_MAX_FILES ? (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-labelledby={id}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const ok = validateImageUpload({ mime: f.type, byteSize: f.size });
                    if (!ok.ok) {
                      setUploadError({
                        ...uploadError,
                        [q.key]: ok.status === 413 ? copy.uploadTooBig : copy.uploadBadType,
                      });
                      return;
                    }
                    setUploadError({ ...uploadError, [q.key]: "" });
                    set(q.key, [...files, f.name]);
                  }}
                />
              ) : null}
              {files.map((name) => (
                <small key={name} className="jb-fixture" data-intake-file="">
                  {name}{" "}
                  <button type="button" className="jb-chip" onClick={() => set(q.key, files.filter((x) => x !== name))}>
                    {copy.uploadRemove}
                  </button>
                </small>
              ))}
              {err ? <em role="alert">{err}</em> : null}
              <small className="jb-fixture">{q.help || copy.uploadNote}</small>
            </div>
          );
        }
        const area = q.type === "area";
        return (
          <label key={q.key} className="jb-field" data-intake-field={q.type} data-intake-key={q.key}>
            <span>{q.label}</span>
            {area ? (
              <textarea
                rows={3}
                maxLength={INTAKE_AREA_MAX}
                placeholder={q.placeholder}
                value={text(q.key)}
                onChange={(e) => set(q.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                maxLength={INTAKE_TEXT_MAX}
                placeholder={q.placeholder}
                value={text(q.key)}
                onChange={(e) => set(q.key, e.target.value)}
              />
            )}
            {q.help ? <small className="jb-fixture">{q.help}</small> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
