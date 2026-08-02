import type { CaptureResult, PostHog } from "posthog-js";
import type { PassType } from "./pass-planning";

export type RouteSearchSource = "form" | "history" | "map_drag";
export type AnalyticsViewport = "mobile" | "desktop";
export type DistanceBucket =
  | "unknown"
  | "under_250m"
  | "250m_1km"
  | "1_5km"
  | "5_10km"
  | "10km_plus";
export type DurationBucket =
  | "unknown"
  | "under_5m"
  | "5_15m"
  | "15_30m"
  | "30_60m"
  | "60m_plus";
export type ElapsedBucket =
  | "unknown"
  | "under_1s"
  | "1_3s"
  | "3_5s"
  | "5_10s"
  | "10s_plus";
export type BikesBucket = "unknown" | "0" | "1_2" | "3_5" | "6_plus";
export type TransferCountBucket = "0" | "1" | "2_plus";

type GeometryQuality = "ready" | "partial" | "fallback" | "loading";
type PassStatus = "not-needed" | "recommended" | "unavailable";
type NearbyStationKind = "rental" | "return";

export type ProductEventMap = {
  core_view: {
    surface: "route_planner" | "about";
  };
  endpoints_selected: {
    uses_current_location: boolean;
  };
  route_search_started: {
    search_attempt_id: string;
    source: RouteSearchSource;
    pass_type: PassType;
    bike_road_priority: boolean;
  };
  route_search_succeeded: {
    search_attempt_id: string;
    source: RouteSearchSource;
    geometry_quality: Exclude<GeometryQuality, "loading">;
    pass_status: PassStatus;
    transfer_count_bucket: TransferCountBucket;
    distance_bucket: DistanceBucket;
    duration_bucket: DurationBucket;
    elapsed_bucket: ElapsedBucket;
    start_station_adjusted: boolean;
    start_station_optimized: boolean;
  };
  route_search_failed: {
    search_attempt_id: string;
    source: RouteSearchSource;
    stage: "validation";
    reason: "missing_endpoint" | "same_endpoint";
  };
  bike_deeplink_clicked: {
    search_attempt_id: string | null;
    source: RouteSearchSource | "restored";
    availability_status: "confirmed" | "unknown";
    bikes_bucket: BikesBucket;
    geometry_quality: GeometryQuality;
  };
  nearby_station_requested: {
    search_attempt_id: string;
    kind: NearbyStationKind;
    bike_route_priority: boolean;
  };
  nearby_station_succeeded: {
    search_attempt_id: string;
    kind: NearbyStationKind;
    route_quality: "actual" | "direct-fallback";
    availability_status: "confirmed" | "unknown";
    adjusted_for_availability: boolean;
    distance_bucket: DistanceBucket;
    duration_bucket: DurationBucket;
    elapsed_bucket: ElapsedBucket;
  };
  nearby_station_failed: {
    search_attempt_id: string;
    kind: NearbyStationKind;
    reason:
      | "no_available"
      | "no_stations"
      | "permission_denied"
      | "timeout"
      | "location_error"
      | "unsupported"
      | "route_error";
    elapsed_bucket: ElapsedBucket;
  };
  availability_refreshed: {
    outcome: "success" | "failure";
    bikes_bucket: BikesBucket;
    recommendation_changed: boolean;
    elapsed_bucket: ElapsedBucket;
  };
};

type ProductEventName = keyof ProductEventMap;
type ProductEventProperty = string | number | boolean | null;

const ANALYTICS_SCHEMA_VERSION = 1;
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const SEARCH_ATTEMPT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

const EVENT_PROPERTY_KEYS = {
  core_view: ["surface"],
  endpoints_selected: ["uses_current_location"],
  route_search_started: [
    "search_attempt_id",
    "source",
    "pass_type",
    "bike_road_priority",
  ],
  route_search_succeeded: [
    "search_attempt_id",
    "source",
    "geometry_quality",
    "pass_status",
    "transfer_count_bucket",
    "distance_bucket",
    "duration_bucket",
    "elapsed_bucket",
    "start_station_adjusted",
    "start_station_optimized",
  ],
  route_search_failed: [
    "search_attempt_id",
    "source",
    "stage",
    "reason",
  ],
  bike_deeplink_clicked: [
    "search_attempt_id",
    "source",
    "availability_status",
    "bikes_bucket",
    "geometry_quality",
  ],
  nearby_station_requested: [
    "search_attempt_id",
    "kind",
    "bike_route_priority",
  ],
  nearby_station_succeeded: [
    "search_attempt_id",
    "kind",
    "route_quality",
    "availability_status",
    "adjusted_for_availability",
    "distance_bucket",
    "duration_bucket",
    "elapsed_bucket",
  ],
  nearby_station_failed: [
    "search_attempt_id",
    "kind",
    "reason",
    "elapsed_bucket",
  ],
  availability_refreshed: [
    "outcome",
    "bikes_bucket",
    "recommendation_changed",
    "elapsed_bucket",
  ],
} as const satisfies Record<ProductEventName, readonly string[]>;

