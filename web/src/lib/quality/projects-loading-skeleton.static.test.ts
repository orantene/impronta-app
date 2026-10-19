import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const LOADING = readFileSync(join(ROOT, "src/app/(workspace)/[tenantSlug]/admin/projects/loading.tsx"), "utf8");
const message = (locale: "en" | "es") =>
  (JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), "utf8")) as {
    dashboard: { projects: Record<string, string> };
  }).dashboard.projects.listLoading;

describe("TUL-734 item 4: Projects list loading skeleton", () => {
  it("is the route's loading boundary and announces itself as a status", () => {
    assert.match(LOADING, /export default async function ProjectsLoading\(/);
    assert.match(LOADING, /role="status"/);
    assert.match(LOADING, /aria-busy="true"/);
  });

  it("reads no data: no loaders, scope, params or database in the skeleton", () => {
    assert.doesNotMatch(LOADING, /loadProjects|getTenantScopeBySlug|userHasCapability|supabase|params|searchParams/i);
  });

  it("uses a localized label from the catalog, in Spanish and English", () => {
    assert.match(LOADING, /tr\("dashboard\.projects\.listLoading"\)/);
    assert.equal(message("en"), "Loading projects");
    assert.equal(message("es"), "Cargando proyectos");
  });

  it("builds the page's own shape from its shared primitives", () => {
    assert.match(LOADING, /import \{ Card, PageShell \} from "\.\/_shared"/);
  });
});
