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
    "npm run test:lab002:web",
    "npm run test:lab002:python",
    "npm run test:lab002:acceptance",
    "npm run validate:lab002:release",
    "npm run validate:lab002:pages",
    "playwright install --with-deps chromium",
    "npm run test:e2e",
    "npm run test:lab002:e2e",
  ]) {
    assert.ok(source.includes(required), `ci.yml is missing ${required}`);
  }
});

test("Pages deploys only trusted default-branch push results from successful CI", async () => {
  const source = await readWorkflow("pages.yml");
  const deployGate = source.match(/^\s{4}if:\s*(.+)$/m)?.[1] ?? "";

  for (const required of [
    "workflow_run:",
    "actions/checkout@v6",
    "actions/configure-pages@v5",
    "npm run validate:lab002:pages",
    "actions/upload-pages-artifact@v4",
    "actions/deploy-pages@v4",
    "path: ./web",
    "pages: write",
    "id-token: write",
  ]) {
    assert.ok(source.includes(required), `pages.yml is missing ${required}`);
  }
  for (const requiredCondition of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == github.event.repository.default_branch",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ]) {
    assert.ok(
      deployGate.includes(requiredCondition),
      `Pages deploy gate is missing ${requiredCondition}`,
    );
  }
});
