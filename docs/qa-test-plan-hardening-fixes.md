# QA Test Plan: Hardening Fixes (Phase 0, 1 and 3)

**Branch:** `phase-4.0` (the changes are in the working tree and not yet committed)
**Date:** 2026-09-15
**Scope:** 7 changes from the Phase 0, 1 and 3 sanity review. Each section says what changed, why, and how to test it.

| # | Area | What changed | Priority |
|---|---|---|---|
| 1 | Saving | Two saves on the same document at the same moment no longer lose one editor's changes | **P0** |
| 2 | Sharing | A document can no longer end up with zero owners when two owner changes happen at once | **P0** |
| 3 | Privacy | Only owners see email addresses; editors see names only; **viewers cannot see the member list at all** | **P0** |
| 4 | Push | A notification from a saver with no display name says "A collaborator", never their email | P1 |
| 5 | Push | Mobile users can now turn notifications on, from the nav drawer | P1 |
| 6 | Sign-in | Removed the inert "Need help?" text and the "version history" claims | P2 |
| 7 | Regression | Normal save, sharing and push behaviour is unchanged | P0 |

---

## Setup

### 1. Run the app

```bash
# API on :3000
cd apps/server && pnpm dev
# Web on :4000
cd apps/web && pnpm dev
```

Postgres runs through docker compose on `localhost:5432`.

### 2. Get a signed-in session for each role

Sign-in is Google only. For testing, a seed script creates three fixed users, one document, and a ready-made session for each role:

```bash
pnpm --filter server seed:e2e
```

This writes:

| File | Contains |
|---|---|
| `e2e/.auth/fixtures.json` | `docId` of "E2E fixture document", plus the user id for each role |
| `e2e/.auth/owner.json` | Cookies for `e2e-owner@example.test` (owner of the fixture doc) |
| `e2e/.auth/editor.json` | Cookies for `e2e-editor@example.test` (editor) |
| `e2e/.auth/viewer.json` | Cookies for `e2e-viewer@example.test` (viewer) |

- **Sessions expire after 15 minutes.** Re-run the seed to get fresh ones.
- **Re-running the seed also resets test data.** Roles go back to owner/editor/viewer, removed members are re-added, and names are restored. Use it between test cases.

**To use a role in the browser:**
1. Use a separate browser profile or incognito window for each role.
2. Open `http://localhost:4000`.
3. In DevTools → Application → Cookies → `http://localhost`, add both cookies from that role's JSON file: `docsync_access` and `docsync_csrf`.
4. Reload the page.

**To use a role with curl**, set these shell variables once. Paste the values from the JSON files:

```bash
API=http://localhost:3000
DOC=<docId from fixtures.json>
OWNER_ID=<users.owner.id>
EDITOR_ID=<users.editor.id>
VIEWER_ID=<users.viewer.id>
OWNER_TOKEN=<docsync_access value from owner.json>
EDITOR_TOKEN=<docsync_access value from editor.json>
VIEWER_TOKEN=<docsync_access value from viewer.json>
CSRF=qa-csrf   # any value works, as long as the cookie and the header match
```

### 3. Database access (needed by some cases)

```bash
psql "postgresql://docsync:docsync@localhost:5432/docsync"
```

### 4. Push notifications (needed only by sections 4 and 5)

Push is off unless all three VAPID variables are set in `apps/server/.env`:

```bash
cd apps/server && pnpm exec web-push generate-vapid-keys
# put the output in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, keep VAPID_SUBJECT, then restart the API
```

Use Chrome or Edge for push tests. Allow notifications at the OS level for the browser.

---

## 1. Concurrent saves keep both editors' changes (P0)

**Before:** if two people clicked Save at almost the same moment, the second save overwrote the first. The first person's badge still said **Saved**, but their text was gone from the server.
**Now:** the second save waits for the first and merges on top of it.

A real clash needs both requests in flight together. Slow the network down to force that.

### QA-1.1: Two editors save at the same time (UI)

| Step | Action |
|---|---|
| 1 | Run the seed. Open the fixture document as **owner** in window A and as **editor** in window B |
| 2 | In **both** windows: DevTools → Network → throttling **Slow 3G** (or a custom profile with ≥ 3 s latency) |
| 3 | Window A: add a new line `alpha from owner`. Window B: add a new line `beta from editor` |
| 4 | Click **Save** in window A, then in window B within 2 seconds |
| 5 | Wait until both badges read **Saved** |
| 6 | Turn throttling off in both. Open the document in a **third** window (any role) |

