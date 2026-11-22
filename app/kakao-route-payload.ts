type KakaoRoutePayload = {
  status?: unknown;
  route?: {
    legs?: Array<{
      properties?: { distance?: unknown; time?: unknown };
      steps?: Array<{ path?: { points?: unknown } } | null>;
    } | null>;
  };
};

export function trimKakaoRoutePayload(payload: unknown) {
  const { status, route } = (payload ?? {}) as KakaoRoutePayload;
  if (!Array.isArray(route?.legs)) return { status };
  return {
    status,
    route: {
      legs: route.legs.map((leg) => ({
        properties: {
          distance: leg?.properties?.distance,
          time: leg?.properties?.time,
        },
        steps: Array.isArray(leg?.steps)
          ? leg.steps.map((step) => ({ path: { points: step?.path?.points } }))
          : undefined,
      })),
    },
  };
}
