import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as pushController from "../controllers/push.js";
import {
  pushSubscriptionSchema,
  unsubscribeSchema,
} from "../validators/push.js";

/**
 * Subscriptions belong to a user, not a document — there is no `:id` here and so
 * no `requireRole`. Which documents a notification is *sent* for is decided at
 * send time from the ACL (services/push.ts), not by what the browser subscribed to.
 */
export const pushRouter = Router();

pushRouter.use(requireAuth);

pushRouter.get("/vapid-public-key", pushController.vapidKey);

pushRouter.post(
  "/subscribe",
  validate("body", pushSubscriptionSchema),
  pushController.subscribe,
);

// DELETE with a body, because the endpoint URL is long enough to be awkward in a
// path segment and this is the same shape the browser hands us on subscribe.
pushRouter.delete(
  "/subscribe",
  validate("body", unsubscribeSchema),
  pushController.unsubscribe,
);
