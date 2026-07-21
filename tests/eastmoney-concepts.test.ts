import assert from "node:assert/strict";
import test from "node:test";
import { parseEastmoneyConceptPage, parseEastmoneyConcepts, searchEastmoneyConceptRows } from "../lib/eastmoney-concepts.ts";

test("完整真实概念目录支持小红书概念搜索", () => {
  const rows = parseEastmoneyConcepts({ data: { diff: [
    { f12: "BK1187", f14: "小红书概念", f104: 12, f105: 18, f106: 2 },
  ] } });
  const results = searchEastmoneyConceptRows(rows, "小红书");
  assert.equal(results[0]?.name, "小红书概念");
  assert.equal(results[0]?.code, "EASTMONEY:BK1187");
  assert.equal(results[0]?.memberCount, 32);
});

test("完整概念目录拒绝无效板块代码", () => {
  assert.deepEqual(parseEastmoneyConcepts({ data: { diff: [{ f12: "bad", f14: "伪数据" }] } }), []);
});

test("行情子域名不可用时可解析同站公开概念目录页", () => {
  const rows = parseEastmoneyConceptPage('<a href="/bkzj/BK1187.html">小红书概念</a>');
  assert.deepEqual(rows, [{ code: "BK1187", name: "小红书概念", memberCount: null }]);
});
