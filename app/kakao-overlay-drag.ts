export type ScreenPoint = {
  x: number;
  y: number;
};

export function getDraggedOverlayPoint(
  startOverlayPoint: ScreenPoint,
  startPointer: ScreenPoint,
  currentPointer: ScreenPoint,
): ScreenPoint {
  return {
    x: startOverlayPoint.x + currentPointer.x - startPointer.x,
    y: startOverlayPoint.y + currentPointer.y - startPointer.y,
  };
}

export function hasMeaningfulOverlayDrag(
  startPointer: ScreenPoint,
  currentPointer: ScreenPoint,
  threshold = 6,
) {
  return (
    Math.hypot(
      currentPointer.x - startPointer.x,
      currentPointer.y - startPointer.y,
    ) >= threshold
  );
}
