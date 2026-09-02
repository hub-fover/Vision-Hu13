import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile UI keeps gallery and rear-camera inputs separate", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

  assert.match(html, /id="gallery-input"[^>]*type="file"[^>]*multiple/);
  assert.match(html, /id="camera-input"[^>]*type="file"[^>]*capture="environment"/);
  assert.doesNotMatch(html, /<form[^>]+action=|type="file"[^>]+name=/);
});

test("first screen promises a three-step attempt instead of automatic stitching", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

  assert.match(html, /一键打开，三步完成/);
  assert.match(html, /先用示例试一次/);
  assert.match(html, /选择照片.*排好顺序.*开始拼接/s);
  assert.match(html, /id="compatibility-notice"[^>]*aria-live="polite"/);
  assert.match(html, /照片只在这台设备的浏览器里处理/);
  assert.doesNotMatch(html, /一键自动拼接/);
});

test("installed sample loader stays relative and reports a recoverable local error", async () => {
  const source = await readFile(new URL("../../web/js/app.js", import.meta.url), "utf8");

  assert.match(source, /\.\/assets\/samples\/manifest\.json/);
  assert.match(source, /示例照片尚未安装|无法读取本地示例/);
  assert.doesNotMatch(source, /https?:\/\//);
});
