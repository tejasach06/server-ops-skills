import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
const skill = (await readFile(new URL("../skills/ansible-brain/SKILL.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
function loadCleanup() {
  const blocks = [...skill.matchAll(/```javascript\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 1);
  return runInNewContext(`${blocks[0][1]}\nwithCleanup`, {
    require: createRequire(import.meta.url)
  }, { timeout: 1000 });
}
function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "brain-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "playbook.yml"), "- hosts: all\n");
  return dir;
}
test("frontmatter exposes ansible-brain with a trigger description", () => {
  const header = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(header, "Missing YAML frontmatter");
  assert.match(header[1], /^name: ansible-brain$/m);
  const description = JSON.parse(header[1].match(/^description: (.*)$/m)[1]);
  assert.equal(typeof description, "string");
  assert.ok(description.length <= 220, "Description exceeds discovery budget");
});
test("skill stays within size limits", () => {
  assert.ok(skill.split("\n").length <= 220);
  assert.ok(Buffer.byteLength(skill) <= 16000);
});
test("skill has no skill:// or Markdown companion links", () => {
  assert.doesNotMatch(skill, /skill:\/\//i);
  assert.doesNotMatch(skill, /\[[^\]]*\]\([^\n)]*\.md(?:#[^\n)]*)?\)/i);
});
for (const asynchronous of [false, true]) {
  test(`local cleanup preserves ${asynchronous ? "async" : "sync"} success result`, async (t) => {
    const withCleanup = loadCleanup();
    const dir = tempDir(t);
    const result = { ok: true };
    assert.equal(await withCleanup(dir, asynchronous ? async () => result : () => result), result);
    assert.equal(existsSync(dir), false);
  });
  test(`local cleanup preserves ${asynchronous ? "async" : "sync"} failure`, async (t) => {
    const withCleanup = loadCleanup();
    const dir = tempDir(t);
    const failure = new Error("job failed");
    await assert.rejects(async () => withCleanup(dir, asynchronous
      ? async () => { throw failure; }
      : () => { throw failure; }), (error) => error === failure);
    assert.equal(existsSync(dir), false);
  });
  test(`local cleanup waits for pending ${asynchronous ? "rejection" : "resolution"}`, async (t) => {
    const withCleanup = loadCleanup();
    const dir = tempDir(t);
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const completion = withCleanup(dir, () => pending);
    const failure = new Error("delayed failure");
    const settled = asynchronous ? assert.rejects(completion, (error) => error === failure) : completion;
    const existsWhilePending = existsSync(dir);
    if (asynchronous) reject(failure);
    else resolve("done");
    const result = await settled;
    assert.equal(existsWhilePending, true, "Local files must remain until the job settles");
    if (!asynchronous) assert.equal(result, "done");
    assert.equal(existsSync(dir), false);
  });
}
test("local cleanup rejects removal errors instead of reporting success", async () => {
  await assert.rejects(loadCleanup()(null, () => "ok"), { code: "ERR_INVALID_ARG_TYPE" });
});
function exampleRecords() {
  const blocks = [...skill.matchAll(/```(jsonl?)\n([\s\S]*?)```/g)];
  assert.deepEqual(blocks.map(([ , language]) => language), ["json", "jsonl"]);
  return blocks.map(([ , language, body]) => language === "json"
    ? JSON.parse(body)
    : body.trim().split("\n").map((line) => JSON.parse(line)));
}
function nonempty(value) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0);
}
function aliases(values) {
  assert.ok(Array.isArray(values) && values.length > 0);
  for (const value of values) assert.match(value, /^[a-z][a-z0-9-]*$/);
}
test("index example parses into a usable discovery record", () => {
  const [entry] = exampleRecords();
  nonempty(entry.id);
  nonempty(entry.intent);
  assert.ok(entry.triggers.length > 0);
  for (const trigger of entry.triggers) nonempty(trigger);
  assert.equal(typeof entry.vars, "object");
  assert.ok(entry.vars && !Array.isArray(entry.vars));
  for (const field of ["check_safe", "idempotent", "destructive"]) assert.equal(typeof entry[field], "boolean");
  assert.ok(entry.distros.length > 0);
  for (const distro of entry.distros) nonempty(distro);
  assert.ok(Number.isFinite(Date.parse(entry.last.date)));
  assert.equal(entry.last.result, "succeeded");
  aliases(entry.last.hosts);
});
test("log examples parse failed attempts separately from successful promotion", () => {
  const [entry, attempts] = exampleRecords();
  assert.deepEqual(attempts.map((attempt) => attempt.result), ["failed", "succeeded"]);
  assert.equal(new Set(attempts.map((attempt) => attempt.attempt)).size, attempts.length);
  for (const attempt of attempts) {
    assert.equal(attempt.id, entry.id);
    assert.ok(Number.isFinite(Date.parse(attempt.date)));
    aliases(attempt.hosts);
    nonempty(attempt.phase);
    nonempty(attempt.fix);
    assert.ok(Number.isInteger(attempt.failures) && attempt.failures >= 0);
    assert.match(attempt.runtime.python, /^\d+\.\d+\.\d+$/);
    assert.match(attempt.runtime.ansible_core, /^\d+\.\d+\.\d+$/);
    for (const field of ["dependencies_lock", "collections_lock"]) assert.match(attempt.runtime[field], /^locks\/[a-z0-9.-]+$/);
  }
  assert.equal(attempts[0].failures, 1);
  assert.equal(attempts[0].promoted, false);
  assert.equal(attempts[1].failures, 0);
  assert.equal(attempts[1].promoted, true);
  assert.deepEqual(entry.last, {
    date: attempts[1].date, result: attempts[1].result, hosts: attempts[1].hosts
  });
});
test("secondary policy checks preserve validation and secret-safe storage", () => {
  for (const pattern of [
    /--syntax-check/, /--check --diff/, /check_mode: false/, /no_check/,
    /never copy a private key/i, /Destructive entries/, /Never delete audit logs/,
    /permanent controller/i, /user config/i, /reply alone/i,
    /imports/, /plugins/, /secret-safe/, /git diff --cached/, /failed attempts/i
  ]) assert.match(skill, pattern);
  assert.doesNotMatch(skill, /git add (?:\.|-A|--all)(?:\s|`|$)/);
});
test("secondary policy checks cover isolation, agent-only trust and teardown", () => {
  for (const pattern of [
    /python3 -m venv "\$run_dir\/venv"/, /ansible-core==/,
    /ANSIBLE_CONFIG="\$run_dir\/ansible\.cfg"/,
    /ANSIBLE_HOME="\$run_dir\/home"/, /ANSIBLE_LOCAL_TEMP=/, /ANSIBLE_REMOTE_TEMP/,
    /TMPDIR=/, /PIP_NO_CACHE_DIR=1/, /requirements\.lock/,
    /ssh -G <alias>/, /ProxyJump/, /recursiv/i,
    /StrictHostKeyChecking=yes/, /UserKnownHostsFile=/, /GlobalKnownHostsFile=\/dev\/null/,
    /IdentityFile=none/, /IdentitiesOnly=no/, /ssh-add -l/, /ssh -n/,
    /-O exit/, /SIGKILL/, /power loss/, /local-only/i
  ]) assert.match(skill, pattern);
});
