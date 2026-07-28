"use client";

import { Bike, Crosshair, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  LayerGroup,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from "leaflet";
import { loadKakaoMapsSdk } from "./kakao-maps";
import type {
  KakaoCustomOverlay,
  KakaoMap,
  KakaoMapObject,
  KakaoSdk,
} from "./kakao-maps";
import { relayoutPreservingMapCenter } from "./map-location-camera";
import {
  CURRENT_LOCATION_MARKER_HTML,
  createCurrentLocationMarkerElement,
  runHeadingAwareMapInteractionStart,
  updateCurrentLocationHeading,
  useHeadingAwareMapTouchStart,
  useHeadingUpMapCanvas,
} from "./map-location-ui";
import type {
  MapHeadingStatus,
  MapLocationMode,
  MapLocationStatus,
} from "./map-location-ui";
import type { Coordinates, RouteSegment } from "./route-geometry";

export type NearbyStationMapKind = "rental" | "return";
export type NearbyStationAvailability = "confirmed" | "unknown";

export type NearbyStationMapStation = {
  name: string;
  address: string;
  coordinates: Coordinates;
  bikes: number | null;
};

export type NearbyStationMapProps = {
  kind: NearbyStationMapKind;
  userCoordinates: Coordinates;
  station: NearbyStationMapStation;
  segment: RouteSegment;
  availability: NearbyStationAvailability;
  adjustedForAvailability: boolean;
  warning?: string;
  userLocation: Coordinates | null;
  userHeading: number | null;
  locationFocusRequestId: number;
  tryConsumeLocationFocusRequest: (requestId: number) => boolean;
  locationStatus: MapLocationStatus;
  locationMode: MapLocationMode;
  headingStatus: MapHeadingStatus;
  onLocate: () => void;
  onMapDragStart: () => void;
  onMapTouchDragStart: () => void;
  onMapTouchDragEnd: () => void;
  onClose: () => void;
  onRefocus?: () => void;
};

type MapCanvasProps = Pick<
  NearbyStationMapProps,
  | "kind"
  | "userCoordinates"
  | "station"
  | "segment"
  | "userLocation"
  | "userHeading"
  | "locationFocusRequestId"
  | "tryConsumeLocationFocusRequest"
  | "locationMode"
  | "onMapDragStart"
  | "onMapTouchDragStart"
  | "onMapTouchDragEnd"
> & {
  refocusRequestId: number;
  onRefocus: () => void;
};

type MapProvider = "loading" | "kakao" | "leaflet" | "unavailable";

const DEFAULT_MAP_CENTER: Coordinates = [37.561, 127.006];

function getKindCopy(kind: NearbyStationMapKind) {
  return kind === "rental"
    ? {
        resultLabel: "가장 가까운 출발 대여소",
        markerLabel: "대여",
        routeLabel: "도보",
        markerClassName: "bike-marker",
      }
    : {
        resultLabel: "가장 가까운 반납 대여소",
        markerLabel: "반납",
        routeLabel: "자전거",
        markerClassName: "return-marker",
      };
}

function formatDistance(meters: number) {
  const roundedMeters = Math.max(0, Math.round(meters));
  if (roundedMeters < 1_000) return `${roundedMeters}m`;
  return `${(roundedMeters / 1_000).toFixed(1)}km`;
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  if (roundedSeconds < 60) return "1분 미만";
  return `${Math.max(1, Math.round(roundedSeconds / 60))}분`;
}

function isUsableCoordinates(
  coordinates: Coordinates,
): coordinates is Coordinates {
  return (
    Number.isFinite(coordinates[0]) &&
    coordinates[0] >= -90 &&
    coordinates[0] <= 90 &&
    Number.isFinite(coordinates[1]) &&
    coordinates[1] >= -180 &&
    coordinates[1] <= 180
  );
}

function getVisibleCoordinates({
  userCoordinates,
  station,
  segment,
}: Pick<
  NearbyStationMapProps,
  "userCoordinates" | "station" | "segment"
>) {
  const path = segment.path.filter(isUsableCoordinates);
  return [
    userCoordinates,
    ...path,
    station.coordinates,
  ].filter(isUsableCoordinates);
}

function createStationMarkerElement(
  kind: NearbyStationMapKind,
  stationName: string,
) {
  const copy = getKindCopy(kind);
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = `route-marker-wrapper kakao-route-marker ${copy.markerClassName}-wrapper nearby-station-marker`;
  wrapper.title = stationName;
  wrapper.setAttribute(
    "aria-label",
    `${stationName} ${copy.markerLabel} 대여소. 현재 위치부터의 경로 다시 보기`,
  );

  const marker = document.createElement("span");
  marker.className = `route-marker ${copy.markerClassName}`;
  const shape = document.createElement("span");
  shape.className = "route-marker-shape";
  const label = document.createElement("span");
  label.className = "route-marker-label";
  label.textContent = copy.markerLabel;
  shape.appendChild(label);
  marker.appendChild(shape);
  wrapper.appendChild(marker);
  return wrapper;
}

function drawKakaoPolyline(
  sdk: KakaoSdk,
  map: KakaoMap,
  coordinates: Coordinates[],
  options: {
    color: string;
    weight: number;
    opacity: number;
    style: string;
    zIndex: number;
  },
) {
  return new sdk.maps.Polyline({
    map,
    path: coordinates.map(
      ([latitude, longitude]) =>
        new sdk.maps.LatLng(latitude, longitude),
    ),
    strokeColor: options.color,
    strokeWeight: options.weight,
    strokeOpacity: options.opacity,
    strokeStyle: options.style,
    zIndex: options.zIndex,
  });
}

function KakaoNearbyMapCanvas({
  kind,
  userCoordinates,
  station,
  segment,
  userLocation,
  userHeading,
  locationFocusRequestId,
  tryConsumeLocationFocusRequest,
  locationMode,
  refocusRequestId,
  onRefocus,
  onMapDragStart,
  onMapTouchDragStart,
  onMapTouchDragEnd,
  onError,
}: MapCanvasProps & { onError: () => void }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const sdkRef = useRef<KakaoSdk | null>(null);
  const mapObjectsRef = useRef<KakaoMapObject[]>([]);
  const locationObjectRef = useRef<KakaoCustomOverlay | null>(null);
  const locationMarkerElementRef = useRef<HTMLElement | null>(null);
  const userLocationRef = useRef(userLocation);
  const userHeadingRef = useRef(userHeading);
  const [ready, setReady] = useState(false);

  const relayoutMapForHeading = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    relayoutPreservingMapCenter(map);
  }, []);
  const { suspendVisualHeading, restoreVisualHeading } =
    useHeadingUpMapCanvas({
      nodeRef,
      enabled: locationMode === "heading",
      heading: userHeading,
      ready,
      onRelayout: relayoutMapForHeading,
    });
  const {
    pinchActiveRef,
    touchGestureActiveRef,
    markTouchDragStarted,
    settleVisualHeading,
  } = useHeadingAwareMapTouchStart({
    nodeRef,
    ready,
    onSuspendVisualHeading: suspendVisualHeading,
    onRestoreVisualHeading: restoreVisualHeading,
    onTouchDragEnd: onMapTouchDragEnd,
  });

  const clearMapObjects = useCallback(() => {
    mapObjectsRef.current.forEach((mapObject) => mapObject.setMap(null));
    mapObjectsRef.current = [];
  }, []);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    let active = true;
    const mapNode = nodeRef.current;

    void loadKakaoMapsSdk()
      .then((sdk) => {
        if (!active || !mapNode || mapRef.current) return;
        sdkRef.current = sdk;
        mapRef.current = new sdk.maps.Map(mapNode, {
          center: new sdk.maps.LatLng(
            DEFAULT_MAP_CENTER[0],
            DEFAULT_MAP_CENTER[1],
          ),
          level: 6,
        });
        setReady(true);
      })
      .catch(() => {
        if (active) onError();
      });

    return () => {
      active = false;
      clearMapObjects();
      locationObjectRef.current?.setMap(null);
      locationObjectRef.current = null;
      locationMarkerElementRef.current = null;
      mapRef.current = null;
      sdkRef.current = null;
    };
  }, [clearMapObjects, onError]);

  useEffect(() => {
    const map = mapRef.current;
    const sdk = sdkRef.current;
    if (!ready || !map || !sdk) return;
    const handleNativeMapDragStart = () => {
      if (pinchActiveRef.current) return;
      if (touchGestureActiveRef.current) {
        if (markTouchDragStarted()) onMapTouchDragStart();
        return;
      }
      runHeadingAwareMapInteractionStart(nodeRef.current, onMapDragStart);
    };
    sdk.maps.event.addListener(map, "dragstart", handleNativeMapDragStart);
    sdk.maps.event.addListener(map, "idle", settleVisualHeading);
    return () => {
      sdk.maps.event.removeListener(
        map,
        "dragstart",
        handleNativeMapDragStart,
      );
      sdk.maps.event.removeListener(map, "idle", settleVisualHeading);
    };
  }, [
    markTouchDragStarted,
    onMapDragStart,
    onMapTouchDragStart,
    pinchActiveRef,
    ready,
    settleVisualHeading,
    touchGestureActiveRef,
  ]);

  useEffect(() => {
    const node = nodeRef.current;
    const map = mapRef.current;
    if (!ready || !node || !map) return;

    let animationFrame = 0;
    const relayout = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => map.relayout());
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(relayout);
    resizeObserver?.observe(node);
    window.addEventListener("resize", relayout);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", relayout);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [ready]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    if (!ready || !sdk || !map) return;

    clearMapObjects();
    const cleanups: Array<() => void> = [];
    const routePath = segment.path.filter(isUsableCoordinates);
    const drawablePath =
      routePath.length >= 2
        ? routePath
        : [userCoordinates, station.coordinates];
    const isDirect = segment.source === "direct";

    if (kind === "rental") {
      mapObjectsRef.current.push(
        drawKakaoPolyline(sdk, map, drawablePath, {
          color: "#3759c7",
          weight: 5,
          opacity: isDirect ? 0.52 : 0.9,
          style: "shortdash",
          zIndex: 2,
        }),
      );
    } else {
      mapObjectsRef.current.push(
        drawKakaoPolyline(sdk, map, drawablePath, {
          color: "#00a77b",
          weight: 7,
          opacity: isDirect ? 0.58 : 0.92,
          style: "solid",
          zIndex: 2,
        }),
        drawKakaoPolyline(sdk, map, drawablePath, {
          color: "#baf4df",
          weight: 2,
          opacity: isDirect ? 0.72 : 0.95,
          style: "shortdot",
          zIndex: 3,
        }),
      );
    }

    const stationMarker = createStationMarkerElement(kind, station.name);
    const handleMarkerClick = (event: Event) => {
      event.stopPropagation();
      onRefocus();
    };
    stationMarker.addEventListener("click", handleMarkerClick);
    cleanups.push(() =>
      stationMarker.removeEventListener("click", handleMarkerClick),
    );
    const stationOverlay = new sdk.maps.CustomOverlay({
      map,
      position: new sdk.maps.LatLng(
        station.coordinates[0],
        station.coordinates[1],
      ),
      content: stationMarker,
      clickable: true,
      xAnchor: 0.5,
      yAnchor: 1,
      zIndex: 6,
    });
    mapObjectsRef.current.push(stationOverlay);

    const bounds = new sdk.maps.LatLngBounds();
    const visibleCoordinates = getVisibleCoordinates({
      userCoordinates: userLocationRef.current ?? userCoordinates,
      station,
      segment,
    });
    visibleCoordinates.forEach(([latitude, longitude]) => {
      bounds.extend(new sdk.maps.LatLng(latitude, longitude));
    });

    const animationFrame = window.requestAnimationFrame(() => {
      map.relayout();
      const uniqueCoordinates = new Set(
        visibleCoordinates.map(
          ([latitude, longitude]) => `${latitude},${longitude}`,
        ),
      );
      if (uniqueCoordinates.size <= 1) {
        map.setCenter(
          new sdk.maps.LatLng(
            station.coordinates[0],
            station.coordinates[1],
          ),
        );
        map.setLevel(3);
        return;
      }
      map.setBounds(bounds, 72, 60, 160, 60);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      cleanups.forEach((cleanup) => cleanup());
      clearMapObjects();
    };
  }, [
    clearMapObjects,
    kind,
    onRefocus,
    ready,
    refocusRequestId,
    segment,
    station,
    userCoordinates,
  ]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    if (!ready || !sdk || !map) return;
    const markerCoordinates = userLocation ?? userCoordinates;
    const position = new sdk.maps.LatLng(
      markerCoordinates[0],
      markerCoordinates[1],
    );
    let overlay = locationObjectRef.current;
    if (!overlay) {
      const marker = createCurrentLocationMarkerElement();
      overlay = new sdk.maps.CustomOverlay({
        map,
        position,
        content: marker,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 5,
      });
      locationObjectRef.current = overlay;
      locationMarkerElementRef.current = marker;
    } else {
      overlay.setPosition(position);
    }
    updateCurrentLocationHeading(
      locationMarkerElementRef.current,
      userLocation ? userHeadingRef.current : null,
    );
  }, [ready, userCoordinates, userLocation]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    if (!ready || !sdk || !map || !userLocation) return;
    if (!tryConsumeLocationFocusRequest(locationFocusRequestId)) return;
    map.setLevel(4);
    map.panTo(new sdk.maps.LatLng(userLocation[0], userLocation[1]));
  }, [
    locationFocusRequestId,
    ready,
    tryConsumeLocationFocusRequest,
    userLocation,
  ]);

  useEffect(() => {
    userHeadingRef.current = userHeading;
    updateCurrentLocationHeading(
      locationMarkerElementRef.current,
      userLocation ? userHeading : null,
    );
  }, [userHeading, userLocation]);

  return (
    <>
      <div
        ref={nodeRef}
        className="map-canvas kakao-map-canvas nearby-map-canvas"
        aria-label={`${getKindCopy(kind).resultLabel}까지의 ${
          getKindCopy(kind).routeLabel
        } 경로 지도`}
      />
      {!ready ? (
        <div
          className="map-loading nearby-map-loading"
          role="status"
          aria-live="polite"
        >
          <span className="loading-wheel" aria-hidden="true" />
          지도를 불러오고 있어요
        </div>
      ) : null}
    </>
  );
}

