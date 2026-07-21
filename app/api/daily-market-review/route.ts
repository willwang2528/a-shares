import { env } from "cloudflare:workers";
import {
  alertsFromMarketDailyReview,
  buildMarketDailyReview,
} from "@/lib/daily-market-review";
import {
  ensureSchema,
  ensureUser,
  getLatestMarketDailyReview,
  loadDashboardState,
  saveAlertEvents,
  saveMarketDailyReview,
} from "@/lib/storage";
import { currentUserIdentity } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSchema(env.DB);
    const user = await currentUserIdentity();
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    const state = await loadDashboardState(env.DB, user.id);
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const latest = await getLatestMarketDailyReview(env.DB);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (!refresh && latest?.tradeDate === today) {
      const events = alertsFromMarketDailyReview(
        latest,
        state.settings.market_down_ratio_threshold,
      );
      await saveAlertEvents(env.DB, user.id, events);
      return Response.json(
        { ok: true, review: latest, events, cacheHit: true },
        { headers: { "Cache-Control": "private, max-age=30" } },
      );
    }

    const review = await buildMarketDailyReview(latest);
    await saveMarketDailyReview(env.DB, review);
    const events = alertsFromMarketDailyReview(
      review,
      state.settings.market_down_ratio_threshold,
    );
    await saveAlertEvents(env.DB, user.id, events);
    return Response.json(
      { ok: true, review, events, cacheHit: false },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (error) {
    try {
      const latest = await getLatestMarketDailyReview(env.DB);
      if (latest) {
        return Response.json(
          {
            ok: true,
            review: latest,
            cacheHit: true,
            stale: true,
            message: "最新真实收盘复盘读取失败，当前显示上一次成功缓存。",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch {
      // 数据库也不可用时统一返回无数据。
    }
    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `没有可用的真实收盘复盘：${error.message}`
            : "没有可用的真实收盘复盘。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
