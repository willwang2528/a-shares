import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      services: [
        {
          id: "market",
          name: "行情源",
          status: runtime.TUSHARE_TOKEN ? "configured_unverified" : "mock",
          message: runtime.TUSHARE_TOKEN ? "已配置服务端凭据，尚未在本次部署做付费连通测试" : "使用 Mock Fixture，不产生行情费用",
        },
        {
          id: "scheduler",
          name: "调度心跳",
          status: runtime.SCHEDULER_SECRET ? "ready" : "needs_config",
          message: runtime.SCHEDULER_SECRET ? "受密钥保护的心跳入口已就绪" : "尚未连接 CloudBase 定时触发器",
        },
        {
          id: "database",
          name: "云端数据库",
          status: env.DB ? "healthy" : "failed",
          message: env.DB ? "结构化保存已连接" : "数据库绑定不可用",
        },
        {
          id: "llm",
          name: "复盘模型",
          status: runtime.LLM_API_KEY && runtime.LLM_BASE_URL && runtime.LLM_MODEL ? "configured_unverified" : "degraded",
          message: runtime.LLM_API_KEY ? "已配置但未调用；失败时使用数字型复盘" : "未配置，当前使用确定性数字复盘",
        },
        {
          id: "notification",
          name: "外部通知",
          status: runtime.SERVERCHAN_SENDKEY || runtime.RESEND_API_KEY ? "configured_unverified" : "simulation",
          message: runtime.SERVERCHAN_SENDKEY || runtime.RESEND_API_KEY ? "服务端凭据已配置，等待用户测试接收" : "外部凭据未配置，先写入模拟发送日志",
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
