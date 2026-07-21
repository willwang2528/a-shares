import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTencentQuoteResponse,
  parseTencentStockQuoteResponse,
} from "../lib/market.ts";
import { evaluateRules, generateDeterministicReview } from "../lib/domain.ts";

function quote(variable: string, value: number, changePct: number, time: string) {
  const fields = Array.from({ length: 35 }, () => "");
  fields[3] = String(value);
  fields[30] = time;
  fields[32] = String(changePct);
  return `v_${variable}="${fields.join("~")}";`;
}

test("parses real index values and provider timestamps", () => {
  const raw = [
    quote("sh000001", 3764.15, -3.05, "20260717161402"),
    quote("sz399001", 13706.88, -5.4, "20260717161451"),
    quote("sz399006", 3428.63, -7.15, "20260717161406"),
    quote("sh000300", 4529.1, -3.6, "20260717161408"),
  ].join("\n");
  const snapshot = parseTencentQuoteResponse(
    raw,
    new Date("2026-07-18T10:00:00+08:00"),
  );
  assert.equal(snapshot.dataVersion, "tencent-indices:2026-07-17T16:14:51+08:00");
  assert.equal(snapshot.dataMode, "experimental_real");
  assert.equal(snapshot.coverage, "indices_only");
  assert.equal(snapshot.asOf, "2026-07-17T16:14:51+08:00");
  assert.equal(snapshot.indices[0].value, 3764.15);
  assert.equal(snapshot.indices[2].changePct, -7.15);
  assert.match(snapshot.provider, /真实数据·实验源/);
  assert.equal(snapshot.dataComplete, true);
  assert.equal(evaluateRules(snapshot).length, 0);
  const review = generateDeterministicReview(snapshot);
  assert.match(review.conclusion, /不能据此判断全市场风险/);
  assert.match(review.integrity, /不包含市场宽度、板块和个股/);
});

test("rejects an incomplete real quote response", () => {
  assert.throws(
    () =>
      parseTencentQuoteResponse(
        quote("sh000001", 3764.15, -3.05, "20260717161402"),
      ),
    /返回数量不完整/,
  );
});

test("parses selected-stock real quotes with provider timestamps", () => {
  const fields = Array.from({ length: 35 }, () => "");
  fields[3] = "8.44";
  fields[30] = "20260717161442";
  fields[32] = "-2.76";
  const quotes = parseTencentStockQuoteResponse(
    `v_sh601600="1~中国铝业~601600~${fields.slice(3).join("~")}";`,
  );
  assert.equal(quotes[0]?.code, "601600.SH");
  assert.equal(quotes[0]?.value, 8.44);
  assert.equal(quotes[0]?.changePct, -2.76);
  assert.equal(quotes[0]?.asOf, "2026-07-17T16:14:42+08:00");
});
