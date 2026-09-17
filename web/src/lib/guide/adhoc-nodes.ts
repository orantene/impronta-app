/**
 * Support Guide P0 — nodes that describe the support drawer itself, not a
 * workspace page, so they don't belong in `DRAWER_HELP`
 * (help-registry.ts — keyed by DrawerId, scanned by help-corpus.ts for a
 * different purpose, the support chatbot's corpus).
 *
 * Single source of truth for both sides of the pipeline: the generation
 * script (scripts/guide/guide-registry.mjs) imports this file directly
 * (via the tsx loader) so it drafts the same facts the app's own
 * registry-fallback reads. They diverged once already — see the P0 PR
 * description — which is exactly the bug this file exists to prevent.
 */
import type { HelpEntry } from "@/components/admin/shell/internal/help-registry";

export const ADHOC_GUIDE_NODES: Record<string, HelpEntry> = {
  "support.live-chat": {
    audience: "Workspace admin",
    category: "Support",
    purpose: "Start live chat connects you to a real person on the Tulala team right now, not a bot.",
    youCanHere: [
      "Ask a question and get a reply from Oran or Vic, usually within minutes during the day",
      "Attach a screen recording of what went wrong if replay is enabled",
      "Fall back to a ticket automatically if nobody is online",
    ],
    relatedDrawers: [],
  },
  "support.start-ticket": {
    audience: "Workspace admin",
    category: "Support",
    purpose:
      "Start a ticket opens a written thread with Tulala support for something that isn't urgent enough for live chat, or happened outside working hours.",
    youCanHere: [
      "Describe what happened and pick a category",
      "Add a phone number if you want a callback instead of a written reply",
      "Get email notifications when support replies, with a link back into this thread",
    ],
    relatedDrawers: [],
  },
  "support.guide-tab": {
    audience: "Workspace admin",
    category: "Support",
    purpose:
      "The Guide tab is the built-in manual: short articles on what each part of Tulala is for and how to use it, in English and Spanish.",
    youCanHere: [
      "Search by typing a word and picking from the topics that match",
      "Open the topics listed under Start here, the most-read pages",
      "Turn on Helper mode with the target icon to see which parts of the current page have an article",
    ],
    relatedDrawers: [],
  },
};
