import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWorkflow = (name) =>
  readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");

test("CI covers the supported Python matrix and browser checks", async () => {
  const source = await readWorkflow("ci.yml");

  for (const required of [
    "ubuntu-latest",
    "windows-latest",
    '"3.11"',
    '"3.12"',
    "python -m pytest",
    "fonts-noto-cjk",
    "npm ci",
    "npm run test:web",
    "playwright install --with-deps chromium",
    "npm run test:e2e",
  ]) {
    assert.ok(source.includes(required), `ci.yml is missing ${required}`);
  }
  assert.doesNotMatch(source, /article|公众号|graphite-minimal|validate_article/i);
});

test("Pages deploys only the static web directory after successful CI", async () => {
  const source = await readWorkflow("pages.yml");

  for (const required of [
    "workflow_run:",
    "conclusion == 'success'",
    "actions/checkout@v6",
    "actions/configure-pages@v5",
    "actions/upload-pages-artifact@v4",
    "actions/deploy-pages@v4",
    "path: ./web",
    "pages: write",
    "id-token: write",
  ]) {
    assert.ok(source.includes(required), `pages.yml is missing ${required}`);
  }
});
