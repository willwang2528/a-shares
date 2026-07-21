import { env } from "cloudflare:workers";
import { fetchSinaAStockCatalogGroup } from "@/lib/market-limits";
import {
  ensureSchema,
  loadMarketStockCatalog,
  saveMarketStockCatalog,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const groupValue = new URL(request.url).searchParams.get("group");
  if (groupValue !== "0" && groupValue !== "1") {
    return Response.json(
      { ok: false, message: "代码目录分组不正确。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await ensureSchema(env.DB);
    const group = Number(groupValue) as 0 | 1;
    const stocks = await fetchSinaAStockCatalogGroup(group);
    await saveMarketStockCatalog(env.DB, stocks);
    const catalog = await loadMarketStockCatalog(env.DB);
    return Response.json(
      { ok: true, group, saved: stocks.length, totalSaved: catalog.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "真实股票代码目录读取失败。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
