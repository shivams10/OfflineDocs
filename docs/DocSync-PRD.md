# DocSync — Product Requirements Document

**Product:** DocSync — offline-first collaborative document workspace
**Status:** Draft for review
**Last updated:** September 9, 2026
**Design reference:** `DocSync UI.dc.html` (hi-fi, screen ids as badges), `DocSync Wireframes.dc.html` (lo-fi structure), `design_handoff_docsync_ui/README.md` (tokens + component spec)

> **Note added on import:** this is the PRD as supplied, kept verbatim so the techspec has a
> stable reference. Where it conflicts with `techspec.md`, see that document's Section 16 —
> the conflicts are listed there rather than resolved in either file.
>
> **Note added 15 September 2026 — read before testing against this document.** The product has
> moved past several lines below, and this file is deliberately *not* edited to match: it is the
> record of what was originally asked for. **`docsync-master-spec.md` is the current source of
> truth.** Its §18.1 lists, line by line, which statements here are superseded and what is true
> instead — version history, "move" documents, the sync-state vocabulary, the presence popover,
> Owner as an invitable role, link access, and the offline queue. Its §18.2 lists what is specified
> but not yet built. Where this document and the master spec disagree, **the master spec wins**,
> and the difference is a known decision rather than a bug.

---

## 1. Summary

DocSync is a collaborative document workspace whose defining behaviour is offline-first editing. Any document a user has opened stays fully editable without a connection, and queued changes merge when the device reconnects. Around that core the product provides a document dashboard, a real-time editor with explicit sync states, sharing and permissions, dictation-to-text, and a read-only viewer mode.

Everything in this document is scoped to the designs already produced: desktop (1440), tablet (768) and mobile (390) layouts, in light and dark themes.

## 2. Problem

Existing collaborative editors treat connectivity as a precondition. When the network drops, users either lose the ability to edit, or they edit into an ambiguous state and cannot tell whether their work is safe. The failure is as much informational as technical: people do not trust that unsynced work will survive.

DocSync addresses both halves — keep editing available offline, and make sync state visible at every point where a user might worry about it (dashboard row, editor top bar, pending change counts).

## 3. Goals and non-goals

### Goals
- A document opened once is editable with no connection, with no degraded mode and no read-only fallback.
- Sync state is always legible: synced, saving, pending, offline, reconnecting.
- Sign-in is a single action. No credential management for the user or the team.
- One shared workspace per account with live presence and full version history behind each save.
- Parity of function across desktop, tablet and mobile, with layout adapted rather than features removed.

### Non-goals (this release)
- Email/password authentication, SSO providers other than Google, account recovery flows.
- Real-time co-editing conflict UI beyond queued-change merge (no manual conflict resolution screen).
- Comments and suggestion mode.
- Folders, tags, or search beyond the document list.
- Rich media in documents (images, embeds, tables).
- Public/anonymous document links beyond the link-access section in the share panel.

## 4. Users

| User | Needs |
|---|---|
| **Owner** | Creates documents, controls sharing and roles, deletes and moves documents |
| **Editor** | Writes, dictates, sees presence, saves; cannot change sharing |
| **Viewer** | Reads only; sees a View only badge, no Save, no dictation, no share controls |

Primary usage context assumed: knowledge workers who move between connected and unconnected environments (transit, flights, poor coverage) and who work with 1–5 collaborators per document.

## 5. Success measures

- Share of editing sessions that continue uninterrupted across a connectivity drop.
- Queued-change merge success rate on reconnect (target: no user-visible failures).
- Time from sign-in click to dashboard render for a returning user.
- Share of first-time users who create or open a document in the first session.
- Support contacts mentioning lost or unsynced work (target: trending to zero).

## 6. Functional requirements

### 6.1 Authentication — screens `7a` (desktop), `7b` (mobile), `8e` (dark)

- Continue with Google is the only authentication method. Email, password, forgot-password, the or-divider and the create-account link are deliberately absent.
- A first-time sign-in creates the user's workspace implicitly. There is no separate sign-up screen.
- On success the user lands on the documents dashboard.
- Desktop layout is a two-column split with no card frame: a brand-soft left column carrying the product story (heading, description, three capability badges, decorative workspace-preview card) and a 640px surface-coloured right column carrying the sign-in action.
- The right column's top row shows an animated line ("Start documenting / drafting / collaborating") with a blinking caret, and a Need help? link. Under `prefers-reduced-motion` the first word renders statically.
- Mobile collapses to a single column with the Google button pinned to the bottom.

### 6.2 Dashboard — screens `1a`–`1d`, `6c`–`6d`

- Document table rows show title, collaborator avatar stack, edited time, and a sync badge (Synced / Pending / Offline). Pending rows show a queued-change count.
- Row hover reveals an overflow menu. Menu contents depend on role: owner gets rename, share, move, delete; non-owner gets open, duplicate, leave.
- First-run empty state presents a single primary action: New document.
- A 420px right drawer shows document details: title, metadata, members, activity.
- Mobile presents the same list as stacked rows with a drawer nav.

### 6.3 Editor — screens `2a`–`2g`, `6b`, `6e`

The editor is one canvas — document title, body, right-hand utility column — with sync state in the top bar. Required states:

