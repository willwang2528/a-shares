const SINA_CONCEPT_RANK_URL =
  "https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class";

export type ConceptPerformance = {
  code: string;
  name: string;
  memberCount: number;
  changePct: number;
  turnoverYuan: number;
  coreStock: string;
  coreStockCode: string;
  coreStockChangePct: number;
};

function finite(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Parse the payload used by Sina's own concept-board page. */
export function parseSinaConceptRank(raw: string): ConceptPerformance[] {
  const match = raw.match(/S_Finance_bankuai_class\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error("真实概念排行格式不正确");
  const source = JSON.parse(match[1]) as Record<string, unknown>;
  const rows: ConceptPerformance[] = [];
  for (const [node, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    const fields = value.split(",");
    const memberCount = finite(fields[2] ?? "");
    const changePct = finite(fields[5] ?? "");
    const turnoverYuan = finite(fields[7] ?? "");
    const coreStockChangePct = finite(fields[9] ?? "");
    const name = (fields[1] ?? "").trim();
    const rawCoreStockCode = (fields[8] ?? "").trim();
    const coreStockCode = rawCoreStockCode.replace(/^(?:sh|sz)/, "");
    const coreStock = (fields[12] ?? "").trim();
    if (
      !node || !name || !coreStock || !/^\d{6}$/.test(coreStockCode) ||
      memberCount === null || memberCount <= 0 ||
      changePct === null || turnoverYuan === null || turnoverYuan < 0 ||
      coreStockChangePct === null
    ) continue;
    rows.push({
      code: `SINA:${node}`,
      name,
      memberCount: Math.round(memberCount),
      changePct,
      turnoverYuan,
      coreStock,
      coreStockCode,
      coreStockChangePct,
    });
  }
  return rows;
}

export async function fetchSinaConceptPerformance(fetcher: typeof fetch = fetch) {
  const response = await fetcher(SINA_CONCEPT_RANK_URL, {
    headers: {
      Accept: "text/plain,*/*",
      "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`真实概念排行返回 ${response.status}`);
  const bytes = await response.arrayBuffer();
  let raw: string;
  try {
    raw = new TextDecoder("gbk").decode(bytes);
  } catch {
    raw = new TextDecoder().decode(bytes);
  }
  const rows = parseSinaConceptRank(raw);
  if (rows.length < 50) throw new Error("真实概念排行返回数量不完整");
  return rows;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s._-]/g, "");
}

export function searchSinaConceptRows(
  rows: ConceptPerformance[],
  query: string,
  limit = 10,
): WatchSearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  return rows
    .map((row) => {
      const name = normalize(row.name);
      const score = name === q ? 100 : name === `${q}概念` ? 98 : name.includes(q) ? 85 : 0;
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.row.name.localeCompare(right.row.name, "zh-CN"))
    .slice(0, limit)
    .map(({ row }) => ({
      objectType: "sector" as const,
      code: row.code,
      name: row.name,
      classification: "新浪财经概念板块",
      source: "新浪财经概念板块排行（真实数据·实验源）",
      sourceUrl: "https://vip.stock.finance.sina.com.cn/mkt/frames/sl_bk.html",
      memberCount: row.memberCount,
      matchReason: `真实概念排行名称匹配，当前包含 ${row.memberCount} 只股票`,
      experimental: true,
    }));
}

export async function searchSinaConcepts(
  query: string,
  limit = 10,
  fetcher: typeof fetch = fetch,
) {
  return searchSinaConceptRows(await fetchSinaConceptPerformance(fetcher), query, limit);
}
import type { WatchSearchResult } from "./instruments";
