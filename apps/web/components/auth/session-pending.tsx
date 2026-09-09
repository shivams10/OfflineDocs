import { Spinner } from "@/components/ui/spinner";

/** Shared waiting state for the auth guards, the home redirect and the OAuth callback. */
export function SessionPending({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <p aria-live="polite" className="flex items-center gap-2 text-ui text-muted-foreground">
        <Spinner />
        {label}
      </p>
    </div>
  );
}
