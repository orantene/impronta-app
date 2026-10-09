import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSupportThreading,
  matchTicketFromInbound,
  parseTicketToken,
  ticketToken,
} from "./support-inbound-match";
import { sanitizeInboundReplyBody } from "./support-inbound-sanitize";
import { shouldAcceptInboundReply } from "./support-inbound-accept";
import { supportOutboundThreading } from "./support-outbound-threading";

const SECRET = "test-secret-not-real";
const ID = "3f2c5ee9-7438-4190-8ae8-adb6a457ec79";

test("token roundtrip", () => {
  const t = ticketToken(ID, SECRET);
  assert.match(t, /^[0-9a-f]{32}-[a-z2-7]{16}$/);
  assert.equal(parseTicketToken(t, SECRET), ID);
  assert.equal(parseTicketToken(t.toUpperCase(), SECRET), ID);
});

test("token tamper, wrong secret and malformed are rejected", () => {
  const t = ticketToken(ID, SECRET);
  const flipped = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
  assert.equal(parseTicketToken(flipped, SECRET), null);
  assert.equal(parseTicketToken(t, "other"), null);
  const otherId = ticketToken("00000000-0000-4000-8000-000000000000", SECRET);
  assert.equal(parseTicketToken(t.slice(0, 33) + otherId.slice(33), SECRET), null);
  assert.equal(parseTicketToken("garbage", SECRET), null);
  assert.equal(parseTicketToken(t, ""), null);
});

test("match by plus-token (with display name)", () => {
  const t = ticketToken(ID, SECRET);
  assert.deepEqual(
    matchTicketFromInbound({ to: [`Tulala Support <support+${t}@in.example.com>`] }, SECRET),
    { ticketId: ID },
  );
});

test("match by In-Reply-To and References headers", () => {
  const t = ticketToken(ID, SECRET);
  const th = buildSupportThreading({ ticketId: ID, secret: SECRET, domain: "in.example.com", uniq: "evt1" });
  assert.deepEqual(
    matchTicketFromInbound({ to: ["help@in.example.com"], inReplyTo: th.headers["Message-ID"] }, SECRET),
    { ticketId: ID },
  );
  assert.deepEqual(
    matchTicketFromInbound(
      { to: [], references: `<other@x.com> ${th.headers["References"]}` },
      SECRET,
    ),
    { ticketId: ID },
  );
  assert.ok(th.replyTo.includes(`support+${t}@`));
});

test("unmatched stays unmatched (subject token never trusted)", () => {
  assert.deepEqual(
    matchTicketFromInbound({ to: ["a@in.example.com"], subject: "Re: x [Tulala #12]" }, SECRET),
    { unmatched: "no_token" },
  );
  const forged = `support+${ID.replace(/-/g, "")}-aaaaaaaaaaaaaaaa@in.example.com`;
  assert.deepEqual(matchTicketFromInbound({ to: [forged] }, SECRET), { unmatched: "invalid_token" });
  assert.deepEqual(matchTicketFromInbound({ to: [forged] }, ""), { unmatched: "secret_not_configured" });
});

test("accept: owner matches case-insensitively", () => {
  assert.deepEqual(
    shouldAcceptInboundReply({
      senderEmail: "Jane Doe <Jane@Example.com>",
      ticketOwnerEmail: " jane@example.com ",
      headers: { "Auto-Submitted": "no" },
    }),
    { accept: true },
  );
});

test("accept: wrong sender rejected, unknown owner rejected", () => {
  assert.deepEqual(
    shouldAcceptInboundReply({ senderEmail: "evil@example.com", ticketOwnerEmail: "jane@example.com", headers: {} }),
    { accept: false, reason: "sender_not_owner" },
  );
  assert.deepEqual(
    shouldAcceptInboundReply({ senderEmail: "jane@example.com", ticketOwnerEmail: null, headers: {} }),
    { accept: false, reason: "owner_email_unknown" },
  );
});

