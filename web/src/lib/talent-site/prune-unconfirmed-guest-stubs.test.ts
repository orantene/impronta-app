import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  isConfirmedChannelHref,
  isUnconfirmedStubCopy,
  pruneUnconfirmedGuestStubs,
} from "./prune-unconfirmed-guest-stubs";

function para(id: string, text: string): BuilderNode {
  return { id, kind: "paragraph", props: { text } } as BuilderNode;
}

function btn(
  id: string,
  opts: { label: string; href: string; leadingIcon?: string },
): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label: opts.label,
      href: opts.href,
      ...(opts.leadingIcon ? { leadingIcon: opts.leadingIcon } : {}),
    },
  } as BuilderNode;
}

test("isUnconfirmedStubCopy matches ES + EN Oran placeholders", () => {
  assert.equal(
    isUnconfirmedStubCopy(
      "Ejemplo: falta confirmar el WhatsApp, el correo y las cuentas de Jorgelina.",
    ),
    true,
  );
  assert.equal(
    isUnconfirmedStubCopy(
      "Imágenes de referencia del estilo de trabajo, generadas para este prototipo. No son fotografías de clientas de Jorg Beauty.",
    ),
    true,
  );
  assert.equal(
    isUnconfirmedStubCopy(
      "Example: her WhatsApp, email and accounts still need confirming.",
    ),
    true,
  );
  assert.equal(isUnconfirmedStubCopy("Trabajos recientes de clientas."), false);
  assert.equal(isUnconfirmedStubCopy(null), false);
});

test("isConfirmedChannelHref accepts real channels only", () => {
  assert.equal(isConfirmedChannelHref("https://wa.me/5219845550147", "whatsapp"), true);
  assert.equal(
    isConfirmedChannelHref("https://instagram.com/jorgbeauty", "instagram"),
    true,
  );
  assert.equal(isConfirmedChannelHref("mailto:hola@jorgbeauty.mx", "email"), true);
  assert.equal(
    isConfirmedChannelHref(
      "https://tulala.digital/t/TAL-93938#servicios",
      "whatsapp",
    ),
    false,
  );
  assert.equal(isConfirmedChannelHref("#", "instagram"), false);
});

test("pruneUnconfirmedGuestStubs hides disclaimer + stub socials; keeps real WA", () => {
  const tree: BuilderNode[] = [
    {
      id: "gallery",
      kind: "container",
      props: { layout: "stack" },
      children: [
        para(
          "mn-8h",
          "Imágenes de referencia del estilo de trabajo, generadas para este prototipo. No son fotografías de clientas de Jorg Beauty.",
        ),
        para("keep-gallery", "Más trabajos pronto."),
      ],
    } as BuilderNode,
    {
      id: "social",
      kind: "container",
      props: { layout: "row" },
      children: [
        btn("wa-stub", {
          label: "WhatsApp",
          href: "https://tulala.digital/t/TAL-93938#servicios",
          leadingIcon: "whatsapp",
        }),
        btn("ig-stub", {
          label: "@jorgbeauty",
          href: "https://tulala.digital/t/TAL-93938#servicios",
          leadingIcon: "instagram",
        }),
        btn("wa-real", {
          label: "WhatsApp",
          href: "https://wa.me/5219845550147",
          leadingIcon: "whatsapp",
        }),
        para(
          "mn-b4",
          "Ejemplo: falta confirmar el WhatsApp, el correo y las cuentas de Jorgelina. Los enlaces están desactivados hasta entonces.",
        ),
      ],
    } as BuilderNode,
  ];

  const pruned = pruneUnconfirmedGuestStubs(tree);
  const galleryKids = (pruned[0] as { children: BuilderNode[] }).children;
  assert.deepEqual(
    galleryKids.map((n) => n.id),
    ["keep-gallery"],
  );

  const socialKids = (pruned[1] as { children: BuilderNode[] }).children;
  assert.deepEqual(
    socialKids.map((n) => n.id),
    ["wa-real"],
  );
});
