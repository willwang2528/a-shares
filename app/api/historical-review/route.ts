import { env } from "cloudflare:workers";
import {
  buildHistoricalReview,
  historicalCacheExpiry,
  historicalScopeKey,
} from "@/lib/historical-review";
import {
  ensureSchema,
  ensureUser,
  getHistoricalReviewCache,
  listWatchItems,
  saveHistoricalReviewCache,
  seedWatchItems,
} from "@/lib/storage";
import { currentUserIdentity } from "@/lib/user";

export const dynamic = "force-dynamic";

function shanghaiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const tradeDate = new URL(request.url).searchParams.get("date") ?? "";
  if (!isValidDate(tradeDate)) {
    return Response.json(
      { ok: false, message: "请选择正确的复盘日期。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (tradeDate > shanghaiToday()) {
    return Response.json(
      { ok: false, message: "复盘日期不能晚于今天。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const user = await currentUserIdentity();
    await ensureSchema(env.DB);
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    await seedWatchItems(env.DB, user.id);
    const stocks = (await listWatchItems(env.DB, user.id))
      .filter((item) => item.object_type === "stock")
      .slice(0, 20)
      .map((item) => ({ code: item.code, name: item.name }))
      .sort((left, right) => left.code.localeCompare(right.code));
    const scopeKey = historicalScopeKey(stocks);
    const cached = await getHistoricalReviewCache(
      env.DB,
      user.id,
      tradeDate,
      scopeKey,
    );
    if (cached) {
      return Response.json(
        {
          ok: true,
          historical: cached.historical,
          cacheHit: true,
          cacheExpiresAt: cached.expiresAt,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const historical = await buildHistoricalReview(tradeDate, stocks);
    const cacheExpiresAt = historicalCacheExpiry(
      tradeDate,
      historical.status,
    );
    await saveHistoricalReviewCache(
      env.DB,
      user.id,
      scopeKey,
      historical,
      cacheExpiresAt,
    );
    return Response.json(
      {
        ok: true,
        historical,
        cacheHit: false,
        cacheExpiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        message: "真实历史行情读取失败；本次不生成复盘结果。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
