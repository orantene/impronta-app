# A6 — Private notes not on customer self-read

## Defect

#16 — `customers_self_select` RLS lets a signed-in customer read their own row,
and the default table GRANT exposed every column including `notes`.

## Fix

Migration `20261231285000_customers_notes_column_privilege.sql`:
- `REVOKE SELECT ON public.customers FROM authenticated`
- `GRANT SELECT (…all columns except notes…)` to authenticated
- Same pattern as `talent_reviews.private_note` privilege hotfix

Staff/talent note reads already use service role (`projects-reader.ts` etc.).

## Proof

```sql
-- As authenticated (customer JWT), selecting notes must fail:
SELECT notes FROM public.customers WHERE user_id = auth.uid();
-- expected: permission denied for column notes

-- Selecting non-notes columns still works under customers_self_select:
SELECT id, display_name, email FROM public.customers WHERE user_id = auth.uid();
```

Unit: `web/src/lib/customers/a6-notes-privacy.static.test.ts`

## db:push

Required before merge (additive privilege change).