**Expected**
- The third window shows **both** `alpha from owner` and `beta from editor`.
- Neither save shows **Save failed**.
- Windows A and B do not show each other's line until reloaded. That is expected: changes merge on Save, not live.

**Repeat 3 times**, swapping which window saves first.

### QA-1.2: Many quick saves from one editor

| Step | Action |
|---|---|
| 1 | As editor: type a line, Save. Repeat 5 times as fast as the button allows |
| 2 | Reload |

**Expected:** all 5 lines are present, no errors, and each save takes about as long as before.

---

## 2. Last-owner rule holds under concurrency (P0)

**Rule:** a document must never have zero owners. Demoting or removing the only owner returns `400 last_owner`.
**Before:** if a document had two owners and both were demoted or removed at the same instant, both requests could succeed, leaving no owner.
**Now:** exactly one request succeeds. The other is refused.

The UI can't create a second owner yet (owner invites aren't built), so these cases set one up in the database and fire requests together with curl.

### Setup for every case in section 2

```bash
pnpm --filter server seed:e2e      # fresh sessions and roles; refresh the *_TOKEN variables
```
```sql
-- make the editor a second owner
UPDATE "DocCollaborator" SET role = 'owner'
WHERE "docId" = '<DOC>' AND "userId" = '<EDITOR_ID>';
```

Add this shell helper once:

```bash
call() {  # call <METHOD> <token> <target user id> [json body]
  curl -s -w "  -> HTTP %{http_code}\n" -X "$1" "$API/docs/$DOC/collaborators/$3" \
    -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
    -b "docsync_access=$2; docsync_csrf=$CSRF" ${4:+-d "$4"}
}
```

Check the owner count afterwards:

```sql
SELECT "userId", role FROM "DocCollaborator" WHERE "docId" = '<DOC>';
```

### QA-2.1: Two owners demote each other at the same time

```bash
call PATCH "$OWNER_TOKEN" "$EDITOR_ID" '{"role":"viewer"}' & \
call PATCH "$EDITOR_TOKEN" "$OWNER_ID" '{"role":"viewer"}' & wait
```

**Expected**
- Exactly **one** response is `HTTP 200`.
- The other is `HTTP 400` with `"code":"last_owner"`, or `HTTP 403` if it arrived after the first had finished. Either is correct.
- The SQL query shows **exactly one** `owner` row.

### QA-2.2: Two owners leave at the same time

```bash
call DELETE "$OWNER_TOKEN" "$OWNER_ID" & \
call DELETE "$EDITOR_TOKEN" "$EDITOR_ID" & wait
```

**Expected**
- Exactly one `HTTP 204`.
- The other is `400 last_owner`, or `404` if it arrived after the first finished.
- Exactly one `owner` row remains.

### QA-2.3: One owner demoted while the other leaves

```bash
call PATCH "$OWNER_TOKEN" "$EDITOR_ID" '{"role":"viewer"}' & \
call DELETE "$OWNER_TOKEN" "$OWNER_ID" & wait
```

**Expected:** one success, one refusal, exactly one `owner` row.

**Run each of QA-2.1 to 2.3 at least 5 times**, re-running the setup in between. **A single run that ends with zero owners is a P0 bug.**

### QA-2.4: Sole owner still can't demote or remove themselves (regression)

Run the seed only (one owner, no SQL step), then:

```bash
call PATCH "$OWNER_TOKEN" "$OWNER_ID" '{"role":"editor"}'
call DELETE "$OWNER_TOKEN" "$OWNER_ID"
```

**Expected:** both return `400` with `"code":"last_owner"`. The owner row is unchanged.

---

## 3. Email addresses visible to owners only (P0)

**Before:** everyone on a document (editors and viewers too) received every member's email address, both in the API response and in the member list.
**Now:** two rules, layered. **Viewers cannot see the member list at all** — `GET /docs/:id/collaborators` is editor+ and answers a viewer `403`. **Editors see names only** (`email` is `null`). Only owners get addresses.