const ALLOWED_STRING_VALUES = new Map<string, ReadonlySet<string>>([
  ["surface", new Set(["route_planner", "about"])],
  ["source", new Set(["form", "history", "map_drag", "restored"])],
  ["pass_type", new Set(["60", "120", "180", "none"])],
  ["geometry_quality", new Set(["ready", "partial", "fallback", "loading"])],
  ["pass_status", new Set(["not-needed", "recommended", "unavailable"])],
  ["transfer_count_bucket", new Set(["0", "1", "2_plus"])],
  [
    "distance_bucket",
    new Set(["unknown", "under_250m", "250m_1km", "1_5km", "5_10km", "10km_plus"]),
  ],
  [
    "duration_bucket",
    new Set(["unknown", "under_5m", "5_15m", "15_30m", "30_60m", "60m_plus"]),
  ],
  [
    "elapsed_bucket",
    new Set(["unknown", "under_1s", "1_3s", "3_5s", "5_10s", "10s_plus"]),
  ],
  ["stage", new Set(["validation"])],
  ["reason", new Set([
    "missing_endpoint",
    "same_endpoint",
    "no_available",
    "no_stations",
    "permission_denied",
    "timeout",
    "location_error",
    "unsupported",
    "route_error",
  ])],
  ["availability_status", new Set(["confirmed", "unknown"])],
  ["bikes_bucket", new Set(["unknown", "0", "1_2", "3_5", "6_plus"])],
  ["kind", new Set(["rental", "return"])],
  ["route_quality", new Set(["actual", "direct-fallback"])],
  ["outcome", new Set(["success", "failure"])],
]);

const URL_PROPERTY_NAMES = new Set([
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
]);
const REFERRER_PROPERTY_NAMES = new Set([
  "$referrer",
  "$initial_referrer",
  "$session_entry_referrer",
]);

let postHogClientPromise: Promise<PostHog | null> | null = null;

function isFiniteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function bucketDistanceMeters(value: number | null | undefined): DistanceBucket {
  if (value === null || value === undefined || !isFiniteNonNegative(value)) {
    return "unknown";
  }
  if (value < 250) return "under_250m";
  if (value < 1_000) return "250m_1km";
  if (value < 5_000) return "1_5km";
  if (value < 10_000) return "5_10km";
  return "10km_plus";
}

export function bucketDurationMinutes(value: number | null | undefined): DurationBucket {
  if (value === null || value === undefined || !isFiniteNonNegative(value)) {
    return "unknown";
  }
  if (value < 5) return "under_5m";
  if (value < 15) return "5_15m";
  if (value < 30) return "15_30m";
  if (value < 60) return "30_60m";
  return "60m_plus";
}

export function bucketElapsedMilliseconds(
  value: number | null | undefined,
): ElapsedBucket {
  if (value === null || value === undefined || !isFiniteNonNegative(value)) {
    return "unknown";
  }
  if (value < 1_000) return "under_1s";
  if (value < 3_000) return "1_3s";
  if (value < 5_000) return "3_5s";
  if (value < 10_000) return "5_10s";
  return "10s_plus";
}

export function bucketBikeCount(value: number | null | undefined): BikesBucket {
  if (value === null || value === undefined || !isFiniteNonNegative(value)) {
    return "unknown";
  }
  if (value < 1) return "0";
  if (value < 3) return "1_2";
  if (value < 6) return "3_5";
  return "6_plus";
}

export function bucketTransferCount(
  value: number | null | undefined,
): TransferCountBucket {
  if (value === 1) return "1";
  if (typeof value === "number" && Number.isFinite(value) && value >= 2) {
    return "2_plus";
  }
  return "0";
}

