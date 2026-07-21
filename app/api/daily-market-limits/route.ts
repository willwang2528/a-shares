import { env } from "cloudflare:workers";
import { alertsFromMarketDailyReview } from "@/lib/daily-market-review";
import { fetchDailyLimitStats, fetchSinaNodeMemberCodes } from "@/lib/market-limits";
import {
  ensureSchema,
  ensureUser,
  getLatestMarketDailyReview,
  loadMarketStockCatalog,
  loadDashboardState,
  saveAlertEvents,
  saveMarketDailyReview,
} from "@/lib/storage";
import { currentUserIdentity } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSchema(env.DB);
    const review = await getLatestMarketDailyReview(env.DB);
    if (!review) {
      return Response.json(
        { ok: false, message: "请先生成真实收盘复盘。" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!refresh && review.limits.limitUp !== null) {
      return Response.json(
        { ok: true, review, cacheHit: true },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
    }
    const catalog = await loadMarketStockCatalog(env.DB);
    if (catalog.length < 4500) {
      return Response.json(
        { ok: false, needsCatalog: true, message: "正在准备真实沪深股票代码目录。" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const stats = await fetchDailyLimitStats(catalog);
    if (stats.asOf.slice(0, 10) !== review.tradeDate) {
      throw new Error("涨跌停统计与收盘复盘交易日期不一致");
    }
    review.limits = {
      limitUp: stats.limitUp,
      limitDown: stats.limitDown,
      openedLimit: stats.openedLimit,
      openedLimitRate: stats.openedLimitRate,
      unavailableReason: null,
    };
    const limitUpSet = new Set(stats.limitUpCodes);
    const directions = [
      ...review.strongestIndustries.map((item) => ({ item, kind: "industry" as const })),
      ...review.strongestConcepts.map((item) => ({ item, kind: "concept" as const })),
    ];
    await Promise.all(directions.map(async ({ item }) => {
      try {
        const members = await fetchSinaNodeMemberCodes(item.sourceNode);
        item.limitUp = members.filter((code) => limitUpSet.has(code)).length;
      } catch {
        item.limitUp = null;
      }
    }));
    review.summary.facts = review.summary.facts.filter(
      (item) => !item.startsWith("涨跌停和炸板"),
    );
    review.summary.facts.push(
      `涨停 ${stats.limitUp} 家、跌停 ${stats.limitDown} 家、炸板 ${stats.openedLimit} 家，炸板率 ${stats.openedLimitRate.toFixed(1)}%。`,
    );
    await saveMarketDailyReview(env.DB, review);

    const user = await currentUserIdentity();
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    const state = await loadDashboardState(env.DB, user.id);
    const events = alertsFromMarketDailyReview(
      review,
      state.settings.market_down_ratio_threshold,
    );
    await saveAlertEvents(env.DB, user.id, events);
    return Response.json(
      { ok: true, review, events, cacheHit: false, coverage: `${stats.coveredStocks}/${stats.requestedStocks}` },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "真实涨跌停统计失败。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
