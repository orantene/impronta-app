"use client";

/**
 * BrandQuickPanel — builder-level quick brand controls from the CommandDock.
 *
 * Reads/writes the same site-header config tables as SiteHeaderInspector
 * (agency_business_identity + agency_branding) — no duplicate data store.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadHeaderConfigAction,
  saveHeaderBrandingAction,
  saveHeaderIdentityAction,
} from "@/lib/site-admin/site-header/actions";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import { MediaField, toMediaValue } from "./inspectors/kit";
import { useEditContext } from "./edit-context";
import { DockFloatingPanel } from "./dock-floating-panel";
import { CHROME, Field, FieldLabel, SaveChip, type SaveChipStatus } from "./kit";
// Direct file import, NOT the inspectors/kit barrel — avoids the barrel
// module cycle documented in kit/field.tsx.
import { InspectorInfoTip } from "./inspectors/kit/inspector-info-tip";

interface BrandQuickPanelProps {
  open: boolean;
  onClose: () => void;
}

function LogoQuickField({
  tenantId,
  assetId,
  onChange,
}: {
  tenantId: string;
  assetId: string | null;
  onChange: (next: string | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!assetId) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void fetch(
      `/api/admin/media/library?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(assetId)}`,
      { cache: "no-store" },
    )
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.ok && Array.isArray(body.items)) {
          const found = body.items.find(
            (m: { id: string; publicUrl: string }) => m.id === assetId,
          );
          setPreviewUrl(found?.publicUrl ?? null);
        }
      })
      .catch(() => setPreviewUrl(null))
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, tenantId]);

  // The whole thumbnail IS the trigger — `<MediaField layout="cover">`. This
  // was a hand-rolled `[&>button]:absolute [&>button]:inset-0 …` cascade
  // reaching into `MediaPicker` to erase the button it renders, plus a
  // hand-written hover ×; `site-header/tabs/BrandTab.tsx` carried a
  // byte-identical copy of the same hack. One component now owns it.
  //
  // `resolving` keeps an unresolved id from flashing the empty state.
  return (
    <Field>
      <FieldLabel info="Shown in the site header and shared with header settings.">
        Logo
      </FieldLabel>
      <div style={{ width: 96, height: 96 }}>
        <MediaField
          tenantId={tenantId}
          aspect="1/1"
          layout="cover"
          emptyLabel={resolving ? "" : "Logo"}
          coverReplaceLabel="Replace"
          // The consumer stores an ASSET ID, so a pasted URL has nothing
          // to store — the escape hatch is off for this field.
          allowUrlPaste={false}
          value={toMediaValue(previewUrl, assetId)}
          onChange={(next) => onChange(next?.mediaId ?? null)}
        />
      </div>
    </Field>
  );
}

/**
 * BrandQuickPanelBody — the brand form (logo / name / colors / contact),
 * decoupled from the floating-panel chrome so it can be hosted either as a
 * standalone dock panel (legacy {@link BrandQuickPanel}) or as the "Brand"
 * section of the unified Design panel.
 *
 * `active` gates the load effect: the body only fetches header config when it
 * is the visible surface. All reads/writes go through the SAME governed
 * site-header actions — this refactor is UI re-home only, no data change.
 */
