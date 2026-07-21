import assert from "node:assert/strict";
import test from "node:test";
import { parseSinaConceptRank, searchSinaConceptRows } from "../lib/sina-concept-performance.ts";

test("解析新浪概念排行真实字段", () => {
  const raw = `var S_Finance_bankuai_class = {"gn_test":"gn_test,小红书概念,42,12.3,0.4,3.25,1234,987654321,sz300001,8.76,23.4,1.8,核心股份"};`;
  assert.deepEqual(parseSinaConceptRank(raw), [{
    code: "SINA:gn_test",
    name: "小红书概念",
    memberCount: 42,
    changePct: 3.25,
    turnoverYuan: 987654321,
    coreStock: "核心股份",
    coreStockCode: "300001",
    coreStockChangePct: 8.76,
  }]);
});

test("概念排行格式错误时拒绝生成数据", () => {
  assert.throws(() => parseSinaConceptRank("not-real-data"), /格式不正确/);
});

test("关注搜索可从真实概念排行匹配概念并展示成分股数量", () => {
  const rows = parseSinaConceptRank(`var S_Finance_bankuai_class = {"gn_xhs":"gn_xhs,小红书概念,35,12,1,2,3,4,sz300001,5,6,1,核心股份"};`);
  const results = searchSinaConceptRows(rows, "小红书");
  assert.equal(results[0]?.name, "小红书概念");
  assert.equal(results[0]?.memberCount, 35);
  assert.match(results[0]?.matchReason ?? "", /真实概念排行/);
});
