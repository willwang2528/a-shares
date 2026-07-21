import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSinaAStockList,
  parseTencentDailyLimits,
} from "../lib/market-limits.ts";

function quote(
  code: string,
  current: number,
  high: number,
  limitUp: number,
  limitDown: number,
) {
  const fields = Array.from({ length: 55 }, () => "");
  fields[3] = String(current);
  fields[30] = "20260721161500";
  fields[33] = String(high);
  fields[47] = String(limitUp);
  fields[48] = String(limitDown);
  return `v_${code}="${fields.join("~")}";`;
}

test("stock list keeps only real Shanghai and Shenzhen A-share identities", () => {
  const stocks = parseSinaAStockList([
    { symbol: "sh600519", code: "600519", name: "贵州茅台" },
    { symbol: "sz300750", code: "300750", name: "宁德时代" },
    { symbol: "bj920001", code: "920001", name: "北交股票" },
  ]);
  assert.deepEqual(
    stocks.map((item) => item.code),
    ["600519.SH", "300750.SZ"],
  );
});

test("limit parser reads provider-specific daily limit prices", () => {
  const rows = parseTencentDailyLimits(
    [
      quote("sh600519", 1460.25, 1460.25, 1460.25, 1194.75),
      quote("sh688981", 160, 172.8, 172.8, 115.2),
      quote("sz300750", 301.14, 391, 451.72, 301.14),
    ].join("\n"),
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.limitUp, 1460.25);
  assert.equal(rows[1]?.limitDown, 115.2);
  assert.equal(rows[2]?.current, 301.14);
});
