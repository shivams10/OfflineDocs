import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * TS-12 — proves the editor+ route gate (collaborators.ts), the controller's
 * email null-ing, and the details drawer's canSeeMembers guard are wired
 * together in the running app, not just each proven in isolation (TS-7,
 * TS-10). Run under the `editor` project only — its storage state is minted
 * by e2e/setup/auth.setup.ts via `pnpm --filter server seed:e2e`.
 *
 *   pnpm exec playwright test e2e/collaborators-email.spec.ts --project editor
 */

const FIXTURES_PATH = path.resolve(
  import.meta.dirname,
  ".auth/fixtures.json",
);

interface Fixtures {
  docId: string;
  users: Record<"owner" | "editor" | "viewer", { id: string; email: string }>;
}

test("an editor's real member list carries no address [AC-10][AC-15][AC-20]", async ({ page }) => {
  const fixtures: Fixtures = JSON.parse(await readFile(FIXTURES_PATH, "utf-8"));
  const seededEmails = Object.values(fixtures.users).map((u) => u.email);

  await page.goto("/dashboard");

  const row = page.getByRole("button", { name: "E2E fixture document" }).locator("xpath=ancestor::li[1]");
  await row.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("menuitem", { name: "Details" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Members")).toBeVisible();

  const drawerText = (await dialog.textContent()) ?? "";

  // Member names are visible — the drawer rendered real data, not an
  // error or an empty list.
  expect(drawerText).toContain("E2E owner");
  expect(drawerText).toContain("E2E editor");
  expect(drawerText).toContain("E2E viewer");

  // No address anywhere in the drawer, for any of the three seeded members —
  // the editor's own row included.
  expect(drawerText).not.toContain("@");
  for (const email of seededEmails) {
    expect(drawerText).not.toContain(email);
  }

  // Not an error state, and not an empty member list (the count badge next
  // to the "Members" label reads the seeded 3, never 0).
  await expect(page.getByText(/could not/i)).not.toBeVisible();
  await expect(dialog.getByText("0", { exact: true })).not.toBeVisible();
});
