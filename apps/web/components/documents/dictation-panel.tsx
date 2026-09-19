import { useEffect, useState } from "react";
import { Check, Copy, Mic, Square } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PanelShell } from "@/components/documents/panel-shell";
import { MIC_ERROR_MESSAGES, transcribeErrorMessage } from "@/constants/errors";
import { DICTATION_LABELS } from "@/constants/labels";
import { useDictation } from "@/lib/dictation/use-dictation";
import { MAX_RECORDING_MS, useRecorder } from "@/lib/dictation/use-recorder";

function formatSeconds(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The editor's dictation entry point plus its panel. Render it only for roles
 * that can edit — viewers get no entry point at all (spec §16.1).
 *
 * State lives here rather than in the panel, so closing the panel mid-recording
 * or mid-transcription loses nothing: the recording is stopped and still sent,
 * and its transcript is waiting when the panel reopens.
 */
export function DictationControl({
  docId,
  online,
  onInsert,
}: {
  docId: string;
  online: boolean;
  /** Inserts reviewed text at the editor's last-known cursor. */
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dictation = useDictation(docId);
  const recorder = useRecorder(dictation.transcribe);
  const { stop } = recorder;

  // Losing the connection mid-recording would only produce audio we can't send.
  useEffect(() => {
    if (!online) stop();
  }, [online, stop]);

  function handleOpenChange(next: boolean) {
    if (next) return;
    stop();
    setOpen(false);
  }

  function handleInsert(text: string) {
    onInsert(text);
    dictation.setTranscript("");
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={DICTATION_LABELS.open}
      >
        <Mic data-icon="inline-start" />
        <span className="max-md:hidden">{DICTATION_LABELS.open}</span>
      </Button>

      {open ? (
        <DictationPanel
          dictation={dictation}
          recorder={recorder}
          online={online}
          onInsert={handleInsert}
          onOpenChange={handleOpenChange}
        />
      ) : null}
    </>
  );
}

function DictationPanel({
  dictation,
  recorder,
  online,
  onInsert,
  onOpenChange,
}: {
  dictation: ReturnType<typeof useDictation>;
  recorder: ReturnType<typeof useRecorder>;
  online: boolean;
  onInsert: (text: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    title,
    subtitle,
    startRecording,
    stopRecording,
    requestingMic,
    recording: recordingLabel,
    timeLeftSuffix,
    idleHint,
    inputLevel,
    transcribing,
    transcriptLabel,
    transcriptPlaceholder,
    offlineHint,
    retry,
    discard,
    clear,
    copy,
    copied: copiedLabel,
    insert,
  } = DICTATION_LABELS;

  const { transcript, setTranscript, loaded, pendingCount, failed, retryFailed, discardFailed } =
    dictation;
  const { status, error, level, elapsedMs, start, stop } = recorder;

  const [copied, setCopied] = useState(false);

  const isRecording = status === "recording";
  const hasText = transcript.trim().length > 0;
  const lastFailure = failed.at(-1);

  function handleCopy() {
    void navigator.clipboard?.writeText(transcript).then(
      () => setCopied(true),
      () => undefined,
    );
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        variant="ghost"
        className="mr-auto"
        onClick={() => setTranscript("")}
        disabled={!hasText}
      >
        {clear}
      </Button>
      <Button variant="outline" onClick={handleCopy} disabled={!hasText}>
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        {copied ? copiedLabel : copy}
      </Button>
      <Button onClick={() => onInsert(transcript)} disabled={!hasText || isRecording}>
        {insert}
      </Button>
    </div>
  );

  return (
    <PanelShell title={title} subtitle={subtitle} onOpenChange={onOpenChange} footer={footer}>
      <div className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">
              {MIC_ERROR_MESSAGES[error]}
            </AlertDescription>
          </Alert>
        ) : null}

        {!online ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-caption text-muted-foreground">
            {offlineHint}
          </p>
        ) : null}

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            {isRecording ? (
              <Button variant="outline" size="lg" onClick={stop}>
                <Square data-icon="inline-start" />
                {stopRecording}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => void start()}
                disabled={!online || !loaded || status === "requesting"}
              >
                <Mic data-icon="inline-start" />
                {status === "requesting" ? requestingMic : startRecording}
              </Button>
            )}

            {/* Only the state is announced — the ticking countdown would flood a screen reader. */}
            <p aria-live="polite" className="text-caption text-muted-foreground">
              {isRecording ? recordingLabel : null}
            </p>
            {isRecording ? (
              <span className="ml-auto font-mono text-meta text-muted-foreground">
                {formatSeconds(MAX_RECORDING_MS - elapsedMs)} {timeLeftSuffix}
              </span>
            ) : null}
          </div>

          {isRecording ? (
            <div
              role="meter"
              aria-label={inputLevel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-75 motion-reduce:transition-none"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          ) : (
            <p className="text-caption text-muted-foreground">{idleHint}</p>
          )}
        </section>

        {pendingCount > 0 ? (
          <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
            <Spinner aria-hidden="true" />
            {transcribing}
          </p>
        ) : null}

        {lastFailure ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-destructive">
              <span className="min-w-0 flex-1">{transcribeErrorMessage(lastFailure.code)}</span>
              <button type="button" className="underline" onClick={retryFailed} disabled={!online}>
                {retry}
              </button>
              <button type="button" className="underline" onClick={discardFailed}>
                {discard}
              </button>
            </AlertDescription>
          </Alert>
        ) : null}

        <label className="block space-y-2">
          <span className="text-label uppercase text-muted-foreground">{transcriptLabel}</span>
          <textarea
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setCopied(false);
            }}
            disabled={!loaded}
            placeholder={transcriptPlaceholder}
            rows={8}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-ui text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
        </label>
      </div>
    </PanelShell>
  );
}
