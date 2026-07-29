import type { ReverseGeocodedAddress } from "./route-endpoint-drag";
import type { Coordinates } from "./route-geometry";

export type KakaoPlaceResult = {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
};

export type KakaoAddressSearchResult = {
  address_name?: string;
  address_type?: string;
  x?: string;
  y?: string;
  address?: {
    address_name?: string;
    x?: string;
    y?: string;
  } | null;
  road_address?: {
    address_name?: string;
    building_name?: string;
    x?: string;
    y?: string;
  } | null;
};

export type KakaoSearchResult = KakaoPlaceResult & {
  result_type: "place" | "address";
  matched_address_name?: string;
  address_type?: string;
};

export type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

export type KakaoLatLngBounds = {
  extend(position: KakaoLatLng): void;
};

export type KakaoPoint = {
  x: number;
  y: number;
};

export type KakaoMapProjection = {
  containerPointFromCoords(position: KakaoLatLng): KakaoPoint;
  coordsFromContainerPoint(point: KakaoPoint): KakaoLatLng;
};

export type KakaoMap = {
  getCenter(): KakaoLatLng;
  getDraggable(): boolean;
  getProjection(): KakaoMapProjection;
  setCenter(position: KakaoLatLng): void;
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ): void;
  relayout(): void;
  panTo(position: KakaoLatLng): void;
  setDraggable(draggable: boolean): void;
  setLevel(level: number): void;
};

export type KakaoMapObject = {
  setMap(map: KakaoMap | null): void;
};

export type KakaoCustomOverlay = KakaoMapObject & {
  getPosition(): KakaoLatLng;
  setPosition(position: KakaoLatLng): void;
};

type KakaoPlaces = {
  keywordSearch(
    keyword: string,
    callback: (
      results: KakaoPlaceResult[],
      status: string,
      pagination: unknown,
    ) => void,
    options?: {
      page?: number;
      size?: number;
      sort?: string;
    },
  ): void;
};

type KakaoGeocoder = {
  addressSearch(
    address: string,
    callback: (
      results: KakaoAddressSearchResult[],
      status: string,
      pagination: unknown,
    ) => void,
    options?: {
      page?: number;
      size?: number;
      analyze_type?: string;
    },
  ): void;
  coord2Address(
    longitude: number,
    latitude: number,
    callback: (results: KakaoAddressSearchResult[], status: string) => void,
  ): void;
};

export type KakaoSdk = {
  maps: {
    load(callback: () => void): void;
    Map: new (
      container: HTMLElement,
      options: { center: KakaoLatLng; level: number },
    ) => KakaoMap;
    LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoLatLngBounds;
    Polyline: new (options: {
      map: KakaoMap;
      path: KakaoLatLng[];
      strokeWeight: number;
      strokeColor: string;
      strokeOpacity: number;
      strokeStyle?: string;
      zIndex?: number;
    }) => KakaoMapObject;
    Point: new (x: number, y: number) => KakaoPoint;
    CustomOverlay: new (options: {
      map: KakaoMap;
      position: KakaoLatLng;
      content: HTMLElement;
      clickable?: boolean;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
    }) => KakaoCustomOverlay;
    event: {
      addListener(
        target: KakaoMap,
        type: string,
        handler: () => void,
      ): void;
      removeListener(
        target: KakaoMap,
        type: string,
        handler: () => void,
      ): void;
      preventMap(): void;
    };
    services: {
      Places: new () => KakaoPlaces;
      Geocoder: new () => KakaoGeocoder;
      Status: {
        OK: string;
        ZERO_RESULT: string;
        ERROR: string;
      };
      SortBy: {
        ACCURACY: string;
        DISTANCE: string;
      };
      AnalyzeType?: {
        SIMILAR: string;
        EXACT: string;
      };
    };
  };
};

declare global {
  interface Window {
    kakao?: KakaoSdk;
  }
}

const KAKAO_SDK_ID = "kakao-maps-javascript-sdk";
const KAKAO_CONFIG_ENDPOINT = "/api/config/kakao";
const SDK_LOAD_TIMEOUT_MS = 10_000;
export const KAKAO_CONFIG_TIMEOUT_MS = 8_000;
export const KAKAO_PLACE_SEARCH_TIMEOUT_MS = 8_000;
export const KAKAO_ADDRESS_SEARCH_TIMEOUT_MS = 8_000;
export const KAKAO_REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

