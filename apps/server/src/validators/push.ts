import { z } from "zod";

// Mirrors the browser's PushSubscription.toJSON() shape, narrowed to the three
// fields web-push actually needs. Anything else the browser sends is dropped
// rather than stored.
export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscriptionBody = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z.object({
  endpoint: z.url(),
});

export type UnsubscribeBody = z.infer<typeof unsubscribeSchema>;
