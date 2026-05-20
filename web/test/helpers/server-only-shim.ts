// Empty shim for the `server-only` package. Next.js uses this as a
// compile-time barrier (importing it from a client bundle throws at
// build time). In tests we're explicitly outside the Next compile
// pipeline, so the import is a no-op — but the module still has to
// resolve. Aliasing `server-only` → this file in vitest.config.mts
// satisfies the resolver without leaking server code into the bundle.
export {};
