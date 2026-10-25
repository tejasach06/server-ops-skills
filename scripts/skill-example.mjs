import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

export async function loadExample(log = console.log) {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  const examples = [...skill.matchAll(/^```javascript\r?\n([\s\S]*?)^```\s*$/gm)];
  if (examples.length !== 1) {
    throw new Error(`Expected one runnable JavaScript example, found ${examples.length}`);
  }
  return runInNewContext(`${examples[0][1]}\n({ ssh, emit, logEvidence })`, {
    require: createRequire(import.meta.url),
    console: { log }
  }, { timeout: 1000 });
}
