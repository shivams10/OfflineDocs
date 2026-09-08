import { prisma } from "../db/client.js";
import { REFRESH_TOKEN_TTL_SECONDS } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { AppError } from "../lib/http-error.js";
import type { UserModel } from "../generated/prisma/models.js";

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

function hashRefreshToken(token: string): string {
  return sha256(token);
}

export async function issueSession(user: Pick<UserModel, "id" | "email">): Promise<IssuedSession> {
  const refreshToken = randomToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  const accessToken = await signAccessToken({ sub: user.id, email: user.email });
  return { accessToken, refreshToken, csrfToken: randomToken() };
}

export async function rotateSession(presentedToken: string): Promise<IssuedSession> {
  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw AppError.unauthorized("Invalid refresh token");
  }

  if (existing.revokedAt) {
    await revokeAllSessionsForUser(existing.userId);
    throw new AppError(
      401,
      "refresh_token_reused",
      "This session was already ended. Please sign in again.",
    );
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "refresh_token_expired", "Your session has expired. Please sign in again.");
  }

  const newToken = randomToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashRefreshToken(newToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    }),
  ]);

  const accessToken = await signAccessToken({
    sub: existing.user.id,
    email: existing.user.email,
  });
  return { accessToken, refreshToken: newToken, csrfToken: randomToken() };
}

export async function revokeSession(presentedToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
