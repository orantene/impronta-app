"use client";

/**
 * CustomFontsPanel — the "Your fonts" pane of the font picker: the tenant's
 * uploaded brand faces (woff2/woff), plus the upload form.
 *
 * The list comes from `actionListTenantFonts` (cached per editor session);
 * uploads ride the signed pipeline (mint URL, PUT, register) with a client
 * pre-sniff for fast feedback, while `actionRegisterTenantFont` re-validates
 * the stored bytes and owns every hard rule (magic bytes, 2 MB cap, 12-file
 * quota). After a successful upload the
 * matching `@font-face` is injected into the editor document immediately so
 * the canvas renders the face without a reload — the published page gets the
 * same rule server-side from TenantFontFaces.
 */

import { useEffect, useRef, useState } from "react";

import {
  actionCreateTenantFontUploadUrl,
  actionDeleteTenantFontFamily,
  actionListTenantFonts,
  actionRegisterTenantFont,
} from "@/lib/server-actions/admin-tenant-fonts";
import { putToSignedUrl } from "@/lib/client/signed-upload-core";
import {
  TENANT_FONT_MAX_BYTES,
  sniffTenantFontFormat,
  tenantFontCssFamily,
  tenantFontFacesCss,
  type TenantFontFamily,
} from "@/lib/site-admin/builder-node/tenant-fonts";
import { ensureInlineFontCss } from "./font-css";

let cachedFamilies: TenantFontFamily[] | null = null;

const WEIGHT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function useFaces(families: TenantFontFamily[]) {
  useEffect(() => {
    if (families.length === 0) return;
    ensureInlineFontCss(
      tenantFontFacesCss(families),
      `tenant-fonts:${families.map((f) => f.family + f.files.length).join(",")}`,
    );
  }, [families]);
}

export function CustomFontsPanel({
  current,
  onPick,
}: {
  /** The currently selected bare family name, if any. */
  current: string | null;
  /** Called with the stored font-family value (family + real fallback). */
  onPick: (cssFamily: string) => void;
}) {
  const [families, setFamilies] = useState<TenantFontFamily[]>(cachedFamilies ?? []);
  const [loading, setLoading] = useState(cachedFamilies === null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [category, setCategory] = useState("sans");
  const [weight, setWeight] = useState("400");
  const [italic, setItalic] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cachedFamilies !== null) return;
    let alive = true;
    actionListTenantFonts().then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) {
        cachedFamilies = result.data;
        setFamilies(result.data);
      } else {
        setError(result.error);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useFaces(families);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a woff2 or woff file first.");
      return;
    }
    if (file.size > TENANT_FONT_MAX_BYTES) {
      setError("Font files are capped at 2 MB. Use a woff2 subset.");
      return;
    }
    // Fail fast in the client; the register action re-runs the same sniff on
    // the bytes that actually landed in storage and is the authority.
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const format = sniffTenantFontFormat(head);
    if (!format) {
      setError("That file is not a woff2 or woff font.");
      return;
    }
    setBusy(true);
    setError(null);
    const signed = await actionCreateTenantFontUploadUrl(format);
    if (!signed.ok) {
      setBusy(false);
      setError(signed.error);
      return;
    }
    const put = await putToSignedUrl(signed.uploadUrl, file);
    if (!put.ok) {
      setBusy(false);
      setError("The upload did not complete. Try again.");
      return;
    }
    const result = await actionRegisterTenantFont({
      storagePath: signed.storagePath,
      family:
        familyName.trim() || file.name.replace(/\.(woff2?|WOFF2?)$/, "").replace(/[-_]+/g, " "),
      category,
      weight: Number.parseInt(weight, 10),
      style: italic ? "italic" : "normal",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    cachedFamilies = result.data;
    setFamilies(result.data);
    setFamilyName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (family: TenantFontFamily) => {
    setBusy(true);
    setError(null);
    const result = await actionDeleteTenantFontFamily(family.family);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    cachedFamilies = result.data;
    setFamilies(result.data);
  };

  return (
    <div className="flex flex-col gap-2">
      {loading ? (
        <div className="p-3 text-center text-[11px] text-stone-500">Loading your fonts…</div>
      ) : families.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#e5e0d5] bg-[#faf9f6]/40 p-3 text-center text-[11px] text-stone-500">
          No uploaded fonts yet. Upload a licensed brand face below and it becomes
          available everywhere a font can be picked.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/40 p-1.5">
          {families.map((f) => (
            <div
              key={f.family}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                current === f.family
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-[#e5e0d5] bg-[#faf9f6]"
              }`}
            >
              <button
                type="button"
                onClick={() => onPick(tenantFontCssFamily(f))}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
                style={{ fontFamily: `"${f.family}"` }}
              >
                <span className="w-full truncate text-[14px] leading-tight text-stone-800">
                  {f.family}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-stone-500">
                  Uploaded · {f.files.length} file{f.files.length === 1 ? "" : "s"}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(f)}
                className="rounded-lg px-2 py-0.5 text-[10px] text-stone-500 hover:bg-white hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-lg border border-[#e5e0d5] bg-white p-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          Upload a font (woff2 or woff, up to 2 MB)
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".woff2,.woff"
          className="text-[11px] text-stone-700 file:mr-2 file:rounded-lg file:border file:border-[#e5e0d5] file:bg-[#faf9f6] file:px-2 file:py-0.5 file:text-[10px] file:text-stone-600"
        />
        <input
          type="text"
          placeholder="Family name (e.g. Suisse Intl)"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          className="rounded-lg border border-[rgba(24,24,27,0.16)] bg-white px-2 py-1 text-[11px] text-stone-800 placeholder:text-stone-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-[rgba(24,24,27,0.16)] bg-white px-1.5 py-1 text-[11px] text-stone-700"
            aria-label="Font category"
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="display">Display</option>
            <option value="script">Script</option>
            <option value="mono">Mono</option>
          </select>
          <select
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="rounded-lg border border-[rgba(24,24,27,0.16)] bg-white px-1.5 py-1 text-[11px] text-stone-700"
            aria-label="Font weight"
          >
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-stone-600">
            <input
              type="checkbox"
              checked={italic}
              onChange={(e) => setItalic(e.target.checked)}
            />
            Italic
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void upload()}
            className="ml-auto rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
        <span className="text-[10px] text-stone-500">
          Upload only fonts your workspace is licensed to embed on the web. Upload
          one file per weight/style, all under the same family name.
        </span>
      </div>

      {error ? <div className="text-[11px] text-red-600">{error}</div> : null}
    </div>
  );
}
