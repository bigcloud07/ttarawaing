"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import {
  getRotatingMapCanvasSide,
  shouldPrepareHeadingMapTouch,
  shouldRestoreHeadingMapTouch,
  updateMapPinchActive,
  unwrapMapHeading,
} from "./map-location-camera";

export type MapLocationStatus = "idle" | "loading" | "ready" | "error";
export type MapLocationMode = "idle" | "tracking" | "heading";
export type MapHeadingStatus =
  | "idle"
  | "requesting"
  | "active"
  | "fallback"
  | "denied";

export const CURRENT_LOCATION_MARKER_HTML =
  '<span class="current-location-marker" aria-hidden="true"><span class="current-location-direction"></span><span class="current-location-dot"></span></span>';

function normalizeHeading(heading: number) {
  return ((heading % 360) + 360) % 360;
}

export function createCurrentLocationMarkerElement() {
  const marker = document.createElement("span");
  marker.className = "current-location-marker";
  marker.title = "현재 위치";
  marker.setAttribute("aria-hidden", "true");

  const direction = document.createElement("span");
  direction.className = "current-location-direction";
  const dot = document.createElement("span");
  dot.className = "current-location-dot";
  marker.append(direction, dot);
  return marker;
}

export function updateCurrentLocationHeading(
  marker: HTMLElement | null,
  heading: number | null,
) {
  if (!marker) return;
  const hasHeading = Number.isFinite(heading);
  marker.classList.toggle("has-heading", hasHeading);
  if (hasHeading) {
    marker.style.setProperty(
      "--location-heading",
      `${normalizeHeading(Number(heading))}deg`,
    );
  } else {
    marker.style.removeProperty("--location-heading");
  }
}

export function runHeadingAwareMapInteractionStart(
  node: HTMLElement | null,
  onInteractionStart: () => void,
) {
  if (node?.dataset.headingUp !== "true") {
    onInteractionStart();
    return;
  }

  node.style.transition = "none";
  flushSync(onInteractionStart);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      node.style.removeProperty("transition");
    });
  });
}

export function useHeadingAwareMapTouchStart({
  nodeRef,
  ready,
  onSuspendVisualHeading,
  onRestoreVisualHeading,
  onTouchDragEnd,
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  ready: boolean;
  onSuspendVisualHeading: () => void;
  onRestoreVisualHeading: () => void;
  onTouchDragEnd: () => void;
}) {
  const pinchActiveRef = useRef(false);
  const touchGestureActiveRef = useRef(false);
  const touchDragStartedRef = useRef(false);
  const gestureHadPinchRef = useRef(false);
  const restorePendingRef = useRef(false);
  const releaseAnimationFrameRef = useRef(0);
  const settleTimeoutRef = useRef<number | null>(null);

  const settleVisualHeading = useCallback(() => {
    if (!restorePendingRef.current) return;
    restorePendingRef.current = false;
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    pinchActiveRef.current = false;
    gestureHadPinchRef.current = false;
    touchDragStartedRef.current = false;
    onRestoreVisualHeading();
  }, [onRestoreVisualHeading]);

  const markTouchDragStarted = useCallback(() => {
    if (
      !touchGestureActiveRef.current ||
      touchDragStartedRef.current
    ) {
      return false;
    }
    touchDragStartedRef.current = true;
    return true;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    const viewport = node?.parentElement;
    if (!ready || !node || !viewport) return;

    const handleTouchStart = (event: TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !node.contains(target)) return;
      if (releaseAnimationFrameRef.current) {
        window.cancelAnimationFrame(releaseAnimationFrameRef.current);
        releaseAnimationFrameRef.current = 0;
      }
      if (restorePendingRef.current) {
        restorePendingRef.current = false;
        if (settleTimeoutRef.current !== null) {
          window.clearTimeout(settleTimeoutRef.current);
          settleTimeoutRef.current = null;
        }
        pinchActiveRef.current = false;
        gestureHadPinchRef.current = false;
        touchDragStartedRef.current = false;
      }
      touchGestureActiveRef.current = true;
      const nextActive = updateMapPinchActive(
        pinchActiveRef.current,
        event.touches.length,
      );
      pinchActiveRef.current = nextActive;
      if (nextActive) gestureHadPinchRef.current = true;
      if (
        !shouldPrepareHeadingMapTouch(
          node.dataset.headingUp === "true",
          event.touches.length,
        )
      ) {
        return;
      }
      onSuspendVisualHeading();
    };
    const handleTouchFinish = (event: TouchEvent) => {
      const nextActive = updateMapPinchActive(
        pinchActiveRef.current,
        event.touches.length,
      );
      pinchActiveRef.current = nextActive;
      if (!shouldRestoreHeadingMapTouch(event.touches.length)) {
        return;
      }
      touchGestureActiveRef.current = false;

      if (gestureHadPinchRef.current) {
        pinchActiveRef.current = true;
        touchDragStartedRef.current = false;
        restorePendingRef.current = true;
        if (settleTimeoutRef.current !== null) {
          window.clearTimeout(settleTimeoutRef.current);
        }
        settleTimeoutRef.current = window.setTimeout(
          settleVisualHeading,
          500,
        );
        return;
      }

      pinchActiveRef.current = false;
      if (touchDragStartedRef.current) {
        touchDragStartedRef.current = false;
        runHeadingAwareMapInteractionStart(node, onTouchDragEnd);
        return;
      }

      window.cancelAnimationFrame(releaseAnimationFrameRef.current);
      releaseAnimationFrameRef.current = window.requestAnimationFrame(() => {
        releaseAnimationFrameRef.current = 0;
        pinchActiveRef.current = false;
        onRestoreVisualHeading();
      });
    };

    viewport.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchFinish, {
      capture: true,
      passive: true,
    });
    viewport.addEventListener("touchcancel", handleTouchFinish, {
      capture: true,
      passive: true,
    });
    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart, true);
      viewport.removeEventListener("touchend", handleTouchFinish, true);
      viewport.removeEventListener("touchcancel", handleTouchFinish, true);
      window.cancelAnimationFrame(releaseAnimationFrameRef.current);
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }
      pinchActiveRef.current = false;
      touchGestureActiveRef.current = false;
      touchDragStartedRef.current = false;
      gestureHadPinchRef.current = false;
      restorePendingRef.current = false;
    };
  }, [
    nodeRef,
    onRestoreVisualHeading,
    onSuspendVisualHeading,
    onTouchDragEnd,
    ready,
    settleVisualHeading,
  ]);

  return {
    pinchActiveRef,
    touchGestureActiveRef,
    markTouchDragStarted,
    settleVisualHeading,
  };
}

