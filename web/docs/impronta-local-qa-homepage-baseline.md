# Impronta local QA — homepage baseline / reset

**Audience:** Engineers running human QA on `http://localhost:3000/impronta?edit=1` (see [builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md)).

**Problem:** Repeated insert/reorder tests accumulate **duplicate sections** and noisy draft rows. The canvas looks “test-contaminated” even when the product path is healthy.

**Principle:** Edit mode is **draft-first**. If **any** `cms_page_sections` rows exist with `is_draft = true` for the homepage, those rows define the builder + preview. If **no** draft rows exist, the loader falls back to **live** (`is_draft = false`) composition ([`loadHomepageCompositionAction`](../src/lib/site-admin/edit-mode/composition-actions.ts), [`loadDraftHomepage`](../src/lib/site-admin/server/homepage-reads.ts)).

---

## 1. Inspect (read-only)

Run in Supabase SQL editor (or `psql`) against your **local/dev** project. Tenant #1 (Impronta) id:

`00000000-0000-0000-0000-000000000001`

```sql
-- Homepage row (en)
SELECT id, locale, slug, title, version, status
FROM public.cms_pages
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND system_template_key = 'homepage'
  AND locale = 'en';

-- How many draft vs live junction rows?
SELECT is_draft, COUNT(*) AS n
FROM public.cms_page_sections cps
JOIN public.cms_pages p ON p.id = cps.page_id
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.system_template_key = 'homepage'
  AND p.locale = 'en'
GROUP BY is_draft;

-- Section instances referenced from the homepage (draft side)
SELECT cps.slot_key, cps.sort_order, cps.is_draft,
       s.section_type_key, s.name
FROM public.cms_page_sections cps
JOIN public.cms_sections s ON s.id = cps.section_id
JOIN public.cms_pages p ON p.id = cps.page_id
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.system_template_key = 'homepage'
  AND p.locale = 'en'
  AND cps.is_draft = true
ORDER BY cps.slot_key, cps.sort_order;
```

---

## 2. Reset builder to **published** composition (discard homepage draft)

This **deletes only draft junction rows** for the English homepage. It does **not** delete `cms_sections` rows and does **not** change the published snapshot. Afterward, the editor loads the **live** slot list until someone saves draft again.

**Use when:** duplicate sections came from unsaved / draft churn and you want the builder to match what was last published.

Preferred repo command:

```bash
cd web
npm run reset:impronta-homepage -- --help   # flag reference
npm run reset:impronta-homepage:draft        # dry-run
npm run reset:impronta-homepage:draft -- --apply
```

```sql
BEGIN;

DELETE FROM public.cms_page_sections cps
USING public.cms_pages p
WHERE p.id = cps.page_id
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.system_template_key = 'homepage'
  AND p.locale = 'en'
  AND cps.is_draft = true;

COMMIT;
```

Then reload `http://localhost:3000/impronta?edit=1` with a hard refresh.

**Caveat:** If duplicates were **published** (`is_draft = false`), they remain until you remove sections through the builder or run a **destructive** live-composition edit—do not batch-delete live rows without understanding tenant impact.

The older `npm run reset:impronta-homepage -- --apply --purge-cleared-sections` path is intentionally more destructive: it clears the homepage composition to an empty published snapshot. Use that only for the blank-canvas e2e scenario, not for normal human QA cleanup.

---

## 3. Curated clean slate (product path)

Prefer **in-builder** deletes for published duplicates when possible so `cms_sections` instances and junction rows stay consistent with app invariants.

---

## 4. Related seeds / fixtures

- Broader CMS fixtures (another tenant id): [`supabase/seed_phase5_qa.sql`](../../supabase/seed_phase5_qa.sql)
- Edit-mode section audit page: [`supabase/seed_phase_e_edit_qa.sql`](../../supabase/seed_phase_e_edit_qa.sql)

These are **not** Impronta tenant `#1` by default—use the inspect queries above before assuming IDs.
