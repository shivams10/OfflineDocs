import { AppError } from "../../lib/http-error.js";
import { constantTimeEquals } from "../../lib/crypto.js";
import { issueSession, type IssuedSession } from "../auth.js";
import { findOrCreateUserFromGoogle } from "../users.js";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  fetchGoogleProfile,
  getGoogleCredentials,
} from "./google.js";
import { createState, readState } from "./state.js";

export interface StartedGoogleLogin {
  state: string;
  authorizeUrl: string;
}

export interface CompleteGoogleLoginInput {
  code: string;
  state: string;
  stateCookie: string;
}

export interface CompletedGoogleLogin {
  session: IssuedSession;
  returnTo: string;
}

export async function startGoogleLogin(
  returnTo: string | undefined,
): Promise<StartedGoogleLogin> {
  getGoogleCredentials(); 

  const state = await createState(returnTo);
  return { state, authorizeUrl: buildGoogleAuthorizeUrl(state) };
}

export async function completeGoogleLogin(
  input: CompleteGoogleLoginInput,
): Promise<CompletedGoogleLogin> {
 
  if (!constantTimeEquals(input.stateCookie, input.state)) {
    throw new AppError(
      400,
      "invalid_oauth_state",
      "Sign-in request could not be verified. Please try again.",
    );
  }

  const cookieState = await readState(input.stateCookie);

  const googleAccessToken = await exchangeGoogleCode(input.code);
  const profile = await fetchGoogleProfile(googleAccessToken);
  const user = await findOrCreateUserFromGoogle(profile);

  return { session: await issueSession(user), returnTo: cookieState.returnTo };
}
