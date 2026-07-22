import { env } from "cloudflare:workers";
import { currentUserIdentity } from "@/lib/user";
import { fetchExperimentalRealSnapshot, fetchExperimentalStockQuotes } from "@/lib/market";
import { fetchSinaIndustryEntryPerformance } from "@/lib/sina-sector-performance";
import { fetchSinaSectorEntries } from "@/lib/sina-sectors";
import { ensureSchema, ensureUser, listWatchItems } from "@/lib/storage";
import {
  buildMarketBriefLayer,
  buildSectorBriefLayer,
  buildStockBriefLayer,
  type TodayBrief,
  type WatchedSectorResult,
} from "@/lib/today-brief";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUserIdentity();
    await ensureSchema(env.DB);
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    const watches = await listWatchItems(env.DB, user.id);
    const stockWatches = watches.filter((watch) => watch.object_type === "stock");
    const sectorWatches = watches.filter((watch) => watch.object_type === "sector");
    const generatedAt = new Date().toISOString();

    const sectorRequest = (async (): Promise<WatchedSectorResult[]> => {
      if (!sectorWatches.length) return [];
      try {
        const entries = await fetchSinaSectorEntries();
        return Promise.all(
          sectorWatches.map(async (watch): Promise<WatchedSectorResult> => {
            if (!watch.code.startsWith("SINA:") || watch.code.startsWith("SINA:gn_")) {
              return { watch, performance: null };
            }
            const node = watch.code.slice("SINA:".length);
            const entry = entries.find(
              (candidate) =>
                candidate.node === node &&
                candidate.name === watch.name &&
                !candidate.classification.includes("概念"),
            );
            return {
              watch,
              performance: entry
                ? await fetchSinaIndustryEntryPerformance(entry).catch(() => null)
                : null,
            };
          }),
        );
      } catch {
        return sectorWatches.map((watch) => ({ watch, performance: null }));
      }
    })();

    const [marketResult, stockResult, sectorResults] = await Promise.all([
      fetchExperimentalRealSnapshot().then(
        (value) => value,
        () => null,
      ),
      fetchExperimentalStockQuotes(stockWatches.map((watch) => watch.code)).then(
        (value) => value,
        () => [],
      ),
      sectorRequest,
    ]);

    const brief: TodayBrief = {
      mode: "manual_only",
      generatedAt,
      layers: {
        market: buildMarketBriefLayer(marketResult),
        sector: buildSectorBriefLayer(watches, sectorResults, generatedAt),
        stock: buildStockBriefLayer(watches, stockResult),
      },
    };

    return Response.json(
      { ok: true, brief },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        message: "无法读取你的关注范围，今日摘要没有生成。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
