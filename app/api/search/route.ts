import {
  mergeSearchResults,
  searchTencentStocks,
} from "@/lib/instruments";
import type { WatchSearchResult } from "@/lib/instruments";
import { searchSinaSectors } from "@/lib/sina-sectors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 40) {
    return Response.json(
      { ok: false, message: "搜索内容太长，请输入板块名称、股票名称或 6 位代码。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let sectors: WatchSearchResult[] = [];
  let remoteStocks: WatchSearchResult[] = [];
  let sourceStatus: "live" | "fallback" | "featured" = query ? "live" : "featured";
  const [sectorResult, stockResult] = await Promise.allSettled([
    searchSinaSectors(query, query ? 10 : 8),
    query ? searchTencentStocks(query) : Promise.resolve([]),
  ]);
  if (sectorResult.status === "fulfilled") sectors = sectorResult.value;
  if (stockResult.status === "fulfilled") {
    remoteStocks = stockResult.value;
  }
  if (sectorResult.status === "rejected" || stockResult.status === "rejected") {
    sourceStatus = "fallback";
  }

  const results = mergeSearchResults(
    sectors,
    remoteStocks,
    [],
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
        : sourceStatus === "fallback"
          ? "真实搜索源暂时不可用，没有使用本地固定列表替代。"
          : "没有找到匹配项，请尝试完整股票名称、6 位代码或更短的板块关键词。",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
