import type { Metadata } from "next";
import { BrandLockup } from "@/components/brand-lockup";
import { LOGIN_FORM, LOGIN_PITCH } from "@/constants/labels";
import { FeaturePills } from "./feature-pills";
import { GoogleSignInButton } from "./google-sign-in-button";
import { LoginError } from "./login-error";
import { TypedWord } from "./typed-word";
import { WorkspacePreview } from "./workspace-preview";

export const metadata: Metadata = { title: "Sign in · DocSync" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Next 16: searchParams is async.
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : undefined;

  return (
    <main className="flex min-h-svh flex-col bg-card lg:flex-row">
      {/* ---------------- Pitch panel ---------------- */}
      <section className="flex flex-col gap-6 border-border bg-primary-soft px-5 pt-8 pb-10 sm:px-8 lg:flex-1 lg:justify-center lg:gap-7 lg:border-r lg:px-16 lg:py-16">
        <BrandLockup className="text-body lg:text-[1.0625rem]" />

        <div className="max-w-[470px]">
          <h1 className="text-balance text-[1.5rem]/[1.25] font-bold tracking-[-0.02em] sm:text-[1.75rem]/[1.2] lg:text-[2.125rem]/[1.2] lg:tracking-[-0.024em]">
            {LOGIN_PITCH.headline}
          </h1>
          <p className="mt-2 text-pretty text-[0.84375rem]/[1.6] text-foreground-2 lg:mt-3.5 lg:text-body/[1.65]">
            <span className="lg:hidden">{LOGIN_PITCH.bodyShort}</span>
            <span className="hidden lg:inline">{LOGIN_PITCH.body}</span>
          </p>
        </div>

        <WorkspacePreview className="w-full lg:order-last lg:max-w-[520px]" />
        <FeaturePills />
      </section>

      {/* ---------------- Form panel ---------------- */}
      <section className="flex flex-1 flex-col px-5 pb-7 sm:px-8 lg:w-160 lg:flex-none lg:px-18 lg:py-8">
        <div className="hidden items-baseline justify-between gap-3 lg:flex">
          <p className="flex items-baseline gap-1.5 text-[1.1875rem]/[1.3] font-bold tracking-[-0.02em]">
            {LOGIN_FORM.startPrefix} <TypedWord />
          </p>
          <span className="text-caption font-medium text-muted-foreground">
            {LOGIN_FORM.needHelp}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-4 lg:justify-center lg:gap-0">
          <div className="hidden lg:block">
            <h2 className="text-balance text-[2.25rem]/[1.14] font-bold tracking-[-0.03em]">
              {LOGIN_FORM.headline}
            </h2>
            <p className="mt-4 text-pretty text-body/[1.65] text-foreground-2">
              {LOGIN_FORM.body}
            </p>
            <div className="h-8" />
          </div>

          <LoginError code={errorCode} />
          <GoogleSignInButton returnTo={returnTo} />

          <p className="text-center text-caption text-muted-foreground lg:mt-3.5 lg:text-left">
            {LOGIN_FORM.workspaceNote}
          </p>
        </div>

        <p className="mt-6 hidden text-meta text-muted-foreground lg:mt-0 lg:block">
          {LOGIN_FORM.legalPrefix}{" "}
          <span className="font-medium text-primary">{LOGIN_FORM.legalTerms}</span>{" "}
          {LOGIN_FORM.legalAnd}{" "}
          <span className="font-medium text-primary">{LOGIN_FORM.legalPrivacy}</span>
          {LOGIN_FORM.legalSuffix}
        </p>
      </section>
    </main>
  );
}
