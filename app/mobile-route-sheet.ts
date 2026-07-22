export type MobileRouteSheetDragAction = "minimize" | "expand";

export const MOBILE_ROUTE_SHEET_CLICK_SLOP_PX = 8;
export const MOBILE_ROUTE_SHEET_CLICK_SUPPRESSION_MS = 450;
export const MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX = 36;

export function shouldSuppressMobileRouteSheetClick(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  if (
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y) ||
    !Number.isFinite(end.x) ||
    !Number.isFinite(end.y)
  ) {
    return false;
  }
  return (
    Math.hypot(end.x - start.x, end.y - start.y) >=
    MOBILE_ROUTE_SHEET_CLICK_SLOP_PX
  );
}

export function getMobileRouteSheetDragAction(
  start: { x: number; y: number },
  end: { x: number; y: number },
): MobileRouteSheetDragAction | null {
  if (
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y) ||
    !Number.isFinite(end.x) ||
    !Number.isFinite(end.y)
  ) {
    return null;
  }
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const verticalDistance = Math.abs(deltaY);
  if (
    verticalDistance < MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX ||
    verticalDistance <= Math.abs(deltaX) * 1.2
  ) {
    return null;
  }
  return deltaY > 0 ? "minimize" : "expand";
}
