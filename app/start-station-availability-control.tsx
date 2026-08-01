"use client";

import { Bike, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useReducer, useRef } from "react";
import {
  abortBikeAvailabilityRefresh,
  createBikeAvailabilityRefreshState,
  reduceBikeAvailabilityRefreshState,
  replanIfBikeStationUnavailable,
} from "./bike-availability-refresh-state";
import type { BikeAvailabilityStatus } from "./bike-availability-refresh-state";

export type BikeAvailabilityRefreshResult = {
  availableBikes: number;
  replanIfUnavailable: () => void;
};

type StartStationAvailabilityControlProps = {
  stationId: string;
  stationName: string;
  initialBikes: number | null;
  initialStatus: BikeAvailabilityStatus;
  loadFreshAvailability: (
    stationId: string,
    signal: AbortSignal,
  ) => Promise<BikeAvailabilityRefreshResult>;
};

const REFRESH_ERROR_MESSAGE =
  "잔여 대수를 새로고침하지 못했어요. 잠시 후 다시 시도해 주세요.";

function availabilityLabel(
  status: BikeAvailabilityStatus,
  bikes: number | null,
) {
  if (status === "ready" && bikes !== null) {
    return `대여 가능 따릉이 ${bikes}대`;
  }
  if (status === "loading") return "실시간 대여 가능 수량 확인 중";
  return "수량 미확인";
}

export const StartStationAvailabilityControl = memo(
  function StartStationAvailabilityControl({
    stationId,
    stationName,
    initialBikes,
    initialStatus,
    loadFreshAvailability,
  }: StartStationAvailabilityControlProps) {
    const [state, dispatch] = useReducer(
      reduceBikeAvailabilityRefreshState,
      undefined,
      () => createBikeAvailabilityRefreshState(initialBikes, initialStatus),
    );
    const refreshAbortControllerRef = useRef<AbortController | null>(null);

    useEffect(
      () => () => {
        abortBikeAvailabilityRefresh(refreshAbortControllerRef.current);
      },
      [],
    );

    const refreshAvailability = useCallback(async () => {
      if (state.status === "loading" || state.isRefreshing) return;

      const controller = new AbortController();
      refreshAbortControllerRef.current = controller;
      dispatch({ type: "refresh-start" });

      try {
        const result = await loadFreshAvailability(stationId, controller.signal);
        if (controller.signal.aborted) return;

        dispatch({
          type: "refresh-success",
          bikes: result.availableBikes,
          announcement: `${stationName} 대여 가능 따릉이가 ${result.availableBikes}대로 새로고침됐어요.`,
        });

        replanIfBikeStationUnavailable(
          result.availableBikes,
          result.replanIfUnavailable,
        );
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        dispatch({ type: "refresh-failure", message: REFRESH_ERROR_MESSAGE });
      } finally {
        if (refreshAbortControllerRef.current === controller) {
          refreshAbortControllerRef.current = null;
        }
      }
    }, [
      loadFreshAvailability,
      state.isRefreshing,
      state.status,
      stationId,
      stationName,
    ]);

    const label = availabilityLabel(state.status, state.bikes);

    return (
      <span className="station-availability-control">
        <span className="station-availability-actions">
          <span
            className={`availability ${
              state.status !== "ready" || state.bikes === null
                ? "status-unlinked"
                : state.bikes === 0
                  ? "bikes-empty"
                  : "bikes-live"
            }`}
            aria-hidden="true"
            title={
              state.status === "unavailable"
                ? "현재 대여 가능 수량을 불러오지 못했어요."
                : undefined
            }
          >
            {state.status === "ready" && state.bikes !== null ? (
              <>
                <Bike size={13} aria-hidden="true" /> {state.bikes}대
              </>
            ) : state.status === "loading" ? (
              "현황 확인 중"
            ) : (
              "수량 미확인"
            )}
          </span>
          <button
            className="bike-availability-refresh"
            type="button"
            aria-label={`${stationName} 잔여 대수 ${
              state.isRefreshing ? "새로고침 중" : "새로고침"
            }`}
            aria-busy={state.isRefreshing}
            disabled={state.status === "loading" || state.isRefreshing}
            title="잔여 대수 새로고침"
            onClick={refreshAvailability}
          >
            <RefreshCw
              className={state.isRefreshing ? "is-spinning" : undefined}
              size={15}
              aria-hidden="true"
            />
          </button>
        </span>
        <span className="screen-reader-only" role="status" aria-live="polite">
          {state.announcement || label}
        </span>
        {state.error ? (
          <span className="bike-availability-refresh-error" role="alert">
            {state.error}
          </span>
        ) : null}
      </span>
    );
  },
);