Where members are listed:
- **Details drawer** (dashboard row ⋯ → Details → Members): owners and editors. A **viewer sees no Members section and no Owner row** — the drawer shows the document's own details only.
- **Share panel** (row ⋯ → Share): owner only.

### QA-3.1: API, email by role

```bash
curl -s -w "  -> HTTP %{http_code}\n" "$API/docs/$DOC/collaborators" -b "docsync_access=$OWNER_TOKEN"
curl -s -w "  -> HTTP %{http_code}\n" "$API/docs/$DOC/collaborators" -b "docsync_access=$EDITOR_TOKEN"
curl -s -w "  -> HTTP %{http_code}\n" "$API/docs/$DOC/collaborators" -b "docsync_access=$VIEWER_TOKEN"
```

**Expected**

| Caller | Status | Body |
|---|---|---|
| Owner | `200` | Real addresses for all 3 members |
| Editor | `200` | `"email": null` for all 3, **including their own**; names present |
| Viewer | **`403`** | `{"error":{"code":"forbidden",…}}` and **no member data at all** — no names, no ids, no roles |

The email must be absent from the raw response itself, not just hidden in the UI. For the viewer, the whole list must be absent.

### QA-3.2: UI, owner sees emails

| Step | Action |
|---|---|
| 1 | As **owner**, dashboard → fixture doc row ⋯ → **Details** |
| 2 | Look at the **Members** list |
| 3 | Close, then row ⋯ → **Share** and look at **People with access** |

**Expected:** in both places each member shows a **name** line and an **email** line below it.

### QA-3.3: UI, an editor sees names only

| Step | Action |
|---|---|
| 1 | As **editor**, dashboard → fixture doc row ⋯ → **Details** → Members |

**Expected**
- Each member shows only a name. There is **no email line** and no blank gap where it used to be.
- Rows are evenly spaced.
- DevTools → Network → the `collaborators` response has `"email": null` for every member.

### QA-3.3b: UI, a viewer sees no member list at all

| Step | Action |
|---|---|
| 1 | As **viewer**, dashboard → fixture doc row ⋯ → **Details** |
| 2 | Watch the Network tab while the drawer opens |

**Expected**
- The drawer shows Your role, Status, Created and Last modified — and **no Members section and no Owner row**.
- **No request to `/collaborators` is made at all.** The viewer's client does not ask and then hide; it does not ask.
- No error, no empty "Members 0" heading, and no console warning.

### QA-3.4: Member with no display name

Some Google accounts have no display name. Simulate one:

```sql
UPDATE "User" SET name = NULL WHERE email = 'e2e-viewer@example.test';
```

| Viewer's row as seen by | Expected display name | Expected avatar initials | Email line |
|---|---|---|---|
| Owner (Details and Share) | `e2e-viewer@example.test` | `E2` | Shown |
| Editor (Details) | **Unnamed collaborator** | `UN` | Not shown |
| The viewer themselves | — | — | No member list at all (QA-3.3b) |

Then, as **owner**, Share panel → viewer's role menu → **Remove access**.
**Expected:** the confirmation reads `e2e-viewer@example.test will lose access…`, never a blank name.

Re-run the seed afterwards to restore the name.

### QA-3.5: Owner-only actions still return the email (regression)

As **owner** in the Share panel:
1. Change a member's role from Editor to Viewer.
2. Invite an existing account by email. Any other seeded or real user who has signed in once works.

**Expected:** both work as before, and the member row shows the email immediately without a reload.

---

## 4. Push notification never reveals the saver's email (P1)

**Before:** if the person who saved had no display name, the notification sent to everyone else named them by **email address**.
**Now:** it says **"A collaborator"**.

Requires push to be set up (see Setup §4).

### QA-4.1: Saver with no name

| Step | Action |
|---|---|
| 1 | `UPDATE "User" SET name = NULL WHERE email = 'e2e-editor@example.test';` |
| 2 | Window A (**owner**, desktop width): click the bell icon in the top bar, allow notifications. The icon turns on |
| 3 | In window A go to the **dashboard**, not the document, then focus a different app |
| 4 | Window B (**editor**): open the fixture doc, add a line, **Save** |
| 5 | Wait about 6 seconds (notifications wait 5 s to collapse quick repeat saves) |

