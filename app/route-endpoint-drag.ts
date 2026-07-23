import type { Coordinates } from "./route-geometry";

export type RouteEndpointKind = "origin" | "destination";

export type ReverseGeocodedAddress = {
  address: string;
  roadAddress: string;
  buildingName: string;
};

export type DraggedRoutePlace = {
  id: string;
  name: string;
  address: string;
  hint: string;
  coordinates: Coordinates;
};

const SUPPORTED_ROUTE_BOUNDS = {
  minLatitude: 36.8,
  maxLatitude: 38.35,
  minLongitude: 126.3,
  maxLongitude: 127.95,
};

export function isSupportedRouteCoordinate([
  latitude,
  longitude,
]: Coordinates) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= SUPPORTED_ROUTE_BOUNDS.minLatitude &&
    latitude <= SUPPORTED_ROUTE_BOUNDS.maxLatitude &&
    longitude >= SUPPORTED_ROUTE_BOUNDS.minLongitude &&
    longitude <= SUPPORTED_ROUTE_BOUNDS.maxLongitude
  );
}

export function createDraggedRoutePlace(
  endpoint: RouteEndpointKind,
  coordinates: Coordinates,
  reverseGeocodedAddress: ReverseGeocodedAddress | null,
): DraggedRoutePlace {
  const [latitude, longitude] = coordinates;
  const roadAddress = reverseGeocodedAddress?.roadAddress.trim() ?? "";
  const parcelAddress = reverseGeocodedAddress?.address.trim() ?? "";
  const buildingName = reverseGeocodedAddress?.buildingName.trim() ?? "";
  const resolvedAddress = roadAddress || parcelAddress;
  const fallbackName =
    endpoint === "origin"
      ? "지도에서 선택한 출발지"
      : "지도에서 선택한 도착지";

  return {
    id: `map:${latitude.toFixed(6)},${longitude.toFixed(6)}`,
    name: buildingName || resolvedAddress || fallbackName,
    address:
      resolvedAddress ||
      `위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`,
    hint: "지도에서 직접 지정",
    coordinates: [latitude, longitude],
  };
}
