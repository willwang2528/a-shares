import type { WatchSearchResult } from "./instruments";

const SINA_NODE_URL =
  "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodes";
const SINA_SOURCE = "新浪财经行情中心板块目录（真实数据·实验源）";
const SINA_SOURCE_URL = "https://vip.stock.finance.sina.com.cn/mkt/";

export type SinaSectorEntry = {
  name: string;
  node: string;
  classification: string;
};

let memoryCache: { expiresAt: number; entries: SinaSectorEntry[] } | null = null;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s._-]/g, "");
}

function classificationFromPath(path: string[]) {
  return path.find((item) =>
    ["申万一级", "申万行业", "新浪行业", "热门概念", "概念板块"].includes(item),
  );
}

export function parseSinaSectorNodes(value: unknown) {
  const results: SinaSectorEntry[] = [];
  const seen = new Set<string>();

  function visit(node: unknown, path: string[]) {
    if (!Array.isArray(node)) return;
    const name = typeof node[0] === "string" ? node[0].trim() : "";
    const providerNode = typeof node[2] === "string" ? node[2].trim() : "";
    const classification = classificationFromPath(path);
    if (name && providerNode && classification && !seen.has(providerNode)) {
      seen.add(providerNode);
      results.push({ name, node: providerNode, classification });
    }
    const nextPath = name ? [...path, name] : path;
    for (const child of node) visit(child, nextPath);
  }

  visit(value, []);
  return results;
}

function score(entry: SinaSectorEntry, query: string) {
  const q = normalize(query);
  if (!q) {
    if (entry.classification === "申万一级") return 30;
    if (entry.classification === "热门概念") return 20;
    return 10;
  }
  const name = normalize(entry.name);
  if (name === q) return 100;
  if (name === `${q}概念`) return 98;
  if (name.includes(q)) return 85;
  if (q.includes(name) && name.length >= 2) return 72;
  return 0;
}

export function searchSinaSectorEntries(
  entries: SinaSectorEntry[],
  query: string,
  limit = 10,
): WatchSearchResult[] {
  return entries
    .map((entry) => ({ entry, score: score(entry, query) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.entry.name.localeCompare(right.entry.name, "zh-CN"),
    )
    .slice(0, limit)
    .map(({ entry }) => ({
      objectType: "sector" as const,
      code: `SINA:${entry.node}`,
      name: entry.name,
      classification: entry.classification.includes("概念")
        ? "新浪财经概念板块"
        : entry.classification.includes("申万")
          ? "申万行业分类（新浪行情目录）"
          : "新浪财经行业分类",
      source: SINA_SOURCE,
      sourceUrl: SINA_SOURCE_URL,
      memberCount: null,
      matchReason: query.trim()
        ? `真实板块目录中的“${entry.classification}”匹配`
        : `真实板块目录中的常用${entry.classification.includes("概念") ? "概念" : "行业"}`,
      experimental: true,
    }));
}

export async function searchSinaSectors(
  query: string,
  limit = 10,
  fetcher: typeof fetch = fetch,
) {
  const entries = await fetchSinaSectorEntries(fetcher);
  return searchSinaSectorEntries(entries, query, limit);
}

export async function fetchSinaSectorEntries(fetcher: typeof fetch = fetch) {
  if (!memoryCache || memoryCache.expiresAt <= Date.now()) {
    const response = await fetcher(SINA_NODE_URL, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`板块目录源返回 ${response.status}`);
    const entries = parseSinaSectorNodes(await response.json());
    if (entries.length < 20) throw new Error("板块目录返回数量不完整");
    memoryCache = { entries, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  }
  return memoryCache.entries;
}
