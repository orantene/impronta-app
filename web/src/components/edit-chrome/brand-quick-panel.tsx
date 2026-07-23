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
import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";
import { useEditContext } from "./edit-context";
import { DockFloatingPanel } from "./dock-floating-panel";
import { CHROME, Field, FieldLabel, Helper, SaveChip, type SaveChipStatus } from "./kit";

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

  const hasLogo = Boolean(assetId && previewUrl);

  return (
    <Field>
      <FieldLabel>Logo</FieldLabel>
      <div
        className="group relative overflow-hidden rounded-[10px] border"
        style={{
          width: 96,
          height: 96,
          borderColor: CHROME.line,
          background: CHROME.controlFill,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl!}
              alt="Site logo"
              className="size-full object-contain p-2"
            />
          ) : resolving ? (
            <span
              className="size-3 animate-pulse rounded-full"
              style={{ background: CHROME.muted3 }}
            />
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: CHROME.muted3 }}>
              Logo
            </span>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-stone-900/55 text-[10px] font-semibold uppercase tracking-[0.1em] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {hasLogo ? "Replace" : "Add"}
        </div>
        <div className="absolute inset-0 z-20 [&>button]:absolute [&>button]:inset-0 [&>button]:size-full [&>button]:cursor-pointer [&>button]:border-0 [&>button]:bg-transparent [&>button]:opacity-0">
          <MediaPicker
            tenantId={tenantId}
            label="Pick logo"
            onPick={() => {}}
            onPickItem={(item) => onChange(item.id)}
          />
        </div>
        {assetId ? (
          <button
            type="button"
            aria-label="Clear logo"
            title="Clear logo"
            onClick={() => onChange(null)}
            className="absolute right-1 top-1 z-30 inline-flex size-5 items-center justify-center rounded-full bg-stone-900/85 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          >
            ×
          </button>
        ) : null}
      </div>
      <Helper>Shown in the site header and shared with header settings.</Helper>
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
          <p className="m-0 text-[11px] leading-snug" style={{ color: CHROME.muted }}>
            Quick brand controls for name, logo, and colors.
          </p>
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
              <FieldLabel>Instagram</FieldLabel>
              <input
                className="w-full rounded-[8px] border px-[10px] py-[8px] text-[13px]"
                style={{ borderColor: CHROME.line, color: CHROME.ink }}
                placeholder="https://instagram.com/…"
                value={config.identity.socialInstagram ?? ""}
                onChange={(e) =>
                  scheduleIdentity({ socialInstagram: e.target.value || null })
                }
              />
              <Helper>Shared with the site header and footer.</Helper>
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
