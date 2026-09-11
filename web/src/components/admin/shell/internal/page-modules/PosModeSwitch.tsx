"use client";

/**
 * PosModeSwitch — the ONE way into the point of sale on a desktop or tablet.
 *
 * A segmented control in the identity bar's centre cluster reading
 * "Workspace | <mode>", modelled on `ModeTogglePill` next door so it reads as
 * the same piece of chrome, plus a menu listing the modes this person may
 * actually use.
 *
 * WHY IT IS NOT IN THE SIDEBAR. `lib/workspace/destinations.ts` marks the POS
 * `chrome: "pos"` and `sidebarGroups()` drops that whole group: the point of
 * sale replaces the admin chrome rather than sitting inside it, so a rail row
 * would be a door into a room that removes the corridor. The phone has its
 * own door — the More sheet's "Open POS" row, gated by the same
 * `showsOpenPosRow` predicate — so this control hides below `md` instead of
 * shrinking.
 *
 * WHAT DECIDES WHETHER IT EXISTS. `posSwitchModel`, which is pure and tested
 * (`lib/workspace/pos-device-mode.test.ts`). Both halves of its gate matter:
 * the platform kill switch (`platform_settings.workspace_pos_enabled`, off by
 * default — the counter ships dark) and whether this person's rank has any
 * mode on this workspace. A read-only assistant gets nothing.
 *
 * HYDRATION. The remembered mode is read in an EFFECT and starts `null`, so
 * the first paint uses the first mode this person may use — a value the
 * server computes identically from the same bridge data. The label can change
 * once after hydration; nothing about the layout does.
 *
 * NO INLINE STYLES. `ModeTogglePill` is styled with `style={{}}` objects; this
 * is not, per the shell's current rule. The admin colour tokens
 * (`bg-admin-*`, `text-admin-*`, `border-admin-*`) carry the same values the
 * `COLORS` constants do, so it matches without repeating them.
 */

import { POS_MODES, modesForPerson, parsePosMode } from "@/lib/pos/modes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { posModeLabel } from "@/components/admin/pos/pos-copy";
import { resolveDestination } from "@/lib/workspace/destinations";
import type { PosMode } from "@/lib/pos/modes";
import {
  posSwitchModel,
  readDevicePosMode,
  writeDevicePosMode,
} from "@/lib/workspace/pos-device-mode";

import { interpolate } from "@/i18n/interpolate";
import { Icon } from "../primitives";
import { useAdminShell } from "../state";

// A mode's label comes from `posModeLabel` (pos-copy.ts) — the same builder
// the counter page itself uses — rather than from a second switch statement
// here or from `POS_MODE_META[mode].label`, which that module's own type
// comment says is English only. One list of mode names, in one place.

const SEGMENT_BASE =
  "inline-flex h-[28px] cursor-pointer items-center justify-center gap-[7px] rounded-[8px] px-[12px] text-admin-12h font-semibold leading-none transition-colors";

type MenuRow = {
  readonly mode: PosMode;
  readonly label: string;
  /** on this menu · turned off at this workspace · not this person's rank */
  readonly state: "open" | "off" | "role";
};

/** Modes the approved switch (W00) names that have no screen yet. */
const NOT_BUILT_MODES = ["spacesMode", "fieldMode"] as const;

