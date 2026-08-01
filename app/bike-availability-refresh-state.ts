export type BikeAvailabilityStatus = "loading" | "ready" | "unavailable";

export type BikeAvailabilityRefreshState = {
  bikes: number | null;
  status: BikeAvailabilityStatus;
  isRefreshing: boolean;
  error: string;
  announcement: string;
};

export type BikeAvailabilityRefreshAction =
  | { type: "refresh-start" }
  | { type: "refresh-success"; bikes: number; announcement: string }
  | { type: "refresh-failure"; message: string };

export function createBikeAvailabilityRefreshState(
  bikes: number | null,
  status: BikeAvailabilityStatus,
): BikeAvailabilityRefreshState {
  return {
    bikes,
    status,
    isRefreshing: false,
    error: "",
    announcement: "",
  };
}

export function reduceBikeAvailabilityRefreshState(
  state: BikeAvailabilityRefreshState,
  action: BikeAvailabilityRefreshAction,
): BikeAvailabilityRefreshState {
  switch (action.type) {
    case "refresh-start":
      return {
        ...state,
        isRefreshing: true,
        error: "",
        announcement: "",
      };
    case "refresh-success":
      return {
        bikes: action.bikes,
        status: "ready",
        isRefreshing: false,
        error: "",
        announcement: action.announcement,
      };
    case "refresh-failure":
      return {
        ...state,
        status: state.status === "ready" ? "ready" : "unavailable",
        isRefreshing: false,
        error: action.message,
        announcement: "",
      };
  }
}

export function replanIfBikeStationUnavailable(
  availableBikes: number,
  replan: () => void,
) {
  if (availableBikes !== 0) return false;
  replan();
  return true;
}

export function abortBikeAvailabilityRefresh(
  controller: AbortController | null,
) {
  controller?.abort();
}