export function createAnalyticsAttemptId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Restricted webviews can expose crypto while blocking randomUUID.
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function sanitizeAnalyticsUrl(value: string, baseUrl?: string) {
  try {
    const url = new URL(value, baseUrl ?? "https://ttarawaing.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function sanitizeAnalyticsReferrer(value: string, baseUrl?: string) {
  if (!value || value === "$direct") return value || "$direct";
  const sanitized = sanitizeAnalyticsUrl(value, baseUrl);
  if (!sanitized) return null;
  try {
    return new URL(sanitized).origin;
  } catch {
    return null;
  }
}

export function sanitizePostHogCaptureResult(
  captureResult: CaptureResult | null,
): CaptureResult | null {
  if (!captureResult) return null;

  const properties = { ...captureResult.properties };
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    if (URL_PROPERTY_NAMES.has(key)) {
      const sanitized = sanitizeAnalyticsUrl(value);
      if (sanitized === null) delete properties[key];
      else properties[key] = sanitized;
    } else if (REFERRER_PROPERTY_NAMES.has(key)) {
      const sanitized = sanitizeAnalyticsReferrer(value);
      if (sanitized === null) delete properties[key];
      else properties[key] = sanitized;
    }
  }

  return { ...captureResult, properties };
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function hostnameMatchesRule(hostname: string, rule: string) {
  const normalizedRule = rule.trim().toLowerCase();
  if (!normalizedRule) return false;
  if (normalizedRule.startsWith("*.")) {
    const suffix = normalizedRule.slice(1);
    return hostname.endsWith(suffix);
  }
  return hostname === normalizedRule;
}

export function shouldEnableProductAnalytics({
  token,
  hostname,
  allowedHosts = "",
}: {
  token: string | undefined;
  hostname: string;
  allowedHosts?: string;
}) {
  if (!token?.trim()) return false;
  const normalizedHostname = hostname.trim().toLowerCase();
  const hostRules = allowedHosts
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (hostRules.length > 0) {
    return hostRules.some((rule) =>
      hostnameMatchesRule(normalizedHostname, rule),
    );
  }
  return !isLocalHostname(normalizedHostname);
}

function sanitizeProductEventProperties<EventName extends ProductEventName>(
  eventName: EventName,
  properties: ProductEventMap[EventName],
) {
  const source = properties as Record<string, unknown>;
  const sanitized: Record<string, ProductEventProperty> = {};

  for (const key of EVENT_PROPERTY_KEYS[eventName]) {
    const value = source[key];
    if (key === "search_attempt_id") {
      if (value === null) sanitized[key] = null;
      else if (typeof value === "string" && SEARCH_ATTEMPT_ID_PATTERN.test(value)) {
        sanitized[key] = value;
      }
      continue;
    }
    if (typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "string" && ALLOWED_STRING_VALUES.get(key)?.has(value)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function getAnalyticsViewport(): AnalyticsViewport {
  return window.matchMedia("(max-width: 900px)").matches ? "mobile" : "desktop";
}

async function getPostHogClient(): Promise<PostHog | null> {
  if (typeof window === "undefined") return null;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (
    !shouldEnableProductAnalytics({
      token,
      hostname: window.location.hostname,
      allowedHosts: process.env.NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS,
    })
  ) {
    return null;
  }

  if (!postHogClientPromise) {
    postHogClientPromise = import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.init(token!.trim(), {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
          persistence: "localStorage",
          persistence_name: "ttarawaing_product_analytics",
          person_profiles: "never",
          respect_dnt: true,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_heatmaps: false,
          enable_heatmaps: false,
          capture_dead_clicks: false,
          capture_exceptions: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_surveys_automatic_display: true,
          disable_product_tours: true,
          advanced_disable_flags: true,
          advanced_disable_feature_flags: true,
          advanced_disable_feature_flags_on_first_load: true,
          disable_external_dependency_loading: true,
          cross_subdomain_cookie: false,
          before_send: sanitizePostHogCaptureResult,
        });
        return posthog;
      })
      .catch(() => null);
  }

  return postHogClientPromise;
}

export function trackProductEvent<EventName extends ProductEventName>(
  eventName: EventName,
  properties: ProductEventMap[EventName],
  options: { immediate?: boolean } = {},
) {
  if (typeof window === "undefined") return;

  const sanitizedProperties = sanitizeProductEventProperties(eventName, properties);
  void getPostHogClient().then((posthog) => {
    posthog?.capture(
      eventName,
      {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        viewport: getAnalyticsViewport(),
        $geoip_disable: true,
        ...sanitizedProperties,
      },
      options.immediate
        ? { send_instantly: true, transport: "sendBeacon" }
        : undefined,
    );
  });
}
