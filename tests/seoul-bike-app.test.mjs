import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeoulBikeAppLinks,
  openSeoulBikeApp,
  startSeoulBikeRental,
  SEOUL_BIKE_APP_URL,
  SEOUL_BIKE_APP_STORE_URL,
  SEOUL_BIKE_PLAY_STORE_URL,
  SEOUL_BIKE_INSTALL_GUIDE_URL,
} from "../app/seoul-bike-app.ts";

function createBrowser(userAgent = "iPhone", rejectApp = false) {
  const browser = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = "visible";
  const navigations = [];
  const timers = new Map();
  let timerId = 0;
  Object.assign(browser, {
    document,
    navigator: { userAgent, maxTouchPoints: 0 },
    location: {
      assign(url) {
        if (rejectApp && !url.startsWith("https:")) throw new Error("Blocked");
        navigations.push(url);
      },
    },
    setTimeout(callback) {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    browser,
    navigations,
    timers,
    elapse() { for (const callback of [...timers.values()]) callback(); },
    setVisibility(state) {
      document.visibilityState = state;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("Android launches the official package with a Google Play fallback", () => {
  const links = getSeoulBikeAppLinks({ userAgent: "Mozilla/5.0 (Linux; Android 15)" });
  assert.match(links.app, /^intent:\/\/action#Intent;scheme=bikeseoul;/);
  assert.match(links.app, /package=com\.dki\.spb_android;/);
  const fallback = links.app.match(/S\.browser_fallback_url=([^;]+)/)[1];
  assert.equal(decodeURIComponent(fallback), SEOUL_BIKE_PLAY_STORE_URL);
});

test("iOS rental shows installation guidance without probing a scheme or starting a redirect timer", () => {
  for (const [userAgent, maxTouchPoints] of [["iPhone", 5], ["iPad", 5], ["Macintosh", 5]]) {
    const state = createBrowser(userAgent);
    state.browser.navigator.maxTouchPoints = maxTouchPoints;
    let prompts = 0;
    const cancel = startSeoulBikeRental(state.browser, () => { prompts += 1; });
    state.elapse();
    assert.equal(prompts, 1);
    assert.deepEqual(state.navigations, []);
    assert.equal(state.timers.size, 0);
    cancel();
    assert.deepEqual(state.navigations, []);
  }
});

test("Android rental still opens the app directly and keeps its store fallback", () => {
  const state = createBrowser("Android");
  startSeoulBikeRental(state.browser, () => assert.fail("Unexpected iOS prompt"));
  assert.match(state.navigations[0], /^intent:/);
  state.elapse();
  assert.equal(state.navigations[1], SEOUL_BIKE_PLAY_STORE_URL);
});

test("the iOS app hands rental off to native code without a second store redirect", () => {
  const state = createBrowser("Mozilla/5.0 (iPhone) TtarawaingApp/iOS");
  startSeoulBikeRental(state.browser, () => assert.fail("Unexpected Safari install guide"));
  state.elapse();
  assert.deepEqual(state.navigations, [SEOUL_BIKE_APP_URL]);
  assert.equal(state.timers.size, 0);
});

test("iPhone, iPad and desktop-mode iPad use the App Store", () => {
  for (const navigator of [
    { userAgent: "iPhone" },
    { userAgent: "iPad" },
    { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 },
  ]) {
    assert.deepEqual(getSeoulBikeAppLinks(navigator), {
      app: SEOUL_BIKE_APP_URL,
      install: SEOUL_BIKE_APP_STORE_URL,
    });
  }
});

test("an unhandled mobile app link falls back to the correct store", () => {
  for (const [agent, store] of [
    ["iPhone", SEOUL_BIKE_APP_STORE_URL],
    ["Android", SEOUL_BIKE_PLAY_STORE_URL],
  ]) {
    const state = createBrowser(agent);
    openSeoulBikeApp(state.browser);
    assert.equal(state.navigations.length, 1);
    state.elapse();
    assert.equal(state.navigations[1], store);
    assert.equal(state.timers.size, 0);
  }
});

test("returning from the app never triggers a delayed store redirect", () => {
  const state = createBrowser();
  openSeoulBikeApp(state.browser);
  const queuedCallback = [...state.timers.values()][0];
  state.setVisibility("hidden");
  state.setVisibility("visible");
  queuedCallback();
  state.elapse();
  assert.deepEqual(state.navigations, [SEOUL_BIKE_APP_URL]);
  assert.equal(state.timers.size, 0);
});

test("pagehide and unmount cleanup cancel even already queued callbacks", () => {
  for (const mode of ["pagehide", "cleanup"]) {
    const state = createBrowser();
    const cancel = openSeoulBikeApp(state.browser);
    const queuedCallback = [...state.timers.values()][0];
    if (mode === "pagehide") state.browser.dispatchEvent(new Event("pagehide"));
    else cancel();
    queuedCallback();
    assert.deepEqual(state.navigations, [SEOUL_BIKE_APP_URL]);
    assert.equal(state.timers.size, 0);
  }
});

test("repeated taps cancel the previous attempt", () => {
  const state = createBrowser();
  const cancel = openSeoulBikeApp(state.browser);
  cancel();
  openSeoulBikeApp(state.browser);
  state.elapse();
  assert.deepEqual(state.navigations, [
    SEOUL_BIKE_APP_URL, SEOUL_BIKE_APP_URL, SEOUL_BIKE_APP_STORE_URL,
  ]);
});

test("a browser rejecting the custom scheme opens the store immediately", () => {
  const state = createBrowser("iPhone", true);
  openSeoulBikeApp(state.browser);
  assert.deepEqual(state.navigations, [SEOUL_BIKE_APP_STORE_URL]);
  assert.equal(state.timers.size, 0);
});

test("desktop users get the official installation guide without a custom scheme", () => {
  for (const userAgent of ["Windows NT 10.0", "Macintosh; Intel Mac OS X", "Linux x86_64"]) {
    const state = createBrowser(userAgent);
    openSeoulBikeApp(state.browser);
    assert.deepEqual(state.navigations, [SEOUL_BIKE_INSTALL_GUIDE_URL]);
    assert.equal(state.timers.size, 0);
  }
});
