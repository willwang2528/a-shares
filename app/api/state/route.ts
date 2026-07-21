import { env } from "cloudflare:workers";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/domain";
import { currentUserIdentity } from "@/lib/user";
import {
  ensureSchema,
  ensureUser,
  loadDashboardState,
  saveSettings,
  seedWatchItems,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const user = await currentUserIdentity();
    await ensureSchema(env.DB);
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    await seedWatchItems(env.DB, user.id);
    const state = await loadDashboardState(env.DB, user.id);
    return json({ ok: true, user: { displayName: user.displayName }, ...state });
  } catch {
    return json(
      {
        ok: false,
        fallback: true,
        message: "云端保存暂时不可用，页面只使用本次会话内的默认设置。",
        settings: DEFAULT_SETTINGS,
      },
      503,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { settings?: Partial<UserSettings> };
    if (!body.settings) return json({ ok: false, message: "缺少设置内容。" }, 400);
    const user = await currentUserIdentity();
    await ensureSchema(env.DB);
    await ensureUser(env.DB, user.id, user.email, user.displayName);
    const current = await loadDashboardState(env.DB, user.id);
    const next: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...current.settings,
      ...body.settings,
      key_moments: Array.isArray(body.settings.key_moments)
        ? body.settings.key_moments.filter((value) => /^\d{2}:\d{2}$/.test(value)).slice(0, 10)
        : current.settings.key_moments,
    };
    if (![5, 30, 60, 120, 180].includes(next.monitor_interval_minutes)) {
      return json({ ok: false, message: "扫描周期只能选择 5、30、60、120 或 180 分钟。" }, 400);
    }
    if (!["event_only", "interval_digest", "both"].includes(next.periodic_push_mode)) {
      return json({ ok: false, message: "推送模式不支持。" }, 400);
    }
    if (!["browser", "serverchan", "email"].includes(next.notification_channel)) {
      return json({ ok: false, message: "通知渠道不支持。" }, 400);
    }
    await saveSettings(env.DB, user.id, next);
    return json({ ok: true, settings: next, savedAt: new Date().toISOString() });
  } catch {
    return json({ ok: false, message: "保存失败，未改动原有设置。" }, 500);
  }
}
