import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIC_ERROR_MESSAGES, TRANSCRIBE_ERROR_MESSAGES } from "@/constants/errors";
import { DICTATION_LABELS, EDITOR_LABELS, SYNC_STATE_LABELS } from "@/constants/labels";
import {
  makeDoc,
  makeSnapshot,
  renderDocEditor,
  setOnline,
} from "@/components/documents/doc-editor.test-utils";
import { ApiError } from "@/lib/api/client";
import { transcribeAudio } from "@/lib/api/dictation";
import { readTranscript } from "@/lib/dictation/transcript-store";

vi.mock("@/lib/api/dictation", () => ({ transcribeAudio: vi.fn() }));

vi.mock("@/lib/api/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/documents")>();
  return { ...actual, saveDoc: vi.fn(), renameDoc: vi.fn() };
});

vi.mock("@/lib/api/presence", () => ({
  sendHeartbeat: vi.fn().mockResolvedValue({ backedUpAt: null }),
  fetchPresence: vi.fn().mockResolvedValue([]),
  fetchOwnDraft: vi.fn().mockResolvedValue(null),
}));

const trackStop = vi.fn();
const getUserMedia = vi.fn();

/** Just enough MediaRecorder: stop() emits one chunk, then `onstop`. */
class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type.startsWith("audio/webm");

  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  setOnline(true);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(transcribeAudio).mockReset();
  getUserMedia.mockReset();
  trackStop.mockReset();
});

function renderEditor(role: "owner" | "editor" | "viewer" = "editor", text = "Hello there") {
  return renderDocEditor(makeDoc({ role, snapshot: makeSnapshot(text) }));
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: DICTATION_LABELS.open }));
  // Recording stays disabled until the saved transcript has been read back.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: DICTATION_LABELS.startRecording })).toBeEnabled(),
  );
}

async function recordOnce(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: DICTATION_LABELS.startRecording }));
  await user.click(await screen.findByRole("button", { name: DICTATION_LABELS.stopRecording }));
}

function transcriptBox() {
  return screen.getByPlaceholderText(DICTATION_LABELS.transcriptPlaceholder);
}

