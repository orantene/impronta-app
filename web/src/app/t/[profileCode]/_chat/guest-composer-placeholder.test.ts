/**
 * C13-1 / WO-C13-HABLAR-2 — offer posture keeps brief phrase.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { guestComposerPlaceholder } from "./guest-composer-placeholder";

const t = (key: string) => key;

test("front-door empty keeps composerPhrase", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: true,
      agencyPublicSurface: false,
      inquiryId: null,
      offerPreview: false,
      threadStatus: "open",
    }),
    "public.guestChat.composerPhrase",
  );
});

test("offer preview with invented inquiryId keeps composerPhrase", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: true,
      agencyPublicSurface: false,
      inquiryId: "preview-offer",
      offerPreview: true,
      threadStatus: "open",
    }),
    "public.guestChat.composerPhrase",
  );
});

test("live offer_pending with inquiryId keeps composerPhrase", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: true,
      agencyPublicSurface: false,
      inquiryId: "real-id",
      offerPreview: false,
      threadStatus: "offer_pending",
    }),
    "public.guestChat.composerPhrase",
  );
});

test("agency front-door offer uses agency phrase", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: true,
      agencyPublicSurface: true,
      inquiryId: "preview-offer",
      offerPreview: true,
      threadStatus: "open",
    }),
    "public.guestChat.composerPhraseAgency",
  );
});

test("front-door open thread without offer uses composerReply", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: true,
      agencyPublicSurface: false,
      inquiryId: "real-id",
      offerPreview: false,
      threadStatus: "open",
    }),
    "public.guestChat.composerReply",
  );
});

test("non front-door empty uses composerFirst", () => {
  assert.equal(
    guestComposerPlaceholder(t, {
      frontDoorChrome: false,
      agencyPublicSurface: false,
      inquiryId: null,
      offerPreview: false,
      threadStatus: "open",
    }),
    "public.guestChat.composerFirst",
  );
});