let kakaoSdkPromise: Promise<KakaoSdk> | null = null;

function runWithTimeout<T>(
  timeoutMs: number,
  timeoutMessage: string,
  operation: (signal: AbortSignal) => Promise<T>,
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      const timeoutError = new Error(timeoutMessage);
      finish(() => {
        reject(timeoutError);
        controller.abort(timeoutError);
      });
    }, timeoutMs);

    void Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
  });
}

export async function getKakaoJavascriptKey(
  timeoutMs = KAKAO_CONFIG_TIMEOUT_MS,
) {
  return runWithTimeout(
    timeoutMs,
    "Kakao Maps configuration request timed out.",
    async (signal) => {
      const response = await fetch(KAKAO_CONFIG_ENDPOINT, {
        headers: { accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        throw new Error("Kakao Maps configuration is unavailable.");
      }

      const body = (await response.json()) as { javascriptKey?: unknown };
      if (
        typeof body.javascriptKey !== "string" ||
        !body.javascriptKey.trim()
      ) {
        throw new Error("Kakao Maps JavaScript key is missing.");
      }

      return body.javascriptKey;
    },
  );
}

function initializeKakaoSdk(resolve: (sdk: KakaoSdk) => void, reject: (error: Error) => void) {
  const sdk = window.kakao;
  if (!sdk?.maps?.load) {
    reject(new Error("Kakao Maps SDK did not initialize."));
    return;
  }

  sdk.maps.load(() => {
    if (!sdk.maps.services?.Places) {
      reject(new Error("Kakao Maps services library did not initialize."));
      return;
    }
    resolve(sdk);
  });
}

export function loadKakaoMapsSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao Maps SDK is only available in the browser."));
  }

  if (window.kakao?.maps?.services?.Places) {
    return Promise.resolve(window.kakao);
  }

  if (kakaoSdkPromise) return kakaoSdkPromise;

  const pendingSdk = getKakaoJavascriptKey().then(
    (javascriptKey) =>
      new Promise<KakaoSdk>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          callback();
        };
        const resolveSdk = (sdk: KakaoSdk) => finish(() => resolve(sdk));
        const rejectSdk = (error: Error) => finish(() => reject(error));
        const timeoutId = window.setTimeout(
          () => rejectSdk(new Error("Kakao Maps SDK load timed out.")),
          SDK_LOAD_TIMEOUT_MS,
        );

        const existingScript = document.getElementById(
          KAKAO_SDK_ID,
        ) as HTMLScriptElement | null;

        if (existingScript) {
          if (window.kakao) {
            initializeKakaoSdk(resolveSdk, rejectSdk);
            return;
          }
          existingScript.addEventListener(
            "load",
            () => initializeKakaoSdk(resolveSdk, rejectSdk),
            { once: true },
          );
          existingScript.addEventListener(
            "error",
            () => rejectSdk(new Error("Kakao Maps SDK could not be loaded.")),
            { once: true },
          );
          return;
        }

        const script = document.createElement("script");
        script.id = KAKAO_SDK_ID;
        script.async = true;
        script.src =
          `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey)}` +
          "&autoload=false&libraries=services";
        script.addEventListener(
          "load",
          () => initializeKakaoSdk(resolveSdk, rejectSdk),
          { once: true },
        );
        script.addEventListener(
          "error",
          () => rejectSdk(new Error("Kakao Maps SDK could not be loaded.")),
          { once: true },
        );
        document.head.appendChild(script);
      }),
  );
  kakaoSdkPromise = pendingSdk;
  void pendingSdk.catch(() => {
    if (kakaoSdkPromise === pendingSdk) kakaoSdkPromise = null;
    document.getElementById(KAKAO_SDK_ID)?.remove();
  });

  return pendingSdk;
}