function LeafletNearbyMapCanvas({
  kind,
  userCoordinates,
  station,
  segment,
  userLocation,
  userHeading,
  locationFocusRequestId,
  tryConsumeLocationFocusRequest,
  locationMode,
  refocusRequestId,
  onRefocus,
  onMapDragStart,
  onMapTouchDragStart,
  onMapTouchDragEnd,
  onError,
}: MapCanvasProps & { onError: () => void }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const locationLayerRef = useRef<LayerGroup | null>(null);
  const locationMarkerRef = useRef<LeafletMarker | null>(null);
  const locationMarkerElementRef = useRef<HTMLElement | null>(null);
  const userLocationRef = useRef(userLocation);
  const userHeadingRef = useRef(userHeading);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const relayoutMapForHeading = useCallback(() => {
    mapRef.current?.invalidateSize({ pan: true, animate: false });
  }, []);
  const { suspendVisualHeading, restoreVisualHeading } =
    useHeadingUpMapCanvas({
      nodeRef,
      enabled: locationMode === "heading",
      heading: userHeading,
      ready,
      onRelayout: relayoutMapForHeading,
    });
  const {
    pinchActiveRef,
    touchGestureActiveRef,
    markTouchDragStarted,
    settleVisualHeading,
  } = useHeadingAwareMapTouchStart({
    nodeRef,
    ready,
    onSuspendVisualHeading: suspendVisualHeading,
    onRestoreVisualHeading: restoreVisualHeading,
    onTouchDragEnd: onMapTouchDragEnd,
  });

  useEffect(() => {
    let active = true;

    void import("leaflet")
      .then((leafletModule) => {
        if (!active || !nodeRef.current || mapRef.current) return;
        const L = leafletModule.default;
        const map = L.map(nodeRef.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView(DEFAULT_MAP_CENTER, 13);
        map.attributionControl.setPrefix(false);
        L.control.zoom({ position: "topright" }).addTo(map);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (active) onError();
      });

    return () => {
      active = false;
      routeLayerRef.current = null;
      locationLayerRef.current = null;
      locationMarkerRef.current = null;
      locationMarkerElementRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const handleNativeMapDragStart = () => {
      if (pinchActiveRef.current) return;
      if (touchGestureActiveRef.current) {
        if (markTouchDragStarted()) onMapTouchDragStart();
        return;
      }
      runHeadingAwareMapInteractionStart(nodeRef.current, onMapDragStart);
    };
    map.on("dragstart", handleNativeMapDragStart);
    map.on("zoomend", settleVisualHeading);
    return () => {
      map.off("dragstart", handleNativeMapDragStart);
      map.off("zoomend", settleVisualHeading);
    };
  }, [
    markTouchDragStarted,
    onMapDragStart,
    onMapTouchDragStart,
    pinchActiveRef,
    ready,
    settleVisualHeading,
    touchGestureActiveRef,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const node = nodeRef.current;
    if (!ready || !map || !node) return;

    let animationFrame = 0;
    const resizeMap = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resizeMap);
    resizeObserver?.observe(node);
    window.addEventListener("resize", resizeMap);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resizeMap);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    let active = true;

    void import("leaflet")
      .then((leafletModule) => {
        const map = mapRef.current;
        if (!active || !map) return;
        const L = leafletModule.default;
        const group = L.layerGroup().addTo(map);
        routeLayerRef.current = group;
        const routePath = segment.path.filter(isUsableCoordinates);
        const drawablePath =
          routePath.length >= 2
            ? routePath
            : [userCoordinates, station.coordinates];
        const isDirect = segment.source === "direct";

        if (kind === "rental") {
          L.polyline(drawablePath, {
            color: "#3759c7",
            weight: 5,
            opacity: isDirect ? 0.52 : 0.9,
            dashArray: "3 9",
            lineCap: "round",
          }).addTo(group);
        } else {
          L.polyline(drawablePath, {
            color: "#00a77b",
            weight: 7,
            opacity: isDirect ? 0.58 : 0.92,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(group);
          L.polyline(drawablePath, {
            color: "#baf4df",
            weight: 2,
            opacity: isDirect ? 0.72 : 0.95,
            dashArray: "1 10",
            lineCap: "round",
          }).addTo(group);
        }

        const copy = getKindCopy(kind);
        L.marker(station.coordinates, {
          icon: L.divIcon({
            className: `route-marker-wrapper ${copy.markerClassName}-wrapper nearby-station-marker`,
            html: `<span class="route-marker ${copy.markerClassName}"><span class="route-marker-shape"><span class="route-marker-label">${copy.markerLabel}</span></span></span>`,
            iconSize: [60, 60],
            iconAnchor: [30, 60],
          }),
          keyboard: true,
          title: `${station.name} ${copy.markerLabel} 대여소`,
        })
          .bindTooltip(station.name, {
            direction: "top",
            offset: [0, -54],
          })
          .on("click", onRefocus)
          .addTo(group);

        const bounds = L.latLngBounds(
          getVisibleCoordinates({
            userCoordinates: userLocationRef.current ?? userCoordinates,
            station,
            segment,
          }),
        );
        const animationFrame = window.requestAnimationFrame(() => {
          map.invalidateSize({ animate: false });
          map.fitBounds(bounds, {
            paddingTopLeft: [60, 72],
            paddingBottomRight: [60, 160],
            maxZoom: 17,
            animate: true,
          });
        });
        group.once("remove", () =>
          window.cancelAnimationFrame(animationFrame),
        );
      })
      .catch(() => {
        if (active) onError();
      });

    return () => {
      active = false;
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
    };
  }, [
    kind,
    onError,
    onRefocus,
    ready,
    refocusRequestId,
    segment,
    station,
    userCoordinates,
  ]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let active = true;
    const markerCoordinates = userLocation ?? userCoordinates;

    void import("leaflet")
      .then((leafletModule) => {
        const map = mapRef.current;
        if (!active || !map) return;
        const L = leafletModule.default;
        let marker = locationMarkerRef.current;
        if (!marker) {
          const group = L.layerGroup().addTo(map);
          locationLayerRef.current = group;
          marker = L.marker(markerCoordinates, {
            icon: L.divIcon({
              className: "current-location-marker-wrapper",
              html: CURRENT_LOCATION_MARKER_HTML,
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            }),
            interactive: false,
            keyboard: false,
            title: "현재 위치",
          }).addTo(group);
          locationMarkerRef.current = marker;
        } else {
          marker.setLatLng(markerCoordinates);
        }
        locationMarkerElementRef.current =
          marker.getElement()?.querySelector<HTMLElement>(
            ".current-location-marker",
          ) ?? null;
        updateCurrentLocationHeading(
          locationMarkerElementRef.current,
          userLocation ? userHeadingRef.current : null,
        );
      })
      .catch(() => {
        if (active) onError();
      });

    return () => {
      active = false;
    };
  }, [onError, ready, userCoordinates, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !userLocation) return;
    if (!tryConsumeLocationFocusRequest(locationFocusRequestId)) return;
    map.flyTo(userLocation, Math.max(map.getZoom(), 16), {
      duration: 0.45,
    });
  }, [
    locationFocusRequestId,
    ready,
    tryConsumeLocationFocusRequest,
    userLocation,
  ]);

  useEffect(() => {
    userHeadingRef.current = userHeading;
    updateCurrentLocationHeading(
      locationMarkerElementRef.current,
      userLocation ? userHeading : null,
    );
  }, [userHeading, userLocation]);

  return (
    <>
      <div
        ref={nodeRef}
        className="map-canvas nearby-map-canvas"
        aria-label={`OpenStreetMap으로 보는 ${
          getKindCopy(kind).resultLabel
        }까지의 ${getKindCopy(kind).routeLabel} 경로`}
      />
      {!ready ? (
        <div
          className="map-loading nearby-map-loading"
          role="status"
          aria-live="polite"
        >
          <span className="loading-wheel" aria-hidden="true" />
          지도를 불러오고 있어요
        </div>
      ) : null}
    </>
  );
}

