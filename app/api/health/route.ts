import { env } from "cloudflare:workers";
import { fetchExperimentalRealSnapshot } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  let marketService = {
    id: "market",
    name: "行情源",
    status: "configured_unverified",
    message: "已配置服务端凭据，尚未在本次部署做付费连通测试",
  };
  if (!runtime.TUSHARE_TOKEN) {
    try {
      const snapshot = await fetchExperimentalRealSnapshot();
      marketService = {
        id: "market",
        name: "行情源",
        status: "experimental",
        message: `真实主要指数读取成功，数据时间 ${snapshot.asOf.slice(0, 16).replace("T", " ")}；实验源无正式生产 SLA`,
      };
    } catch {
      marketService = {
        id: "market",
        name: "行情源",
        status: "failed",
        message: "真实指数读取失败；已停止生成行情结论",
      };
    }
  }
  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      services: [
        marketService,
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
          status: runtime.SERVERCHAN_SENDKEY || runtime.RESEND_API_KEY ? "configured_unverified" : "needs_config",
          message: runtime.SERVERCHAN_SENDKEY || runtime.RESEND_API_KEY ? "服务端凭据已配置，等待用户测试接收" : "外部通知凭据未配置；不会记录成已发送",
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