**Expected**
- The owner gets an OS notification titled "E2E fixture document".
- Its body is **"A collaborator added 1 line"** (or similar change wording).
- The text never contains `e2e-editor@example.test` or any other email.

### QA-4.2: Saver with a name (regression)

Re-run the seed (restores the name), turn notifications back on, repeat QA-4.1 from step 2.

**Expected:** the body starts with **"E2E editor"**.

### QA-4.3: Doc already open and focused (regression)

Repeat QA-4.2, but keep window A **on the fixture document and focused**.

**Expected:** **no** OS notification. An in-app bar inside the editor reads "E2E editor updated this document." with **Reload** and **Dismiss** buttons.

---

## 5. Notifications toggle on mobile (P1)

**Before:** the bell toggle existed only in the desktop top bar, so a phone had no way to enable push.
**Now:** below 768px, the nav drawer has a **Notifications** row with the same toggle, just above **Theme**.

Use DevTools device mode at **390 × 844** unless a case says otherwise.

### QA-5.1: Push configured, permission not yet asked

| Step | Action |
|---|---|
| 1 | Clear site permissions for `localhost:4000`. Sign in as any role |
| 2 | Tap the menu icon to open the nav drawer |

**Expected:** a **Notifications** row sits directly above **Theme**, with a bell-off icon button on the right. It has the same height and padding as the Theme row.

### QA-5.2: Turn on and off

| Step | Action |
|---|---|
| 1 | Tap the Notifications button |
| 2 | Allow at the browser prompt |
| 3 | Tap the button again |

**Expected**
- After step 2 the icon changes to a bell (on).
- After step 3 it changes back to bell-off (off).
- The button is disabled while turning on.
- Hovering or long-pressing shows "Enable notifications" or "Turn off notifications" to match the state.

### QA-5.3: Permission blocked

Block notifications for `localhost:4000` in site settings, reload, open the drawer.

**Expected:** the row is shown, but its button is **disabled**, with the tooltip "Notifications are blocked in your browser settings."

### QA-5.4: Push not configured on the server

Remove the VAPID variables from `apps/server/.env`, restart the API, reload, open the drawer.

**Expected**
- **No Notifications row at all.** No label is left behind without a button.
- The Theme row and sign-in state are unaffected.
- Saving still works (see QA-7.1).

### QA-5.5: Desktop unchanged (regression)

At **1440 px** width with push configured.

**Expected**
- The bell toggle is still in the top bar next to the theme toggle and works as before.
- There is no Notifications row anywhere in the left nav.

### QA-5.6: Tablet and browsers

- Check 768px: the top-bar toggle is visible and the drawer row is not.
- Check 767px: the other way round.
- Check QA-5.1 in Safari on iOS, where push works only when the app is installed to the home screen. Otherwise the row should be hidden (same as QA-5.4).

---

## 6. Sign-in page copy (P2)

**Changes:** the inert **"Need help?"** text is removed. The page no longer promises version history, which isn't built.

### QA-6.1: Desktop (≥ 1024 px)

Sign out, open `http://localhost:4000/login`.

| Check | Expected |
|---|---|
| Top row of the right-hand panel | Only "Start ‹animated word›". **No "Need help?"** |
| Left panel paragraph | Ends with "…with live presence on each document and roles for everyone you share it with." |
| Feature pills | **Offline editing** · **Live presence** · **Roles & sharing** |
| Search the page (Ctrl/Cmd+F) for "version" or "history" | No matches |
| Continue with Google | Still works and lands on the dashboard |

### QA-6.2: Mobile (390 px) and tablet (768 px)

| Check | Expected |
|---|---|
| Paragraph (short version) | Ends with "…One shared workspace, with live presence and roles." |
| Pills | Same three as desktop, wrapping cleanly with no clipping |
| Continue with Google | Pinned at the bottom as before |

### QA-6.3: Dark mode

Repeat QA-6.1 and 6.2 in dark theme. **Expected:** no layout shift, and the top row still aligns with nothing where "Need help?" used to be.

---

## 7. Regression sweep (P0)

The save and sharing code paths were changed underneath, so re-check the everyday flows.

