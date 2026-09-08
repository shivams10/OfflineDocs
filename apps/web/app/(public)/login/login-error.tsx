import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authErrorMessage } from "@/constants/errors";

export function LoginError({ code }: { code: string | undefined }) {
  const message = authErrorMessage(code);
  if (!message) return null;

  return (
    <Alert variant="destructive" className="bg-destructive-soft">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
