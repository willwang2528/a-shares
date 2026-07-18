import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSearchResults,
  parseTencentSearchResponse,
  searchLocalStockCatalog,
  searchSectorCatalog,
} from "../lib/instruments.ts";

test("sector search ranks the actual exact match instead of a hardcoded sector", () => {
  const results = searchSectorCatalog("银行");
  assert.equal(results[0]?.name, "银行");
  assert.equal(results[0]?.code, "SW-801780");
  assert.notEqual(results[0]?.name, "有色金属");
  assert.match(results[0]?.matchReason ?? "", /完全匹配/);
});

test("sector aliases are visible and still require user confirmation", () => {
  const results = searchSectorCatalog("白酒");
  assert.equal(results[0]?.name, "食品饮料");
  assert.match(results[0]?.matchReason ?? "", /常用说法/);
  assert.equal(results[0]?.memberCount, null);
});

test("Tencent search parser keeps A-share stocks and excludes ETF and Hong Kong items", () => {
  const raw =
    'v_hint="sh~601600~\\u4e2d\\u56fd\\u94dd\\u4e1a~zgly~GP-A^hk~02600~\\u4e2d\\u56fd\\u94dd\\u4e1a~zgly~GP^sh~512800~\\u94f6\\u884cETF~yhetf~ETF"';
  const results = parseTencentSearchResponse(raw, "601600");
  assert.deepEqual(
    results.map((item) => [item.code, item.name]),
    [["601600.SH", "中国铝业"]],
  );
  assert.match(results[0]?.matchReason ?? "", /代码匹配/);
});

test("mixed choices include both sectors and stocks without duplicates", () => {
  const sectors = searchSectorCatalog("银行");
  const stocks = searchLocalStockCatalog("银行");
  const results = mergeSearchResults(sectors, stocks, stocks);
  assert.ok(results.some((item) => item.objectType === "sector"));
  assert.ok(results.some((item) => item.objectType === "stock"));
  assert.equal(
    new Set(results.map((item) => `${item.objectType}:${item.code}`)).size,
    results.length,
  );
});
