/**
 * The client every storefront core takes.
 *
 * Duck-typed on purpose, the same way `lib/pos/sale-rows.ts` and
 * `lib/commands/run.ts` type theirs: the seams are unit-tested against an
 * in-memory PostgREST (`__fixtures__/fake-admin.ts`), and the generated
 * `database.types.ts` lags the newest tables anyway. The `.server.ts` files
 * pass the real service-role client, which satisfies this shape.
 */
export type StorefrontAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (name: string, args?: Record<string, unknown>) => any;
};