describe("DocEditor — dictation", () => {
  it("gives viewers no dictation entry point at all", () => {
    renderEditor("viewer");

    expect(screen.queryByRole("button", { name: DICTATION_LABELS.open })).not.toBeInTheDocument();
  });

  it("shows the entry point to owners and editors", () => {
    renderEditor("owner");
    expect(screen.getByRole("button", { name: DICTATION_LABELS.open })).toBeInTheDocument();
  });

  it("records, transcribes into the panel, and inserts at the last cursor only on request", async () => {
    const user = userEvent.setup();
    const { doc } = renderEditor("editor", "Hello there");
    vi.mocked(transcribeAudio).mockResolvedValueOnce("big");

    // Leave the cursor between "Hello" and " there".
    const body = screen.getByPlaceholderText(EDITOR_LABELS.bodyPlaceholder) as HTMLTextAreaElement;
    body.setSelectionRange(5, 5);
    fireEvent.select(body);

    await openPanel(user);
    await recordOnce(user);

    await waitFor(() => expect(transcriptBox()).toHaveValue("big"));
    const [docId, audio] = vi.mocked(transcribeAudio).mock.calls[0]!;
    expect(docId).toBe(doc.id);
    expect(audio.type).toBe("audio/webm;codecs=opus");
    // The microphone is released once recording stops.
    expect(trackStop).toHaveBeenCalled();

    // Nothing reached the document yet.
    expect(body).toHaveValue("Hello there");

    // The user corrects the transcript before inserting.
    await user.clear(transcriptBox());
    await user.type(transcriptBox(), "brave");
    await user.click(screen.getByRole("button", { name: DICTATION_LABELS.insert }));

    expect(body).toHaveValue("Hello brave there");
    expect(screen.queryByText(DICTATION_LABELS.title)).not.toBeInTheDocument();
    // An ordinary local edit: the doc is now a draft waiting for Save.
    expect(screen.getByText(SYNC_STATE_LABELS.draft)).toBeInTheDocument();
    await waitFor(async () => expect(await readTranscript(doc.id)).toBe(""));
  });

  it("appends successive recordings in the order they were spoken", async () => {
    const user = userEvent.setup();
    renderEditor();
    let releaseFirst!: (text: string) => void;
    vi.mocked(transcribeAudio)
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce("second");

    await openPanel(user);
    await recordOnce(user);
    await recordOnce(user);

    // The second chunk waits for the first, rather than racing it.
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    releaseFirst("first");

    await waitFor(() => expect(transcriptBox()).toHaveValue("first second"));
  });

  it("shows an inline error when the microphone is blocked, and typing still works", async () => {
    const user = userEvent.setup();
    renderEditor("editor", "abc");
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: DICTATION_LABELS.startRecording }));

    expect(await screen.findByText(MIC_ERROR_MESSAGES.permission_denied)).toBeInTheDocument();
    expect(transcribeAudio).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    const body = screen.getByPlaceholderText(EDITOR_LABELS.bodyPlaceholder);
    await user.type(body, "d");
    expect(body).toHaveValue("abcd");
  });

  it("records offline, queues the audio, and transcribes it on reconnect [Phase 4.2]", async () => {
    const user = userEvent.setup();
    renderEditor();
    vi.mocked(transcribeAudio).mockResolvedValueOnce("recorded while offline");
    setOnline(false);

    await openPanel(user);
    expect(screen.getByText(DICTATION_LABELS.offlineHint)).toBeInTheDocument();

    // Phase 4.2 supersedes the disabled-offline button: the audio is kept.
    await recordOnce(user);

    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(await screen.findByText(DICTATION_LABELS.queuedOne)).toBeInTheDocument();

    setOnline(true);

    await waitFor(() => expect(transcriptBox()).toHaveValue("recorded while offline"));
    // The raw audio goes once its transcript is in hand. The queue snapshot
    // refreshes a tick after the delete, so this waits rather than asserting now.
    await waitFor(() =>
      expect(screen.queryByText(DICTATION_LABELS.queuedOne)).not.toBeInTheDocument(),
    );
  });

  it("keeps a failed recording so it can be retried", async () => {
    const user = userEvent.setup();
    renderEditor();
    vi.mocked(transcribeAudio)
      .mockRejectedValueOnce(new ApiError(503, "stt_unavailable", "down"))
      .mockResolvedValueOnce("recovered");

    await openPanel(user);
    await recordOnce(user);

    expect(
      await screen.findByText(TRANSCRIBE_ERROR_MESSAGES.stt_unavailable!),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: DICTATION_LABELS.retry }));

    await waitFor(() => expect(transcriptBox()).toHaveValue("recovered"));
    expect(screen.queryByText(TRANSCRIBE_ERROR_MESSAGES.stt_unavailable!)).not.toBeInTheDocument();
    const [, firstAudio] = vi.mocked(transcribeAudio).mock.calls[0]!;
    const [, retriedAudio] = vi.mocked(transcribeAudio).mock.calls[1]!;
    expect(retriedAudio).toBe(firstAudio);
  });

  it("closing the panel mid-recording still transcribes, and the text is there on reopen", async () => {
    const user = userEvent.setup();
    renderEditor();
    vi.mocked(transcribeAudio).mockResolvedValueOnce("not lost");

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: DICTATION_LABELS.startRecording }));
    await screen.findByRole("button", { name: DICTATION_LABELS.stopRecording });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(transcribeAudio).toHaveBeenCalledOnce());
    expect(trackStop).toHaveBeenCalled();

    await openPanel(user);
    await waitFor(() => expect(transcriptBox()).toHaveValue("not lost"));
  });

  it("restores the transcript for the same document after the editor remounts", async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ role: "editor", snapshot: makeSnapshot("x") });
    vi.mocked(transcribeAudio).mockResolvedValueOnce("saved for later");

    const first = renderDocEditor(doc);
    await openPanel(user);
    await recordOnce(user);
    await waitFor(async () => expect(await readTranscript(doc.id)).toBe("saved for later"));
    first.unmount();

    renderDocEditor(doc);
    await openPanel(user);
    expect(transcriptBox()).toHaveValue("saved for later");
  });
});
