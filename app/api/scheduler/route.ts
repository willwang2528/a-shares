import { env } from "cloudflare:workers";
import { getDueBundle, getMarketSessionState, type UserSettings } from "@/lib/domain";
import { executeJob } from "@/lib/jobs";
import { ensureSchema } from "@/lib/storage";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ ok: false, message: "调度密钥不正确。" }, { status: 401 });
}

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const expected = runtime.SCHEDULER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) return unauthorized();

  await ensureSchema(env.DB);
  const users = await env.DB
    .prepare(
      `SELECT u.id, s.settings_json,
        (SELECT started_at FROM scheduled_job_runs j
         WHERE j.user_id = u.id AND j.job_type = 'scan' AND j.status = 'success'
         ORDER BY started_at DESC LIMIT 1) AS last_scan
       FROM users u JOIN user_settings s ON s.user_id = u.id`,
    )
    .all<{ id: string; settings_json: string; last_scan: string | null }>();

  const now = new Date();
  const session = getMarketSessionState(now);
  const results = [];
  for (const user of users.results) {
    const settings = JSON.parse(user.settings_json) as UserSettings;
    const due = getDueBundle(now, settings, user.last_scan ?? undefined);
    if (!due.due) {
      results.push({ userId: user.id, status: "skipped", reason: due.skipReason });
      continue;
    }
    const type = due.triggers.includes("daily_review") ? "review" : "scan";
    const result = await executeJob(
      env.DB,
      runtime,
      {
        userId: user.id,
        type,
        fixtureId: "market_drop",
        origin: new URL(request.url).origin,
        forceId: `${user.id}:${type}:${session.date}:${due.triggers.join("+")}`,
      },
    );
    results.push({ userId: user.id, triggers: due.triggers, merged: due.merged, result });
  }
  return Response.json({ ok: true, session, results, checkedAt: now.toISOString() });
}
