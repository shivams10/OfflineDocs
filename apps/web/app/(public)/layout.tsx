import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>;
}
