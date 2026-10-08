// Script-only stand-in: outside a request there is no user session; the
// loaders fall back to the service-role client, which is what they use anyway.
export async function createClient(): Promise<never> {
  return {} as never;
}
