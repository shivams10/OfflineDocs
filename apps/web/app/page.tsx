import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/* Temporary design-system proof sheet. Every value on this page comes from a
   token — there is not a single hex code or `dark:` class. Delete it once real
   screens exist; until then it is how we verify the system end to end. */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-border pb-8">
      <h2 className="text-label uppercase text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Badge({
  className,
  dot,
  children,
}: {
  className?: string;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption ${className}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${dot}`} /> : null}
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-10">
      <div className="flex items-center justify-between">
        <span className="text-label uppercase text-muted-foreground">
          Design system
        </span>
        <ThemeToggle />
      </div>

      <Section title="Type scale">
        <div className="space-y-4">
          <p className="text-page-title">All documents</p>
          <p className="text-doc-title">Project Requirements</p>
          <p className="text-body text-foreground-2">
            Saving is a deliberate action so that people always know what state
            their work is in.
          </p>
          <p className="text-ui">Meeting Notes</p>
          <p className="text-caption text-muted-foreground">
            Yesterday, 16:02 · 318 words
          </p>
          <p className="text-label uppercase text-muted-foreground">Members</p>
          <p className="text-meta font-mono text-muted-foreground">
            00:26 · 32 words
          </p>
        </div>
      </Section>

      <Section title="Buttons · 36px, 42px large">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Save</Button>
          <Button variant="outline">Share</Button>
          <Button variant="ghost">Cancel</Button>
          <Button disabled>Save</Button>
          <Button variant="outline" size="icon">
            ⋮
          </Button>
          <Button size="lg">Save</Button>
        </div>
      </Section>

      <Section title="Inputs · 38px · focus ring 3px">
        <div className="max-w-sm space-y-3">
          <input
            className="h-9.5 w-full rounded-lg border border-input bg-card px-3 text-ui placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            placeholder="Search documents"
          />
          <input
            className="h-9.5 w-full rounded-lg border border-input bg-card px-3 text-ui placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            placeholder="name@company.com"
          />
        </div>
      </Section>

      <Section title="Badges & document state">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-primary-soft text-primary">Owner</Badge>
          <Badge className="bg-accent text-foreground">Editor</Badge>
          <Badge className="bg-accent text-foreground">Viewer</Badge>
          <Badge className="bg-success-soft text-success" dot="bg-success">
            Saved
          </Badge>
          <Badge className="bg-warning-soft text-warning" dot="bg-warning">
            Offline
          </Badge>
          {/* --neutral is for the dot only: as label text it is 2.36:1 on this
              background. Neutral badge labels use muted-foreground. */}
          <Badge className="bg-accent text-muted-foreground" dot="bg-neutral">
            Draft
          </Badge>
          <Badge
            className="bg-destructive-soft text-destructive"
            dot="bg-destructive"
          >
            Save failed
          </Badge>
        </div>
      </Section>

      <Section title="Radius & elevation">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-20 rounded-sm bg-card shadow-sh-1" />
          <div className="h-20 rounded-lg bg-card shadow-sh-2" />
          <div className="h-20 rounded-xl bg-card shadow-sh-3" />
        </div>
        <div className="grid gap-4 text-caption text-muted-foreground sm:grid-cols-3">
          <p>--r-sm 6 · sh-1</p>
          <p>--r 8 · sh-2</p>
          <p>--r-lg 12 · sh-3</p>
        </div>
      </Section>

    </main>
  );
}
