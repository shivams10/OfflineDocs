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

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession(): UseQueryResult<AuthUser | null> {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
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
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.clear();
      router.replace(ROUTES.login);
    },
  });
}
