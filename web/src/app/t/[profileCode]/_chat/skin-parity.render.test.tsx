/**
 * SKIN PARITY. The card skin is a presentation layer on the ONE dock: it may
 * theme, it may never remove a function. Every case below runs the SAME flow
 * against the default skin and the card skin and expects the same capability.
 * (The static guard at the bottom pins the engine file to presentational
 * `card` uses only.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GuestInquirySummary, MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { MiniChatMessageBubble, type StreamRow } from "./MiniChatMessageBubble";
import { MiniChatPanelColumn, type MiniChatPanelColumnProps } from "./MiniChatPanelColumn";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, rel), "utf8");

const CARD: ChatCardConfig = {
  replyLabel: "Responde en minutos",
  city: "Cancun",
  customGreeting: null,
  browseServices: true,
  colors: { background: null, surface: null, ink: null, muted: null, line: null, accent: null, onAccent: null },
  bodyFont: null,
};
const SKINS = [
  { name: "default", card: null },
  { name: "card", card: CARD },
] as const;

const BRAND = { agencyName: "Valeria Unas", talentDisplayName: "Valeria Unas", locale: "es", greeting: null } as MiniChatBrand;
const row = (id: string, authorRole: StreamRow["authorRole"], body: string): StreamRow =>
  ({ id, inquiryId: "i1", authorRole, authorLabel: authorRole === "guest" ? null : "Valeria", body, kind: "text", createdAt: "2026-09-18T12:00:00.000Z" }) as unknown as StreamRow;

function column(card: ChatCardConfig | null, over: Partial<MiniChatPanelColumnProps> = {}) {
  const noop = () => undefined;
  const props = {
    brand: BRAND,
    accent: "#2b8a63",
    accentInk: "#ffffff",
    talentFirst: "Valeria",
    tenantSlug: "valeria",
    talentProfileId: "t1",
    open: true,
    expanded: false,
    inquiryId: "i1",
    rows: [row("m1", "guest", "Hola, quiero una cita"), row("m2", "staff", "Claro, tengo hueco el viernes")],
    scrollRef: createRef<HTMLDivElement>(),
    stage: "thread",
    threadStatus: "open",
    typicalReply: null,
    emailedTo: null,
    seenAtByInquiry: {},
    pulseActive: false,
    limitNudge: null,
    capturedChipKinds: [],
    draft: "",
    firstName: "",
    lastName: "",
    email: "",
    honeypot: "",
    sending: false,
    error: null,
    inCooldown: false,
    cooldownSecs: 0,
    sendDisabled: false,
    captchaRequired: false,
    onClose: noop,
    onDraftChange: noop,
    onFirstNameChange: noop,
    onLastNameChange: noop,
    onEmailChange: noop,
    onHoneypotChange: noop,
    onSubmit: noop,
    onFirstSend: noop,
    onAddClaimEmail: null,
    onSwitchInquiry: noop,
    onCaptureChip: null,
    onCapturedChipKind: noop,
    identity: "guest",
    textareaRef: createRef<HTMLTextAreaElement>(),
    card,
    ...over,
  } as unknown as MiniChatPanelColumnProps;
  return renderToStaticMarkup(<MiniChatPanelColumn {...props} />);
}

function summary(over: Partial<GuestInquirySummary> = {}): GuestInquirySummary {
  return {
    inquiryId: "i1",
    projectLabel: "Gel semipermanente",
    lineup: [],
    lineupCount: 0,
    talentProfileId: null,
    talentName: "Valeria",
    talentPortraitUrl: null,
    agencyName: "Valeria Unas",
    lastMessagePreview: "Hi",
    lastMessageAt: "2026-09-18T12:00:00.000Z",
    lastMessageAuthor: "agency",
    unreadHint: false,
    threadStatus: "open",
    typicalReplyLabel: null,
    isDraft: false,
    contactName: "Ada",
    conversationState: "awaiting_customer",
    ...over,
  };
}

for (const { name, card } of SKINS) {
  test(`[${name}] send a message: composer, send button and the thread are all there`, () => {
    const html = column(card);
    assert.match(html, /<textarea/);
    assert.match(html, /aria-label="Send message"/);
    assert.match(html, /Hola, quiero una cita/);
    assert.match(html, /Claro, tengo hueco el viernes/);
  });

  test(`[${name}] the contact gate asks for name and email before the first send`, () => {
    const html = column(card, { stage: "gate", inquiryId: null, rows: [], draft: "Hola" });
    assert.match(html, /type="email"|autoComplete="email"|inputMode="email"/i);
  });

  test(`[${name}] rate-limit error and captcha notice stay visible`, () => {
    const html = column(card, { error: "Demasiados intentos", inCooldown: true, cooldownSecs: 30, captchaRequired: true });
    assert.match(html, /role="alert"/);
    assert.match(html, /Demasiados intentos/);
    assert.match(html, /data-guest-chat-captcha-slot/);
  });

  test(`[${name}] a draft can be sent to the agency (the send bar)`, () => {
    const html = column(card, { extrasEnabled: true, onSendToAgency: () => undefined, onDockViewChange: () => undefined, inquiryIntent: null });
    assert.match(html, /Valeria Unas|Valeria/);
    assert.ok(/data-send|Send to|Enviar/i.test(html), "a send-to-agency control renders");
  });

  test(`[${name}] Mis citas: every state, the filters, and the item rows (resume a thread by tapping it)`, () => {
    const html = renderToStaticMarkup(
      <GuestDockProjectsView
        inquiries={[summary(), summary({ inquiryId: "i2", conversationState: "needs_reply", projectLabel: "Pestanas" })]}
        activeInquiryId="i1"
        seenAtByInquiry={{}}
        accent="#2b8a63"
        agencyName="Valeria Unas"
        surfaceMode={card ? "card" : "light"}
        t={(k) => k}
        onSelect={() => undefined}
        onBrowseServices={card ? () => undefined : undefined}
      />,
    );
    for (const seg of ["needs", "wait", "done"]) assert.match(html, new RegExp(`data-guest-dock-inquiries-seg="${seg}"`));
    assert.match(html, /data-guest-dock-inquiry="i1"/);
    assert.doesNotMatch(html, /data-guest-dock-inquiry="i2"/, "the other state sits behind its filter");
  });

  test(`[${name}] typed cards (offers, receipts) still render through the shared bubble`, () => {
    const html = renderToStaticMarkup(
      <MiniChatMessageBubble m={row("m3", "staff", "Tu oferta") as StreamRow} accent="#2b8a63" locale="es" surfaceMode={card ? "card" : "light"} />,
    );
    assert.match(html, /Tu oferta/);
  });
}

// ── architecture guard ───────────────────────────────────────────────────────

test("every dock view the default renders is rendered with the card skin on (no view sits behind a card check)", () => {
  const col = src("MiniChatPanelColumn.tsx");
  for (const view of ["home", "lineup", "projects", "chat"]) {
    const at = col.indexOf(`activeDockView === "${view}"`);
    assert.ok(at > 0, `${view} view is rendered`);
    const guard = col.slice(Math.max(0, at - 12), at);
    assert.doesNotMatch(guard, /card/, `${view} is not conditioned on the skin`);
  }
});

test("the engine file uses `card` only to theme, never to switch a function off", () => {
  const col = src("MiniChatPanelColumn.tsx");
  const uses = col.split("\n").filter((l) => /\bcard\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  const allowed = [
    /card\?:|card = null|card: ChatCardConfig/, // the prop
    /card\?\.colors|const surfaceMode: SurfaceMode = card/, // theme resolution
    /card=\{card\}/, // handed to the chrome
    /card && !showGate \?/, // card-only extras (intro / ask footer / back to booking)
    /card \?/, // placeholder, services skin, projects empty state, cardIntro
    /card && \(brand\.dockServiceMenu/, // the skin's own service list replaces the catalog only when a menu exists
    /card && \(\(\) =>|return card \?/, // lineup skin
    /\{card && /, // card-only extras
    /card\s*$/, // multi-line props
    /import type \{ ChatCardConfig/,
    /onStartInquiry=\{card \? undefined/, // the skin's tray replaces the shelf's own start button
    /onPickOffering=\{card \? undefined/, // rows ask about a service instead of the quick picker
    /hideAskCard=\{Boolean\(card\)\}/,
  ];
  for (const l of uses) assert.ok(allowed.some((re) => re.test(l)), `unreviewed card use in the engine: ${l.trim()}`);
});