| ID | Flow | Expected |
|---|---|---|
| QA-7.1 | Editor types, clicks Save (or Cmd/Ctrl+S) | Badge goes Draft → Saving… → Saved. Reload shows the text. Dashboard row's "Last modified" updates |
| QA-7.2 | New document → type → Save | Same as 7.1 |
| QA-7.3 | Invalid save through the API (below) | `400`, and the document content is unchanged on reload |
| QA-7.4 | Viewer opens the doc | "View only" badge, no Save button, can't type |
| QA-7.5 | Viewer saves through the API (below) | `403` |
| QA-7.6 | Owner changes Editor → Viewer in the Share panel | Role updates. The member's next load is read-only |
| QA-7.7 | Owner removes a member | Member disappears. Their next open of the doc shows "Couldn't load this document" |
| QA-7.8 | Editor or viewer uses row ⋯ → **Leave** | Doc disappears from their dashboard. Owner still has it |
| QA-7.9 | Offline (DevTools → Offline) while editing | Badge shows Offline, typing still works, Save disabled. Back online, Save works |
| QA-7.10 | Two saves by the same editor within 5 s, with a collaborator subscribed to push | The collaborator gets **one** notification, not two |
| QA-7.11 | Presence: owner and editor open the same doc | Each sees the other's avatar chip within ~20 s |

API calls for QA-7.3 and 7.5:

```bash
# 7.3: owner sends a malformed update -> expect 400
curl -s -w "  -> HTTP %{http_code}\n" -X POST "$API/docs/$DOC/save" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -b "docsync_access=$OWNER_TOKEN; docsync_csrf=$CSRF" -d '{"update":"not-a-real-update"}'

# 7.5: viewer tries to save -> expect 403
curl -s -w "  -> HTTP %{http_code}\n" -X POST "$API/docs/$DOC/save" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -b "docsync_access=$VIEWER_TOKEN; docsync_csrf=$CSRF" -d '{"update":"AAA="}'
```

---

## Automated coverage already in place

These run in CI and back up the manual cases above. Run them from **inside each app folder**: running `--project` from the repo root currently fails on vitest 5.

```bash
cd apps/server && pnpm exec vitest run   # 72 tests, all passing
cd apps/web    && pnpm exec vitest run   # 64 tests, 63 passing (see "Known failing test" below)
```

| Test file | Covers | Proven to catch the old bug? |
|---|---|---|
| `apps/server/src/services/docs.save.concurrency.test.ts` | Section 1: two concurrent saves, 10 rounds | Yes, failed against the old code |
| `apps/server/src/services/collaborators.last-owner.test.ts` | Section 2: demote/demote, remove/remove, demote/remove, 10 rounds each | Yes, all 3 failed against the old code |
| `apps/server/src/routes/collaborators.email.test.ts` | Section 3: owner gets emails, editor gets `null`, viewer gets `403` | Not mutation-checked |

**No automated test for:** the "A collaborator" push wording (section 4), the "Unnamed collaborator" fallback and hidden email line in the UI (QA-3.3, 3.4), the mobile Notifications row (section 5), or the sign-in copy (section 6). These rely on manual testing.

---

## Not part of this change: don't file as new bugs

These are already known, and waiting on a product decision.

| Behaviour you may notice | Status |
|---|---|
| Inviting an email with no DocSync account shows "No account found for that email" | Pending invites are specified but not built |
| No way to invite someone as an **Owner**, or promote someone to Owner | Not built |
| No **Share** button in the editor's top bar | Not built. Share is reachable from the dashboard row menu only |
| No "Anyone with the link" section in the Share panel | Not built |
| Clearing site data then reopening a doc doesn't restore the server-side draft backup | Not built. The web test `presence.draft-restore.test.tsx` fails on purpose to track this |
| Closing the tab within ~25 s of typing gives no "unsaved changes" warning | Not built |
| Notification wording is based on line count ("added 2 lines") | Known. How changes should be described is still an open decision |
| Toggling notifications in the mobile drawer, then widening the window to desktop, shows the top-bar bell in its old state until reload | Known limitation of this change. The two toggles check state independently when the page loads |

## Reporting

For each failure, include: the test ID (e.g. QA-2.1), role(s) used, browser and viewport, the exact response or screenshot, and for section 2 the output of the `SELECT` owner query. **Any run that ends with zero owners (section 2) or a missing line (section 1) is P0.**
