import { isTtarawaingIOS } from "./native-app.ts";

export const SEOUL_BIKE_APP_URL = "bikeseoul://action";
export const SEOUL_BIKE_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.dki.spb_android";
export const SEOUL_BIKE_APP_STORE_URL =
  "https://apps.apple.com/kr/app/id1037272004";
export const SEOUL_BIKE_INSTALL_GUIDE_URL =
  "https://news.seoul.go.kr/traffic/archives/505738";

export function getSeoulBikeAppLinks(navigator: {
  userAgent: string;
  maxTouchPoints?: number;
}) {
  if (/Android/i.test(navigator.userAgent)) {
    return {
      app: `intent://action#Intent;scheme=bikeseoul;package=com.dki.spb_android;S.browser_fallback_url=${encodeURIComponent(SEOUL_BIKE_PLAY_STORE_URL)};end`,
      install: SEOUL_BIKE_PLAY_STORE_URL,
    };
  }

  if (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) &&
      (navigator.maxTouchPoints ?? 0) > 1)
  ) {
    return { app: SEOUL_BIKE_APP_URL, install: SEOUL_BIKE_APP_STORE_URL };
  }

  return { app: null, install: SEOUL_BIKE_INSTALL_GUIDE_URL };
}

/** iOS cannot probe a custom scheme without showing Safari's invalid-URL alert. */
export function startSeoulBikeRental(
  browser: Window,
  showInstallGuide: () => void,
): () => void {
  if (isTtarawaingIOS(browser.navigator.userAgent)) {
    browser.location.assign(SEOUL_BIKE_APP_URL);
    return () => {};
  }

  if (getSeoulBikeAppLinks(browser.navigator).app === SEOUL_BIKE_APP_URL) {
    showInstallGuide();
    return () => {};
  }
  return openSeoulBikeApp(browser);
}

/** On iOS, call only after the user explicitly chooses to open an installed app. */
export function openSeoulBikeApp(browser: Window): () => void {
  const { app, install } = getSeoulBikeAppLinks(browser.navigator);
  if (!app) {
    browser.location.assign(install);
    return () => {};
  }

  let pending = true;
  const cancel = () => {
    pending = false;
    browser.clearTimeout(timer);
    browser.document.removeEventListener("visibilitychange", onVisibilityChange);
    browser.removeEventListener("pagehide", cancel);
  };
  const onVisibilityChange = () => {
    // Cancel permanently: returning from the app must never open the store.
    if (browser.document.visibilityState === "hidden") cancel();
  };
  const openStore = () => {
    if (!pending) return;
    const isVisible = browser.document.visibilityState === "visible";
    cancel();
    if (isVisible) browser.location.assign(install);
  };

  // Also covers browsers that ignore Android's browser_fallback_url.
  const timer = browser.setTimeout(openStore, 2000);
  browser.document.addEventListener("visibilitychange", onVisibilityChange);
  browser.addEventListener("pagehide", cancel);
  try {
    browser.location.assign(app);
  } catch {
    openStore();
  }
  return cancel;
}
