import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(Buffer.from(a)).digest();
  const digestB = createHash("sha256").update(Buffer.from(b)).digest();
  return timingSafeEqual(digestA, digestB);
}
