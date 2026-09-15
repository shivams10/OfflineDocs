import "dotenv/config";
import { z } from "zod";


const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SERVER_ORIGIN: z.string().url().default("http://localhost:3000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:4000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // All three or none: push stays off unless the set is complete, rather than
  // failing at send time with a half-configured signer.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

/** Access tokens stay short-lived; the refresh token is what survives a long offline gap. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** How long the browser has to complete a provider round trip before the state cookie dies. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * Presence is a TTL, not a connection. The client heartbeats every
 * HEARTBEAT_INTERVAL and a row counts as present for PRESENCE_TTL -- roughly
 * 2x -- so one dropped beat does not blink someone out of the list, while a
 * closed tab disappears on its own with no "leaving" signal to miss.
 */
export const PRESENCE_TTL_SECONDS = 60;
export const PRESENCE_HEARTBEAT_INTERVAL_SECONDS = 25;
export const PRESENCE_POLL_INTERVAL_SECONDS = 15;

/** Rows this old are past any plausible TTL and are swept opportunistically. */
export const PRESENCE_SWEEP_AFTER_SECONDS = 60 * 60;

/**
 * Collapses a burst of saves by one editor into a single notification -- the
 * typo fixed right after saving should not be a second buzz. Long enough to
 * catch that follow-up, short enough that the notification still feels immediate.
 */
export const PUSH_DEBOUNCE_MS = 5_000;

/** Push is configured only when the whole VAPID set is present. */
export const vapid =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      }
    : null;
