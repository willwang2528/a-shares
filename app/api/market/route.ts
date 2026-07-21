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
          "当前只覆盖四个主要指数。市场宽度、板块、个股及涨跌停仍需正式授权数据源。",
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
