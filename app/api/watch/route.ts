import { env } from "cloudflare:workers";
import {
  addWatchItem,
  deleteWatchItem,
  ensureSchema,
  ensureUser,
  listWatchItems,
  updateWatchTag,
} from "@/lib/storage";
import { currentUserIdentity } from "@/lib/user";
import { searchTencentStocks } from "@/lib/instruments";
import { searchSinaSectors } from "@/lib/sina-sectors";
import { searchEastmoneyConcepts } from "@/lib/eastmoney-concepts";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function prepareUser() {
  const user = await currentUserIdentity();
  await ensureSchema(env.DB);
  await ensureUser(env.DB, user.id, user.email, user.displayName);
  return user;
}

async function isVerifiedRealCandidate(
  objectType: "sector" | "stock",
  code: string,
  name: string,
) {
  if (objectType === "stock") {
    const candidates = await searchTencentStocks(code.slice(0, 6));
    return candidates.some((item) => item.code === code && item.name === name);
  }
  const candidates = code.startsWith("EASTMONEY:")
    ? await searchEastmoneyConcepts(name, 10)
    : await searchSinaSectors(name, 20);
  return candidates.some((item) => item.code === code && item.name === name);
}

export async function GET() {
  try {
    const user = await prepareUser();
    return json({ ok: true, watches: await listWatchItems(env.DB, user.id) });
  } catch {
    return json({ ok: false, message: "关注列表读取失败，请稍后重试。" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      objectType?: string;
      code?: string;
      name?: string;
      tag?: string;
    };
    if (!["sector", "stock"].includes(body.objectType ?? "")) {
      return json({ ok: false, message: "关注类型不正确。" }, 400);
    }
    const objectType = body.objectType as "sector" | "stock";
    const rawCode = body.code?.trim() ?? "";
    const code = objectType === "stock" || /^EASTMONEY:/i.test(rawCode)
      ? rawCode.toUpperCase()
      : rawCode;
    const name = body.name?.trim() ?? "";
    if (objectType === "sector") {
      if (!/^(?:SINA:[a-zA-Z0-9_]+|EASTMONEY:BK\d{4})$/.test(code)) {
        return json({ ok: false, message: "板块代码不是来自当前真实目录。" }, 400);
      }
    } else if (!/^\d{6}\.(SH|SZ|BJ)$/.test(code)) {
      return json({ ok: false, message: "股票代码格式不正确。" }, 400);
    }
    if (!name || name.length > 30) {
      return json({ ok: false, message: "股票或板块名称不正确。" }, 400);
    }
    if (!(await isVerifiedRealCandidate(objectType, code, name))) {
      return json({ ok: false, message: "没有在当前真实目录中核验到这个对象，未保存。" }, 400);
    }
    const tag = body.tag === "holding" ? "holding" : "watch";
    const user = await prepareUser();
    const result = await addWatchItem(env.DB, user.id, {
      objectType,
      code,
      name,
      tag,
    });
    return json({
      ok: true,
      created: result.created,
      message: result.created ? "已加入关注。" : "这个对象已经在关注列表中。",
      watches: await listWatchItems(env.DB, user.id),
    });
  } catch {
    return json({ ok: false, message: "添加失败，原有关注列表没有改动。" }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; tag?: string };
    if (!body.id || !["watch", "holding"].includes(body.tag ?? "")) {
      return json({ ok: false, message: "标签修改内容不正确。" }, 400);
    }
    const user = await prepareUser();
    const updated = await updateWatchTag(
      env.DB,
      user.id,
      body.id,
      body.tag as "watch" | "holding",
    );
    if (!updated) return json({ ok: false, message: "没有找到这条关注。" }, 404);
    return json({
      ok: true,
      message: body.tag === "holding" ? "已标记为持有。" : "已改为仅关注。",
      watches: await listWatchItems(env.DB, user.id),
    });
  } catch {
    return json({ ok: false, message: "标签修改失败，请稍后重试。" }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ ok: false, message: "缺少要移除的关注项。" }, 400);
    const user = await prepareUser();
    const deleted = await deleteWatchItem(env.DB, user.id, id);
    if (!deleted) return json({ ok: false, message: "没有找到这条关注。" }, 404);
    return json({
      ok: true,
      message: "已从关注列表移除。",
      watches: await listWatchItems(env.DB, user.id),
    });
  } catch {
    return json({ ok: false, message: "移除失败，原有关注列表没有改动。" }, 500);
  }
}
