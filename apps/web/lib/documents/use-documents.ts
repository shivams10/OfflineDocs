"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { DocSummary } from "@docsync/shared";
import { ROUTES } from "@/constants/routes";
import {
  createDoc,
  deleteDoc,
  duplicateDoc,
  fetchDocs,
  renameDoc,
} from "@/lib/api/documents";

// "list" segment matters: Part 2 needs ["docs", "detail", id]. A bare ["docs"]
// key would make this list's invalidation prefix-match and refetch the
// editor's snapshot query too, overwriting an unsaved local draft.
export const DOCS_QUERY_KEY = ["docs", "list"] as const;

export function useDocs(): UseQueryResult<DocSummary[]> {
  return useQuery({
    queryKey: DOCS_QUERY_KEY,
    queryFn: fetchDocs,
  });
}

export function useCreateDoc() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (title?: string) => createDoc(title),
    onSuccess: async (doc) => {
      await queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      router.push(ROUTES.doc(doc.id));
    },
  });
}

export function useRenameDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDoc(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY }),
  });
}

export function useDeleteDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDoc(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY }),
  });
}

// Deliberately does not navigate, unlike useCreateDoc — duplicating from a
// row should leave the caller on the dashboard looking at the new row.
export function useDuplicateDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => duplicateDoc(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY }),
  });
}
