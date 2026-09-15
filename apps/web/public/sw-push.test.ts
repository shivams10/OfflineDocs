import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * sw-push.js is a plain (non-module) service-worker script: it reaches for a
 * global `self`, not an import. There is nothing to `import` here — the file
 * is loaded as source text and evaluated against a fake `self` built per
 * test, the standard way to unit-test a service worker without a browser.
 *
 * Filed as `.test.ts` rather than the `.js` suggested by the brief: the web
 * project's vitest config only includes `**\/*.test.{ts,tsx}` (see
 * apps/web/vitest.config.ts), so a `.test.js` file here would never be
 * collected and would silently never run.
 */

const swSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "sw-push.js"),
  "utf-8",
);

interface FakeClient {
  url: string;
  focused?: boolean;
  postMessage?: ReturnType<typeof vi.fn>;
  focus?: ReturnType<typeof vi.fn>;
  navigate?: ReturnType<typeof vi.fn>;
}

function createFakeSelf() {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    addEventListener: vi.fn((type: string, cb: (event: unknown) => void) => {
      listeners.set(type, cb);
    }),
    listeners,
    clients: {
      matchAll: vi.fn<() => Promise<FakeClient[]>>(),
      openWindow: vi.fn().mockResolvedValue(undefined),
    },
    registration: {
      showNotification: vi.fn(),
    },
  };
}

type FakeSelf = ReturnType<typeof createFakeSelf>;

/** Runs sw-push.js fresh, in isolation, against the given fake `self`. */
function loadServiceWorker(fakeSelf: FakeSelf): void {
  const context = vm.createContext({ self: fakeSelf, URL, console });
  vm.runInContext(swSource, context);
}

function pushEvent(payload: unknown) {
  let waited: Promise<unknown> | undefined;
  const event = {
    data: { json: () => payload },
    waitUntil: (promise: Promise<unknown>) => {
      waited = promise;
    },
  };
  return { event, wait: () => waited };
}

function notificationClickEvent(docId: string | undefined) {
  let waited: Promise<unknown> | undefined;
  const event = {
    notification: {
      close: vi.fn(),
      data: docId === undefined ? undefined : { docId },
    },
    waitUntil: (promise: Promise<unknown>) => {
      waited = promise;
    },
  };
  return { event, wait: () => waited };
}

describe("sw-push.js — push event", () => {
  it("suppresses the OS notification and posts to the tab already focused on that document [AC-127]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const pushHandler = fakeSelf.listeners.get("push")!;

    const focusedClient: FakeClient = {
      focused: true,
      url: "https://app.test/doc/doc-1",
      postMessage: vi.fn(),
    };
    fakeSelf.clients.matchAll.mockResolvedValue([focusedClient]);

    const payload = {
      docId: "doc-1",
      docTitle: "Quarterly plan",
      editorName: "Ada",
      changeSummary: "added 3 lines",
    };
    const { event, wait } = pushEvent(payload);
    pushHandler(event);
    await wait();

    expect(fakeSelf.registration.showNotification).not.toHaveBeenCalled();
    expect(focusedClient.postMessage).toHaveBeenCalledWith({
      type: "docsync:doc-saved",
      payload,
    });
  });

  it("shows an OS notification naming the editor and the change when no tab is focused on that document [AC-128]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const pushHandler = fakeSelf.listeners.get("push")!;

    const unfocusedClient: FakeClient = {
      focused: false,
      url: "https://app.test/dashboard",
      postMessage: vi.fn(),
    };
    fakeSelf.clients.matchAll.mockResolvedValue([unfocusedClient]);

    const payload = {
      docId: "doc-2",
      docTitle: "Roadmap",
      editorName: "Priya",
      changeSummary: "removed 4 lines",
    };
    const { event, wait } = pushEvent(payload);
    pushHandler(event);
    await wait();

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith("Roadmap", {
      body: "Priya removed 4 lines",
      tag: "docsync-doc-doc-2",
      renotify: true,
      data: { docId: "doc-2" },
    });
    expect(unfocusedClient.postMessage).not.toHaveBeenCalled();
  });

  it("scopes the notification tag to the document so a save to a different doc does not replace it [AC-128]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const pushHandler = fakeSelf.listeners.get("push")!;

    fakeSelf.clients.matchAll.mockResolvedValue([]);

    const { event, wait } = pushEvent({
      docId: "doc-other",
      docTitle: "Different doc",
      editorName: "Zed",
      changeSummary: "added 1 line",
    });
    pushHandler(event);
    await wait();

    const [, options] = fakeSelf.registration.showNotification.mock.calls[0]!;
    expect(options).toMatchObject({ tag: "docsync-doc-doc-other" });
    expect(options.tag).not.toBe("docsync-doc-doc-2");
  });
});

describe("sw-push.js — notificationclick event", () => {
  it("focuses an existing tab already showing the document, without opening a new one [AC-129]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const clickHandler = fakeSelf.listeners.get("notificationclick")!;

    const matchingClient: FakeClient = {
      url: "https://app.test/doc/doc-3",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    const otherClient: FakeClient = {
      url: "https://app.test/dashboard",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    fakeSelf.clients.matchAll.mockResolvedValue([otherClient, matchingClient]);

    const { event, wait } = notificationClickEvent("doc-3");
    clickHandler(event);
    await wait();

    expect(matchingClient.focus).toHaveBeenCalledTimes(1);
    expect(otherClient.navigate).not.toHaveBeenCalled();
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled();
  });

  it("reuses an open window and navigates it to the document when no tab already shows it [AC-129]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const clickHandler = fakeSelf.listeners.get("notificationclick")!;

    const existing: FakeClient = {
      url: "https://app.test/dashboard",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    fakeSelf.clients.matchAll.mockResolvedValue([existing]);

    const { event, wait } = notificationClickEvent("doc-4");
    clickHandler(event);
    await wait();

    expect(existing.focus).toHaveBeenCalledTimes(1);
    expect(existing.navigate).toHaveBeenCalledWith("/doc/doc-4");
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window to the document when no client is open at all [AC-129]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const clickHandler = fakeSelf.listeners.get("notificationclick")!;

    fakeSelf.clients.matchAll.mockResolvedValue([]);

    const { event, wait } = notificationClickEvent("doc-5");
    clickHandler(event);
    await wait();

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith("/doc/doc-5");
  });

  it("skips a client whose URL cannot be parsed instead of throwing, and still matches a later one [AC-129]", async () => {
    const fakeSelf = createFakeSelf();
    loadServiceWorker(fakeSelf);
    const clickHandler = fakeSelf.listeners.get("notificationclick")!;

    const unparseable: FakeClient = {
      url: "not a url",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    const matching: FakeClient = {
      url: "https://app.test/doc/doc-6",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    fakeSelf.clients.matchAll.mockResolvedValue([unparseable, matching]);

    const { event, wait } = notificationClickEvent("doc-6");
    clickHandler(event);
    await wait();

    expect(matching.focus).toHaveBeenCalledTimes(1);
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled();
  });
});
