// QuickAdd drawer: single-talent entry, CSV import, then full profile handoff.
"use client";
import React, { useState, useEffect, useMemo, useRef, useTransition, useCallback } from "react";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import {
  COLORS,
  DrawerShell,
  FONTS,
  FieldRow,
  PROTO_TENANT_ID,
  PrimaryButton,
  ProfileDraft,
  SecondaryButton,
  Section,
  TAXONOMY,
  TaxonomyNode,
  TaxonomyParentId,
  WORKSPACE_TAXONOMY_DEFAULT,
  actionUploadAndAssignMedia,
  addTalentToRoster,
  bulkAddTalentToRoster,
  clearProfileDraft,
  createTalentDraft,
  discardTalentDraft,
  getEnabledTaxonomyTree,
  patchProfileDraft,
  patchTalentDraft,
  resolvedFieldsForMode,
  useAdminShell,
  useDashboardText,
  useLiveTaxonomy,
  useQueuedRouterRefresh,
} from "../../drawer-shared";
import {
  CsvBulkAddPanel,
  ManagementMethodPicker,
  PasteContactModal,
  PrimaryTalentTypeGrid,
  qaInputStyle,
} from "./talent-type-picker";
import { buildNewTalentPickerTaxonomy } from "./new-talent-taxonomy";
import { uploadTalentMedia } from "@/lib/client/signed-upload";

