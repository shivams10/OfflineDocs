import { z } from "zod";

// Base64 shape only, same as saveDocSchema: whether the bytes are a real Yjs
// update is not this layer's business. Unlike a save, a backup that fails to
// decode is never applied to anything, so it is stored as sent and validated
// when it is read back.
export const draftBackupSchema = z.object({
  update: z.string().min(1).optional(),
});

export type DraftBackupBody = z.infer<typeof draftBackupSchema>;