test("accept: auto-replies and robots ignored", () => {
  const base = { senderEmail: "jane@example.com", ticketOwnerEmail: "jane@example.com" };
  const cases: Record<string, string>[] = [
    { "auto-submitted": "auto-replied" },
    { Precedence: "bulk" },
    { precedence: "junk" },
    { "X-Autoreply": "yes" },
  ];
  for (const headers of cases) {
    assert.equal(shouldAcceptInboundReply({ ...base, headers }).accept, false);
  }
  for (const s of ["mailer-daemon@example.com", "no-reply@example.com", "noreply@example.com"]) {
    assert.equal(
      shouldAcceptInboundReply({ senderEmail: s, ticketOwnerEmail: s, headers: {} }).accept,
      false,
    );
  }
});

test("sanitize: Gmail 'On ... wrote:' and > quotes", () => {
  const body = "Thanks, that fixed it!\n\nOn Tue, Oct 6, 2026 at 9:14 AM Tulala Support <support@in.example.com> wrote:\n> Hello\n> Can you retry?\n";
  assert.equal(sanitizeInboundReplyBody({ text: body }), "Thanks, that fixed it!");
});

test("sanitize: wrapped 'On ... wrote:' across two lines", () => {
  const body = "Still broken.\n\nOn Tue, Oct 6, 2026 at 9:14 AM Tulala Support <support@in.example.com>\nwrote:\n> hi";
  assert.equal(sanitizeInboundReplyBody({ text: body }), "Still broken.");
});

test("sanitize: Outlook header block and Original Message", () => {
  const outlook = "See attached screenshot.\n\n________________________________\nFrom: Tulala Support <support@in.example.com>\nSent: Tuesday, October 6, 2026 9:14 AM\nTo: Jane\nSubject: Re: Help [Tulala #12]\n\nOld text";
  assert.equal(sanitizeInboundReplyBody({ text: outlook }), "See attached screenshot.");
  const orig = "Yes please.\n-----Original Message-----\nFrom: x\nOld";
  assert.equal(sanitizeInboundReplyBody({ text: orig }), "Yes please.");
});

test("sanitize: signature after '-- '", () => {
  assert.equal(sanitizeInboundReplyBody({ text: "Works now.\n-- \nJane Doe\nCEO" }), "Works now.");
});

test("sanitize: html to text, no scripts, no links, no javascript:", () => {
  const html = '<div>Hello <a href="javascript:alert(1)">click</a><script>alert(1)</script><br>Line 2 &amp; more</div><blockquote>old quote</blockquote>';
  const out = sanitizeInboundReplyBody({ html });
  assert.equal(out, "Hello click\nLine 2 & more");
  assert.ok(!/<|javascript:/i.test(out));
});

test("sanitize: caps at 10_000 chars and handles empty", () => {
  assert.equal(sanitizeInboundReplyBody({ text: "a".repeat(20_000) }).length, 10_000);
  assert.equal(sanitizeInboundReplyBody({ text: null, html: null }), "");
});

test("outbound threading only when configured and platform support mail", () => {
  const env = { SUPPORT_INBOUND_DOMAIN: "in.example.com", GUEST_COOKIE_SECRET: SECRET };
  const payload = { ticketId: ID, platformFrom: true };
  const r = supportOutboundThreading("support.message.agent", payload, "evt-1", env);
  assert.ok(r?.replyTo.startsWith("support+"));
  assert.ok(r?.headers["Message-ID"].startsWith("<tulala-support-"));
  assert.equal(supportOutboundThreading("booking.confirmed", payload, "e", env), null);
  assert.equal(supportOutboundThreading("support.message.agent", { ticketId: ID }, "e", env), null);
  assert.equal(supportOutboundThreading("support.message.agent", payload, "e", {}), null);
  assert.equal(supportOutboundThreading("support.message.agent", { ticketId: "nope", platformFrom: true }, "e", env), null);
});

test("supportInboundSecret: dedicated secret wins, GUEST_COOKIE_SECRET is only the fallback", async () => {
  const { supportInboundSecret } = await import("./support-inbound-match");
  assert.equal(supportInboundSecret({ SUPPORT_INBOUND_SECRET: " a ", GUEST_COOKIE_SECRET: "b" }), "a");
  assert.equal(supportInboundSecret({ GUEST_COOKIE_SECRET: "b" }), "b");
  assert.equal(supportInboundSecret({ SUPPORT_INBOUND_SECRET: "  ", GUEST_COOKIE_SECRET: " " }), null);
  assert.equal(supportInboundSecret({}), null);
});
