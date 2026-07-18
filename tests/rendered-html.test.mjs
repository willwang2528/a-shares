import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("production bundle contains the finished Chinese product", async () => {
  const assetsUrl = new URL("../dist/client/assets/", import.meta.url);
  const files = await readdir(assetsUrl);
  const appBundle = files.find((file) => file.startsWith("AStockApp-") && file.endsWith(".js"));
  assert.ok(appBundle, "AStockApp client bundle should exist");
  const javascript = await readFile(new URL(appBundle, assetsUrl), "utf8");
  assert.match(javascript, /盘面守望/);
  assert.match(javascript, /真实指数已更新/);
  assert.match(javascript, /真实数据·实验源/);
  assert.match(javascript, /先算清，再开通/);
  assert.match(javascript, /只推异常/);
  assert.match(javascript, /板块和股票都由你选择/);
  assert.match(javascript, /系统返回多个候选并说明匹配原因/);
  assert.match(javascript, /真实行情读取中/);
  assert.doesNotMatch(javascript, /-3\.42%|-9\.54%|-5\.76%/);
  assert.doesNotMatch(javascript, /数据 14:30 · Mock/);
  assert.doesNotMatch(javascript, /Your site is taking shape|react-loading-skeleton/i);
  await access(new URL("../dist/client/og.png", import.meta.url));
  await access(new URL("../dist/client/manifest.webmanifest", import.meta.url));
  await access(new URL("../dist/.openai/drizzle/0000_goofy_paladin.sql", import.meta.url));
});

test("mobile layouts cover the required 360, 390 and 430 pixel widths", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 760px\)/, "430px should use the mobile layout");
  assert.match(css, /@media \(max-width: 390px\)/, "390px and 360px should use the compact layout");
  assert.match(css, /\.sidebar\s*\{\s*display: none;/s);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?display: grid;/);
  assert.match(css, /\.mobile-nav button\s*\{[\s\S]*?min-width: 0;/);
});
