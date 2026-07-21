import type { WatchSearchResult } from "./instruments";

const EASTMONEY_CONCEPT_PAGE = "https://data.eastmoney.com/bkzj/";

export type EastmoneyConcept = {
  code: string;
  name: string;
  memberCount: number | null;
};

export function parseEastmoneyConcepts(raw: unknown): EastmoneyConcept[] {
  const source = raw as { data?: { diff?: unknown } };
  if (!Array.isArray(source.data?.diff)) return [];
  const seen = new Set<string>();
  return source.data.diff
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const code = typeof item.f12 === "string" ? item.f12 : "";
      const name = typeof item.f14 === "string" ? item.f14.trim() : "";
      const counts = [item.f104, item.f105, item.f106].map(Number);
      const memberCount = counts.every(Number.isFinite)
        ? counts.reduce((sum, value) => sum + value, 0)
        : null;
      if (!/^BK\d{4}$/.test(code) || !name || seen.has(code)) return null;
      seen.add(code);
      return { code, name, memberCount };
    })
    .filter((item): item is EastmoneyConcept => item !== null);
}

export function parseEastmoneyConceptPage(raw: string): EastmoneyConcept[] {
  const rows: EastmoneyConcept[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(/href=["']\/bkzj\/(BK\d{4})\.html["'][^>]*>([^<]+)<\/a>/gi)) {
    const code = match[1].toUpperCase();
    const name = match[2].replace(/&amp;/g, "&").trim();
    if (!name || seen.has(code)) continue;
    seen.add(code);
    rows.push({ code, name, memberCount: null });
  }
  return rows;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s._-]/g, "");
}

export function searchEastmoneyConceptRows(
  rows: EastmoneyConcept[],
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
      code: `EASTMONEY:${row.code}`,
      name: row.name,
      classification: "东方财富概念板块",
      source: "东方财富概念板块目录（真实数据·实验源）",
      sourceUrl: `https://quote.eastmoney.com/bk/90.${row.code}.html`,
      memberCount: row.memberCount,
      matchReason: row.memberCount === null
        ? "真实概念板块名称匹配"
        : `真实概念板块名称匹配，当前包含 ${row.memberCount} 只股票`,
      experimental: true,
    }));
}

export async function searchEastmoneyConcepts(
  query: string,
  limit = 10,
  fetcher: typeof fetch = fetch,
) {
  const options = {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(10_000),
  };
  const page = await fetcher(EASTMONEY_CONCEPT_PAGE, options);
  if (!page.ok) throw new Error(`完整概念目录页返回 ${page.status}`);
  const rows = parseEastmoneyConceptPage(await page.text());
  if (rows.length < 300) throw new Error("完整概念目录返回数量不完整");
  return searchEastmoneyConceptRows(rows, query, limit);
}
