import { fetchExperimentalStockQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const codes = (new URL(request.url).searchParams.get("codes") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  if (
    codes.length > 30 ||
    codes.some((code) => !/^\d{6}\.(SH|SZ|BJ)$/.test(code))
  ) {
    return Response.json(
      { ok: false, message: "自选股代码列表不正确。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const quotes = await fetchExperimentalStockQuotes(codes);
    return Response.json(
      {
        ok: true,
        quotes,
        provider: "腾讯公开行情页面接口（真实数据·实验源）",
        sourceUrl: "https://gu.qq.com/",
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
        message: "真实自选股行情暂时读取失败，不会用演示涨跌幅替代。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
