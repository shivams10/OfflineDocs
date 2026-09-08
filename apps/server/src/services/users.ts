import { prisma } from "../db/client.js";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../lib/http-error.js";
import type { GoogleProfile } from "./oauth/google.js";
import type { UserModel } from "../generated/prisma/models.js";

interface UniqueViolationMeta {
  target?: string[] | string;
  driverAdapterError?: { cause?: { constraint?: { index?: string } } };
}

function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const meta = error.meta as UniqueViolationMeta | undefined;
  const target = meta?.target;
  if (Array.isArray(target)) return target.includes(field);

  const name = typeof target === "string" ? target : meta?.driverAdapterError?.cause?.constraint?.index;
  return typeof name === "string" && name.toLowerCase().includes(`_${field.toLowerCase()}_`);
}

const emailTaken = () =>
  new AppError(
    409,
    "email_already_registered",
    "Another DocSync account already uses this email address.",
  );

export async function findOrCreateUserFromGoogle(profile: GoogleProfile): Promise<UserModel> {
  const email = profile.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { googleId: profile.providerUserId } });

  if (existing) {
    const name = profile.name ?? existing.name;
    const avatarUrl = profile.avatarUrl ?? existing.avatarUrl;

    if (existing.email === email && existing.name === name && existing.avatarUrl === avatarUrl) {
      return existing;
    }

    try {
      return await prisma.user.update({ where: { id: existing.id }, data: { email, name, avatarUrl } });
    } catch (error) {
      if (isUniqueViolationOn(error, "email")) throw emailTaken();
      throw error;
    }
  }

  if (!profile.emailVerified) {
    throw new AppError(
      403,
      "email_not_verified",
      "Your Google email address is not verified. Verify it with Google, then sign in again.",
    );
  }

  try {
    return await prisma.user.create({
      data: { googleId: profile.providerUserId, email, name: profile.name, avatarUrl: profile.avatarUrl },
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "email")) throw emailTaken();
    throw error;
  }
}

/** Public profile fields — the only user columns any endpoint is allowed to hand out. */
const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export type UserProfile = Pick<UserModel, keyof typeof PUBLIC_USER_FIELDS>;

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_FIELDS,
  });

  if (!user) {
    throw AppError.unauthorized("Account no longer exists");
  }

  return user;
}
