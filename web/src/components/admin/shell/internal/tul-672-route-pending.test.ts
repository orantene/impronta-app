/**
 * TUL-672: a rail click to Pedidos / Proyectos / Incidencias / Ventas left the
 * previous page on screen (or a wrong page) until the server route arrived.
 *
 * Those destinations are real server pages. `setPage` flips the shell's page
 * state at once but the route (and the canonical-children context) commits
 * later, so PageRouter has to show an honest pending skeleton in between
 * instead of the old body, a blank, or (for `projects`) the Messages page.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { pageIsServerRoute } from "./route-pending";

describe("TUL-672 route pending", () => {
  it("names every server-route page the reporter hit", () => {
    for (const p of ["orders", "projects", "issues", "exceptions", "sales"]) {
      assert.equal(pageIsServerRoute(p), true, p);
    }
  });

  it("does not claim SPA bodies", () => {
    for (const p of ["analytics", "reviews", "messages", "overview", "roster", "payouts", "settings"]) {
      assert.equal(pageIsServerRoute(p), false, p);
    }
  });

  it("PageRouter shows the skeleton while the route is pending", () => {
    const src = readFileSync(
      path.join(__dirname, "page-modules/WorkspaceShell.tsx"),
      "utf8",
    );
    assert.match(src, /pageIsServerRoute\(page\)/);
    assert.doesNotMatch(src, /case "projects":[^\n]*\n\s*body = <WorkspaceMessagesPage/);
  });
});
