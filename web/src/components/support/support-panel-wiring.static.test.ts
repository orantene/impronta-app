import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panel = readFileSync("src/components/support/SupportPanel.tsx", "utf8");
const forms = readFileSync("src/components/support/SupportPanelForms.tsx", "utf8");
const hooks = readFileSync("src/components/support/support-hooks.ts", "utf8");
const actions = readFileSync("src/lib/support/actions.ts", "utf8");

test("the panel keys thread state by ticket and never keeps a bare messages array", () => {
  assert.match(panel, /useReducer\(threadReducer, EMPTY_THREAD\)/);
  assert.match(panel, /selectThread\(threadState, ticketId\)/);
  assert.doesNotMatch(panel, /useState<SupportMessageRow\[\]>/);
  assert.doesNotMatch(panel, /useState<SupportTicketRow \| null>/);
});

test("the thread fetch is cancelled when the ticket changes", () => {
  assert.match(panel, /let cancelled = false;[\s\S]*if \(cancelled\) return;[\s\S]*cancelled = true;/);
});

test("closing the panel resets the view through viewAfterOpenChange", () => {
  assert.match(panel, /viewAfterOpenChange\(wasOpenRef\.current, open, view\)/);
});

test("both send boxes clear before awaiting the server", () => {
  const ask = panel.indexOf('setAsk("");');
  const create = panel.indexOf("guardSupportSend(() => contract.createTicket");
  assert.ok(ask > -1 && create > ask, "Home input is cleared before createTicket resolves");
  const clear = forms.indexOf('setBody("");');
  const send = forms.indexOf("await onSend(text)");
  assert.ok(clear > -1 && send > clear, "Composer is cleared before onSend resolves");
});

test("a failed send restores the text instead of eating it", () => {
  assert.match(panel, /setAsk\(\(current\) => \(current === "" \? body : current\)\)/);
  assert.match(forms, /setBody\(\(current\) => \(current === "" \? text : current\)\)/);
});

test("badge and launcher dot share one count, and other tickets update live", () => {
  assert.match(hooks, /return unreadOpenCount\(tickets\)/);
  assert.match(hooks, /export function useSupportInboxRealtime/);
  assert.match(panel, /useSupportInboxRealtime\(/);
});

test("reading a ticket also reads its bell rows", () => {
  assert.match(actions, /markTicketBellRead/);
});

test("TUL-677: a failed or hidden thread read is logged, shown as failed, and retryable", () => {
  assert.match(panel, /if \(tErr \|\| mErr \|\| !tRow\)/);
  assert.match(panel, /console\.error\("support thread load failed"/);
  assert.match(panel, /<SupportThreadLoadError onRetry=\{\(\) => setLoadAttempt/);
  assert.match(panel, /\[open, ticketId, contract, patchSummary, loadAttempt\]/);
  const err = readFileSync("src/components/support/SupportThreadLoadError.tsx", "utf8");
  assert.match(err, /threadLoadRetry/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.adminSupport;
    assert.ok(m.threadLoadRetry && m.threadLoadFailed, l);
    assert.doesNotMatch(m.threadLoadRetry + m.threadLoadFailed, /\u2014/);
  }
});

test("TUL-677: an invalid support= value routes to the Tickets list through the hook and launcher", () => {
  assert.match(hooks, /else openToList\?\.\(\)/);
  const launcher = readFileSync("src/components/support/SupportLauncher.tsx", "utf8");
  assert.match(launcher, /setDeepLinkList\(true\)/);
  assert.match(panel, /else if \(deepLinkList\) setView\("tickets"\)/);
});
