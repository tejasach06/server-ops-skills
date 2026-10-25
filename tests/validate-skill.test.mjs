import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = (await readFile(new URL("../SKILL.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const lines = skill.trimEnd().split("\n").length;
const bytes = Buffer.byteLength(skill);
const estimatedTokens = Math.ceil(skill.length / 4);

test("frontmatter exposes a valid model-invoked skill", () => {
  const header = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(header, "Missing YAML frontmatter delimiters");
  const fields = Object.fromEntries(header[1].split("\n").map(line => {
    const split = line.indexOf(":");
    assert.ok(split > 0, `Invalid frontmatter entry: ${line}`);
    return [line.slice(0, split), line.slice(split + 1).trim()];
  }));
  assert.equal(fields.name, "server-ops");
  assert.ok(fields.description?.length > 0, "Missing trigger description");
  assert.ok(fields.description.length <= 220, "Description exceeds discovery budget");
  assert.notEqual(fields["disable-model-invocation"], "true");
});

test("loaded skill stays within explicit size limits", () => {
  assert.ok(lines <= 220, `${lines} lines exceeds 220`);
  assert.ok(bytes <= 16000, `${bytes} bytes exceeds 16000`);
  assert.ok(estimatedTokens <= 4000, `${estimatedTokens} character-based token estimate exceeds 4000`);
  console.log(`skill_size lines=${lines} bytes=${bytes} estimated_tokens=${estimatedTokens} basis=characters/4`);
});

test("skill has no companion skill or Markdown document dependencies", () => {
  assert.doesNotMatch(skill, /skill:\/\//i);
  assert.doesNotMatch(skill, /\[[^\]]*\]\([^\n)]*\.md(?:#[^\n)]*)?\)/i);
  assert.doesNotMatch(skill, /^\[[^\]]+\]:\s*\S+\.md(?:\s|#|$)/im);
  assert.doesNotMatch(skill, /(?:references|docs)\/[\w./-]+\.md/i);
});