export function searchKakaoKeyword(
  sdk: KakaoSdk,
  keyword: string,
  timeoutMs = KAKAO_PLACE_SEARCH_TIMEOUT_MS,
) {
  return new Promise<KakaoPlaceResult[]>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(
      () =>
        finish(() =>
          reject(new Error("Kakao place search request timed out.")),
        ),
      timeoutMs,
    );

    try {
      const places = new sdk.maps.services.Places();
      places.keywordSearch(
        keyword,
        (results, status) => {
          if (status === sdk.maps.services.Status.OK) {
            finish(() => resolve(results));
            return;
          }
          if (status === sdk.maps.services.Status.ZERO_RESULT) {
            finish(() => resolve([]));
            return;
          }
          finish(() => reject(new Error("Kakao place search failed.")));
        },
        {
          page: 1,
          size: 10,
          sort: sdk.maps.services.SortBy.ACCURACY,
        },
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export function searchKakaoAddress(
  sdk: KakaoSdk,
  address: string,
  timeoutMs = KAKAO_ADDRESS_SEARCH_TIMEOUT_MS,
) {
  return new Promise<KakaoAddressSearchResult[]>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(
      () =>
        finish(() =>
          reject(new Error("Kakao address search request timed out.")),
        ),
      timeoutMs,
    );

    try {
      if (!sdk.maps.services.Geocoder) {
        finish(() => reject(new Error("Kakao address search is unavailable.")));
        return;
      }
      const geocoder = new sdk.maps.services.Geocoder();
      if (!geocoder.addressSearch) {
        finish(() => reject(new Error("Kakao address search is unavailable.")));
        return;
      }
      geocoder.addressSearch(
        address,
        (results, status) => {
          if (status === sdk.maps.services.Status.OK) {
            finish(() => resolve(results));
            return;
          }
          if (status === sdk.maps.services.Status.ZERO_RESULT) {
            finish(() => resolve([]));
            return;
          }
          finish(() => reject(new Error("Kakao address search failed.")));
        },
        {
          page: 1,
          size: 10,
          analyze_type:
            sdk.maps.services.AnalyzeType?.SIMILAR ?? "SIMILAR",
        },
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export function reverseGeocodeKakaoCoordinates(
  sdk: KakaoSdk,
  [latitude, longitude]: Coordinates,
  timeoutMs = KAKAO_REVERSE_GEOCODE_TIMEOUT_MS,
) {
  return new Promise<ReverseGeocodedAddress | null>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(
      () =>
        finish(() =>
          reject(new Error("Kakao reverse geocoding request timed out.")),
        ),
      timeoutMs,
    );

    try {
      if (!sdk.maps.services.Geocoder) {
        finish(() =>
          reject(new Error("Kakao reverse geocoding is unavailable.")),
        );
        return;
      }
      const geocoder = new sdk.maps.services.Geocoder();
      geocoder.coord2Address(longitude, latitude, (results, status) => {
        if (status === sdk.maps.services.Status.OK) {
          const result = results[0];
          if (!result) {
            finish(() => resolve(null));
            return;
          }
          finish(() =>
            resolve({
              address: result.address?.address_name?.trim() ?? "",
              roadAddress: result.road_address?.address_name?.trim() ?? "",
              buildingName:
                result.road_address?.building_name?.trim() ?? "",
            }),
          );
          return;
        }
        if (status === sdk.maps.services.Status.ZERO_RESULT) {
          finish(() => resolve(null));
          return;
        }
        finish(() => reject(new Error("Kakao reverse geocoding failed.")));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export async function reverseGeocodeKakao(coordinates: Coordinates) {
  const sdk = await loadKakaoMapsSdk();
  return reverseGeocodeKakaoCoordinates(sdk, coordinates);
}

const SUPPORTED_REGION_PREFIX =
  /^(?:서울(?:특별시|시)?|경기(?:도)?)(?:\s|$)/;

function buildRegionalQueries(query: string) {
  const normalized = query.trim();
  if (SUPPORTED_REGION_PREFIX.test(normalized)) {
    return [normalized];
  }
  return [`서울 ${normalized}`, `경기 ${normalized}`];
}

function normalizeSearchKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeKakaoPlaceResult(
  result: KakaoPlaceResult,
): KakaoSearchResult {
  return {
    ...result,
    id: `place:${result.id || `${result.place_name}|${result.x}|${result.y}`}`,
    result_type: "place",
  };
}

export function normalizeKakaoAddressResult(
  result: KakaoAddressSearchResult,
): KakaoSearchResult | null {
  const matchedAddress = result.address_name?.trim() ?? "";
  const parcelAddress = result.address?.address_name?.trim() ?? "";
  const roadAddress = result.road_address?.address_name?.trim() ?? "";
  const buildingName = result.road_address?.building_name?.trim() ?? "";
  const longitude =
    result.x?.trim() ||
    result.road_address?.x?.trim() ||
    result.address?.x?.trim() ||
    "";
  const latitude =
    result.y?.trim() ||
    result.road_address?.y?.trim() ||
    result.address?.y?.trim() ||
    "";

  if (
    !longitude ||
    !latitude ||
    !Number.isFinite(Number(longitude)) ||
    !Number.isFinite(Number(latitude))
  ) {
    return null;
  }

  const representativeAddress =
    roadAddress || parcelAddress || matchedAddress;
  const placeName =
    buildingName || matchedAddress || representativeAddress;
  if (!representativeAddress || !placeName) return null;

  return {
    id: [
      "address",
      normalizeSearchKey(representativeAddress),
      longitude,
      latitude,
    ].join(":"),
    result_type: "address",
    place_name: placeName,
    category_name: "",
    address_name: parcelAddress || matchedAddress,
    road_address_name: roadAddress,
    matched_address_name: matchedAddress,
    address_type: result.address_type?.trim() ?? "",
    x: longitude,
    y: latitude,
  };
}

function searchResultAddress(result: KakaoSearchResult) {
  return (
    result.road_address_name ||
    result.address_name ||
    result.matched_address_name ||
    ""
  );
}

function interleaveSearchResults(groups: KakaoSearchResult[][]) {
  const merged: KakaoSearchResult[] = [];
  const seenIds = new Set<string>();
  const seenDisplayKeys = new Set<string>();
  const longestGroup = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < longestGroup && merged.length < 10; index += 1) {
    for (const group of groups) {
      const result = group[index];
      if (!result) continue;
      const displayKey = [
        normalizeSearchKey(result.place_name),
        normalizeSearchKey(searchResultAddress(result)),
      ].join("|");
      if (seenIds.has(result.id) || seenDisplayKeys.has(displayKey)) continue;
      seenIds.add(result.id);
      seenDisplayKeys.add(displayKey);
      merged.push(result);
      if (merged.length === 10) break;
    }
  }
  return merged;
}

export function isSupportedPlaceAddress(address: string) {
  return SUPPORTED_REGION_PREFIX.test(address.trim());
}

function looksLikeAddressQuery(query: string) {
  return (
    /\d/.test(query) ||
    /(?:로|길|동|가|읍|면|리)(?:\s|$)/.test(query.trim())
  );
}

export async function searchKakaoPlacesWithSdk(
  sdk: KakaoSdk,
  query: string,
) {
  const normalized = query.trim();
  if (!normalized) return [];

  const regionalQueries = buildRegionalQueries(normalized);
  const keywordRequests = regionalQueries.map((keyword) =>
    searchKakaoKeyword(sdk, keyword),
  );
  const addressRequests = regionalQueries.map((address) =>
    searchKakaoAddress(sdk, address),
  );
  const [settledKeywords, settledAddresses] = await Promise.all([
    Promise.allSettled(keywordRequests),
    Promise.allSettled(addressRequests),
  ]);

  const keywordGroups = settledKeywords.flatMap((result) =>
    result.status === "fulfilled"
      ? [
          result.value
            .map(normalizeKakaoPlaceResult)
            .filter((place) =>
              isSupportedPlaceAddress(searchResultAddress(place)),
            ),
        ]
      : [],
  );
  const addressGroups = settledAddresses.flatMap((result) =>
    result.status === "fulfilled"
      ? [
          result.value
            .map(normalizeKakaoAddressResult)
            .filter(
              (address): address is KakaoSearchResult =>
                address !== null &&
                isSupportedPlaceAddress(searchResultAddress(address)),
            ),
        ]
      : [],
  );

  if (!keywordGroups.length && !addressGroups.length) {
    throw new Error("Kakao place search failed.");
  }

  return interleaveSearchResults(
    looksLikeAddressQuery(normalized)
      ? [...addressGroups, ...keywordGroups]
      : [...keywordGroups, ...addressGroups],
  );
}

export async function searchKakaoPlaces(query: string) {
  const sdk = await loadKakaoMapsSdk();
  return searchKakaoPlacesWithSdk(sdk, query);
}
