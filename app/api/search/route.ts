import {
  mergeSearchResults,
  searchLocalStockCatalog,
  searchSectorCatalog,
  searchTencentStocks,
} from "@/lib/instruments";
import type { WatchSearchResult } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 40) {
    return Response.json(
      { ok: false, message: "搜索内容太长，请输入板块名称、股票名称或 6 位代码。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sectors = searchSectorCatalog(query, query ? 8 : 6);
  const localStocks = searchLocalStockCatalog(query, query ? 8 : 6);
  let remoteStocks: WatchSearchResult[] = [];
  let sourceStatus: "live" | "fallback" | "featured" = query
    ? "live"
    : "featured";
  if (query) {
    try {
      remoteStocks = await searchTencentStocks(query);
    } catch {
      sourceStatus = "fallback";
    }
  }

  const results = mergeSearchResults(
    sectors,
    remoteStocks,
    localStocks,
    query ? 12 : 10,
  );
  return Response.json(
    {
      ok: true,
      query,
      results,
      sourceStatus,
      message: results.length
        ? `找到 ${results.length} 个候选，请选择后再确认关注。`
        : "没有找到匹配项，请尝试完整股票名称、6 位代码或更短的板块关键词。",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
