import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";

const skill = (await readFile(new URL("../skills/ansible-brain/SKILL.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("frontmatter exposes ansible-brain with a trigger description", () => {
  const header = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(header, "Missing YAML frontmatter");
  assert.match(header[1], /^name: ansible-brain$/m);
  const description = header[1].match(/^description: (.*)$/m)[1];
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

test("skill keeps the save, secrets and destructive-run rules", () => {
  assert.match(skill, /--syntax-check/);
  assert.match(skill, /--check --diff/);
  assert.match(skill, /Never copy a private key/);
  assert.match(skill, /Destructive entries/);
  assert.match(skill, /Never delete audit logs/);
});

test("cleanup removes the temp directory after a failed job and rethrows", () => {
  const code = skill.match(/```javascript\n([\s\S]*?)```/)[1];
  const { withCleanup } = runInNewContext(`${code}\n({ withCleanup })`, {
    require: createRequire(import.meta.url)
  });
  const dir = mkdtempSync(join(tmpdir(), "brain-test-"));
  writeFileSync(join(dir, "playbook.yml"), "- hosts: all\n");
  assert.throws(() => withCleanup(dir, () => { throw new Error("job failed"); }), /job failed/);
  assert.equal(existsSync(dir), false);
});

test("cleanup returns the job result on success", () => {
  const code = skill.match(/```javascript\n([\s\S]*?)```/)[1];
  const { withCleanup } = runInNewContext(`${code}\n({ withCleanup })`, {
    require: createRequire(import.meta.url)
  });
  const dir = mkdtempSync(join(tmpdir(), "brain-test-"));
  assert.equal(withCleanup(dir, () => "ok"), "ok");
  assert.equal(existsSync(dir), false);
});

test("run flow isolates the venv from the master's Ansible config", () => {
  assert.match(skill, /`ANSIBLE_CONFIG` and `ANSIBLE_HOME`/);
});

test("run flow ships a temp ssh config and keeps known_hosts and sockets in the temp dir", () => {
  assert.match(skill, /ssh -G <alias>/);
  assert.match(skill, /UserKnownHostsFile=/);
  assert.match(skill, /ControlPath=/);
  assert.match(skill, /host-key checks stay on/);
});