export function BrandQuickPanelBody({ active }: { active: boolean }) {
  const { queueRouterRefresh, tenantId } = useEditContext();
  const [config, setConfig] = useState<SiteHeaderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [chipStatus, setChipStatus] = useState<SaveChipStatus>("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setLoadErr(null);
    void loadHeaderConfigAction().then((res) => {
      if (res.ok) {
        setConfig(res.config);
        setChipStatus("saved");
      } else {
        setLoadErr(res.error);
      }
      setLoading(false);
    });
  }, [active]);

  const scheduleIdentity = useCallback(
    (patch: Omit<Parameters<typeof saveHeaderIdentityAction>[0], "expectedVersion">) => {
      if (!config) return;
      setConfig((c) =>
        c
          ? {
              ...c,
              identity: { ...c.identity, ...patch },
            }
          : c,
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setChipStatus("dirty");
      debounceRef.current = setTimeout(() => {
        setChipStatus("saving");
        void saveHeaderIdentityAction({
          expectedVersion: config.identity.version,
          ...patch,
        }).then((res) => {
          if (res.ok) {
            setConfig((c) =>
              c
                ? {
                    ...c,
                    identity: { ...c.identity, version: res.version },
                  }
                : c,
            );
            setChipStatus("saved");
            void queueRouterRefresh();
          } else {
            setChipStatus("error");
          }
        });
      }, 600);
    },
    [config, queueRouterRefresh],
  );

  const scheduleBranding = useCallback(
    (patch: Omit<Parameters<typeof saveHeaderBrandingAction>[0], "expectedVersion">) => {
      if (!config) return;
      setConfig((c) =>
        c
          ? {
              ...c,
              branding: { ...c.branding, ...patch },
            }
          : c,
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setChipStatus("dirty");
      debounceRef.current = setTimeout(() => {
        setChipStatus("saving");
        void saveHeaderBrandingAction({
          expectedVersion: config.branding.version,
          ...patch,
        }).then((res) => {
          if (res.ok) {
            setConfig((c) =>
              c
                ? {
                    ...c,
                    branding: { ...c.branding, version: res.version },
                  }
                : c,
            );
            setChipStatus("saved");
            void queueRouterRefresh();
          } else {
            setChipStatus("error");
          }
        });
      }, 600);
    },
    [config, queueRouterRefresh],
  );

  if (!active) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[14px] py-[12px]">
        <div className="mb-[10px] flex items-center justify-between gap-[8px]">
          <InspectorInfoTip content="Quick brand controls for name, logo, and colors." />
          <SaveChip status={chipStatus} />
        </div>

        {loading ? (
          <p className="text-[12px]" style={{ color: CHROME.muted }}>
            Loading brand…
          </p>
        ) : null}
        {loadErr ? (
          <p className="text-[12px]" style={{ color: CHROME.rose }}>
            {loadErr}
          </p>
        ) : null}

        {config ? (
          <div className="flex flex-col gap-[14px]">
            <LogoQuickField
              tenantId={tenantId}
              assetId={config.branding.logoMediaAssetId}
              onChange={(next) =>
                scheduleBranding({ logoMediaAssetId: next })
              }
            />

            <Field>
              <FieldLabel>Brand name</FieldLabel>
              <input
                className="w-full rounded-[8px] border px-[10px] py-[8px] text-[13px]"
                style={{ borderColor: CHROME.line, color: CHROME.ink }}
                value={config.identity.publicName}
                onChange={(e) => scheduleIdentity({ publicName: e.target.value })}
              />
            </Field>

            <Field>
              <FieldLabel>Tagline</FieldLabel>
              <input
                className="w-full rounded-[8px] border px-[10px] py-[8px] text-[13px]"
                style={{ borderColor: CHROME.line, color: CHROME.ink }}
                value={config.identity.tagline ?? ""}
                onChange={(e) =>
                  scheduleIdentity({ tagline: e.target.value || null })
                }
              />
            </Field>

            <Field>
              <FieldLabel>Primary color</FieldLabel>
              <input
                type="color"
                value={config.branding.primaryColor ?? "#3d4f7c"}
                onChange={(e) =>
                  scheduleBranding({ primaryColor: e.target.value })
                }
              />
            </Field>

            <Field>
              <FieldLabel>Accent color</FieldLabel>
              <input
                type="color"
                value={config.branding.accentColor ?? "#6b5b95"}
                onChange={(e) =>
                  scheduleBranding({ accentColor: e.target.value })
                }
              />
            </Field>

            <Field>
              <FieldLabel>Contact email</FieldLabel>
              <input
                className="w-full rounded-[8px] border px-[10px] py-[8px] text-[13px]"
                style={{ borderColor: CHROME.line, color: CHROME.ink }}
                value={config.identity.contactEmail ?? ""}
                onChange={(e) =>
                  scheduleIdentity({ contactEmail: e.target.value || null })
                }
              />
            </Field>

            <Field>
              <FieldLabel info="Shared with the site header and footer.">
                Instagram
              </FieldLabel>
              <input
                className="w-full rounded-[8px] border px-[10px] py-[8px] text-[13px]"
                style={{ borderColor: CHROME.line, color: CHROME.ink }}
                placeholder="https://instagram.com/…"
                value={config.identity.socialInstagram ?? ""}
                onChange={(e) =>
                  scheduleIdentity({ socialInstagram: e.target.value || null })
                }
              />
            </Field>
          </div>
        ) : null}
    </div>
  );
}

/**
 * BrandQuickPanel — legacy standalone dock panel wrapper around
 * {@link BrandQuickPanelBody}. Retained for back-compat; the unified Design
 * panel hosts {@link BrandQuickPanelBody} directly.
 */
export function BrandQuickPanel({ open, onClose }: BrandQuickPanelProps) {
  if (!open) return null;
  return (
    <DockFloatingPanel
      panelId="brand"
      title="Brand"
      open={open}
      onClose={onClose}
      width={340}
      testId="brand-quick-panel"
    >
      <BrandQuickPanelBody active={open} />
    </DockFloatingPanel>
  );
}
