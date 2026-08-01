import assert from "node:assert/strict";
import test from "node:test";
import {
  abortBikeAvailabilityRefresh,
  createBikeAvailabilityRefreshState,
  reduceBikeAvailabilityRefreshState,
  replanIfBikeStationUnavailable,
} from "../app/bike-availability-refresh-state.ts";

test("잔여 대수 새로고침은 기존 수량을 유지한 채 로딩한다", () => {
  const initialState = createBikeAvailabilityRefreshState(7, "ready");
  const nextState = reduceBikeAvailabilityRefreshState(initialState, {
    type: "refresh-start",
  });

  assert.deepEqual(nextState, {
    bikes: 7,
    status: "ready",
    isRefreshing: true,
    error: "",
    announcement: "",
  });
});

test("성공한 잔여 대수 새로고침은 수량 영역의 상태만 교체한다", () => {
  const refreshingState = {
    ...createBikeAvailabilityRefreshState(7, "ready"),
    isRefreshing: true,
  };
  const nextState = reduceBikeAvailabilityRefreshState(refreshingState, {
    type: "refresh-success",
    bikes: 5,
    announcement: "5대로 새로고침됐어요.",
  });

  assert.deepEqual(nextState, {
    bikes: 5,
    status: "ready",
    isRefreshing: false,
    error: "",
    announcement: "5대로 새로고침됐어요.",
  });
});

test("실패한 새로고침은 마지막으로 확인한 수량을 보존한다", () => {
  const refreshingState = {
    ...createBikeAvailabilityRefreshState(7, "ready"),
    isRefreshing: true,
  };
  const nextState = reduceBikeAvailabilityRefreshState(refreshingState, {
    type: "refresh-failure",
    message: "다시 시도해 주세요.",
  });

  assert.equal(nextState.bikes, 7);
  assert.equal(nextState.status, "ready");
  assert.equal(nextState.isRefreshing, false);
  assert.equal(nextState.error, "다시 시도해 주세요.");
});

test("대여 가능한 수량이면 전체 경로 재추천을 실행하지 않는다", () => {
  let replanCount = 0;

  const didReplan = replanIfBikeStationUnavailable(5, () => {
    replanCount += 1;
  });

  assert.equal(didReplan, false);
  assert.equal(replanCount, 0);
});

test("새 수량이 0대일 때만 전체 경로 재추천을 정확히 한 번 실행한다", () => {
  let replanCount = 0;

  const didReplan = replanIfBikeStationUnavailable(0, () => {
    replanCount += 1;
  });

  assert.equal(didReplan, true);
  assert.equal(replanCount, 1);
});

test("잔여 대수 컴포넌트가 사라지면 진행 중인 요청을 취소한다", () => {
  const controller = new AbortController();

  abortBikeAvailabilityRefresh(controller);

  assert.equal(controller.signal.aborted, true);
});