| State | Behaviour |
|---|---|
| Unsaved changes | Save enabled; document marked dirty |
| Saving | Spinner, Save disabled |
| Saved | Success badge, Save disabled |
| Offline | Warning badge; **editing remains fully enabled**; changes queue locally |
| Reconnected | Queued changes flush, badge returns to Synced |

- Presence: avatar stack in the top bar; clicking opens a popover listing who is in the document.
- A new document opens untitled with the title field focused.
- Mobile replaces the utility column with a bottom action bar.

### 6.4 Sharing and permissions — screens `3a`–`3b`, `5b`, `6f`

- Invite by email with a role select (Owner / Editor / Viewer).
- Member list with per-row role menus; the same list renders inside the details drawer.
- A link-access section controls document-level link permissions.
- Role differences are enforced in the UI (hidden controls, View only badge) and must also be enforced server-side.
- Mobile presents sharing as a bottom sheet.

### 6.5 Dictation — screens `4a`–`4e`, `6g`

Flow: toolbar entry point → 380px panel idle → recording with a live level meter → transcript ready → Insert at cursor → document updated. On mobile the panel becomes a bottom sheet.

### 6.6 Viewer mode — screens `5a`–`5b`, `6h`

Read-only canvas with no Save and no dictation, marked with a View only badge. Screen `5b` documents the owner / editor / viewer header differences side by side.

### 6.7 Responsive behaviour — screens `6a`–`6h`

- 1440 desktop: full left nav.
- 768 tablet: nav collapses to an icon rail.
- 390 mobile: drawer nav, bottom action bar, sheets instead of panels. Controls are 46–50px tall to stay above a 44px touch target.

### 6.8 Theming — screens `8a`–`8e`

Light and dark are the same components with a different token set. Dark is implemented as a theme switch, never as duplicated components.

## 7. Sync model (product-level)

- Every document the user has opened is cached locally and editable with no connection.
- Local edits are written to a durable local store (IndexedDB or platform equivalent) and queued.
- Connectivity state drives every sync badge in the product.
- On reconnect the queue replays in order; the badge returns to Synced when the queue is empty.
- Pending counts surface in two places: dashboard rows and the editor top bar.
- Merge is automatic. No manual conflict-resolution UI is in scope for this release.

## 8. State model

| Store | Contents |
|---|---|
| `session` / `currentUser` | From Google OAuth; gates all routes |
| `documents[]` | id, title, owner, collaborators, updatedAt, syncState (`synced` / `saving` / `pending` / `offline`), pendingChangeCount |
| `activeDocument` | content, isDirty, permission role, presence list, cursor position |
| `connectivity` | online/offline; drives sync badges and queueing |
| `dictation` | panel open, recording, audioLevel, transcript |
| `ui` | theme, drawer/panel/sheet flags, active row menu |

## 9. Design system

The visual language is fixed and documented in `design_handoff_docsync_ui/README.md`. Key points:

- **Tokens** — CSS custom properties on `:root` with a `.dark` override. Components read tokens exclusively; the only intentional raw hex is the four-colour Google mark.
- **Type** — Plus Jakarta Sans for all UI, JetBrains Mono for numeric and token accents.
- **Radii / shadows** — `8px` / `6px` / `12px`, pills at `999px`; three shadow levels for controls, raised cards and popovers.
- **Components** — `.btn` (with primary, ghost, disabled, large, icon variants), `.inp`, `.badge` (neutral plus brand/success/warning/error), `.i` icons on a 24×24 grid at `stroke-width:1.7`, `.av`/`.stack` avatars, `.card`, `.topbar`.
- **Motion** — caret blink 1s `steps(1)` infinite; typewriter type 70ms/char, hold 1600ms, delete 34ms/char, 340ms between words. All other transitions 120–180ms ease-out.
- **Focus** — `0 0 0 3px var(--focus)` plus a brand border on every interactive element.

Map tokens onto the target codebase's theme system rather than hard-coding values.

## 10. Accessibility

- Text contrast at 4.5:1 minimum (3:1 permitted at headline scale).
- Visible focus ring on every interactive element.
- `prefers-reduced-motion` disables the typewriter and caret animations.
- Mobile touch targets at or above 44px.
- Sync state is communicated by label and icon, not colour alone.

## 11. Assets

No bitmap images or external icon packs. All icons are inline SVG on a 24×24 grid. Avatars are initials on token-coloured fills. Fonts should be self-hosted in production. The workspace preview card on the sign-in screen is built from divs and should be replaced with a real product screenshot when one exists.

## 12. Implementation note

The `.dc.html` files are design references, not production code. They should be recreated in the target codebase using its existing component library, styling approach and routing patterns. If no environment exists, choose the framework appropriate to the project and implement the designs there. `support.js` is runtime for the design files only and must not be ported.

## 13. Open questions

1. Autosave cadence versus explicit Save — the designs show both a dirty state and a Save control. Which is authoritative?
2. Retention limit for queued offline changes (time or size cap) before the user is warned.
3. Version history depth and whether restore is in scope for this release.
4. Behaviour when a queued change targets a document the user has since lost access to.
5. Whether Need help? on the sign-in screen opens docs, a contact form, or a support chat.
6. Storage quota handling when the local cache fills.
