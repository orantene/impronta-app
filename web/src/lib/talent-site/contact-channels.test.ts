import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  CONTACT_COPY,
  CONTACT_LAYER,
  TALENT_ASK_HREF,
  contactChannelButtons,
  contactCopyForPlan,
  pruneEmptyContactChannels,
  talentContactHrefs,
  talentOffersInstantBooking,
} from "./contact-channels";

test("contact channels are Ask, then WhatsApp, then email", () => {
  let n = 0;
  const buttons = contactChannelButtons(() => `c-${++n}`);
  assert.deepEqual(
    buttons.map((node) => (node.props as { layerLabel: string }).layerLabel),
    [CONTACT_LAYER.ask, CONTACT_LAYER.whatsapp, CONTACT_LAYER.email],
  );
  assert.equal((buttons[0]!.props as { href: string }).href, TALENT_ASK_HREF);
  assert.equal((buttons[1]!.props as { href: string }).href, "{{whatsappHref}}");
  assert.equal((buttons[2]!.props as { href: string }).href, "{{emailHref}}");
});

test("empty WhatsApp and email buttons drop; a hidden one stays", () => {
  const tree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        ...contactChannelButtons(() => "x"),
      ],
    },
  ] as unknown as BuilderNode[];
  const ask = tree[0]!;
  const children = (ask as { children: BuilderNode[] }).children;
  (children[1]!.props as { href: string }).href = "";
  (children[2]!.props as { href: string; style: { visibility: string } }).href = "";
  (children[2]!.props as { style: { visibility: string } }).style = { visibility: "hidden" };

  const pruned = pruneEmptyContactChannels(tree);
  const left = (pruned[0] as { children: BuilderNode[] }).children;
  const labels = left.map((node) => (node.props as { layerLabel: string }).layerLabel);
  assert.deepEqual(labels, [CONTACT_LAYER.ask, CONTACT_LAYER.email]);
});

test("a free plan confirms by hand and Portfolio can book a time", () => {
  assert.equal(talentOffersInstantBooking("talent_basic"), false);
  assert.equal(talentOffersInstantBooking("talent_pro"), false);
  assert.equal(talentOffersInstantBooking(null), false);
  assert.equal(talentOffersInstantBooking("talent_portfolio"), true);
  assert.equal(contactCopyForPlan("talent_basic"), CONTACT_COPY.confirmByHand);
  assert.equal(contactCopyForPlan("talent_portfolio"), CONTACT_COPY.bookInstant);
});

test("WhatsApp uses her number or a published link; email is a mailto only", () => {
  assert.deepEqual(talentContactHrefs({ phone: "+52 998 111 2233" }), {
    whatsappHref: "https://wa.me/529981112233",
    emailHref: "",
  });
  assert.equal(
    talentContactHrefs({
      socialLinks: [{ href: "shell://whatsapp/5219980001111" }],
    }).whatsappHref,
    "https://wa.me/5219980001111",
  );
  assert.equal(
    talentContactHrefs({
      socialLinks: [{ href: "mailto:studio@example.com" }],
    }).emailHref,
    "mailto:studio@example.com",
  );
  assert.equal(talentContactHrefs({ phone: "123" }).whatsappHref, "");
});

test("the guest dock opens in place for an ask, without a pending service", () => {
  const launcher = readFileSync(
    new URL("../../app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx", import.meta.url),
    "utf8",
  );
  assert.match(launcher, /tulala:open-guest-chat/);
  assert.match(launcher, /setPendingOffering\(null\)/);
});

test("contact copy is in EN, ES, and FR", () => {
  const root = new URL("../../../messages/", import.meta.url);
  const en = readFileSync(new URL("en.json", root), "utf8");
  const es = readFileSync(new URL("es.json", root), "utf8");
  const fr = readFileSync(new URL("fr.json", root), "utf8");
  assert.match(en, /She confirms by hand\./);
  assert.match(es, /Ella confirma a mano\./);
  assert.match(fr, /Elle confirme à la main\./);
  assert.match(en, /Ask a question/);
  assert.match(es, /Hacer una pregunta/);
  assert.match(fr, /Poser une question/);
});