// ── F14/F15 — Publish checklist ────────────────────────────────────────────────
function PublishChecklist({
  hasName, hasPrimaryType, hasHomeBase, hasPhoto,
  saveState, draftId, onDiscard,
}: {
  hasName: boolean; hasPrimaryType: boolean; hasHomeBase: boolean; hasPhoto: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  draftId: string | null;
  onDiscard: () => void;
}) {
  const copy = useDashboardText();
  const tt = copy.t;
  const items = [
    { label: tt("Name"),                done: hasName },
    { label: tt("Primary talent type"), done: hasPrimaryType },
    { label: tt("Home base"),           done: hasHomeBase },
    { label: tt("At least one photo"),  done: hasPhoto },
  ];
  const allDone = items.every(i => i.done);
  const anyStarted = items.some(i => i.done);
  if (!anyStarted && saveState === "idle") return null;

  return (
    <div style={{
      marginTop: 12, padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${allDone ? "rgba(15,79,62,0.25)" : COLORS.borderSoft}`,
      background: allDone ? "rgba(15,79,62,0.04)" : "rgba(11,11,13,0.03)",
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}
          className={allDone ? "text-admin-accent-deep" : "text-admin-ink-muted"}>
          {allDone ? tt("Ready to publish") : tt("Before publishing")}
        </span>
        <span style={{ fontSize: 10.5 }} className="text-admin-ink-dim">
          {saveState === "saving" && tt("Saving…")}
          {saveState === "saved" && `✓ ${tt("Draft saved")}`}
          {saveState === "error" && `⚠ ${tt("Save failed")}`}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {items.map(it => (
          <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: it.done ? 600 : 500 }}
            className={it.done ? "text-admin-green" : "text-admin-ink-muted"}>
            <span style={{ fontSize: 10, lineHeight: 1 }}>{it.done ? "✓" : "○"}</span>
            {it.label}
          </span>
        ))}
      </div>
      {draftId && (
        <button type="button" onClick={onDiscard} style={{
          marginTop: 10, background: "none", border: "none", cursor: "pointer",
          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, padding: 0,
        }} className="text-admin-ink-muted">
          {tt("Discard this draft")} →
        </button>
      )}
    </div>
  );
}

export function NewTalentDrawer() {
  const { state, closeDrawer, openDrawer, toast, bulkAddTalent, tenantSlug, effectiveTenant, bridgeTenantIdentity } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Hold the actual File so we can upload it as a `card` variant after
  // addTalentToRoster returns the new talentProfileId. The blob URL above
  // is only for preview.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+34");
  const [primaryType, setPrimaryType] = useState<string | null>(null);
  // A6 — multi-role parity. Wizard + edit drawer collect secondary
  // types; admin add couldn't, forcing a 2-step process (add + open
  // shell + add secondaries). Now NewTalentDrawer carries secondaries
  // through the seed handoff so the talent's roster card + dashboard
  // immediately reflect "Model + Host" on first save.
  const [secondaryTypes, setSecondaryTypes] = useState<string[]>([]);
  const [homeBase, setHomeBase] = useState("");
  // Default to "agency" so the most-used path (admin fills full profile)
  // is the visible default — the field-list preview spells out exactly
  // what the admin will get on the next screen.
  const [method, setMethod] = useState<"agency" | "invited" | "draft">("agency");
  const [showMore, setShowMore] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // #12 — Tab between single-talent quick-add and CSV bulk import.
  const [addMode, setAddMode] = useState<"single" | "csv">("single");
  const [tenantTaxonomyTree, setTenantTaxonomyTree] = useState<TaxonomyNode[] | null>(null);
  // F4 — autosave draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live taxonomy (PR-A) — picker source.
  // Real tenant UUID → drop admin-disabled categories from the picker; falls
  // back to unfiltered when there's no tenant (prototype).
  const live = useLiveTaxonomy({ tenantId: bridgeTenantIdentity?.tenantId ?? null });
  const fallbackAllowedParentIds = useMemo(
    () => new Set(
      WORKSPACE_TAXONOMY_DEFAULT
        .filter(s => s.isEnabled && s.showInRegistration)
        .map(s => s.parentId as string),
    ),
    [],
  );
  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    getEnabledTaxonomyTree().then((res) => {
      if (!cancelled && res.ok) setTenantTaxonomyTree(res.tree);
    });
    return () => { cancelled = true; };
  }, [tenantSlug]);
  const {
    visibleParents,
    restParents,
    allowedParents,
    allSecondaryParents,
  } = buildNewTalentPickerTaxonomy({
    visibleLiveParents: live.visibleParents,
    restLiveParents: live.restParents,
    tenantTree: tenantTaxonomyTree,
    fallbackAllowedParentIds,
    currentPlan: state.plan as "free" | "studio" | "agency" | "network",
    showMore,
  });

  const computedDisplayName = displayName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const minimumValid = firstName.trim().length > 0 && lastName.trim().length > 0 && !!primaryType && homeBase.trim().length > 0;
  const inviteValid = minimumValid && emailValid;

  // #4 — Sync QuickAdd state into the shared draft store (debounced).
  // Shell reads from this on mount so first/last/email/phone/photo flow
  // through without lossy seed-data prop-drilling.
  useEffect(() => {
    const t = setTimeout(() => {
      patchProfileDraft("default", {
        firstName, lastName, displayName,
        email, phone, phoneCountry,
        primaryType, homeBase, method,
        photoUrl, photoCount: photoUrl ? 1 : 0,
      } as Partial<ProfileDraft>, "quick-add");
    }, 350);
    return () => clearTimeout(t);
  }, [firstName, lastName, displayName, email, phone, phoneCountry, primaryType, homeBase, method, photoUrl]);

  const seedForShell = () => ({
    stageName: computedDisplayName,
    primaryType: primaryType ?? undefined,
    secondaryTypes,
    homeBase,
    method,
    contact: email,
  });
  const workspaceScopeTenantId = bridgeTenantIdentity?.tenantId ?? bridgeTenantIdentity?.slug ?? tenantSlug ?? PROTO_TENANT_ID;

  // F4 — Create a persistent draft row on the first name-field blur.
  const createDraft = useCallback(async () => {
    if (!tenantSlug || draftId) return;
    const name = firstName.trim() || lastName.trim();
    if (!name) return;
    setSaveState("saving");
    const res = await createTalentDraft(tenantSlug, firstName.trim(), lastName.trim());
    if (res.ok && res.talentProfileId) {
      setDraftId(res.talentProfileId);
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  }, [tenantSlug, draftId, firstName, lastName]);

  // F4 — Schedule a debounced patch 400ms after a field blurs.
  const schedulePatch = useCallback(() => {
    if (!tenantSlug || !draftId) return;
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    setSaveState("saving");
    patchTimerRef.current = setTimeout(async () => {
      const res = await patchTalentDraft({
        tenantSlug,
        talentProfileId: draftId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phoneCountry && phone ? `${phoneCountry} ${phone}` : phone,
        homeBase: homeBase.trim(),
        primaryTypeSlugorId: primaryType ?? undefined,
      });
      setSaveState(res.ok ? "saved" : "error");
    }, 400);
  }, [tenantSlug, draftId, firstName, lastName, displayName, email, phone, phoneCountry, homeBase, primaryType]);

  // Patch when primaryType changes after a draft is open (no blur event for type picker).
  useEffect(() => {
    if (draftId && primaryType) schedulePatch();
  }, [primaryType, draftId, schedulePatch]);

  // F4 — Discard: delete the draft row then close.
  const handleDiscard = useCallback(async () => {
    if (tenantSlug && draftId) {
      await discardTalentDraft(tenantSlug, draftId);
    }
    setDraftId(null);
    setSaveState("idle");
    clearProfileDraft("default");
    closeDrawer();
  }, [tenantSlug, draftId, closeDrawer]);

  // ── CTA handlers — use real server action in production, mock in prototype ──
  const runAdd = (managementMethod: "agency" | "invited" | "draft", afterOk: (id?: string) => void) => {
    if (!tenantSlug) {
      // Prototype / preview mode — local mock only
      const savedName = computedDisplayName || tt("Talent");
      toast(
        managementMethod === "invited"
          ? (copy.isSpanish ? `Invitación enviada a ${email}` : `Invite sent to ${email}`)
          : (copy.isSpanish ? `${savedName} guardado` : `${savedName} saved`),
      );
      clearProfileDraft("default");
      closeDrawer();
      return;
    }
    startTransition(async () => {
      const result = await addTalentToRoster({
        tenantSlug: tenantSlug!,
        firstName,
        lastName,
        displayName,
        email,
        phone: phoneCountry && phone ? `${phoneCountry} ${phone}` : phone,
        homeBase,
        primaryTypeSlugorId: primaryType ?? undefined,
        secondaryTypeSlugorIds: secondaryTypes,
        managementMethod,
      });
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }

      // Upload the optional avatar file as the talent's `card` variant
      // (the public roster card photo). Best-effort — surface a toast on
      // failure but don't block the add flow.
      if (result.talentProfileId && photoFile) {
        try {
          // Signed pipeline first — the legacy FormData action rejects any
          // photo over the 4 MB Server Action body cap, i.e. most camera
          // shots, which left brand-new talents photoless.
          const fast = await uploadTalentMedia({
            file: photoFile,
            variantKind: "card",
            talentProfileId: result.talentProfileId,
          });
          if (!fast.ok) {
            if (!fast.fallbackToLegacy) throw new Error(fast.error);
            const fd = new FormData();
            fd.append("file", photoFile);
            const upRes = await actionUploadAndAssignMedia(fd, result.talentProfileId, "card");
            if (!upRes.ok) toast(
              copy.isSpanish ? `Error al subir la foto: ${upRes.error}` : `Photo upload failed: ${upRes.error}`,
              { tone: "error" },
            );
          }
        } catch (err) {
          logServerError("newtalentdrawer_photo_upload", err);
          toast(tt("Photo upload failed. Talent created without photo."), { tone: "error" });
        }
      }

      if (result.warnings?.length) {
        result.warnings.forEach(w => toast(w, { tone: "error" }));
      }
      clearProfileDraft("default");
      queueRouterRefresh();
      afterOk(result.talentProfileId);
    });
  };

  const sendInvite = () => {
    if (!inviteValid) return;
    runAdd("invited", () => {
      toast(copy.isSpanish ? `Invitación enviada a ${email}` : `Invite sent to ${email}`);
      closeDrawer();
    });
  };
  const continueEditing = () => {
    if (!minimumValid) return;
    if (!tenantSlug) {
      // Prototype mode — open profile shell directly without persisting
      closeDrawer();
      openDrawer("talent-profile-shell", { mode: "create", seed: seedForShell() });
      return;
    }
    runAdd("agency", (talentProfileId) => {
      closeDrawer();
      if (talentProfileId) {
        // Hand the newly-created talent off to the canonical catalog-driven
        // edit drawer (mirrors the roster list's openProfile in TalentPage-1).
        // The standalone full-page editor at /admin/roster/[id] is retired.
        openDrawer("talent-profile-shell", { mode: "edit-admin", talentId: talentProfileId });
      } else {
        openDrawer("talent-profile-shell", { mode: "create", seed: seedForShell() });
      }
    });
  };
  const saveDraft = () => {
    if (!minimumValid) return;
    runAdd("draft", () => {
      const savedName = computedDisplayName || tt("Talent");
      toast(copy.isSpanish ? `${savedName} guardado como borrador` : `${savedName} saved as draft`);
      closeDrawer();
    });
  };

  // F14/F15 — Footer semantics: "Save draft & exit" (always) + "Publish"
  // (gated on the checklist). The legacy method-based primary CTA is
  // demoted to a hint inside the Management section.
  const allChecklistDone =
    !!(firstName.trim() || lastName.trim() || displayName.trim()) &&
    !!primaryType &&
    !!homeBase.trim() &&
    !!photoUrl;

  const saveDraftAndExit = () => {
    if (!tenantSlug) {
      // Prototype mode — local mock only.
      const savedName = computedDisplayName || tt("Talent");
      toast(copy.isSpanish ? `${savedName} guardado como borrador` : `${savedName} saved as draft`);
      clearProfileDraft("default");
      closeDrawer();
      return;
    }
    // Live mode — the draft is already persisted via autosave on blur.
    // A pending debounced patch (if any) will complete in the background.
    toast(draftId ? tt("Draft saved") : tt("Closed without changes"));
    clearProfileDraft("default");
    closeDrawer();
  };

  const publish = () => {
    if (!allChecklistDone) return;
    // Live mode + draft already exists → hand off to the canonical catalog
    // edit drawer at the existing draftId. No duplicate row. The standalone
    // full-page editor at /admin/roster/[id] is retired.
    if (tenantSlug && draftId) {
      closeDrawer();
      openDrawer("talent-profile-shell", { mode: "edit-admin", talentId: draftId });
      return;
    }
    // Prototype mode or no draftId yet → use the legacy create-and-handoff.
    continueEditing();
  };

  // Alternative CTAs surfaced from the Management method picker (visible
  // only when the admin explicitly picks an non-default method).
  const altCta = method === "invited"
    ? { label: isPending ? tt("Sending…") : tt("Send claim invite"), run: sendInvite, enabled: inviteValid && !isPending }
    : null;

  // #11 — Paste a vCard / Instagram handle / LinkedIn URL / plain text
  // contact. Parser detects shape and autofills first name + last name +
  // email + phone. Saves admins ~30 seconds per add when they're working
  // from a contact card or social page.
  const [pasteOpen, setPasteOpen] = useState(false);
  const applyPaste = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    let firstParsed = "", lastParsed = "", emailParsed = "", phoneParsed = "";
    // 1. vCard
    if (/BEGIN:VCARD/i.test(text)) {
      const fnLine = /(?:^|\n)FN[:;].*?:(.+)/i.exec(text);
      if (fnLine) {
        const parts = fnLine[1].trim().split(/\s+/);
        firstParsed = parts[0] ?? "";
        lastParsed = parts.slice(1).join(" ");
      }
      const emailLine = /(?:^|\n)EMAIL[:;].*?:([^\s\n]+)/i.exec(text);
      if (emailLine) emailParsed = emailLine[1];
      const telLine = /(?:^|\n)TEL[:;].*?:([+\d\s()-]+)/i.exec(text);
      if (telLine) phoneParsed = telLine[1].trim();
    } else if (/@[\w.]+|instagram\.com|linkedin\.com/i.test(text)) {
      // 2. IG handle / LinkedIn URL — extract handle as a hint, no email.
      const igMatch = /(?:instagram\.com\/|^@)([\w.]+)/i.exec(text);
      if (igMatch) {
        const handle = igMatch[1];
        // Best-effort: capitalize handle as a name guess
        firstParsed = handle.split(".")[0].replace(/^\w/, c => c.toUpperCase());
      }
      const liMatch = /linkedin\.com\/in\/([\w-]+)/i.exec(text);
      if (liMatch) {
        const slug = liMatch[1];
        const parts = slug.split("-");
        firstParsed = (parts[0] ?? "").replace(/^\w/, c => c.toUpperCase());
        lastParsed = parts.slice(1).map(p => p.replace(/^\w/, c => c.toUpperCase())).join(" ");
      }
    } else {
      // 3. Plain text — pull email + phone + first non-email-or-phone line as name
      const emailHit = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
      if (emailHit) emailParsed = emailHit[0];
      const phoneHit = /(\+?\d[\d\s().-]{7,})/.exec(text);
      if (phoneHit) phoneParsed = phoneHit[1].trim();
      const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
      const nameLine = lines.find(l => l !== emailParsed && !l.includes(phoneParsed) && !/[@+]/.test(l));
      if (nameLine) {
        const parts = nameLine.split(/\s+/);
        firstParsed = parts[0] ?? "";
        lastParsed = parts.slice(1).join(" ");
      }
    }
    if (firstParsed) setFirstName(firstParsed);
    if (lastParsed) setLastName(lastParsed);
    if (emailParsed) setEmail(emailParsed);
    if (phoneParsed) setPhone(phoneParsed.replace(/^\+\d+\s?/, ""));
    setPasteOpen(false);
    const filled: string[] = [];
    if (firstParsed || lastParsed) filled.push(copy.isSpanish ? "nombre" : "name");
    if (emailParsed) filled.push(copy.isSpanish ? "correo" : "email");
    if (phoneParsed) filled.push(copy.isSpanish ? "teléfono" : "phone");
    toast(
      filled.length
        ? (copy.isSpanish ? `Pegado: ${filled.join(", ")}` : `Pasted: ${filled.join(", ")}`)
        : tt("No fields recognized"),
    );
  };
  const handlePasteFromClipboard = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        applyPaste(text);
      } catch {
        setPasteOpen(true);
      }
    } else {
      setPasteOpen(true);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Add talent")}
      description={tt("Just the essentials here. Everything else (bio, photos, location, type-specific fields, languages, rates) lives in the full profile, opened next.")}
      width={620}
      footer={
        <>
          <SecondaryButton onClick={handleDiscard}>
            {draftId ? tt("Discard draft") : tt("Cancel")}
          </SecondaryButton>
          <SecondaryButton onClick={saveDraftAndExit}>
            {tt("Save draft & exit")}
          </SecondaryButton>
          {altCta && (
            <SecondaryButton onClick={altCta.run}>
              {altCta.label}
            </SecondaryButton>
          )}
          <span
            title={!allChecklistDone && !isPending ? tt("Complete the checklist above to publish") : undefined}
            style={{ display: "inline-flex" }}
          >
            <PrimaryButton
              onClick={publish}
              disabled={!allChecklistDone || isPending}
            >
              {isPending ? tt("Publishing…") : tt("Publish")}
            </PrimaryButton>
          </span>
        </>
      }
    >
      {/* #12 — Tab strip: Single talent / Bulk via CSV. Single tab keeps
          the existing form; CSV tab shows a paste/upload area + preview
          table + bulk-create CTA. */}
      <div style={{
        display: "inline-flex", padding: 3, borderRadius: 999,
        background: "rgba(11,11,13,0.04)", marginBottom: 14,
        fontFamily: FONTS.body,
      }}>
        {([
          { id: "single" as const, label: tt("Single talent") },
          { id: "csv" as const,    label: tt("Bulk via CSV") },
        ]).map(tab => {
          const active = addMode === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setAddMode(tab.id)} style={{
              padding: "6px 14px", borderRadius: 999, border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? COLORS.ink : COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
            }}>{tab.label}</button>
          );
        })}
      </div>

      {addMode === "csv" && (
        <CsvBulkAddPanel
          allowedParents={allowedParents}
          onComplete={async (rows, defaultType) => {
            // Map CSV "type" column → taxonomy slug. Falls back to defaultType.
            const allTypes = allowedParents.flatMap(p => p.children);
            const matchType = (label: string): string | undefined => {
              if (!label) return undefined;
              const norm = label.toLowerCase().replace(/[\s_-]+/g, "-");
              return allTypes.find(c =>
                c.id === norm
                || c.label.toLowerCase().replace(/[\s_-]+/g, "-") === norm
                || c.label.toLowerCase().includes(label.toLowerCase())
              )?.id;
            };

            // Live mode — fire the real bulk action that writes each row to
            // talent_profiles + agency_talent_roster. Per-row errors don't
            // abort the batch; the toast surfaces created vs failed counts.
            if (tenantSlug) {
              const liveRows = rows.map(r => ({
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email,
                homeBase: r.city,
                primaryTypeSlugorId: matchType(r.type) ?? defaultType ?? undefined,
              }));
              startTransition(async () => {
                const res = await bulkAddTalentToRoster(tenantSlug, liveRows);
                if (!res.ok) {
                  toast(res.error, { tone: "error" });
                  return;
                }
                if (res.failed > 0) {
                  void improntaLog("admin_profile_shell_internal.warn", {
                    message: "[bulk-add talent] failures:",
                    res: JSON.stringify(res.errors),
                  });
                  toast(
                    copy.isSpanish
                      ? `Creados ${res.created} de ${res.created + res.failed}. ${res.failed} con error, ver consola.`
                      : `Created ${res.created} of ${res.created + res.failed}. ${res.failed} failed, see console.`,
                    { tone: res.created > 0 ? undefined : "error" },
                  );
                } else {
                  toast(
                    copy.isSpanish
                      ? `${res.created} perfil${res.created === 1 ? "" : "es"} de talento creado${res.created === 1 ? "" : "s"}`
                      : `Created ${res.created} talent profile${res.created === 1 ? "" : "s"}`,
                  );
                }
                if (res.created > 0) {
                  queueRouterRefresh();
                  closeDrawer();
                }
              });
              return;
            }

            // Mock mode (no tenant) — fall back to the prototype's local
            // pending-talent queue so the prototype demo path still works.
            const enriched = rows.map(r => ({
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              primaryType: matchType(r.type) ?? defaultType ?? undefined,
              city: r.city,
            }));
            const created = bulkAddTalent(enriched);
            if (created > 0) {
              toast(
                copy.isSpanish
                  ? `${created} borrador${created === 1 ? "" : "es"} creado${created === 1 ? "" : "s"} · revisar en Aprobaciones`
                  : `Created ${created} draft${created === 1 ? "" : "s"} · review in Approvals`,
              );
              closeDrawer();
              openDrawer("talent-approvals");
            } else {
              toast(tt("No valid rows. Each row needs first name + email."));
            }
          }}
        />
      )}

      {addMode === "single" && (
        <>
      {/* Power-user shortcut bar */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center", marginBottom: 14,
        flexWrap: "wrap", fontFamily: FONTS.body,
      }}>
        <button type="button" onClick={handlePasteFromClipboard} title={tt("Paste vCard / IG handle / LinkedIn URL / plain text")} style={{
          padding: "6px 12px", borderRadius: 999,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>📋 {tt("Paste contact")}</button>
        <span className="text-admin-ink-dim text-admin-11">
          vCard · @handle · linkedin.com/in/… · {tt("plain text")}
        </span>
      </div>

      {/* Hero — photo + name + display + pronunciation */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 14, borderRadius: 14, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 16 }} className="bg-admin-surface">
        <button type="button" onClick={() => fileRef.current?.click()} aria-label={tt("Upload photo")} style={{
          width: 88, height: 88, flexShrink: 0,
          borderRadius: 14,
          background: photoUrl
            ? `url(${photoUrl}) center/cover, ${COLORS.surfaceAlt}`
            : COLORS.surfaceAlt,
          border: photoUrl ? "none" : `1.5px dashed ${COLORS.borderSoft}`,
          cursor: "pointer", color: COLORS.inkMuted,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          fontFamily: FONTS.body, fontSize: 10, fontWeight: 600,
          position: "relative", overflow: "hidden",
        }}>
          {!photoUrl && (<>
            <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
            <span>{tt("Photo")}</span>
          </>)}
          {photoUrl && (
            <span style={{
              position: "absolute", bottom: 4, right: 4,
              padding: "2px 6px", borderRadius: 999,
              background: "rgba(11,11,13,0.65)", color: "#fff",
              fontSize: 9, fontWeight: 600,
            }}>{tt("Replace")}</span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setPhotoUrl(URL.createObjectURL(f));
              setPhotoFile(f);
            }
            e.target.value = "";
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex gap-1.5">
            <input type="text" placeholder={tt("First name")} value={firstName} onChange={(e) => setFirstName(e.target.value)}
              onBlur={() => { void createDraft(); if (draftId) schedulePatch(); }}
              style={qaInputStyle()}
            />
            <input type="text" placeholder={tt("Last name")} value={lastName} onChange={(e) => setLastName(e.target.value)}
              onBlur={() => { void createDraft(); if (draftId) schedulePatch(); }}
              style={qaInputStyle()}
            />
          </div>
          <input type="text"
            placeholder={firstName || lastName
              ? (copy.isSpanish ? `Nombre público · por defecto ${computedDisplayName}` : `Display name · defaults to ${computedDisplayName}`)
              : tt("Display name (optional)")}
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            style={qaInputStyle()}
          />
        </div>
      </div>

      {/* Contact */}
      <Section title={tt("Contact")} framed>
        <FieldRow label={tt("Email")}
          hint={method === "invited" ? tt("Required. They'll receive a claim link.") : tt("Optional. Used for booking comms.")}
        >
          <div className="relative">
            <input type="email" placeholder="talent@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              onBlur={schedulePatch}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 90px 10px 12px", borderRadius: 10,
                border: `1px solid ${email && !emailValid ? COLORS.amberDeep : COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                background: "#fff",
              }}
            />
            {email && (
              <span style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 10.5, fontWeight: 600,
                color: emailValid ? COLORS.successDeep : COLORS.amberDeep,
              }}>{emailValid ? `✓ ${tt("valid")}` : tt("check format")}</span>
            )}
          </div>
        </FieldRow>
        <FieldRow label={tt("Phone")} optional hint={tt("Used for SMS verification + day-of booking comms.")}>
          <div className="flex gap-1.5">
            <select value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)} style={{
              padding: "10px 10px", borderRadius: 10,
              border: `1px solid ${COLORS.border}`, background: "#fff",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
              flexShrink: 0,
            }}>
              <option value="+34">🇪🇸 +34</option>
              <option value="+52">🇲🇽 +52</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+33">🇫🇷 +33</option>
              <option value="+39">🇮🇹 +39</option>
              <option value="+49">🇩🇪 +49</option>
              <option value="+351">🇵🇹 +351</option>
            </select>
            <input type="tel" placeholder="612 345 678"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              onBlur={schedulePatch}
              style={qaInputStyle()}
            />
          </div>
        </FieldRow>
      </Section>

      {/* Talent Type */}
      <Section title={tt("Primary Talent Type")} framed>
        {/* Sticky confirmation — shows immediately after picking so the
            operator knows the selection registered without needing to scroll */}
        {primaryType && (() => {
          const match = allowedParents.flatMap(p => p.children.map(c => ({ parent: p, child: c }))).find(x => x.child.id === primaryType);
          return match ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 7px", borderRadius: 999, background: "rgba(11,11,13,0.06)", border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, marginBottom: 10 }} className="text-admin-ink">
              <span className="text-admin-green text-admin-11">✓</span>
              <span>{match.child.label}</span>
              <span style={{ fontWeight: 400 }} className="text-admin-ink-muted">{tt("under")} {match.parent.label}</span>
              <button type="button" onClick={() => setPrimaryType(null)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: 0, lineHeight: 1,
              }} title={tt("Clear selection")}>×</button>
            </div>
          ) : null;
        })()}
        <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {tt("What clients book this person as. Add secondary roles below, this matches what registration collects.")}
        </div>
        <PrimaryTalentTypeGrid parents={allowedParents} selected={primaryType} onPick={(id) => setPrimaryType(id)} />
        {restParents.length > 0 && (
          <button type="button" onClick={() => setShowMore(s => !s)} style={{
            marginTop: 10, padding: "6px 12px", borderRadius: 999,
            background: "transparent", border: `1px dashed ${COLORS.border}`,
            color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>
            {showMore
              ? (copy.isSpanish ? `Ocultar ${restParents.length} más` : `Hide ${restParents.length} more`)
              : (copy.isSpanish ? `+ Más… (${restParents.length})` : `+ More… (${restParents.length})`)}
          </button>
        )}
        <div style={{ marginTop: 6, fontSize: 10.5 }} className="text-admin-ink-dim">
          {live.source === "live" ? tt("Live taxonomy") : tt("Local fixture")} · {copy.isSpanish ? `${visibleParents.length} visibles · ${restParents.length} más` : `${visibleParents.length} visible · ${restParents.length} more`}
        </div>
      </Section>

      {/* A6 — Secondary talent types. Multi-role parity with the
          wizard. Renders only after a primary is picked so the
          options stay focused. The hint links the user back to the
          parent grid for rare combinations. */}
      {primaryType && (() => {
        const candidates = allSecondaryParents
          .flatMap(parent => parent.children.map(child => ({ parent, child })))
          .filter(({ child }) => child.id !== primaryType);
        return (
          <Section title={tt("Secondary talent types")} framed>
            <div style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("Optional. Pick exact additional services this talent also books for. Multi-role profiles surface in more searches.")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map(({ parent, child }) => {
                const active = secondaryTypes.includes(child.id);
                return (
                  <button
                    key={`${parent.id}:${child.id}`}
                    type="button"
                    onClick={() => setSecondaryTypes(prev =>
                      active ? prev.filter(x => x !== child.id) : [...prev, child.id]
                    )}
                    title={parent.label}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 999,
                      border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                      background: active ? "rgba(15,79,62,0.08)" : "#fff",
                      color: active ? COLORS.accentDeep : COLORS.ink,
                      fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden className="text-admin-13">{parent.emoji}</span>
                    <span>+ {child.label}</span>
                  </button>
                );
              })}
            </div>
            {secondaryTypes.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 10.5 }} className="text-admin-ink-dim">
                {copy.isSpanish
                  ? `${secondaryTypes.length} ${secondaryTypes.length === 1 ? "rol secundario seleccionado" : "roles secundarios seleccionados"}.`
                  : `${secondaryTypes.length} secondary ${secondaryTypes.length === 1 ? "role" : "roles"} selected.`}
              </div>
            )}
          </Section>
        );
      })()}

      {/* A4 + A5 — Catalog-driven peek at what the talent will need
          to fill (or what admin should fill on their behalf) once
          they reach the full profile shell. Sourced from
          resolvedFieldsForMode("registration", primaryType) so
          workspace required-overrides are honored. Shows the top
          required + recommendedFor fields per selected role.
          Pure preview — admin doesn't fill them here, just sees
          what's coming. */}
      {primaryType && (() => {
        const allRoles = primaryType ? [primaryType, ...secondaryTypes] : secondaryTypes;
        // Map child id → parent id (catalog applicability is keyed by parent).
        const parentIds = allRoles
          .map(id => TAXONOMY.find(p => p.children.some(c => c.id === id))?.id)
          .filter((x): x is TaxonomyParentId => !!x);
        if (parentIds.length === 0) return null;
        const fields = resolvedFieldsForMode("registration", workspaceScopeTenantId, parentIds)
          .filter(f => f.tier === "type-specific" && f.id.includes("."))
          .filter(f => parentIds.some(p => f.appliesTo?.includes(p)));
        if (fields.length === 0) return null;
        // Required first, then recommended.
        const required = fields.filter(f => parentIds.some(p => f.requiredFor?.includes(p)) || f.optional === false);
        const recommended = fields.filter(f =>
          !required.includes(f)
          && parentIds.some(p => f.recommendedFor?.includes(p))
        );
        return (
          <Section title={tt("What's collected next")} framed>
            <div style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("After save, the full profile shell asks for these fields. Catalog-driven, workspace overrides apply.")}
            </div>
            {required.length > 0 && (
              <div className="mb-2.5">
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                  color: COLORS.accentDeep ?? COLORS.accent, marginBottom: 4,
                }}>
                  {tt("Required")} ({required.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {required.slice(0, 12).map(f => (
                    <span key={f.id} style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: "rgba(15,79,62,0.08)",
                      color: COLORS.accentDeep ?? COLORS.accent,
                      fontSize: 11, fontWeight: 600,
                      fontFamily: FONTS.body,
                    }}>{f.label}</span>
                  ))}
                  {required.length > 12 && (
                    <span style={{ fontSize: 10.5, alignSelf: "center" }} className="text-admin-ink-muted">
                      +{required.length - 12} {tt("more")}
                    </span>
                  )}
                </div>
              </div>
            )}
            {recommended.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }} className="text-admin-ink-muted">
                  {tt("Recommended")} ({recommended.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {recommended.slice(0, 8).map(f => (
                    <span key={f.id} style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: "rgba(11,11,13,0.04)",
                      color: COLORS.inkMuted,
                      fontSize: 11, fontWeight: 500,
                      fontFamily: FONTS.body,
                    }}>{f.label}</span>
                  ))}
                  {recommended.length > 8 && (
                    <span style={{ fontSize: 10.5, alignSelf: "center" }} className="text-admin-ink-dim">
                      +{recommended.length - 8} {tt("more")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Section>
        );
      })()}

      {/* Home base */}
      <Section title={tt("Home base")} framed>
        <FieldRow label={tt("Where is this talent based?")} hint={tt("Service areas + travel radius are set in the full profile.")}>
          <input type="text" placeholder={tt("e.g. Playa del Carmen")}
            value={homeBase} onChange={(e) => setHomeBase(e.target.value)}
            onBlur={schedulePatch}
            style={qaInputStyle()}
          />
        </FieldRow>
      </Section>

      {/* Management */}
      <Section title={tt("Management method")}>
        <ManagementMethodPicker value={method} onChange={setMethod} />
      </Section>

      {/* Power-user: registration link */}
      <Section title={tt("Or send the registration link")} framed>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          fontFamily: FONTS.body,
        }}>
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-admin-12h font-semibold">
              {tt("Mobile-first self-registration")}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">
              {tt("The talent fills out their own profile. Goes to your approval queue.")}
            </div>
          </div>
          <button type="button" onClick={() => openDrawer("talent-registration")} style={{
            padding: "9px 14px", borderRadius: 999,
            background: COLORS.fill, color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}>{tt("Preview")}</button>
        </div>
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => {
              const url = `https://tulala.digital/${effectiveTenant.slug}/join`;
              void navigator.clipboard
                .writeText(url)
                .then(() => toast(tt("Registration link copied")))
                .catch(() => toast(tt("Couldn't copy. Copy manually.")));
            }}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              background: "transparent", color: COLORS.ink,
              border: `1px dashed ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, cursor: "pointer",
              textAlign: "left",
            }}
          >
            tulala.digital/{effectiveTenant.slug}/join · {tt("copy link")}
          </button>
        </div>
      </Section>
        </>
      )}

      {/* F14/F15 — Publish checklist (replaces cascade one-at-a-time errors) */}
      {addMode === "single" && (
        <PublishChecklist
          hasName={!!(firstName.trim() || lastName.trim() || displayName.trim())}
          hasPrimaryType={!!primaryType}
          hasHomeBase={!!homeBase.trim()}
          hasPhoto={!!photoUrl}
          saveState={saveState}
          draftId={draftId}
          onDiscard={handleDiscard}
        />
      )}

      {/* #11 — Paste-anywhere fallback when clipboard.readText is denied */}
      {pasteOpen && (
        <PasteContactModal
          onClose={() => setPasteOpen(false)}
          onApply={applyPaste}
        />
      )}
    </DrawerShell>
  );
}
