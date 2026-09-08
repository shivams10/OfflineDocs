import { z } from "zod";

export const startQuerySchema = z.object({
  returnTo: z.string().optional(),
});


export const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

export type StartQuery = z.infer<typeof startQuerySchema>;
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;
