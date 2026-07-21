import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRealtimeBikeAvailability,
  normalizeRealtimeBikeAvailability,
} from "../app/realtime-bikes.ts";

function completeStationPayload(count = 2_700) {
  return {
    stations: Array.from({ length: count }, (_, index) => ({
      id: String(index + 1),
      availableBikes: index % 12,
    })),
  };
}

test("공식 실시간 요청이 멈춰도 제한시간 뒤 프록시 데이터로 이어간다", async () => {
  const calls = [];
  const availability = await fetchRealtimeBikeAvailability(
    new AbortController().signal,
    {
      attemptTimeoutMs: 10,
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) return new Promise(() => {});
        return Response.json(completeStationPayload());
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(availability.length, 2_700);
});

test("모든 실시간 소스가 멈춰도 로딩을 영구 유지하지 않는다", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    fetchRealtimeBikeAvailability(new AbortController().signal, {
      attemptTimeoutMs: 8,
      fetchImpl: async () => new Promise(() => {}),
    }),
    /Realtime bike status request failed/,
  );
  assert.ok(Date.now() - startedAt < 200);
});

test("상위 요청 취소는 다음 실시간 소스를 호출하지 않고 즉시 중단한다", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = fetchRealtimeBikeAvailability(controller.signal, {
    attemptTimeoutMs: 1_000,
    fetchImpl: async () => {
      calls += 1;
      return new Promise(() => {});
    },
  });
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("공식 응답의 일반·QR·새싹 따릉이 수를 합산하고 0대도 보존한다", () => {
  assert.deepEqual(
    normalizeRealtimeBikeAvailability({
      realtimeList: [
        {
          stationName: "2041. 사당중학교 버스정류소",
          parkingBikeTotCnt: "0",
          parkingQRBikeCnt: "2",
          parkingELECBikeCnt: "1",
        },
        {
          stationName: "2104. 사당역 5번출구",
          parkingBikeTotCnt: "0",
          parkingQRBikeCnt: "0",
          parkingELECBikeCnt: "0",
        },
      ],
    }),
    [
      { id: "2041", availableBikes: 3 },
      { id: "2104", availableBikes: 0 },
    ],
  );
});
