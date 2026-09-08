import { HomeRedirect } from "./home-redirect";

/*
 * `/` holds no content of its own — it only routes by session state. Rendering a neutral
 * pending state rather than guessing means a signed-in user never sees a login form flash,
 * and a signed-out user never sees protected chrome.
 */
export default function Home() {
  return <HomeRedirect />;
}
