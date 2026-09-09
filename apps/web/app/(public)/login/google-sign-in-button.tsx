"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";
import { LOGIN_FORM } from "@/constants/labels";
import { googleLoginUrl } from "@/lib/api/auth";
import { safeReturnTo } from "@/lib/auth/paths";

export function GoogleSignInButton({ returnTo }: { returnTo?: string }) {
  const [redirecting, setRedirecting] = useState(false);

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={redirecting}
      onClick={() => {
        setRedirecting(true);
        window.location.assign(googleLoginUrl(safeReturnTo(returnTo)));
      }}
      className="h-12.5 w-full gap-3 border-border-strong text-[0.90625rem] font-medium shadow-sh-2 lg:h-13.5 lg:text-body"
    >
      <GoogleIcon className="size-5" />
      {redirecting ? LOGIN_FORM.googleCtaBusy : LOGIN_FORM.googleCta}
    </Button>
  );
}
