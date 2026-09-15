import type { Request, Response } from "express";
import type {
  PushSubscriptionRequest,
  VapidKeyResponse,
} from "@docsync/shared";
import { getAuthenticatedUser } from "../middleware/auth.js";
import {
  removeSubscription,
  saveSubscription,
  vapidPublicKey,
} from "../services/push.js";
import type { UnsubscribeBody } from "../validators/push.js";

/**
 * The client needs this key to call `pushManager.subscribe()`. Served rather than
 * baked into the web build so the two halves cannot drift: a rotated key takes
 * effect without a frontend deploy, and `null` is the honest answer on a server
 * with no keys — the UI hides the toggle instead of offering something that
 * cannot work.
 */
export function vapidKey(_req: Request, res: Response<VapidKeyResponse>): void {
  res.json({ publicKey: vapidPublicKey() });
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthenticatedUser(req);
  const subscription = req.body as unknown as PushSubscriptionRequest;

  await saveSubscription(userId, subscription);
  res.status(204).send();
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthenticatedUser(req);
  const { endpoint } = req.body as unknown as UnsubscribeBody;

  await removeSubscription(userId, endpoint);
  res.status(204).send();
}
