import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Talent-scope guard — the `tenantScopedQuery` twin for rows owned by a talent
 * personal site (Posts v1: `cms_posts`, `cms_post_categories`, `cms_redirects`
 * carry `talent_profile_id` with `tenant_id IS NULL`).
 *
 *   - select / update / delete → `.eq("talent_profile_id", id).is("tenant_id", null)`
 *   - insert                   → `talent_profile_id` forced, `tenant_id` forced NULL
 *
 * The `tenant_id IS NULL` half matters: a talent who once wrote under a
 * workspace tenant must never reach those rows through the talent scope.
 */

const TALENT_COLUMN = "talent_profile_id";
const TENANT_COLUMN = "tenant_id";

type FromBuilder = ReturnType<SupabaseClient["from"]>;
type SelectArgs = Parameters<FromBuilder["select"]>;
type UpdateArgs = Parameters<FromBuilder["update"]>;
type DeleteArgs = Parameters<FromBuilder["delete"]>;
type InsertArgs = Parameters<FromBuilder["insert"]>;
type SelectBuilder = ReturnType<FromBuilder["select"]>;
type UpdateBuilder = ReturnType<FromBuilder["update"]>;
type DeleteBuilder = ReturnType<FromBuilder["delete"]>;
type InsertBuilder = ReturnType<FromBuilder["insert"]>;
type WriteRow = Record<string, unknown>;

export interface TalentScopedQuery {
  select(...args: SelectArgs): SelectBuilder;
  update(...args: UpdateArgs): UpdateBuilder;
  delete(...args: DeleteArgs): DeleteBuilder;
  insert(values: WriteRow | WriteRow[], options?: InsertArgs[1]): InsertBuilder;
}

function withTalent(values: WriteRow | WriteRow[], talentProfileId: string): WriteRow | WriteRow[] {
  const scope = { [TALENT_COLUMN]: talentProfileId, [TENANT_COLUMN]: null };
  return Array.isArray(values) ? values.map((row) => ({ ...row, ...scope })) : { ...values, ...scope };
}

export function talentScopedQuery(
  supabase: SupabaseClient,
  table: string,
  talentProfileId: string,
): TalentScopedQuery {
  return {
    select(...args: SelectArgs): SelectBuilder {
      const [columns, options] = args;
      return supabase
        .from(table)
        .select(columns as string, options)
        .eq(TALENT_COLUMN, talentProfileId)
        .is(TENANT_COLUMN, null) as SelectBuilder;
    },
    update(...args: UpdateArgs): UpdateBuilder {
      const [values, options] = args;
      return supabase
        .from(table)
        .update(values, options)
        .eq(TALENT_COLUMN, talentProfileId)
        .is(TENANT_COLUMN, null) as UpdateBuilder;
    },
    delete(...args: DeleteArgs): DeleteBuilder {
      const [options] = args;
      return supabase
        .from(table)
        .delete(options)
        .eq(TALENT_COLUMN, talentProfileId)
        .is(TENANT_COLUMN, null) as DeleteBuilder;
    },
    insert(values: WriteRow | WriteRow[], options?: InsertArgs[1]): InsertBuilder {
      return supabase
        .from(table)
        .insert(withTalent(values, talentProfileId) as unknown as InsertArgs[0], options) as InsertBuilder;
    },
  };
}
