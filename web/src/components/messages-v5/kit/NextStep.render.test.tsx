import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { deriveTasks } from "@/lib/messaging/tasks";

import { NextStepBar, NextStepBlock } from "./NextStep";
import { EN_COPY } from "./test-copy";
import { TASKS } from "./test-fixtures";

const action = { label: "Revise offer", onClick: () => {} };

test("desktop bar: Next, primary title, why, + N other tasks, one primary button", () => {
  const html = renderToStaticMarkup(<NextStepBar tasks={TASKS} copy={EN_COPY} action={action} onMoreTasks={() => {}} />);
  assert.match(html, /class="nextbar" data-next-step/);
  assert.match(html, /class="lbl">Next</);
  assert.match(html, /<b>Reply to the client<\/b>/);
  assert.match(html, /class="why">· The client is waiting on a reply\./);
  assert.match(html, /class="more">\+ 2 other tasks/);
  assert.match(html, /btn primary sm[^>]*data-next-step-action[^>]*>Revise offer/);
  assert.doesNotMatch(html, /style=/);
});

test("loading, busy, empty (nothing to do), done (closed) and a task with no control", () => {
  const loading = renderToStaticMarkup(<NextStepBar tasks={[]} copy={EN_COPY} action={null} loading />);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Working out the next step/);
  const busy = renderToStaticMarkup(<NextStepBar tasks={TASKS} copy={EN_COPY} action={action} busy />);
  assert.match(busy, /aria-busy="true"[^>]*data-next-step-action/);
  const empty = renderToStaticMarkup(<NextStepBar tasks={[]} copy={EN_COPY} action={null} />);
  assert.match(empty, /nextbar done/);
  assert.match(empty, /<b>Nothing to do<\/b>/);
  assert.doesNotMatch(empty, /<button/);
  const closed = deriveTasks({ conversationState: "resolved", opportunityState: null, recordChips: [], identityLevel: "confirmed", unanswered: false, talentConfirmationsPending: 0, balanceDueAt: null, reminderDueAt: null, holdExpiresAt: null, paymentIssue: null });
  const done = renderToStaticMarkup(<NextStepBar tasks={closed} copy={EN_COPY} action={null} />);
  assert.match(done, /nextbar done/);
  assert.match(done, /<b>Resolved<\/b>/);
});

test("mobile block: label, title, why, xl primary, + N other tasks", () => {
  const html = renderToStaticMarkup(<NextStepBlock tasks={TASKS} copy={EN_COPY} action={action} onMoreTasks={() => {}} />);
  assert.match(html, /class="mx-next" data-next-step/);
  assert.match(html, /Next step<button[^>]*class="tasks"[^>]*>\+ 2 other tasks/);
  assert.match(html, /class="ttl">Reply to the client</);
  assert.match(html, /class="sub">The client is waiting on a reply\./);
  assert.match(html, /btn primary xl[^>]*data-next-step-action/);
  const secondary = renderToStaticMarkup(<NextStepBlock tasks={TASKS.slice(0, 1)} copy={EN_COPY} action={{ ...action, secondary: true }} />);
  assert.match(secondary, /btn secondary xl/);
  assert.doesNotMatch(secondary, /other tasks/);
});
