import { ROUTES } from "@/constants/routes";
import { CallbackClient } from "./callback-client";

export default async function AuthCallbackPage({ searchParams }: PageProps<"/auth/callback">) {
  const params = await searchParams;
  const returnTo =
    typeof params.returnTo === "string" ? params.returnTo : ROUTES.dashboard;

  return <CallbackClient returnTo={returnTo} />;
}