export function NearbyStationResultCard({
  kind,
  station,
  segment,
  availability,
  adjustedForAvailability,
  warning,
  onClose,
  onRefocus,
}: Pick<
  NearbyStationMapProps,
  | "kind"
  | "station"
  | "segment"
  | "availability"
  | "adjustedForAvailability"
  | "warning"
  | "onClose"
> & { onRefocus: () => void }) {
  const titleId = useId();
  const copy = getKindCopy(kind);
  const bikes =
    availability === "confirmed" &&
    station.bikes !== null &&
    Number.isFinite(station.bikes)
      ? `자전거 ${Math.max(0, Math.floor(station.bikes))}대`
      : "수량 미확인";

  const handleFocusKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === " ") event.stopPropagation();
  };

  return (
    <section
      className={`nearby-result-card nearby-result-card--${kind}`}
      aria-labelledby={titleId}
      aria-live="polite"
    >
      <button
        className="nearby-result-card__focus"
        type="button"
        aria-label={`${station.name}까지의 경로를 지도에 다시 맞추기`}
        onClick={onRefocus}
        onKeyDown={handleFocusKeyDown}
      >
        <span
          className="station-mini-icon nearby-result-card__icon"
          aria-hidden="true"
        >
          <Bike size={18} />
        </span>
        <span className="nearby-result-card__copy">
          <span className="nearby-result-card__eyebrow">
            {copy.resultLabel}
          </span>
          <strong className="nearby-result-card__name" id={titleId}>
            {station.name}
          </strong>
          {station.address ? (
            <span className="nearby-result-card__address">
              {station.address}
            </span>
          ) : null}
          <span className="nearby-result-card__metrics">
            <span className="nearby-result-card__metric">
              {copy.routeLabel} {formatDuration(segment.durationSeconds)}
            </span>
            <span className="nearby-result-card__metric">
              {formatDistance(segment.distanceMeters)}
            </span>
            {kind === "rental" ? (
              <span
                className={`nearby-result-card__availability nearby-result-card__availability--${availability}`}
              >
                {bikes}
              </span>
            ) : null}
          </span>
          {kind === "rental" && adjustedForAvailability ? (
            <span className="nearby-result-card__notice">
              가까운 대여소에 자전거가 없어 다음 대여소를 안내해요.
            </span>
          ) : null}
          {warning ? (
            <span className="nearby-result-card__warning" role="status">
              {warning}
            </span>
          ) : null}
        </span>
      </button>
      <button
        className="nearby-result-card__close"
        type="button"
        aria-label={`${copy.resultLabel} 결과 닫기`}
        onClick={onClose}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

function NearbyMapLocationControl({
  ready,
  locationStatus,
  locationMode,
  headingStatus,
  onLocate,
}: Pick<
  NearbyStationMapProps,
  "locationStatus" | "locationMode" | "headingStatus" | "onLocate"
> & { ready: boolean }) {
  const busy =
    locationStatus === "loading" || headingStatus === "requesting";
  const label =
    locationStatus === "error"
      ? "현재 위치를 확인하지 못했어요. 실시간 추적 다시 시도"
      : locationMode === "heading" || headingStatus === "denied"
        ? "현재 위치와 방향 추적을 종료하고 지도를 북쪽 기준으로 되돌리기"
        : locationMode === "tracking"
          ? "내가 보는 방향 표시"
          : "실시간 현재 위치 추적 시작";
  const headingMessage =
    headingStatus === "denied"
      ? "방향 권한을 허용하면 보는 방향을 표시할 수 있어요"
      : headingStatus === "fallback"
        ? "방향 센서가 없어 이동 중일 때만 방향을 표시해요"
        : "";

  return (
    <div className="map-guide-controls nearby-map-location-controls">
      <button
        className={`map-location-control ${locationStatus} ${locationMode}`}
        type="button"
        aria-label={label}
        disabled={!ready || busy}
        onClick={onLocate}
      >
        <Crosshair
          className={busy ? "is-spinning" : undefined}
          size={17}
          strokeWidth={2.3}
          aria-hidden="true"
        />
      </button>
      {locationStatus === "error" ? (
        <span className="map-location-error" role="alert">
          위치를 확인할 수 없어요
        </span>
      ) : null}
      {headingMessage ? (
        <span className="map-location-error is-guidance" role="status">
          {headingMessage}
        </span>
      ) : null}
    </div>
  );
}

export function NearbyStationMap({
  kind,
  userCoordinates,
  station,
  segment,
  availability,
  adjustedForAvailability,
  warning,
  userLocation,
  userHeading,
  locationFocusRequestId,
  tryConsumeLocationFocusRequest,
  locationStatus,
  locationMode,
  headingStatus,
  onLocate,
  onMapDragStart,
  onMapTouchDragStart,
  onMapTouchDragEnd,
  onClose,
  onRefocus,
}: NearbyStationMapProps) {
  const [provider, setProvider] = useState<MapProvider>("loading");
  const [refocusRequestId, setRefocusRequestId] = useState(0);

  useEffect(() => {
    let active = true;
    void loadKakaoMapsSdk()
      .then(() => {
        if (active) setProvider("kakao");
      })
      .catch(() => {
        if (active) setProvider("leaflet");
      });
    return () => {
      active = false;
    };
  }, []);

  const useLeafletFallback = useCallback(() => {
    setProvider("leaflet");
  }, []);
  const showUnavailableMap = useCallback(() => {
    setProvider("unavailable");
  }, []);
  const handleRefocus = useCallback(() => {
    setRefocusRequestId((requestId) => requestId + 1);
    onRefocus?.();
  }, [onRefocus]);

  const canvasProps: MapCanvasProps = {
    kind,
    userCoordinates,
    station,
    segment,
    userLocation,
    userHeading,
    locationFocusRequestId,
    tryConsumeLocationFocusRequest,
    locationMode,
    refocusRequestId,
    onRefocus: handleRefocus,
    onMapDragStart,
    onMapTouchDragStart,
    onMapTouchDragEnd,
  };

  return (
    <div
      className={`map-wrap nearby-map nearby-map--${kind}`}
      data-nearby-kind={kind}
    >
      {provider === "kakao" ? (
        <KakaoNearbyMapCanvas
          {...canvasProps}
          onError={useLeafletFallback}
        />
      ) : null}
      {provider === "leaflet" ? (
        <LeafletNearbyMapCanvas
          {...canvasProps}
          onError={showUnavailableMap}
        />
      ) : null}
      {provider === "loading" ? (
        <>
          <div
            className="map-canvas nearby-map-canvas"
            aria-hidden="true"
          />
          <div
            className="map-loading nearby-map-loading"
            role="status"
            aria-live="polite"
          >
            <span className="loading-wheel" aria-hidden="true" />
            지도를 불러오고 있어요
          </div>
        </>
      ) : null}
      {provider === "unavailable" ? (
        <div
          className="map-canvas nearby-map-canvas nearby-map-unavailable"
          role="status"
        >
          지도를 불러오지 못했어요. 대여소 정보는 아래에서 확인할 수
          있어요.
        </div>
      ) : null}
      <NearbyMapLocationControl
        ready={provider === "kakao" || provider === "leaflet"}
        locationStatus={locationStatus}
        locationMode={locationMode}
        headingStatus={headingStatus}
        onLocate={onLocate}
      />
      <NearbyStationResultCard
        kind={kind}
        station={station}
        segment={segment}
        availability={availability}
        adjustedForAvailability={adjustedForAvailability}
        warning={warning}
        onClose={onClose}
        onRefocus={handleRefocus}
      />
    </div>
  );
}

export default NearbyStationMap;
