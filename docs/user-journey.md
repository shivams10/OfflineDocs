# DocSync — User Journey by Role

Four end-to-end journeys: **Owner**, **Editor**, **Viewer**, and a dedicated walkthrough of **push notifications** since it's the mechanism tying the other three together. `userflow-diagram.md` has the technical flowcharts; this is what each person actually experiences, screen by screen. Section references point back to `techspec.md`.

**Cast:** Priya (Owner), Sam (Editor), Alex (Viewer) — all three on the same document.

---

## 1. Owner journey — Priya

1. **First login.** Priya logs in, lands on an empty dashboard, clicks "New document," gives it a title, and is dropped into the editor (§2).
2. **Writing.** She types. The status indicator flips to **Draft** immediately — nothing leaves her device yet. Every 20–30s, her draft is quietly backed up to the server in the background, invisibly, as a safety net (§4.1).
3. **Saving.** She clicks **Save**. Status goes **Saving...** → **Saved**. This is the moment her edit becomes real for anyone else and the trigger for notifying collaborators — but she has none yet (§4, §6).
4. **Inviting collaborators.** Priya opens the doc's sharing panel and invites Sam as **Editor** and Alex as **Viewer** (§8). Only she can do this — invites and role changes are Owner-only.
5. **Collaboration begins.** Sam later edits and saves; Priya gets a push notification (§6, see Section 4 below for the full mechanics). She also sees a presence chip when Sam or Alex have the doc open (§7).
6. **Changing access.** A month in, Priya decides Alex should be able to edit too. She promotes him from Viewer to Editor in the sharing panel — the next time Alex opens the doc, he has full editing rights, no re-invite needed (§8).
7. **Offline.** Priya edits on a flight with no Wi-Fi. Nothing about her experience changes — she keeps typing, her draft accumulates locally, and Save just queues until she's back online (§7).

Ownership itself doesn't transfer or get revoked in this MVP — Priya is Owner for the life of the doc; what she manages is *other people's* roles on it, not her own (§8, non-goal in §1.2 for anything beyond that).

---

## 2. Editor journey — Sam

1. **Getting invited.** Sam receives an invite to collaborate (email, out of scope for the PWA itself). He logs in, and Priya's doc now appears in his own dashboard alongside anything he owns (§2, §8).
2. **Opening the doc.** It loads Priya's latest saved version — instantly if cached, otherwise fetched fresh (§2.1).
3. **Editing.** Sam has the same Draft/Save experience Priya does — nothing about being an Editor-not-Owner changes how writing feels. He types, sees **Draft**, edits freely.
4. **Saving.** He clicks Save. His edit merges into the canonical doc via CRDT (automatically, even if Priya had also edited offline in the meantime — §4), and Priya + Alex both get notified (§6).
5. **Presence.** While Sam edits, he sees a chip if Alex has the doc open reading it. No live cursor, no typing indicator — just "Alex has this open" (§7).
6. **Dictation.** Sam clicks **Dictate**, records a paragraph (up to a minute per recording), reviews and corrects the transcript, and inserts it at his cursor. While he's offline, recording is disabled — queued offline dictation is not built yet (master spec §Phase 4 Part 2). It's scratch space until he explicitly inserts it — nothing reaches the shared doc from voice alone (§5).
7. **Offline.** Same as Priya — full read/write, Save just queues if there's no network (§7).
8. **Demotion.** If Priya later downgrades Sam to Viewer, the next time he opens the doc the editing surface and Save button are simply gone — no error, no broken state, just a read-only view (§8).

An Editor's experience is functionally identical to an Owner's for editing and saving — the only things Sam can't do are manage other people's access (§8).

---

## 3. Viewer journey — Alex

1. **Getting invited.** Alex is invited as Viewer. He logs in, the doc shows up in his dashboard the same as it would for any role (§8).
2. **Opening the doc.** He sees Priya's (and now Sam's) latest saved content. The editing surface is visibly read-only — no cursor to click into, no Save button rendered at all, not just disabled (§8). He's never confused by a control that would silently fail.
3. **Staying informed.** Alex still gets push notifications when Priya or Sam save — being read-only doesn't mean being out of the loop (§6, §8: pushes and presence go to anyone with at least Viewer access).
4. **Presence.** Alex shows up as a presence chip to Priya and Sam while he's reading, the same as an Editor would (§7) — presence isn't gated by role.
5. **What he can't do.** No Save button, no invite/role-management panel, no editing at all. No dictation either: viewers get no Dictate button at all — decided in master spec §16.1.
6. **Promotion.** If Priya promotes him to Editor, his next open of the doc has the full editing experience — same as Sam's journey above, starting from step 3.

---

## 4. Push notification — end to end, across roles

Concrete walkthrough of one Save, since this is the mechanism that makes the other three journeys feel connected without any real-time connection underneath (§6).

1. **Trigger.** Sam clicks Save. His edit merges into the canonical doc.
2. **Debounce.** If Sam clicks Save again 3 seconds later fixing a typo, the backend doesn't send two notifications — a 5-second per-doc timer restarts on each Save and only fires once things go quiet (§6).
3. **Recipient list.** Everyone with at least Viewer access to the doc, except Sam himself. Here: Priya and Alex.
4. **Delivery depends on what each recipient is doing right now**, decided independently per person:
   - **Priya has the app fully closed.** Her service worker's `push` handler fires, `clients.matchAll()` finds no open tab, and she gets a real OS notification: *"Sam saved 'Q3 Roadmap' — 3 changes."*
   - **Alex has the doc open in another tab, but isn't looking at it (backgrounded).** Same push event fires, but his SW notices the doc is already open and suppresses the OS notification — he instead sees a quiet in-app toast and a badge update. No double-interruption for something he's about to see anyway (§6).
5. **Acting on it.** Priya taps her OS notification → `notificationclick` focuses or opens the app → deep-links straight to that doc → the latest saved state loads (§6).
6. **The one edge case that matters:** if Priya had her *own* unsaved Draft open on that doc when Sam's push arrived, nothing is overwritten. Her draft stays exactly as she left it; Sam's change merges into her copy the next time she Saves or reloads, via the same CRDT merge that handles any other divergent-edit scenario (§9).
7. **If notifications are denied entirely** (any role), none of this breaks anything else — that person just doesn't get OS-level pings. In-app badges and toasts still update whenever they actually have the app open (§7).

The same six steps run identically regardless of whether the person who saved is the Owner, an Editor, or (not applicable — Viewers can't trigger this) — the notification pipeline doesn't care about roles, only about who has access to see the result.
