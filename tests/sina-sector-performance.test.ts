import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSinaSectorStocks } from "../lib/sina-sector-performance.ts";

test("sector summary uses only returned stock prices and amounts", () => {
  const result = summarizeSinaSectorStocks(
    { name: "银行", node: "sw1_480000", classification: "申万一级" },
    [
      { symbol: "sh601398", name: "工商银行", trade: "7.50", changepercent: 2, amount: 1000 },
      { symbol: "sh600036", name: "招商银行", trade: "40.00", changepercent: -1, amount: 3000 },
      { symbol: "invalid", name: "无价格", trade: "0", changepercent: 99, amount: 1 },
    ],
  );
  assert.ok(result);
  assert.equal(result.memberCount, 2);
  assert.equal(result.changePct, 0.5);
  assert.equal(result.turnoverYuan, 4000);
  assert.equal(result.coreStock, "工商银行");
  assert.equal(result.weakestStock, "招商银行");
  assert.equal(result.up, 1);
  assert.equal(result.down, 1);
});
