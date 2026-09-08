import { Router } from "express";
import * as authController from "../controllers/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { callbackQuerySchema, startQuerySchema } from "../validators/auth.js";

export const authRouter = Router();

authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);

authRouter.get("/google", validate("query", startQuerySchema), authController.startLogin);

authRouter.get(
  "/google/callback",
  validate("query", callbackQuerySchema),
  authController.handleCallback,
);
