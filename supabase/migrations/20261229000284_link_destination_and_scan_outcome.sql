-- QR & Links — two CEO rulings from the 2026-09-05 production guest QA.
--
-- RULING 1 — A DEAD DESTINATION IS CAUGHT AT SAVE, NEVER AT SCAN.
-- Production QA pointed a code at a path the tenant does not have. The
-- resolver did its job perfectly and delivered the guest to a 404. Nothing
-- validated the destination anywhere, and that is worse than a broken code
-- BECAUSE THE CODE WORKS: an operator testing "does the QR scan" passes, and
-- only a guest standing at a table ever finds out.
--
-- Validation is at save and it is advisory, not a refusal. A destination that
-- matches a published page slug, a known public route, or an absolute URL
-- saves silently. Anything else still saves — after an explicit confirmation —
-- and is FLAGGED here so the operator's own list can show it. We do not probe
-- paths: a probe would refuse valid dynamic routes, which is a worse failure
-- than the one it prevents.
--
-- RULING 2 — A REFUSAL IS A SCAN.
-- A paused link recorded nothing, so an operator could not learn that people
-- are still scanning a code they retired — which is exactly when a table tent
-- is still sitting on a table. `outcome` distinguishes what the guest actually
-- got from what the link was for.
--
-- 'resolved' is the default so every existing row keeps its meaning: every
-- scan recorded before this migration was, by construction, a resolved one.
--
-- NOTE ON WHAT IS DELIBERATELY ABSENT: there is no 'unknown' outcome here.
-- A code that does not exist has no link to attach a scan to (`link_id` is NOT
-- NULL), and recording one would mean an unauthenticated, attacker-controlled
-- INSERT. See the note to the CEO; that half needs a different mechanism than
-- a row per scan.
--
-- Rollback:
--   ALTER TABLE public.links DROP COLUMN destination_unverified;
--   ALTER TABLE public.link_scans DROP COLUMN outcome;
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

ALTER TABLE public.links
  ADD COLUMN IF NOT EXISTS destination_unverified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.links.destination_unverified IS
  'True when the operator saved a destination that matched no published page '
  'slug and no known public route, and confirmed it anyway. Advisory: the link '
  'works. It exists so the links list can show which printed codes may point '
  'at nothing.';

ALTER TABLE public.link_scans
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'resolved';

DO $$
BEGIN
  ALTER TABLE public.link_scans
    ADD CONSTRAINT link_scans_outcome_valid CHECK (outcome IN ('resolved', 'paused'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.link_scans.outcome IS
  'What the guest actually got. resolved = redirected to a destination. '
  'paused = the link exists but is paused, so they saw the refusal. A refusal '
  'IS a scan: an operator needs to know a retired tent is still on a table.';

-- The links list asks "how many paused-scans has this code had", which is a
-- filtered count per link.
CREATE INDEX IF NOT EXISTS link_scans_link_outcome_idx
  ON public.link_scans (link_id, outcome);
