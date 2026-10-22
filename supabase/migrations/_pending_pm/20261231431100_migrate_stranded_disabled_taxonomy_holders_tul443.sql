-- TUL-443 (follow-up to 20261231400200): migrate STRANDED talents to the nearest
-- ACTIVE service type. HELD in _pending_pm: NOT applied. Prod run needs Oran's GO and
-- a prod run of `node --env-file=.env.local scripts/report-disabled-taxonomy-holders.mjs`.
--
-- Decision (Oran): a stranded talent (every service type they hold is switched off
-- for the switching workspace) moves to the nearest active type; the old types then
-- stay hidden from pickers. Talents with at least one enabled type are NOT touched here
-- (400200 already dropped their orphan rows).
--
-- Shape of the change, in order:
--   1. pmm_backup.tul443_backup (full copy of every row about to change, plus the target).
--   2. only STRANDED rows change: row.taxonomy_term_id is swapped to the mapped term in
--      place (keeps is_primary, relationship_type, display_order, proficiency, so the
--      one-primary unique index is never violated). If the talent already holds the target
--      (two disabled types mapping to one target) the duplicate row is removed and the
--      primary flag moves to the held row.
--   3. rows whose disabled term has NO mapping stay untouched and are listed by NOTICE.
-- Scope matches 400200: workspace-owned rows (tenant_id = switching tenant, or legacy NULL)
-- of ACTIVE roster members of the switching tenant.
--
-- MAPPING (disabled slug -> nearest active slug), derived from the taxonomy tree
-- (parent / grandparent categories read from staging 2026-10-22). confidence:
--   exact    same trade, same parent family, or true synonym
--   close    same trade in a neighbouring family
--   category same broad category, weaker fit. Strip these rows from the VALUES list
--            if you want exact/close only; the talent then stays untouched and listed.
-- Left UNMAPPED on purpose (no honest active equivalent exists; NOTICE lists any holder):
--   jewelry-* / watch-repair, software-developer, app-developer, seo-specialist,
--   web-designer, ux-designer, industrial-designer, dentist family, home-doctor, home-nurse,
--   optometrist, speech/occupational therapist, podiatrist, home-vet, pet walking/sitting/
--   daycare, finance-tax family, legal-services family, paperwork-permits family,
--   real-estate-services family, vehicle-care family, virtual-assistant, automation-consultant,
--   social-media-manager, recruiter, proofreader, transcriptionist, translator, interpreter,
--   ceramist, tattoo-artist, piercer.
--
-- ROLLBACK (run by hand, in this order; the backup table holds old and new term ids):
--   -- 1. put swapped rows back:
--   --   UPDATE public.talent_profile_taxonomy t
--   --      SET taxonomy_term_id = b.taxonomy_term_id
--   --     FROM pmm_backup.tul443_backup b
--   --    WHERE b.action = 'swapped'
--   --      AND t.talent_profile_id = b.talent_profile_id
--   --      AND t.taxonomy_term_id = b.new_term_id;
--   -- 2. re-insert rows that were merged into an already-held target:
--   --   INSERT INTO public.talent_profile_taxonomy
--   --     (talent_profile_id, taxonomy_term_id, is_primary, relationship_type, display_order,
--   --      tenant_id, created_at, updated_at, proficiency_level, years_experience, verified_at,
--   --      verified_by_user_id, verified_by_tenant_id, verification_note)
--   --   SELECT talent_profile_id, taxonomy_term_id, false, relationship_type, display_order,
--   --          tenant_id, created_at, updated_at, proficiency_level, years_experience, verified_at,
--   --          verified_by_user_id, verified_by_tenant_id, verification_note
--   --     FROM pmm_backup.tul443_backup WHERE action = 'merged'
--   --   ON CONFLICT DO NOTHING;
--   --   (then, for backup rows with is_primary, set the primary back by hand if needed.)

CREATE SCHEMA IF NOT EXISTS pmm_backup;

