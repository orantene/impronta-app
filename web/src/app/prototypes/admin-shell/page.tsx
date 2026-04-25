"use client";

/**
 * Admin Shell — Clickable High-Fidelity Prototype
 *
 * This is a fake-but-real SaaS experience for the Tulala/Impronta admin
 * surface. It is NOT wired to any backend — every drawer, click, and
 * state change runs in local React Context (`ProtoProvider`).
 *
 * Architecture (5-file split):
 *   page.tsx         — entry point (this file). Mounts the provider tree.
 *   _state.tsx       — types, mock data, ProtoProvider, useProto, tokens
 *   _primitives.tsx  — Icon library, atoms, cards, drawer/modal shells, ToastHost
 *   _pages.tsx       — ControlBar, WorkspaceTopbar, all surface/page renderers
 *   _drawers.tsx     — DrawerRoot dispatcher, every drawer body, UpgradeModal
 *
 * Four prototype dimensions (set via the dark ControlBar at the top):
 *   Surface           — workspace · talent · client · platform
 *   Plan              — free · studio · agency · network
 *   Role              — viewer → editor → coordinator → admin → owner
 *   TalentRelationship — alsoTalent on/off (am I a talent on this roster?)
 *
 * State is bidirectionally synced with the URL query string via
 * `replaceState`, so a refresh keeps your scene and you can paste a link
 * to a teammate.
 *
 * Dev-handoff documentation lives at `web/docs/admin-redesign/dev-handoff.md`.
 */

import { Suspense } from "react";
import { ProtoProvider, useProto, COLORS, FONTS } from "./_state";
import { ToastHost } from "./_primitives";
import { ControlBar, SurfaceRouter } from "./_pages";
import { DrawerRoot, UpgradeModal } from "./_drawers";

// ─── Toast bridge (reads from context, passes to dumb host) ──────────

function ToastBridge() {
  const { state } = useProto();
  return <ToastHost toasts={state.toasts} />;
}

// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  return (
    <Suspense fallback={null}>
      <ProtoProvider>
        <div
          style={{
            background: COLORS.surface,
            minHeight: "100vh",
            fontFamily: FONTS.body,
            color: COLORS.ink,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top: prototype control bar (dark, sticky) */}
          <ControlBar />

          {/* Below: the surface — workspace, talent, client, or platform */}
          <SurfaceRouter />

          {/* Layered on top: drawer overlay + drawer panel */}
          <DrawerRoot />

          {/* Layered on top: upgrade modal (cream header + plan unlocks) */}
          <UpgradeModal />

          {/* Layered on top: toast stack (bottom-right) */}
          <ToastBridge />
        </div>
      </ProtoProvider>
    </Suspense>
  );
}