export function useHeadingUpMapCanvas({
  nodeRef,
  enabled,
  heading,
  ready,
  onRelayout,
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  heading: number | null;
  ready: boolean;
  onRelayout: () => void;
}) {
  const continuousHeadingRef = useRef<number | null>(null);
  const headingUpRef = useRef(false);
  const visualHeadingSuspendedRef = useRef(false);
  const transitionAnimationFrameRef = useRef(0);
  const headingUp = enabled && Number.isFinite(heading);

  const applyExpandedLayout = useCallback(() => {
    const node = nodeRef.current;
    const viewport = node?.parentElement;
    if (!node || !viewport) return;
    const side = getRotatingMapCanvasSide(
      viewport.clientWidth,
      viewport.clientHeight,
    );
    if (side <= 0) return;
    node.style.inset = "auto";
    node.style.left = "50%";
    node.style.top = "50%";
    node.style.width = `${side}px`;
    node.style.height = `${side}px`;
    node.style.marginLeft = `${-side / 2}px`;
    node.style.marginTop = `${-side / 2}px`;
  }, [nodeRef]);

  const applyNeutralLayout = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.inset = "0";
    node.style.removeProperty("left");
    node.style.removeProperty("top");
    node.style.removeProperty("width");
    node.style.removeProperty("height");
    node.style.removeProperty("margin-left");
    node.style.removeProperty("margin-top");
  }, [nodeRef]);

  const suspendVisualHeading = useCallback(() => {
    const node = nodeRef.current;
    if (
      !node ||
      !headingUpRef.current ||
      visualHeadingSuspendedRef.current
    ) {
      return;
    }
    window.cancelAnimationFrame(transitionAnimationFrameRef.current);
    transitionAnimationFrameRef.current = 0;
    visualHeadingSuspendedRef.current = true;
    node.dataset.headingVisualSuspended = "true";
    node.style.transition = "none";
    node.style.setProperty("--map-counter-rotation", "0deg");
    node.style.transform = "none";
    applyNeutralLayout();
    onRelayout();
  }, [applyNeutralLayout, nodeRef, onRelayout]);

  const restoreVisualHeading = useCallback(() => {
    const node = nodeRef.current;
    if (!node || !visualHeadingSuspendedRef.current) return;
    visualHeadingSuspendedRef.current = false;
    node.removeAttribute("data-heading-visual-suspended");

    if (headingUpRef.current) {
      const continuousHeading = continuousHeadingRef.current;
      applyExpandedLayout();
      if (Number.isFinite(continuousHeading)) {
        node.style.setProperty(
          "--map-counter-rotation",
          `${continuousHeading}deg`,
        );
        node.style.transform = `rotate(${-Number(continuousHeading)}deg)`;
      }
    } else {
      applyNeutralLayout();
    }
    onRelayout();

    transitionAnimationFrameRef.current = window.requestAnimationFrame(() => {
      transitionAnimationFrameRef.current = window.requestAnimationFrame(() => {
        transitionAnimationFrameRef.current = 0;
        node.style.removeProperty("transition");
      });
    });
  }, [applyExpandedLayout, applyNeutralLayout, nodeRef, onRelayout]);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    headingUpRef.current = headingUp;

    if (!headingUp || heading === null) {
      continuousHeadingRef.current = null;
      visualHeadingSuspendedRef.current = false;
      window.cancelAnimationFrame(transitionAnimationFrameRef.current);
      transitionAnimationFrameRef.current = 0;
      node.removeAttribute("data-heading-up");
      node.removeAttribute("data-heading-visual-suspended");
      node.style.removeProperty("--map-counter-rotation");
      node.style.removeProperty("transform");
      node.style.removeProperty("transition");
      return;
    }

    const continuousHeading = unwrapMapHeading(
      continuousHeadingRef.current,
      heading,
    );
    continuousHeadingRef.current = continuousHeading;
    node.dataset.headingUp = "true";
    if (visualHeadingSuspendedRef.current) return;
    node.style.setProperty(
      "--map-counter-rotation",
      `${continuousHeading}deg`,
    );
    node.style.transform = `rotate(${-continuousHeading}deg)`;
  }, [heading, headingUp, nodeRef]);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    const viewport = node?.parentElement;
    if (!ready || !node || !viewport) return;

    let animationFrame = 0;
    const applyLayout = () => {
      if (headingUp && !visualHeadingSuspendedRef.current) {
        applyExpandedLayout();
      } else {
        applyNeutralLayout();
      }
      onRelayout();
    };
    const scheduleLayout = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(applyLayout);
    };

    applyLayout();
    const resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(viewport);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    applyExpandedLayout,
    applyNeutralLayout,
    headingUp,
    nodeRef,
    onRelayout,
    ready,
  ]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(transitionAnimationFrameRef.current);
    },
    [],
  );

  return { suspendVisualHeading, restoreVisualHeading };
}
