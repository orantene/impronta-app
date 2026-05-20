"use client";

import { useState } from "react";
import { Icon, SecondaryButton, TextInput } from "../../primitives";
import { AVAILABLE_CHANNELS, COLORS, EXPOSURE_PRESET_META, FONTS, MY_AGENCIES, MY_TALENT_PROFILE, TALENT_CHANNELS, useAdminShell, type ChannelEntry, type ExposurePreset } from "../../state";
import { ModalConfirm, ReachStat, ReachStatDivider } from "../shared/calendar-2";
import { DistributionCard, ExposurePresetSlider, ProTierCompactStrip, ProTierValueCard, ReachHealthScore } from "../shared/calendar-3";
import { PageHeader } from "../shared/page-chrome-1";



// ════════════════════════════════════════════════════════════════════
// REACH — distribution channels
// ════════════════════════════════════════════════════════════════════
//
// Where the talent shows up. Five distribution lanes, each with live
// performance counts. Talent can scan one screen and know:
//   - which channels are sending them work
//   - what each channel costs them in unwanted inquiries
//   - how to grow their reach (browse-to-add) or pull back (toggle off)
//
// The four-preset Exposure slider sits on top — it sets sensible
// defaults across all toggleable channels in one move. Per-channel
// granular toggles below let the talent override.
//
// Distinct from Settings (configuration) and Privacy (what to hide):
// Reach is operational. Distribution is a lever the talent owns.

