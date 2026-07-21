import { fetchExperimentalRealSnapshot } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchExperimentalRealSnapshot();
    return Response.json(
      {
        ok: true,
        snapshot,
        limitation:
          "当前快照覆盖六个主要指数。全市场复盘、板块和涨跌停使用独立真实数据链路。",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30",
        },
      },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        message: "真实指数暂时读取失败，已停止生成新的行情结论。",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
