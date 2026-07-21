import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSearchResults,
  parseTencentSearchResponse,
} from "../lib/instruments.ts";
import {
  parseSinaSectorNodes,
  searchSinaSectorEntries,
} from "../lib/sina-sectors.ts";

const recordedSinaNodes = ["行情中心", [["A股", [
  ["申万一级", [["银行", "", "sw1_480000"], ["有色金属", "", "sw1_240000"]], "", "sw1_hy", "cn"],
  ["热门概念", [["Kimi概念", "", "chgn_730558"], ["小米汽车概念", "", "chgn_701220"]], "", "chgn", "cn"],
]]]];

test("live sector catalog ranks the exact industry match", () => {
  const results = searchSinaSectorEntries(parseSinaSectorNodes(recordedSinaNodes), "银行");
  assert.equal(results[0]?.name, "银行");
  assert.equal(results[0]?.code, "SINA:sw1_480000");
  assert.notEqual(results[0]?.name, "有色金属");
  assert.match(results[0]?.matchReason ?? "", /真实板块目录/);
});

test("live catalog includes real concept choices", () => {
  const results = searchSinaSectorEntries(parseSinaSectorNodes(recordedSinaNodes), "Kimi");
  assert.equal(results[0]?.name, "Kimi概念");
  assert.match(results[0]?.classification ?? "", /概念板块/);
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
  const sectors = searchSinaSectorEntries(parseSinaSectorNodes(recordedSinaNodes), "银行");
  const stocks = parseTencentSearchResponse(
    'v_hint="sh~601398~\\u5de5\\u5546\\u94f6\\u884c~gsyh~GP-A"',
    "银行",
  );
  const results = mergeSearchResults(sectors, stocks, stocks);
  assert.ok(results.some((item) => item.objectType === "sector"));
  assert.ok(results.some((item) => item.objectType === "stock"));
  assert.equal(
    new Set(results.map((item) => `${item.objectType}:${item.code}`)).size,
    results.length,
  );
});
