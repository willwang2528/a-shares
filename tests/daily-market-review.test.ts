import assert from "node:assert/strict";
import test from "node:test";
import {
  alertsFromMarketDailyReview,
  parseTencentExchangeCloseResponse,
  type MarketDailyReview,
} from "../lib/daily-market-review.ts";

function response(
  code: "sh000001" | "sz399001",
  values: { up: number; flat: number; down: number; amountWan: number },
) {
  const quote = Array.from({ length: 90 }, () => "");
  quote[30] = "20260721161402";
  quote[37] = String(values.amountWan);
  const rank = [
    code.startsWith("sh") ? "Rank_A_sh" : "Rank_A_sz",
    "rank",
    String(values.up),
    String(values.flat),
    String(values.down),
    String(values.up + values.flat + values.down),
  ];
  return JSON.stringify({ data: { [code]: { qt: { [code]: quote, zhishu: rank } } } });
}

test("parses real exchange breadth and turnover with matching totals", () => {
  const result = parseTencentExchangeCloseResponse(
    response("sh000001", { up: 1210, flat: 55, down: 1044, amountWan: 139_651_762 }),
    "sh000001",
  );
  assert.equal(result.tradeDate, "2026-07-21");
  assert.equal(result.exchange, "SH");
  assert.equal(result.up, 1210);
  assert.equal(result.down, 1044);
  assert.equal(result.listed, 2309);
  assert.equal(result.turnoverYuan, 1_396_517_620_000);
});

test("rejects breadth totals that do not reconcile", () => {
  const raw = JSON.parse(
    response("sz399001", { up: 1661, flat: 56, down: 1175, amountWan: 156_057_506 }),
  );
  raw.data.sz399001.qt.zhishu[5] = "9999";
  assert.throws(
    () => parseTencentExchangeCloseResponse(JSON.stringify(raw), "sz399001"),
    /数值不完整/,
  );
});

test("daily review alerts use only real closing metrics and stable daily keys", () => {
  const review = {
    tradeDate: "2026-07-17",
    asOf: "2026-07-17T16:14:00+08:00",
    provider: "真实测试响应",
    breadth: { up: 900, down: 4000, flat: 100, total: 5000 },
    indices: [
      { code: "399006.SZ", name: "创业板指", value: 3428.63, changePct: -7.15 },
    ],
  } as MarketDailyReview;
  const events = alertsFromMarketDailyReview(review, 60);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.id, "daily:2026-07-17:market-breadth-down");
  assert.equal(events[0]?.currentValue, "80.0%（4000 家）");
  assert.equal(events[1]?.level, "danger");
  assert.match(events[1]?.provider ?? "", /真实/);
});
