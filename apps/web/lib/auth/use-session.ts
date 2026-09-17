"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@docsync/shared";
import { ROUTES } from "@/constants/routes";
import { fetchSession, logout } from "@/lib/api/auth";
import {
  forgetSession,
  readRememberedSession,
  rememberSession,
} from "@/lib/auth/offline-session";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession(): UseQueryResult<AuthUser | null> {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        const user = await fetchSession();
        // Recorded on every answer, including a definite "signed out", so the
        // fallback below can never outlive the real session.
        rememberSession(user);
        return user;
      } catch (error) {
        /* Only a transport failure reaches here — fetchSession() turns a real 401
           into null. Not gated on navigator.onLine: that reports an interface,
           not reachability. */
        const remembered = readRememberedSession();
        if (remembered) return remembered;
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // On settled, not on success: even a failed logout must end the offline
      // session, or the app stays openable on this device.
      forgetSession();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.clear();
      router.replace(ROUTES.login);
    },
  });
}