export function PosModeSwitch() {
  const { state, t, workspacePosEnabled, workspacePosModes, adminBasePath, tenantSlug, effectiveTenant } =
    useAdminShell();
  const tenantName = effectiveTenant.name;
  const router = useRouter();
  const [remembered, setRemembered] = useState<PosMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The registry decides what "on the point of sale" means, not a literal:
  // `state.page` is seeded from the SERVER's own pathname derivation (see the
  // admin layout's `deriveInitialPage`), so this is settled at first paint and
  // never read off `usePathname` mid-render.
  const onPos = resolveDestination(state.page)?.chrome === "pos";

  const [urlMode, setUrlMode] = useState<PosMode | null>(null);

  const model = posSwitchModel({
    posEnabled: workspacePosEnabled,
    role: state.role,
    workspaceEnabledModes: workspacePosModes,
    remembered,
    urlMode,
    onPos,
  });

  const allowedKey = model.visible ? model.modes.join(",") : "";
  useEffect(() => {
    if (!allowedKey) return;
    setRemembered(readDevicePosMode(allowedKey.split(",") as PosMode[], tenantSlug));
  }, [allowedKey, tenantSlug]);

  // The mode in the address, read after mount like the remembered one, so the
  // server and the first client paint agree; until then the model falls back
  // exactly as before. Deliberately AFTER the storage effect: a guard pins
  // that the first effect in this file is the storage read.
  useEffect(() => {
    if (!onPos) {
      setUrlMode(null);
      return;
    }
    const read = () => {
      const raw = new URLSearchParams(window.location.search).get("mode");
      setUrlMode(parsePosMode(raw) ?? null);
    };
    read();
    // Back/forward between modes changes the address without changing the
    // page, so the address is re-read on popstate as well.
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [onPos, state.page]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocumentDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocumentDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  const openMode = useCallback(
    (mode: PosMode) => {
      // Using a mode IS choosing it: the next shift on this tablet opens where
      // the last one left off without anybody configuring anything.
      writeDevicePosMode(mode, tenantSlug);
      setRemembered(mode);
      // Mode-to-mode moves keep `state.page` at "pos", so the address effect
      // does not re-run; the chosen mode is the address from here on.
      setUrlMode(mode);
      setMenuOpen(false);
      setSavedDefault(false);
      router.push(`${adminBasePath}/pos?mode=${mode}`);
    },
    [adminBasePath, router, tenantSlug],
  );

  if (!model.visible) return null;

  const currentLabel = posModeLabel(t, model.currentMode);
  // Every mode the point of sale has, each with why it is or is not on this
  // menu (W00 / M33): on, turned off at this workspace, or not this role.
  const roleModes = modesForPerson({ role: state.role, workspaceEnabledModes: POS_MODES });
  const rows: MenuRow[] = POS_MODES.map((mode) => ({
    mode,
    label: posModeLabel(t, mode),
    state: model.modes.includes(mode)
      ? "open"
      : roleModes.includes(mode)
        ? "off"
        : "role",
  }));
  const posSegmentClass =
    model.active === "pos"
      ? "bg-admin-card text-admin-ink shadow-admin-rest"
      : "bg-transparent text-admin-brand hover:bg-admin-card/60";

  return (
    <div ref={rootRef} className="relative hidden items-center md:inline-flex">
      <div
        role="group"
        aria-label={t("dashboard.pos.counter.switch.label")}
        className="inline-flex items-center gap-[2px] rounded-[11px] border border-admin-border bg-admin-surface-alt p-[3px] font-admin-body"
      >
        <button
          type="button"
          aria-pressed={model.active === "workspace"}
          onClick={() => {
            setMenuOpen(false);
            if (model.active === "workspace") return;
            router.push(adminBasePath);
          }}
          className={`${SEGMENT_BASE} ${
            model.active === "workspace"
              ? "bg-admin-card text-admin-ink shadow-admin-rest"
              : "bg-transparent text-admin-ink-muted hover:text-admin-ink"
          }`}
        >
          {t("dashboard.pos.counter.switch.workspace")}
        </button>
        <button
          type="button"
          aria-pressed={model.active === "pos"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            // One mode and not yet on the point of sale: the half IS the door.
            // Otherwise the menu, which is where the modes are chosen.
            if (model.active === "pos" || model.modes.length > 1) {
              setMenuOpen((open) => !open);
              return;
            }
            openMode(model.currentMode);
          }}
          className={`${SEGMENT_BASE} ${posSegmentClass}`}
        >
          <Icon name="credit" size={14} stroke={1.75} color="currentColor" />
          {t("dashboard.pos.counter.switch.pos")} · {currentLabel}
          <span aria-hidden className="inline-flex opacity-80">
            <Icon name="chevron-down" size={12} stroke={1.75} color="currentColor" />
          </span>
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          aria-label={t("dashboard.pos.counter.switch.openMenu")}
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[340px] -translate-x-1/2 rounded-[12px] border border-admin-border-soft bg-admin-card font-admin-body shadow-admin-hover"
        >
          <div className="border-b border-admin-border-soft px-[14px] pb-[8px] pt-[10px] text-admin-10h font-bold uppercase tracking-[0.08em] text-admin-ink-dim">
            {t("dashboard.pos.counter.switch.openPos")} · {tenantName}
          </div>
          <div className="p-[6px]">
            {rows.map((row) => {
              const isCurrent = row.mode === model.currentMode;
              if (row.state !== "open") {
                return (
                  <div
                    key={row.mode}
                    role="menuitem"
                    aria-disabled="true"
                    className="flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-left text-admin-13 font-medium text-admin-ink-dim"
                  >
                    <Icon name="credit" size={14} stroke={1.6} color="currentColor" />
                    <span className="min-w-0 flex-1 whitespace-nowrap">{row.label}</span>
                    <span className="shrink-0 whitespace-nowrap text-admin-11 font-medium">
                      {row.state === "off"
                        ? interpolate(t("dashboard.pos.counter.switch.turnedOff"), { workspace: tenantName })
                        : t("dashboard.pos.counter.switch.notYourRole")}
                    </span>
                    <Icon name="lock" size={12} stroke={1.6} color="currentColor" />
                  </div>
                );
              }
              return (
                <button
                  key={row.mode}
                  type="button"
                  role="menuitem"
                  aria-label={row.label}
                  onClick={() => openMode(row.mode)}
                  className={`flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-left text-admin-13 hover:bg-admin-surface-alt ${
                    isCurrent ? "bg-admin-surface-alt font-semibold text-admin-ink" : "font-medium text-admin-ink"
                  }`}
                >
                  <Icon name="credit" size={14} stroke={1.6} color="currentColor" />
                  <span className="min-w-0 flex-1">{row.label}</span>
                  {isCurrent && model.currentIsRemembered && (
                    <span className="text-admin-11 font-medium text-admin-ink-dim">
                      {t("dashboard.pos.counter.switch.defaultHere")}
                    </span>
                  )}
                  {isCurrent && (
                    <Icon name="check" size={14} stroke={2} color="var(--color-admin-brand)" />
                  )}
                </button>
              );
            })}
            {/* Two modes the board names that have no screen yet. Drawn so
                nobody looks for them; disabled with the reason. */}
            {NOT_BUILT_MODES.map((key) => (
              <div
                key={key}
                role="menuitem"
                aria-disabled="true"
                className="flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-left text-admin-13 font-medium text-admin-ink-dim"
              >
                <Icon name="layers" size={14} stroke={1.6} color="currentColor" />
                <span className="min-w-0 flex-1 whitespace-nowrap">{t(`dashboard.pos.counter.switch.${key}`)}</span>
                <span className="shrink-0 whitespace-nowrap text-admin-11 font-medium">{t("dashboard.pos.counter.switch.noScreen")}</span>
                <Icon name="lock" size={12} stroke={1.6} color="currentColor" />
              </div>
            ))}
            <div className="my-[4px] h-px bg-admin-border-soft" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                writeDevicePosMode(model.currentMode, tenantSlug);
                setRemembered(model.currentMode);
                setSavedDefault(true);
              }}
              className="flex w-full cursor-pointer items-center rounded-[8px] px-[10px] py-[7px] text-left text-admin-12h font-medium text-admin-ink-muted hover:bg-admin-surface-alt"
            >
              {savedDefault
                ? t("dashboard.pos.counter.switch.defaultSaved")
                : t("dashboard.pos.counter.switch.makeDefault")}
            </button>
          </div>
          <div className="border-t border-admin-border-soft px-[14px] py-[10px] text-admin-11h leading-[1.5] text-admin-ink-muted">
            {t("dashboard.pos.counter.switch.footer")}
          </div>
        </div>
      )}
    </div>
  );
}
