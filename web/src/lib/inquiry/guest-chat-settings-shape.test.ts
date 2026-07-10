/**
 * UNIT TEST — guest-chat-settings-shape.ts (message-panel wave W2-C).
 *
 * Pins the row→settings mapper, with focus on the NEW `show_on_home` flag and
 * the defaults-ON / fail-open contract shared by every surface flag:
 *   (a) missing row → all-on default (showOnHome: true)
 *   (b) show_on_home only opts out on an explicit `false`; null/undefined → on
 *   (c) each surface flag is independent (home off does not touch directory)
 *   (d) greeting is trimmed to null when blank
 *
 * Run: npx tsx --test src/lib/inquiry/guest-chat-settings-shape.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  GUEST_CHAT_DEFAULTS,
  mapGuestChatSettingsRow,
} from "./guest-chat-settings-shape";

describe("mapGuestChatSettingsRow — show_on_home", () => {
  it("defaults showOnHome ON when there is no row (fail-open)", () => {
    assert.equal(GUEST_CHAT_DEFAULTS.showOnHome, true);
    assert.deepEqual(mapGuestChatSettingsRow(null), GUEST_CHAT_DEFAULTS);
    assert.deepEqual(mapGuestChatSettingsRow(undefined), GUEST_CHAT_DEFAULTS);
  });

  it("keeps showOnHome ON when the flag is null/undefined on an existing row", () => {
    assert.equal(mapGuestChatSettingsRow({}).showOnHome, true);
    assert.equal(
      mapGuestChatSettingsRow({ show_on_home: null }).showOnHome,
      true,
    );
    assert.equal(
      mapGuestChatSettingsRow({ show_on_home: undefined }).showOnHome,
      true,
    );
  });

  it("opts showOnHome OUT only on an explicit false", () => {
    assert.equal(
      mapGuestChatSettingsRow({ show_on_home: false }).showOnHome,
      false,
    );
    assert.equal(
      mapGuestChatSettingsRow({ show_on_home: true }).showOnHome,
      true,
    );
  });

  it("treats each surface flag independently (home off ≠ directory off)", () => {
    const s = mapGuestChatSettingsRow({
      show_on_home: false,
      show_on_directory: true,
      show_on_talent: true,
    });
    assert.equal(s.showOnHome, false);
    assert.equal(s.showOnDirectory, true);
    assert.equal(s.showOnTalent, true);
    assert.equal(s.enabled, true);
  });

  it("still maps the pre-existing flags + greeting correctly", () => {
    const s = mapGuestChatSettingsRow({
      enabled: false,
      show_on_talent: false,
      show_on_directory: false,
      show_on_home: false,
      greeting: "  Hi there  ",
    });
    assert.deepEqual(s, {
      enabled: false,
      showOnTalent: false,
      showOnDirectory: false,
      showOnHome: false,
      greeting: "Hi there",
    });
  });

  it("trims a blank greeting to null", () => {
    assert.equal(mapGuestChatSettingsRow({ greeting: "   " }).greeting, null);
    assert.equal(mapGuestChatSettingsRow({ greeting: "" }).greeting, null);
  });
});
