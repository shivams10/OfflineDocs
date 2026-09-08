import { RequireSession } from "@/components/auth/require-session";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <RequireSession>{children}</RequireSession>;
}
