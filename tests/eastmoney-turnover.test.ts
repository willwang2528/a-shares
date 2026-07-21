import assert from "node:assert/strict";
import test from "node:test";
import { parseEastmoneyIndexTurnover } from "../lib/eastmoney-turnover.ts";

test("历史成交额只读取真实日线中的成交额字段", () => {
  const rows = parseEastmoneyIndexTurnover({ data: { klines: [
    "2026-07-20,3791.66,3796.28,3831.66,3741.11,709234069,1294651895844.70,2.41,0.85,32.13,1.47",
  ] } });
  assert.deepEqual(rows, [{ tradeDate: "2026-07-20", turnoverYuan: 1294651895844.7 }]);
});

test("历史成交额字段缺失时返回空数组而非估算", () => {
  assert.deepEqual(parseEastmoneyIndexTurnover({ data: { klines: [] } }), []);
});
