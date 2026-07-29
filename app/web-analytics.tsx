"use client";

import { useSyncExternalStore } from "react";
import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";

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
  const isVercelHost = useSyncExternalStore(
    subscribeToHost,
    () => window.location.hostname.endsWith(".vercel.app"),
    () => false,
  );

  return isVercelHost ? (
    <Analytics beforeSend={removeSensitiveUrlParts} />
  ) : null;
}