function ReachPage() {
  const { openDrawer, toast } = useAdminShell();

  // Audit #40 — dismissible Pro-tier card. Once dismissed for the
  // session, the page falls back to a compact strip at the same spot.
  const [proTierDismissed, setProTierDismissed] = useState(false);

  // Local state — preset slider + per-channel overrides. In production
  // these would persist via mutations on TalentDistribution rows.
  const [preset, setPreset] = useState<ExposurePreset>("wide");
  // Per-channel toggle state, keyed by channel id. Initial value mirrors
  // the channel's `status === "live" || "published"` state.
  const [channelOn, setChannelOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      [...TALENT_CHANNELS, ...AVAILABLE_CHANNELS].map((c) => [
        c.id,
        c.status === "live" || c.status === "published",
      ]),
    ),
  );

  const setOn = (id: string, on: boolean) => {
    const wasOn = channelOn[id] ?? false;
    setChannelOn((prev) => ({ ...prev, [id]: on }));
    const ch =
      TALENT_CHANNELS.find((c) => c.id === id) ??
      AVAILABLE_CHANNELS.find((c) => c.id === id);
    // A11: undo on save toasts — pass an undo callback that flips back.
    if (ch) {
      toast(`${ch.name} · ${on ? "on" : "off"}`, {
        undo: () => setChannelOn((prev) => ({ ...prev, [id]: wasOn })),
      });
    }
  };

  // Maximum-confirm dialog state. Picking Maximum opens unverified
  // marketplace channels — the talent might get spammed by Basic clients.
  // Confirming makes the trade-off explicit before we apply it.
  const [showMaxConfirm, setShowMaxConfirm] = useState(false);

  const applyPreset = (next: ExposurePreset, skipMaxConfirm = false) => {
    if (next === "maximum" && !skipMaxConfirm) {
      setShowMaxConfirm(true);
      return;
    }
    setPreset(next);
    // Preset rules — translates a high-level intent into per-channel state.
    // Agency channels are unaffected (contracts handle them). Personal
    // page is always on (talent's own surface).
    setChannelOn((prev) => {
      const newState = { ...prev };
      for (const c of [...TALENT_CHANNELS, ...AVAILABLE_CHANNELS]) {
        if (!c.toggleable) continue;
        if (c.kind === "personal") {
          newState[c.id] = true;
          continue;
        }
        if (c.kind === "tulala-hub") {
          // On for everyone except Selective.
          newState[c.id] = next !== "selective";
          continue;
        }
        if (c.kind === "external") {
          if (next === "selective") newState[c.id] = false;
          else if (next === "curated") newState[c.id] = false;
          else if (next === "wide") newState[c.id] = c.verified === true;
          else newState[c.id] = true; // maximum
          continue;
        }
        if (c.kind === "studio") {
          if (next === "selective" || next === "curated") newState[c.id] = false;
          else newState[c.id] = next === "wide" ? prev[c.id] ?? false : true;
        }
      }
      return newState;
    });
    toast(`Exposure set to ${EXPOSURE_PRESET_META[next].label}`);
  };

  // Aggregate counts for hero strip
  const liveChannels = TALENT_CHANNELS.filter((c) => channelOn[c.id]).length;
  const totalInquiries7d = TALENT_CHANNELS.filter((c) => channelOn[c.id]).reduce(
    (sum, c) => sum + c.inquiries7d,
    0,
  );
  const totalInquiriesDelta = TALENT_CHANNELS.filter((c) => channelOn[c.id]).reduce(
    (sum, c) => sum + (c.inquiries7dDelta ?? 0),
    0,
  );
  const totalBookings90d = TALENT_CHANNELS.reduce((sum, c) => sum + c.bookings90d, 0);
  const totalEarnings90d = TALENT_CHANNELS.reduce((sum, c) => sum + c.earnings90d, 0);
  // Find the talent's top earning channel — surfaces "what's actually
  // working" at a glance.
  const topChannel = TALENT_CHANNELS.reduce<ChannelEntry | null>(
    (best, c) =>
      c.earnings90d > 0 && (!best || c.earnings90d > best.earnings90d) ? c : best,
    null,
  );

  return (
    <>
      <PageHeader
        title="Reach"
        subtitle="Where you appear, and what each channel sent you."
        actions={
          <SecondaryButton onClick={() => openDrawer("talent-public-preview")}>
            Preview public profile
          </SecondaryButton>
        }
      />

      {/* Top stat strip — at-a-glance reach summary. Each stat carries
          a delta or context line so the strip reads as "here's where I
          am, here's the trend." Earnings is the single most important
          metric — it answers "what did distribution actually earn me?" */}
      {/* Audit #44 — Reach health score. Single 0–100 number that
          summarizes how well distributed the talent is. Sits above the
          stat strip so it's the first thing scanned. */}
      <ReachHealthScore
        liveChannels={liveChannels}
        totalChannels={TALENT_CHANNELS.length}
        inquiries7d={totalInquiries7d}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "10px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <ReachStat
          label="Live channels"
          value={`${liveChannels}/${TALENT_CHANNELS.length}`}
          caption={topChannel ? `top: ${topChannel.name}` : ""}
        />
        <ReachStatDivider />
        <ReachStat
          label="Inquiries · 7d"
          value={String(totalInquiries7d)}
          caption={
            totalInquiriesDelta > 0
              ? `+${totalInquiriesDelta} vs prior 7d`
              : totalInquiriesDelta < 0
                ? `${totalInquiriesDelta} vs prior 7d`
                : "flat vs prior 7d"
          }
          captionTone={totalInquiriesDelta > 0 ? "success" : totalInquiriesDelta < 0 ? "coral" : "default"}
          tone="indigo"
        />
        <ReachStatDivider />
        <ReachStat
          label="Earnings · 90d"
          value={`€${totalEarnings90d.toLocaleString()}`}
          caption={`across ${totalBookings90d} bookings`}
          tone="success"
        />
      </div>

      {/* Exposure preset slider — the headline control */}
      <ExposurePresetSlider preset={preset} onChange={applyPreset} />

      <div style={{ height: 20 }} />

      {/* Five distribution cards — one per lane */}
      <div className="flex flex-col gap-3">
        <DistributionCard
          kind="personal"
          title="Personal page"
          description="Your premium page on Tulala. The only channel you fully own."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "personal")}
          channelOn={channelOn}
          onToggle={setOn}
          onPrimary={{
            label: "Edit page",
            handler: () => openDrawer("talent-personal-page"),
          }}
        />
        <DistributionCard
          kind="tulala-hub"
          title="Tulala Hub"
          description="Curated discovery inside Tulala. Vetted by editorial."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "tulala-hub")}
          channelOn={channelOn}
          onToggle={setOn}
        />
        <DistributionCard
          kind="agency"
          title="Agencies on roster"
          description="One exclusive agency at a time. Make / leave / view rights granted per agency."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "agency")}
          channelOn={channelOn}
          onToggle={setOn}
          onPrimary={{
            label: "+ Join another agency",
            handler: () => openDrawer("talent-agency-relationship", { mode: "add" }),
          }}
          onManage={(c) => {
            // Map channel id ("ch-agency-acme") to MY_AGENCIES id ("ag1").
            // Best-effort lookup by name match; production will store the
            // agency_id directly on the distribution row.
            const ag = MY_AGENCIES.find((a) =>
              c.name.toLowerCase().includes(a.name.toLowerCase()) ||
              a.name.toLowerCase().includes(c.name.toLowerCase()),
            );
            openDrawer("talent-agency-relationship", { id: ag?.id ?? "ag1" });
          }}
        />
        <DistributionCard
          kind="external"
          title="External hubs"
          description="Verified third-party platforms that forward inquiries to you."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "external")}
          channelOn={channelOn}
          onToggle={setOn}
          available={AVAILABLE_CHANNELS.filter((c) => c.kind === "external")}
          onAdd={(c) => openDrawer("talent-hub-detail", { channelId: c.id })}
        />
        <DistributionCard
          kind="studio"
          title="Studios & free books"
          description="Creative-studio communities and free-book partnerships."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "studio")}
          channelOn={channelOn}
          onToggle={setOn}
          available={AVAILABLE_CHANNELS.filter((c) => c.kind === "studio")}
          onAdd={(c) => openDrawer("talent-hub-detail", { channelId: c.id })}
        />
      </div>

      <div style={{ height: 24 }} />

      {/* Search / browse — quick add */}
      <section
        style={{
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <Icon name="search" size={14} stroke={1.7} color={COLORS.inkMuted} />
          <span className="text-admin-ink text-admin-13 font-semibold">
            Find a hub or studio to join
          </span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          New partner platforms are added monthly. Tulala vets every external hub before
          surfacing it here. Inquiries through verified hubs follow the same trust + payout
          rules as agency-routed work.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <div className="flex-1">
            <TextInput placeholder="Search Models.com, Cast Iron, Atelier Paris…" />
          </div>
          <SecondaryButton onClick={() => openDrawer("talent-hub-compare")}>
            Compare hubs
          </SecondaryButton>
        </div>
      </section>

      <div style={{ height: 24 }} />

      {/* Pro tier value card (E6) — only when on a non-Portfolio tier.
          Audit #40 — dismissible per-session. Shown until the talent
          dismisses it or upgrades; then a compact "Pro unlocks 3 modules
          → Compare" sticky strip lives at the bottom of Reach instead. */}
      {MY_TALENT_PROFILE.subscription.tier !== "portfolio" && (
        proTierDismissed ? (
          <ProTierCompactStrip
            currentTier={MY_TALENT_PROFILE.subscription.tier}
            onCompare={() => openDrawer("talent-tier-compare")}
          />
        ) : (
          <ProTierValueCard
            currentTier={MY_TALENT_PROFILE.subscription.tier}
            onCompare={() => openDrawer("talent-tier-compare")}
            onDismiss={() => setProTierDismissed(true)}
          />
        )
      )}

      {/* Maximum-exposure confirm dialog. Surfaces the real trade-off
          (marketplace inquiries from Basic clients) before applying. */}
      {showMaxConfirm && (
        <ModalConfirm
          title="Open every channel?"
          body={
            <>
              <p style={{ margin: "0 0 10px" }}>
                <strong>Maximum</strong> exposure adds unverified marketplace channels
                (BookEm.app, etc.). You may get inquiries from Basic-tier clients you
                wouldn&apos;t otherwise see.
              </p>
              <p style={{ margin: 0 }} className="text-admin-ink-muted">
                You can still toggle individual channels off below, or slide back to
                Wide at any time. No commitment.
              </p>
            </>
          }
          confirmLabel="Open every channel"
          confirmTone="critical"
          onConfirm={() => {
            setShowMaxConfirm(false);
            applyPreset("maximum", true);
          }}
          onCancel={() => setShowMaxConfirm(false)}
        />
      )}
    </>
  );
}
