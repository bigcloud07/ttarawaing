import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bucketBikeCount,
  bucketDistanceMeters,
  bucketDurationMinutes,
  bucketElapsedMilliseconds,
  bucketTransferCount,
  createAnalyticsAttemptId,
  sanitizeAnalyticsReferrer,
  sanitizeAnalyticsUrl,
  sanitizePostHogCaptureResult,
  shouldEnableProductAnalytics,
} from "../app/product-analytics.ts";

test("analytics buckets expose ranges instead of precise movement data", () => {
  assert.equal(bucketDistanceMeters(undefined), "unknown");
  assert.equal(bucketDistanceMeters(249), "under_250m");
  assert.equal(bucketDistanceMeters(250), "250m_1km");
  assert.equal(bucketDistanceMeters(1_000), "1_5km");
  assert.equal(bucketDistanceMeters(10_000), "10km_plus");

  assert.equal(bucketDurationMinutes(-1), "unknown");
  assert.equal(bucketDurationMinutes(4.9), "under_5m");
  assert.equal(bucketDurationMinutes(5), "5_15m");
  assert.equal(bucketDurationMinutes(60), "60m_plus");

  assert.equal(bucketElapsedMilliseconds(Number.NaN), "unknown");
  assert.equal(bucketElapsedMilliseconds(999), "under_1s");
  assert.equal(bucketElapsedMilliseconds(3_000), "3_5s");
  assert.equal(bucketElapsedMilliseconds(10_000), "10s_plus");

  assert.equal(bucketBikeCount(null), "unknown");
  assert.equal(bucketBikeCount(0), "0");
  assert.equal(bucketBikeCount(2), "1_2");
  assert.equal(bucketBikeCount(5), "3_5");
  assert.equal(bucketBikeCount(6), "6_plus");

  assert.equal(bucketTransferCount(undefined), "0");
  assert.equal(bucketTransferCount(1), "1");
  assert.equal(bucketTransferCount(2), "2_plus");
});

test("attempt ids are opaque and contain no route information", () => {
  const first = createAnalyticsAttemptId();
  const second = createAnalyticsAttemptId();

  assert.notEqual(first, second);
  assert.match(first, /^[a-zA-Z0-9_-]{8,80}$/);
  assert.match(second, /^[a-zA-Z0-9_-]{8,80}$/);
});

test("analytics URLs and referrers drop queries and fragments", () => {
  assert.equal(
    sanitizeAnalyticsUrl("https://ttarawaing.vercel.app/?origin=secret#route"),
    "https://ttarawaing.vercel.app/",
  );
  assert.equal(
    sanitizeAnalyticsReferrer("https://example.com/community/post?id=123#comment"),
    "https://example.com",
  );
  assert.equal(sanitizeAnalyticsReferrer("$direct"), "$direct");
  assert.equal(sanitizeAnalyticsUrl("javascript:alert(1)"), null);

  const sanitized = sanitizePostHogCaptureResult({
    uuid: "00000000-0000-4000-8000-000000000000",
    event: "route_search_started",
    properties: {
      $current_url: "https://ttarawaing.vercel.app/?address=private#result",
      $referrer: "https://example.com/path?query=private",
      viewport: "mobile",
    },
  });

  assert.equal(
    sanitized?.properties.$current_url,
    "https://ttarawaing.vercel.app/",
  );
  assert.equal(sanitized?.properties.$referrer, "https://example.com");
  assert.equal(sanitized?.properties.viewport, "mobile");
});

test("analytics stays off without a token and on local hosts by default", () => {
  assert.equal(
    shouldEnableProductAnalytics({ token: "", hostname: "ttarawaing.vercel.app" }),
    false,
  );
  assert.equal(
    shouldEnableProductAnalytics({ token: "phc_test", hostname: "localhost" }),
    false,
  );
  assert.equal(
    shouldEnableProductAnalytics({
      token: "phc_test",
      hostname: "localhost",
      allowedHosts: "localhost",
    }),
    true,
  );
  assert.equal(
    shouldEnableProductAnalytics({
      token: "phc_test",
      hostname: "ttarawaing.vercel.app",
    }),
    true,
  );
  assert.equal(
    shouldEnableProductAnalytics({
      token: "phc_test",
      hostname: "preview.vercel.app",
      allowedHosts: "ttarawaing.vercel.app,ttarawaing.dnsxo0712.chatgpt.site",
    }),
    false,
  );
});

test("PostHog is configured for explicit, privacy-safe product events only", async () => {
  const [source, envExample] = await Promise.all([
    readFile(new URL("../app/product-analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(envExample, /NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=/);
  assert.match(source, /autocapture: false/);
  assert.match(source, /capture_pageview: false/);
  assert.match(source, /disable_session_recording: true/);
  assert.match(source, /capture_heatmaps: false/);
  assert.match(source, /capture_exceptions: false/);
  assert.match(source, /disable_surveys: true/);
  assert.match(source, /disable_product_tours: true/);
  assert.match(source, /advanced_disable_flags: true/);
  assert.match(source, /persistence: "localStorage"/);
  assert.match(source, /respect_dnt: true/);
  assert.match(source, /\$geoip_disable: true/);
  assert.match(source, /send_instantly: true/);
  assert.match(source, /transport: "sendBeacon"/);
  assert.doesNotMatch(source, /\baddress\b|\bcoordinates?\b|station_name/);
});
