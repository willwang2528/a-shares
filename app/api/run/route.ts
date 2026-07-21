import { env } from "cloudflare:workers";
import { executeJob } from "@/lib/jobs";
import { currentUserIdentity } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: "scan" | "review" | "test_notification";
      force?: boolean;
    };
    if (!body.type || !["scan", "review", "test_notification"].includes(body.type)) {
      return Response.json({ ok: false, message: "未知任务类型。" }, { status: 400 });
    }
    const user = await currentUserIdentity();
    const result = await executeJob(
      env.DB,
      env as unknown as Record<string, string | undefined>,
      {
        userId: user.id,
        type: body.type,
        origin: new URL(request.url).origin,
        forceId: body.force ? `${user.id}:${body.type}:manual:${crypto.randomUUID()}` : undefined,
      },
    );
    return Response.json(result, {
      status: result.ok ? 200 : result.status === "locked" ? 409 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { ok: false, status: "failed", message: "请求执行失败，敏感信息不会写入响应。" },
      { status: 500 },
    );
  }
}
