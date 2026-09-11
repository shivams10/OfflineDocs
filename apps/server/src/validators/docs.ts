import { z } from "zod";

// .trim() before .min(1): whitespace-only titles must fail, not become "".
export const createDocSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export type CreateDocBody = z.infer<typeof createDocSchema>;

export const renameDocSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export type RenameDocBody = z.infer<typeof renameDocSchema>;
