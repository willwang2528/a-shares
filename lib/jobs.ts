import {
  DEFAULT_SETTINGS,
  evaluateRules,
  generateDeterministicReview,
  getFixture,
  shouldPush,
  type UserSettings,
} from "./domain";
import { fetchExperimentalRealSnapshot } from "./market";
import { acquireLease, ensureSchema, ensureUser, loadDashboardState } from "./storage";
import { getNotificationProvider } from "./notifications";

interface JobInput {
  userId: string;
  type: "scan" | "review" | "test_notification";
  fixtureId?: string;
  origin?: string;
  forceId?: string;
}

export async function executeJob(
  db: D1Database,
  runtimeEnv: Record<string, string | undefined>,
  input: JobInput,
) {
  await ensureSchema(db);
  await ensureUser(db, input.userId);
  const owner = crypto.randomUUID();
  const leaseKey = `${input.userId}:${input.type}`;
  if (!(await acquireLease(db, leaseKey, owner))) {
    return { ok: false, status: "locked", message: "同类任务正在运行，本次安全跳过。" };
  }

  const started = Date.now();
  const now = new Date().toISOString();
  const state = await loadDashboardState(db, input.userId);
  const settings = (state.settings ?? DEFAULT_SETTINGS) as UserSettings;
  const snapshot = input.fixtureId
    ? getFixture(input.fixtureId)
    : await fetchExperimentalRealSnapshot();
  const tradeDate = snapshot.asOf.slice(0, 10);
  const idempotencyKey =
    input.forceId ??
    (input.type === "review"
      ? `${input.userId}:daily_review:${tradeDate}`
      : `${input.userId}:${input.type}:${snapshot.fixtureId}:${snapshot.asOf}`);
  const runId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO quote_snapshots
       (id, provider, scope, data_time, payload_json, is_fresh, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      snapshot.provider,
      snapshot.coverage ?? "full",
      snapshot.asOf,
      JSON.stringify(snapshot),
      snapshot.dataComplete ? 1 : 0,
      now,
      now,
    )
    .run();
  const insert = await db
    .prepare(
      `INSERT OR IGNORE INTO scheduled_job_runs
       (id, user_id, job_type, idempotency_key, trigger_json, status, attempt, started_at)
       VALUES (?, ?, ?, ?, ?, 'running', 1, ?)`,
    )
    .bind(runId, input.userId, input.type, idempotencyKey, JSON.stringify({ fixture: snapshot.fixtureId, origin: input.origin ?? "manual" }), now)
    .run();
  if ((insert.meta.changes ?? 0) === 0) {
    return { ok: true, status: "duplicate", duplicate: true, message: "相同数据版本已经处理，本次没有重复发送。" };
  }

  let payload: unknown;
  let delivery: Awaited<ReturnType<ReturnType<typeof getNotificationProvider>["send"]>> | undefined;
  try {
    if (input.type === "scan") {
      const events = evaluateRules(snapshot, settings);
      const createdAt = new Date().toISOString();
      for (const event of events) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO alert_events
             (id, user_id, dedupe_key, level, object_type, object_code, title, payload_json, data_time, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), input.userId, event.id, event.level, event.objectType, event.objectCode, event.title, JSON.stringify(event), event.dataTime, createdAt, createdAt)
          .run();
      }
      const shouldNotify = shouldPush(settings.periodic_push_mode, events);
      if (shouldNotify) {
        const provider = getNotificationProvider(runtimeEnv, settings.notification_channel);
        delivery = await provider.send(
          events.some((event) => event.level === "danger") ? "A 股盘面风险上升" : "A 股周期扫描摘要",
          events.length > 0
            ? `本周期共触发 ${events.length} 条事件，最高风险请打开盘面查看。`
            : "本周期未出现达到阈值的异常。",
          input.origin,
        );
      }
      payload = { snapshot, events, delivery };
    } else if (input.type === "review") {
      const review = generateDeterministicReview(snapshot);
      const createdAt = new Date().toISOString();
      await db
        .prepare(
          `INSERT OR IGNORE INTO daily_reviews
           (id, user_id, trade_date, status, data_ready, retry_count, report_json, pushed_at, created_at, updated_at)
           VALUES (?, ?, ?, 'success', ?, 0, ?, NULL, ?, ?)`,
        )
        .bind(crypto.randomUUID(), input.userId, review.tradeDate, snapshot.dataComplete ? 1 : 0, JSON.stringify(review), createdAt, createdAt)
        .run();
      const provider = getNotificationProvider(runtimeEnv, settings.notification_channel);
      delivery = await provider.send("A 股收盘复盘", review.conclusion, input.origin);
      payload = { review, delivery };
    } else {
      const provider = getNotificationProvider(runtimeEnv, settings.notification_channel);
      delivery = await provider.send(
        "盘面守望测试通知",
        "如果你看到这条消息，说明当前通知渠道可用。",
        input.origin,
      );
      payload = { delivery };
    }

    if (delivery) {
      const createdAt = new Date().toISOString();
      await db
        .prepare(
          `INSERT OR IGNORE INTO notification_deliveries
           (id, user_id, channel, status, dedupe_key, error_code, sent_at, payload_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.userId,
          delivery.channel,
          delivery.status,
          `${idempotencyKey}:delivery`,
          delivery.status === "failed" ? "provider_error" : null,
          delivery.status === "sent" ? new Date().toISOString() : null,
          JSON.stringify(delivery),
          createdAt,
          createdAt,
        )
        .run();
    }
    await db
      .prepare("UPDATE scheduled_job_runs SET status = 'success', finished_at = ?, duration_ms = ? WHERE id = ?")
      .bind(new Date().toISOString(), Date.now() - started, runId)
      .run();
    return { ok: true, status: "success", duplicate: false, payload };
  } catch {
    await db
      .prepare("UPDATE scheduled_job_runs SET status = 'failed', finished_at = ?, duration_ms = ?, error_code = ? WHERE id = ?")
      .bind(new Date().toISOString(), Date.now() - started, "job_failed", runId)
      .run();
    return { ok: false, status: "failed", message: "任务执行失败，已记录错误；不会伪造成功结果。" };
  }
}
