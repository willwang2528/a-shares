import assert from "node:assert/strict";
import test from "node:test";
import {
  historicalCacheExpiry,
  historicalScopeKey,
  parseTencentHistoricalResponse,
  summarizeHistoricalMovements,
} from "../lib/historical-review.ts";

const recordedTencentResponse = JSON.stringify({
  data: {
    sh601600: {
      qfqday: [
        ["2026-07-15", "8.590", "8.640", "8.720", "8.520", "1800000"],
        ["2026-07-16", "8.650", "8.680", "8.760", "8.570", "1900000"],
        ["2026-07-17", "8.620", "8.440", "8.700", "8.330", "2540894"],
      ],
    },
  },
});

test("historical parser uses the real previous close, open and close fields", () => {
  const result = parseTencentHistoricalResponse(
    recordedTencentResponse,
    { code: "601600.SH", name: "中国铝业" },
    "2026-07-17",
  );
  assert.equal(result.status, "available");
  assert.equal(result.previousTradeDate, "2026-07-16");
  assert.equal(result.previousClose, 8.68);
  assert.equal(result.open, 8.62);
  assert.equal(result.close, 8.44);
  assert.equal(result.high, 8.7);
  assert.equal(result.low, 8.33);
  assert.equal(result.volume, 2_540_894);
  assert.ok(Math.abs((result.openGapPct ?? 0) - -0.6912) < 0.001);
  assert.ok(Math.abs((result.intradayPct ?? 0) - -2.0882) < 0.001);
  assert.ok(Math.abs((result.dayChangePct ?? 0) - -2.765) < 0.001);
});

test("historical parser reports no data instead of fabricating a non-trading day", () => {
  const result = parseTencentHistoricalResponse(
    recordedTencentResponse,
    { code: "601600.SH", name: "中国铝业" },
    "2026-07-18",
  );
  assert.equal(result.status, "no_data");
  assert.match(result.message ?? "", /没有返回这一天/);
});

test("deterministic summary separates facts from unknown causes", () => {
  const movement = parseTencentHistoricalResponse(
    recordedTencentResponse,
    { code: "601600.SH", name: "中国铝业" },
    "2026-07-17",
  );
  const summary = summarizeHistoricalMovements("2026-07-17", [movement]);
  assert.match(summary.headline, /真实数据/);
  assert.match(summary.facts.join(""), /前复权收盘价/);
  assert.match(summary.unknowns.join(""), /不推测/);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /立即买入|立即卖出|清仓|稳赚/,
  );
});

test("historical cache key follows the selected stock set and expiry is bounded", () => {
  assert.equal(
    historicalScopeKey([{ code: "601600.SH" }, { code: "000858.SZ" }]),
    "000858.SZ|601600.SH",
  );
  const now = new Date("2026-07-18T04:00:00.000Z");
  assert.equal(
    historicalCacheExpiry("2026-07-17", "complete", now),
    "2026-07-25T04:00:00.000Z",
  );
  assert.equal(
    historicalCacheExpiry("2026-07-18", "no_data", now),
    "2026-07-18T05:00:00.000Z",
  );
});
