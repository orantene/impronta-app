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

import { useAdminShell } from "../state";

// A mode's label comes from `posModeLabel` (pos-copy.ts) — the same builder
// the counter page itself uses — rather than from a second switch statement
// here or from `POS_MODE_META[mode].label`, which that module's own type
// comment says is English only. One list of mode names, in one place.

const SEGMENT_BASE =
  "inline-flex h-[26px] items-center justify-center gap-[6px] rounded-full px-[14px] text-[12.5px] leading-none transition-colors";
const SEGMENT_ACTIVE = "bg-admin-ink font-semibold text-white shadow-admin-rest";
const SEGMENT_IDLE = "bg-transparent font-medium text-admin-ink-muted hover:text-admin-ink";

export function PosModeSwitch() {
  const { state, t, workspacePosEnabled, workspacePosModes, adminBasePath, tenantSlug } =
    useAdminShell();
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

  const model = posSwitchModel({
    posEnabled: workspacePosEnabled,
    role: state.role,
    workspaceEnabledModes: workspacePosModes,
    remembered,
    onPos,
  });

  const allowedKey = model.visible ? model.modes.join(",") : "";
  useEffect(() => {
    if (!allowedKey) return;
    setRemembered(readDevicePosMode(allowedKey.split(",") as PosMode[], tenantSlug));
  }, [allowedKey, tenantSlug]);

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
      setMenuOpen(false);
      setSavedDefault(false);
      router.push(`${adminBasePath}/pos?mode=${mode}`);
    },
    [adminBasePath, router, tenantSlug],
  );

  if (!model.visible) return null;

  const currentLabel = posModeLabel(t, model.currentMode);

  return (
    <div ref={rootRef} className="relative hidden items-center md:inline-flex">
      <div
        role="group"
        aria-label={t("dashboard.pos.counter.switch.label")}
        className="inline-flex h-[32px] items-center rounded-full bg-admin-surface-alt p-[3px] font-admin-body"
      >
        <button
          type="button"
          aria-pressed={model.active === "workspace"}
          onClick={() => {
            setMenuOpen(false);
            if (model.active === "workspace") return;
            router.push(adminBasePath);
          }}
          className={`${SEGMENT_BASE} ${model.active === "workspace" ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
        >
          {t("dashboard.pos.counter.switch.workspace")}
        </button>
        <button
          type="button"
          aria-pressed={model.active === "pos"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            if (model.active === "pos" || model.modes.length > 1) {
              setMenuOpen((open) => !open);
              return;
            }
            openMode(model.currentMode);
          }}
          className={`${SEGMENT_BASE} ${model.active === "pos" ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
        >
          {currentLabel}
          {model.modes.length > 1 && (
            <span aria-hidden className="text-[9px] leading-none opacity-70">
              ▾
            </span>
          )}
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          aria-label={t("dashboard.pos.counter.switch.openMenu")}
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px] rounded-[10px] border border-admin-border-soft bg-admin-card p-[4px] font-admin-body shadow-admin-hover"
        >
          {model.modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitem"
              onClick={() => openMode(mode)}
              className={`flex w-full items-center justify-between rounded-[7px] px-[10px] py-[8px] text-left text-[13px] hover:bg-admin-surface-alt ${
                mode === model.currentMode
                  ? "font-semibold text-admin-ink"
                  : "font-medium text-admin-ink-muted"
              }`}
            >
              {posModeLabel(t, mode)}
              {mode === model.currentMode && (
                <span aria-hidden className="text-[11px] leading-none text-admin-ink-dim">
                  ●
                </span>
              )}
            </button>
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
            className="flex w-full items-center rounded-[7px] px-[10px] py-[8px] text-left text-[12.5px] font-medium text-admin-ink-muted hover:bg-admin-surface-alt"
          >
            {savedDefault
              ? t("dashboard.pos.counter.switch.defaultSaved")
              : t("dashboard.pos.counter.switch.makeDefault")}
          </button>
        </div>
      )}
    </div>
  );
}
