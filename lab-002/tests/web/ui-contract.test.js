import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile UI keeps gallery and rear-camera inputs separate", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

  assert.match(html, /id="gallery-input"[^>]*type="file"[^>]*multiple/);
  assert.match(html, /id="camera-input"[^>]*type="file"[^>]*capture="environment"/);
  assert.doesNotMatch(html, /<form[^>]+action=|type="file"[^>]+name=/);
});

test("installed sample loader stays relative and reports a recoverable local error", async () => {
  const source = await readFile(new URL("../../web/js/app.js", import.meta.url), "utf8");

  assert.match(source, /\.\/assets\/samples\/manifest\.json/);
  assert.match(source, /示例照片尚未安装|无法读取本地示例/);
  assert.doesNotMatch(source, /https?:\/\//);
});
