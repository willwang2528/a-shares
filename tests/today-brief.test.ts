import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSnapshot } from "../lib/domain.ts";
import type { StockQuote } from "../lib/market.ts";
import type { SectorPerformance } from "../lib/sina-sector-performance.ts";
import type { StoredWatchItem } from "../lib/storage.ts";
import {
  buildMarketBriefLayer,
  buildSectorBriefLayer,
  buildStockBriefLayer,
  chooseLargestIndex,
  chooseWatchedSector,
  chooseWatchedStock,
} from "../lib/today-brief.ts";

function watch(
  code: string,
  name: string,
  objectType: "sector" | "stock",
  tag: "watch" | "holding" = "watch",
): StoredWatchItem {
  return {
    id: code,
    user_id: "user",
    group_id: null,
    object_type: objectType,
    code,
    name,
    tag,
    cost_price: null,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
  };
}

function quote(code: string, changePct: number, asOf = "2026-07-21T09:59:00+08:00"): StockQuote {
  return { code, value: 10, changePct, asOf };
}

function sector(code: string, name: string, changePct: number): SectorPerformance {
  return {
    code,
    name,
    changePct,
    turnoverYuan: 100,
    up: 3,
    down: 7,
    flat: 0,
    memberCount: 10,
    coreStock: "样本 A",
    coreStockCode: "sh600001",
    coreStockChangePct: 1,
    weakestStock: "样本 B",
    weakestStockCode: "sh600002",
    weakestStockChangePct: -2,
  };
}

const snapshot: MarketSnapshot = {
  dataVersion: "real",
  dataMode: "experimental_real",
  coverage: "indices_only",
  asOf: "2026-07-21T15:00:00+08:00",
  provider: "真实指数源",
  sourceUrl: "https://example.com/real",
  delayedMinutes: 0,
  dataComplete: true,
  indices: [
    { code: "000001.SH", name: "上证指数", value: 3500, changePct: -1 },
    { code: "399006.SZ", name: "创业板指", value: 2200, changePct: 3.2 },
    { code: "000300.SH", name: "沪深 300", value: 3900, changePct: -2.8 },
  ],
  breadth: { up: 0, down: 0, flat: 0, limitUp: 0, limitDown: 0 },
  sectors: [],
  stocks: [],
};

test("market card chooses the largest absolute index movement and only compares previous close", () => {
  assert.equal(chooseLargestIndex(snapshot)?.name, "创业板指");
  const layer = buildMarketBriefLayer(snapshot);
  assert.equal(layer.status, "available");
  assert.equal(layer.changePct, 3.2);
  assert.equal(layer.level, null, "indices-only data must remain a price fact");
  assert.equal(layer.comparisonBase, "相对上一交易日收盘");
  assert.match(layer.reason, /不代表全市场风险/);
  assert.match(layer.coverageText, /真实指数 3\/6/);
});

test("stock card only considers watched stocks and prefers holding on an exact tie", () => {
  const watches = [
    watch("600001.SH", "仅关注股", "stock"),
    watch("600002.SH", "持有股", "stock", "holding"),
  ];
  const selected = chooseWatchedStock(watches, [
    quote("600001.SH", -3),
    quote("600002.SH", -3),
    quote("600999.SH", -9),
  ]);
  assert.equal(selected?.watch.name, "持有股");
  const layer = buildStockBriefLayer(
    watches,
    [quote("600002.SH", -3)],
    new Date("2026-07-21T10:00:00+08:00"),
  );
  assert.equal(layer.name, "持有股");
  assert.match(layer.coverageText, /1\/2/);
});

test("risk level is considered before absolute movement for watched stocks", () => {
  const watches = [
    watch("600001.SH", "上涨较多", "stock"),
    watch("600002.SH", "下跌需留意", "stock"),
  ];
  const selected = chooseWatchedStock(watches, [
    quote("600001.SH", 9),
    quote("600002.SH", -2.1),
  ]);
  assert.equal(selected?.watch.name, "下跌需留意");
});

test("sector card only selects exact watched-sector results and keeps watched order on ties", () => {
  const first = watch("SINA:hy_a", "行业甲", "sector");
  const second = watch("SINA:hy_b", "行业乙", "sector");
  const selected = chooseWatchedSector([
    { watch: first, performance: sector(first.code, first.name, -2.5) },
    { watch: second, performance: sector(second.code, second.name, -2.5) },
  ]);
  assert.equal(selected?.watch.name, "行业甲");
  const layer = buildSectorBriefLayer(
    [first, second, watch("EASTMONEY:BK1187", "小红书", "sector")],
    [{ watch: first, performance: sector(first.code, first.name, -2.5) }],
    "2026-07-21T10:00:00+08:00",
  );
  assert.equal(layer.name, "行业甲");
  assert.match(layer.coverageText, /1\/3/);
  assert.match(layer.coverageText, /概念板块当前没有可靠汇总/);
  assert.equal(layer.dataTimeLabel, "本次读取时间（行情新鲜度未知）");
});

test("no watch, partial source failure and stale quote stay isolated and explicit", () => {
  assert.equal(buildStockBriefLayer([], []).status, "no_watch");
  assert.equal(buildSectorBriefLayer([], [], new Date().toISOString()).status, "no_watch");
  assert.equal(buildMarketBriefLayer(null).status, "no_data");

  const stockWatch = watch("600001.SH", "样本股", "stock");
  const freshStock = buildStockBriefLayer(
    [stockWatch],
    [quote("600001.SH", -1)],
    new Date("2026-07-21T10:00:00+08:00"),
  );
  assert.equal(freshStock.status, "available", "market failure must not affect stock layer");

  const staleStock = buildStockBriefLayer(
    [stockWatch],
    [quote("600001.SH", -1, "2026-07-21T09:50:00+08:00")],
    new Date("2026-07-21T10:00:00+08:00"),
  );
  assert.equal(staleStock.status, "stale");
  assert.match(staleStock.currentValue, /过期/);
});

test("indices-only market data is not described as ordinary risk", () => {
  const layer = buildMarketBriefLayer(snapshot);
  assert.equal(snapshot.coverage, "indices_only");
  assert.notEqual(layer.reason, "未出现默认高风险信号");
  assert.match(layer.reason, /绝对涨跌幅最大/);
  assert.equal(layer.level, null);
});
