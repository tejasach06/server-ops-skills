import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadExample } from "../scripts/skill-example.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--host" || args[1].startsWith("-"))) {
  throw new Error("Usage: node tests/smoke-context-summary.mjs [--host SSH_ALIAS]");
}

const records = [];
const example = await loadExample(line => {
  records.push(JSON.parse(line));
  console.log(line);
});
const result = spawnSync(process.execPath, ["-e", `
  console.log("service started");
  console.log("request maxTimeout=60000");
  console.log("failed password=fixture-secret");
  console.log("I/O error on fixture-device");
  console.log("out of memory");
`], { encoding: "utf8", timeout: 5000 });
example.emit("local-log-summary", result, example.logEvidence);
assert.equal(records[0].ok, true);
assert.equal(records[0].evidence.scanned, 5);
assert.deepEqual(records[0].evidence.patternMatches, { oom: 1, storage: 1, failure: 2 });
assert.equal(JSON.stringify(records).includes("fixture-secret"), false);

if (args.length) {
  const remote = example.ssh(args[1], "hostname && uname -s && uname -r", 20_000);
  example.emit("remote-read-only-identity", remote, text => {
    const fields = text.trim().split(/\r?\n/);
    assert.equal(fields.length, 3, "Unexpected host identity output");
    assert.equal(fields[1], "Linux", "Smoke target must be Linux");
    return { hostname: fields[0], os: fields[1], kernel: fields[2] };
  });
  assert.equal(records[1].ok, true, "Remote identity probe failed");
}
console.log("smoke=passed source=SKILL.md");
