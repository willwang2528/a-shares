export type WatchObjectType = "sector" | "stock";

export type WatchSearchResult = {
  objectType: WatchObjectType;
  code: string;
  name: string;
  classification: string;
  source: string;
  sourceUrl: string;
  memberCount: number | null;
  matchReason: string;
  experimental: boolean;
};

const TENCENT_SOURCE = "腾讯公开证券搜索页面（实验源）";
const TENCENT_SOURCE_URL = "https://gu.qq.com/";

export function parseTencentSearchResponse(
  raw: string,
  query: string,
): WatchSearchResult[] {
  const assignment = raw.trim().match(/^v_hint=("(?:\\.|[^"])*")/);
  if (!assignment) return [];
  let value = "";
  try {
    value = JSON.parse(assignment[1]) as string;
  } catch {
    return [];
  }
  return value
    .split("^")
    .map((item) => item.split("~"))
    .filter(
      (fields) =>
        ["sh", "sz", "bj"].includes(fields[0]) &&
        /^\d{6}$/.test(fields[1] ?? "") &&
        (fields[4] ?? "").startsWith("GP-A"),
    )
    .slice(0, 10)
    .map((fields) => {
      const exchange = fields[0].toUpperCase();
      return {
        objectType: "stock" as const,
        code: `${fields[1]}.${exchange}`,
        name: (fields[2] ?? "").replace(/\s+/g, ""),
        classification: `${exchange === "SH" ? "上交所" : exchange === "SZ" ? "深交所" : "北交所"} A 股`,
        source: TENCENT_SOURCE,
        sourceUrl: TENCENT_SOURCE_URL,
        memberCount: null,
        matchReason: /^\d/.test(query.trim())
          ? "证券代码匹配"
          : "证券名称或拼音匹配",
        experimental: true,
      };
    });
}

export async function searchTencentStocks(
  query: string,
  fetcher: typeof fetch = fetch,
) {
  if (!query.trim()) return [];
  const response = await fetcher(
    `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(query.trim())}`,
    {
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": "A-Share-Watch/0.1 private-evaluation",
      },
      signal: AbortSignal.timeout(4_000),
    },
  );
  if (!response.ok) throw new Error(`证券搜索源返回 ${response.status}`);
  return parseTencentSearchResponse(await response.text(), query);
}

export function mergeSearchResults(
  sectors: WatchSearchResult[],
  remoteStocks: WatchSearchResult[],
  localStocks: WatchSearchResult[],
  limit = 12,
) {
  const seen = new Set<string>();
  return [...sectors, ...remoteStocks, ...localStocks]
    .filter((item) => {
      const key = `${item.objectType}:${item.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
