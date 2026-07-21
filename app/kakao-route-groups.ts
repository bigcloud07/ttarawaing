export const KAKAO_MAX_WAYPOINTS = 5;

export function splitKakaoRoutePoints<T>(
  points: T[],
  maximumWaypoints = KAKAO_MAX_WAYPOINTS,
) {
  const maximumPointsPerLink = maximumWaypoints + 2;
  if (points.length < 2) return [];
  if (points.length <= maximumPointsPerLink) return [points];

  const groups: T[][] = [];
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    const group = points.slice(startIndex, startIndex + maximumPointsPerLink);
    if (group.length < 2) break;
    groups.push(group);
    // The previous destination becomes the next origin so consecutive Kakao
    // links join without dropping or reordering a transfer point.
    startIndex += group.length - 1;
  }
  return groups;
}
