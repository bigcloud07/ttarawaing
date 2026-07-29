"use client";

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

export default function WebAnalytics() {
  return <Analytics beforeSend={removeSensitiveUrlParts} />;
}
