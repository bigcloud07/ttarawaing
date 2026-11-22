"use client";

import { useSyncExternalStore } from "react";
import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";
import { isTtarawaingIOS } from "./native-app";

function removeSensitiveUrlParts(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);

    return {
      ...event,
      url: `${url.origin}${url.pathname}`,
    };
  } catch {
    return event;
  }
}

function subscribeToHost() {
  return () => {};
}

export default function WebAnalytics() {
  const shouldRenderAnalytics = useSyncExternalStore(
    subscribeToHost,
    () =>
      window.location.hostname.endsWith(".vercel.app") &&
      !isTtarawaingIOS(window.navigator.userAgent),
    () => false,
  );

  return shouldRenderAnalytics ? (
    <Analytics beforeSend={removeSensitiveUrlParts} />
  ) : null;
}
