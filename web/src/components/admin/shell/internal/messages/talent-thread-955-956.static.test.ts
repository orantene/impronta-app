import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "src/components/admin/shell/internal/messages");

test("TUL-955: the Group tab leads with the guest's original request", () => {
  const src = readFileSync(join(dir, "talent-2.tsx"), "utf8");
  assert.match(src, /data-original-inquiry/);
  assert.match(src, /dashboard\.talentThread\.originalRequest/);
});

test("TUL-956: the open thread is mirrored to ?thread= and read back on load", () => {
  const src = readFileSync(join(dir, "TalentJobShell.tsx"), "utf8");
  assert.match(src, /searchParams\.get\("thread"\)/);
  assert.match(src, /searchParams\.set\("thread", activeId\)/);
  assert.match(src, /replaceState/);
});

test("TUL-956: /talent/inbox?thread=<id> opens that thread (known ids only, a pinned thread still wins) and selecting a thread rewrites the URL", () => {
  const src = readFileSync(join(dir, "TalentJobShell.tsx"), "utf8");
  // deep link: the pin outranks the URL, and an unknown id falls through to the first thread
  assert.match(src, /consumePendingConversation\(\) \?\? fromUrl/);
  assert.match(src, /conversations\.some\(\(c\) => c\.id === pending\)/);
  assert.match(src, /setActiveId\(pending\);\s*setMobilePane\("thread"\)/);
  // switching: the list's onSelect sets the active id, and an effect keyed on it mirrors to the URL
  assert.match(src, /onSelect=\{\(id\) => \{ setActiveId\(id\)/);
  const mirror = src.slice(src.indexOf("mirror the open thread into the URL"));
  assert.match(mirror, /useEffect\([\s\S]*?\}, \[activeId\]\)/);
  // replaceState, not pushState: browsing threads must not fill the back stack
  assert.doesNotMatch(src, /history\.pushState/);
  // the inbox route itself stays a plain page (no redirect that would drop the query string)
  const page = readFileSync(join(process.cwd(), "src/app/(workspace)/talent/inbox/page.tsx"), "utf8");
  assert.doesNotMatch(page, /redirect\(/);
});

test("TUL-955 / TUL-1097: the Original request block is guarded by the brief, labelled in EN and ES, and leads BOTH the Client and Group tabs", () => {
  const src = readFileSync(join(dir, "talent-2.tsx"), "utf8");
  const def = src.slice(src.indexOf("const originalRequestBlock"));
  assert.match(def.slice(0, 80), /conv\.brief \? \(/, "guarded by the brief");
  assert.match(def.slice(0, 600), /data-original-inquiry/);
  assert.match(def.slice(0, 900), /conv\.brief\}/, "shows the brief text");
  for (const [tab, marker] of [["client", 'activeTab === "client" && isCoordinator'], ["group", 'activeTab === "group" && (']] as const) {
    const at = src.indexOf(marker, src.indexOf("TAB BAR"));
    assert.ok(at > -1, tab + " tab present");
    const body = src.slice(at, at + 400);
    const block = body.indexOf("{originalRequestBlock}");
    const convo = body.indexOf("<ConversationTab");
    assert.ok(block > -1 && convo > -1 && block < convo, tab + ": original request renders before the message list");
  }
  const label = { en: "Original request", es: "Solicitud original" } as const;
  for (const f of ["en", "es"] as const) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8"));
    assert.equal(m.dashboard.talentThread.originalRequest, label[f]);
  }
});
