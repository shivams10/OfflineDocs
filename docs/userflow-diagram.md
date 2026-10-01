# DocSync — PWA User Flow Diagrams (Mermaid)

Paste any of the code blocks below into https://mermaid.live or any Mermaid-compatible tool.

---

## 1. App launch → auth → document access

```mermaid
flowchart TD
    A[App opens] --> B{Service worker registered?}
    B -->|No| C[Register SW, cache app shell]
    B -->|Yes| D{SW update available?}
    C --> D
    D -->|Yes| E[Activate new SW on next reload / skipWaiting]
    D -->|No| F[Check auth token]
    E --> F
    F -->|Valid| G{Network available?}
    F -->|Expired/Missing| H[Show login]
    H --> I{Login succeeds?}
    I -->|No| H
    I -->|Yes, online| G
    I -->|Attempted offline| J[Block: auth requires network]
    G -->|Online| K[Fetch doc list from server]
    G -->|Offline| L[Load cached doc list from IndexedDB]
    K --> M[Render dashboard]
    L --> M
    M --> N{User opens a doc}
```

---

## 2. Opening a document (online/offline branches)

```mermaid
flowchart TD
    A[User selects document] --> B{Cached locally in IndexedDB?}
    B -->|Yes| C[Load local copy instantly]
    B -->|No, online| D[Fetch latest saved snapshot from server, cache it]
    B -->|No, offline| E[Show 'not available offline' state]
    C --> F{Network available?}
    D --> F
    F -->|Online| G[Fetch latest saved state via HTTP, no persistent connection]
    F -->|Offline| H[Enter offline editing mode against last-cached snapshot]
    G --> I{Server has newer version than local cache?}
    I -->|Yes| J[Yjs CRDT auto-merges server updates into local doc]
    I -->|No| K[Local doc is current]
    J --> L[Doc ready — editable, status shows 'Saved']
    K --> L
    H --> L
    E --> M[Retry when back online]
```

---

## 3. Editing: typing + dictation panel

Viewers have no Dictate button (master spec §16.1). The offline audio queue is Phase 4.2 and not
built, so offline recording is disabled for now.

```mermaid
flowchart TD
    A[Doc open, editable] --> B{Input method}
    B -->|Typing| C[Keystroke → insert into Yjs doc at cursor]
    C --> R[Cursor position remembered]
    B -->|Dictate button| F[Open dictation panel]
    F --> V{Online?}
    V -->|No| W[Recording disabled, offline hint — typing still works]
    V -->|Yes| D[Start recording → request mic permission]
    D -->|Denied / no mic| E[Inline error in panel, fall back to typing]
    D -->|Granted| G[Record chunk — level meter, stops itself at 60 s]
    G --> H[Stop, or panel closed → chunk sent]
    H --> I[POST /docs/:id/transcribe → self-hosted faster-whisper]
    I -->|Busy| I2[Retry after 1s, 2s, 4s]
    I2 --> I
    I -->|Success| K[Transcript appended in panel, saved to IndexedDB]
    I -->|Failed| L[Error with Retry / Discard — recording kept]
    L -->|Retry| I
    K --> M{User action on transcript}
    M -->|Edit| K
    M -->|Copy| N[Clipboard, user pastes manually]
    M -->|Clear| P[Transcript emptied]
    M -->|Insert at cursor| O[Insert at remembered cursor via Yjs, clear transcript, close panel]
    C --> Q[Doc status flips to 'Draft' — Save button becomes active]
    O --> Q
    Q --> S{User clicks Save?}
    S -->|Not yet| Q
    S -->|Yes| T[Send Save request — see diagram 4]
```

---

## 4. Save & push notifications

```mermaid
flowchart TD
    A[Doc has unsaved Draft edits] --> B[User clicks Save]
    B --> C{Online?}
    C -->|Yes| D[POST Yjs update to backend]
    C -->|No| E[Queue Save request; SW registers Background Sync]
    E --> F{Connection restored?}
    F -->|No| E
    F -->|Yes| D
    D --> G[Backend merges update into canonical Y.Doc via CRDT]
    G --> H{Concurrent Save from another collaborator already merged?}
    H -->|Yes| I[CRDT auto-merges both — no data loss, no manual resolution]
    H -->|No| J[Clean merge]
    I --> K[Persist snapshot to Postgres]
    J --> K
    K --> L[Doc status flips to 'Saved' for the saving client]
    K --> M[Trigger Web Push via VAPID to other subscribed collaborators]
    M --> N[SW 'push' event fires on each recipient device]
    N --> O{Doc already open + focused in a client tab?}
    O -->|Yes| P[Suppress OS notification — in-app toast + doc badge update instead]
    O -->|No| Q{Notification permission granted?}
    Q -->|No| R[Silent — badge/unread count updates only]
    Q -->|Yes| S[Show OS notification: 'X saved doc — N changes']
    S --> T{User taps notification}
    T --> U[SW 'notificationclick' → focus/open client, deep-link to doc]
    U --> V[Client fetches latest saved state; Yjs CRDT merges it into any local Draft]
```

---

## 5. Offline write, reconnect & service worker edge cases

```mermaid
flowchart TD
    A[User edits while offline] --> B[Yjs update kept in local Draft, persisted to IndexedDB]
    B --> Z{User clicks Save?}
    Z -->|Not yet| A
    Z -->|Yes, still offline| C[SW queues the Save request via Background Sync API]
    C --> D{Connection restored?}
    D -->|No| C
    D -->|Yes| E[SW fires 'sync' event]
    E --> F[Push queued Save request to server]
    F --> G{Server accepts merge?}
    G -->|Yes| H[Doc reconciled, push notifications sent to others]
    G -->|Conflict on schema/permissions| I[Show non-destructive error, keep local Draft safe, retry Save]
    H --> J[Local IndexedDB cache updated, status flips to 'Saved']
    A --> K{App closed with unsaved Draft, e.g. browser killed}
    K --> L[On relaunch, SW + IndexedDB restore unsaved Draft — Save button still active]
    L --> A
    M[New app version deployed] --> N[SW detects new version on next fetch]
    N --> O{skipWaiting configured?}
    O -->|No| P[New SW waits — user must close all tabs to activate]
    O -->|Yes| Q[New SW activates immediately, risk: mid-edit reload]
    Q --> R[Show 'app updated, refresh to get latest' banner instead of forcing reload]
```