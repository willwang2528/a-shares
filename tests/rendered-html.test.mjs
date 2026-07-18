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
  assert.match(javascript, /先算清，再开通/);
  assert.match(javascript, /只推异常/);
  assert.doesNotMatch(javascript, /Your site is taking shape|react-loading-skeleton/i);
  await access(new URL("../dist/client/og.png", import.meta.url));
  await access(new URL("../dist/client/manifest.webmanifest", import.meta.url));
  await access(new URL("../dist/.openai/drizzle/0000_goofy_paladin.sql", import.meta.url));
});