CREATE TABLE IF NOT EXISTS pmm_backup.tul443_backup (
  LIKE public.talent_profile_taxonomy,
  ws_tenant_id uuid,
  new_term_id uuid,
  action text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  r RECORD;
  swapped int := 0;
  merged int := 0;
  unmapped int := 0;
BEGIN
  CREATE TEMP TABLE tul443_map (old_slug text, new_slug text, confidence text, reason text) ON COMMIT DROP;
  INSERT INTO tul443_map (old_slug, new_slug, confidence, reason) VALUES
    -- crafts-makers
    ('leatherworker','tailor','category','soft goods / sewing trade'),
    ('embroidery-artist','tailor','close','textile craft'),
    ('calligrapher','art-instructor','category','art teaching is the only active art type'),
    ('woodworker','carpenter','close','same trade'),
    ('seamstress','tailor','exact','synonym'),
    ('upholsterer','carpenter','category','furniture / woodwork adjacent'),
    ('shoe-repair','tailor','category','repair of sewn goods'),
    ('furniture-restorer','carpenter','close','furniture woodwork'),
    -- design-digital
    ('architect','interior-decorator','category','built-space design'),
    ('interior-designer','interior-decorator','close','same trade'),
    ('graphic-designer','art-director','category','visual design'),
    ('illustrator','art-director','category','visual design'),
    ('mural-artist','set-designer','category','large-scale painted / built scenery'),
    ('brand-designer','art-director','close','brand visuals'),
    ('3d-designer','motion-graphics-artist','close','3D / motion content'),
    -- education-tutoring
    ('math-tutor','workshop-facilitator','category','teaching'),
    ('science-tutor','workshop-facilitator','category','teaching'),
    ('exam-prep-tutor','workshop-facilitator','category','teaching'),
    ('school-tutor','workshop-facilitator','category','teaching'),
    ('special-education-tutor','workshop-facilitator','category','teaching'),
    ('driving-instructor','private-driver','category','driving'),
    ('music-teacher','art-instructor','category','arts teaching'),
    ('guitar-teacher','art-instructor','category','arts teaching'),
    ('piano-teacher','art-instructor','category','arts teaching'),
    ('voice-teacher','art-instructor','category','arts teaching'),
    ('writing-coach','career-coach','category','coaching'),
    ('coding-tutor','corporate-trainer','category','technical training'),
    ('computer-classes','corporate-trainer','category','technical training'),
    -- health-therapy
    ('doula','holistic-therapist','category','care / holistic wellbeing'),
    ('lactation-consultant','holistic-therapist','category','care / holistic wellbeing'),
    ('psychologist','life-coach','category','mental wellbeing'),
    ('couples-therapist','life-coach','category','relationship wellbeing'),
    ('elder-caregiver','family-assistant','category','household care'),
    ('nutritionist','nutrition-coach','close','same field'),
    ('physiotherapist','massage-therapist','category','manual therapy'),
    ('chiropractor','massage-therapist','category','manual therapy'),
    -- home-technical-services
    ('pest-control','general-maintenance-technician','category','property upkeep'),
    ('solar-installer','electrician','close','electrical install'),
    ('computer-technician','wifi-technician','close','IT / network tech'),
    ('it-support','wifi-technician','close','IT / network tech'),
    ('phone-repair','appliance-repair','category','device repair'),
    -- music-djs
    ('music-producer','sound-technician','close','audio'),
    ('sound-designer','sound-technician','close','audio'),
    ('mixing-engineer','sound-technician','close','audio'),
    -- pets-animal-care
    ('equine-care','animal-handler','category','animals'),
    ('dog-groomer','animal-handler','category','animals'),
    ('dog-trainer','animal-handler','close','animal training'),
    -- production-bts
    ('wedding-planner','event-coordinator','close','event planning'),
    ('event-planner','event-coordinator','exact','synonym'),
    ('kids-party-planner','event-coordinator','close','event planning'),
    ('wedding-officiant','wedding-host','category','ceremony host'),
    -- professional-services
    ('project-manager','production-manager','close','project management'),
    ('marketing-consultant','business-coach','category','business advice'),
    ('copywriter','content-creator','category','content'),
    ('content-writer','content-creator','category','content'),
    -- sports-fitness
    ('scuba-instructor','diving-instructor','exact','same parent, synonym'),
    ('fishing-guide','adventure-guide','close','guided outdoor activity'),
    -- travel-concierge
    ('personal-shopper','personal-concierge','close','same parent'),
    -- wellness-beauty
    ('barber','hair-stylist','close','same parent, hair'),
    ('esthetician','skincare-specialist','exact','synonym'),
    ('permanent-makeup-artist','makeup-artist','close','same parent, makeup');

  -- (a) STRANDED rows with a usable target, computed once, before any change.
  CREATE TEMP TABLE tul443_work ON COMMIT DROP AS
  SELECT tpt.talent_profile_id,
         tpt.taxonomy_term_id AS old_term_id,
         nt.id                AS new_term_id,
         s.tenant_id          AS ws_tenant_id
    FROM public.talent_profile_taxonomy tpt
    JOIN public.agency_taxonomy_settings s
      ON s.taxonomy_term_id = tpt.taxonomy_term_id AND s.is_enabled = false
    JOIN public.agency_talent_roster ro
      ON ro.tenant_id = s.tenant_id AND ro.talent_profile_id = tpt.talent_profile_id AND ro.status = 'active'
    JOIN public.taxonomy_terms ot ON ot.id = tpt.taxonomy_term_id
    JOIN tul443_map m ON m.old_slug = ot.slug
    JOIN public.taxonomy_terms nt ON nt.slug = m.new_slug AND nt.kind = ot.kind AND nt.archived_at IS NULL
   WHERE (tpt.tenant_id = s.tenant_id OR tpt.tenant_id IS NULL)
     AND NOT EXISTS (  -- STRANDED: no held term is enabled for this workspace
       SELECT 1 FROM public.talent_profile_taxonomy o
        WHERE o.talent_profile_id = tpt.talent_profile_id
          AND NOT EXISTS (
            SELECT 1 FROM public.agency_taxonomy_settings x
             WHERE x.tenant_id = s.tenant_id AND x.taxonomy_term_id = o.taxonomy_term_id AND x.is_enabled = false))
     AND NOT EXISTS (  -- target must itself be active for this workspace
       SELECT 1 FROM public.agency_taxonomy_settings y
        WHERE y.tenant_id = s.tenant_id AND y.taxonomy_term_id = nt.id AND y.is_enabled = false);

  -- (b) BACKUP FIRST: nothing below runs unless this insert succeeded.
  INSERT INTO pmm_backup.tul443_backup
    (talent_profile_id, taxonomy_term_id, is_primary, relationship_type, display_order, tenant_id,
     created_at, updated_at, proficiency_level, years_experience, verified_at, verified_by_user_id,
     verified_by_tenant_id, verification_note, ws_tenant_id, new_term_id, action)
  SELECT t.talent_profile_id, t.taxonomy_term_id, t.is_primary, t.relationship_type, t.display_order, t.tenant_id,
         t.created_at, t.updated_at, t.proficiency_level, t.years_experience, t.verified_at, t.verified_by_user_id,
         t.verified_by_tenant_id, t.verification_note, w.ws_tenant_id, w.new_term_id,
         CASE WHEN EXISTS (SELECT 1 FROM public.talent_profile_taxonomy h
                            WHERE h.talent_profile_id = w.talent_profile_id AND h.taxonomy_term_id = w.new_term_id)
              THEN 'merged' ELSE 'swapped' END
    FROM tul443_work w
    JOIN public.talent_profile_taxonomy t
      ON t.talent_profile_id = w.talent_profile_id AND t.taxonomy_term_id = w.old_term_id;

  -- (c) apply, stranded rows only.
  FOR r IN SELECT * FROM tul443_work ORDER BY talent_profile_id, old_term_id LOOP
    IF EXISTS (SELECT 1 FROM public.talent_profile_taxonomy h
                WHERE h.talent_profile_id = r.talent_profile_id AND h.taxonomy_term_id = r.new_term_id) THEN
      -- target already held: drop the disabled row, carry the primary flag over.
      DECLARE was_primary boolean; BEGIN
        SELECT is_primary INTO was_primary FROM public.talent_profile_taxonomy
         WHERE talent_profile_id = r.talent_profile_id AND taxonomy_term_id = r.old_term_id;
        DELETE FROM public.talent_profile_taxonomy
         WHERE talent_profile_id = r.talent_profile_id AND taxonomy_term_id = r.old_term_id;
        IF was_primary THEN
          UPDATE public.talent_profile_taxonomy SET is_primary = true
           WHERE talent_profile_id = r.talent_profile_id AND taxonomy_term_id = r.new_term_id
             AND NOT EXISTS (SELECT 1 FROM public.talent_profile_taxonomy q
                              WHERE q.talent_profile_id = r.talent_profile_id AND q.is_primary);
        END IF;
      END;
      UPDATE pmm_backup.tul443_backup SET action = 'merged'
       WHERE talent_profile_id = r.talent_profile_id AND taxonomy_term_id = r.old_term_id;
      merged := merged + 1;
    ELSE
      UPDATE public.talent_profile_taxonomy
         SET taxonomy_term_id = r.new_term_id
       WHERE talent_profile_id = r.talent_profile_id AND taxonomy_term_id = r.old_term_id;
      swapped := swapped + 1;
    END IF;
  END LOOP;

  -- (d) stranded rows with no mapping stay put.
  SELECT count(*) INTO unmapped
    FROM public.talent_profile_taxonomy tpt
    JOIN public.agency_taxonomy_settings s
      ON s.taxonomy_term_id = tpt.taxonomy_term_id AND s.is_enabled = false
    JOIN public.agency_talent_roster ro
      ON ro.tenant_id = s.tenant_id AND ro.talent_profile_id = tpt.talent_profile_id AND ro.status = 'active'
   WHERE (tpt.tenant_id = s.tenant_id OR tpt.tenant_id IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.talent_profile_taxonomy o
        WHERE o.talent_profile_id = tpt.talent_profile_id
          AND NOT EXISTS (
            SELECT 1 FROM public.agency_taxonomy_settings x
             WHERE x.tenant_id = s.tenant_id AND x.taxonomy_term_id = o.taxonomy_term_id AND x.is_enabled = false));

  RAISE NOTICE 'TUL-443: % row(s) swapped to the nearest active type, % merged into an already-held target, % stranded row(s) left (no mapping)', swapped, merged, unmapped;
END $$;
