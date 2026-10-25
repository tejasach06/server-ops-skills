import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadExample } from "../scripts/skill-example.mjs";

function child(code, options = {}) {
  return spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8", timeout: 5000, ...options
  });
}

async function createFixture() {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  return { example, records };
}

test("log triage counts the whole capture without exposing raw messages", async () => {
  const { example, records } = await createFixture();
  const result = child(`
    for (let i = 0; i < 12000; i++) console.log("request maxTimeout=60000");
    console.log("failed Authorization: Bearer fixture-secret");
    console.log("I/O error at https://user:pass@example.invalid/?token=fixture-secret");
    console.log("Out of memory: killed process 123");
  `);
  example.emit("journal-triage", result, example.logEvidence);
  assert.equal(records[0].ok, true);
  assert.equal(records[0].complete, true);
  assert.deepEqual(records[0].evidence, {
    scanned: 12003, patternMatches: { oom: 1, storage: 1, failure: 2 }
  });
  const returned = JSON.stringify(records);
  assert.equal(/fixture-secret|user:pass|https:|maxTimeout/.test(returned), false);
});

test("a failed process cannot turn empty output into a healthy check", async () => {
  const { example, records } = await createFixture();
  let analyzed = false;
  example.emit("failed-command", child("process.exit(7)"), () => { analyzed = true; });
  assert.equal(analyzed, false);
  assert.equal(records[0].exit, 7);
  assert.equal(records[0].complete, true);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
});

test("a documented success status can differ from zero", async () => {
  const { example, records } = await createFixture();
  example.emit("dnf-status", child("process.exit(100)"), () => ({ updatesAvailable: true }), [0, 100]);
  assert.equal(records[0].ok, true);
  assert.deepEqual(records[0].evidence, { updatesAvailable: true });
});

test("timeouts retain the failure and suppress partial evidence", async () => {
  const { example, records } = await createFixture();
  const result = child("setInterval(() => {}, 1000)", { timeout: 500 });
  example.emit("timed-out", result, example.logEvidence);
  assert.equal(records[0].error, "ETIMEDOUT");
  assert.equal(records[0].complete, false);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
});

test("buffer overflow is incomplete evidence, not a successful scan", async () => {
  const { example, records } = await createFixture();
  const result = child("console.log('error '.repeat(10000))", { maxBuffer: 1024 });
  example.emit("overflow", result, example.logEvidence);
  assert.equal(records[0].error, "ENOBUFS");
  assert.equal(records[0].complete, false);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
});

test("stderr warnings remain visible without exposing diagnostic secrets", async () => {
  const { example, records } = await createFixture();
  const result = child(`console.error("partial visibility password=fixture-secret");`);
  example.emit("journal-access", result, example.logEvidence);
  assert.equal(records[0].exit, 0);
  assert.equal(records[0].stderrChars, result.stderr.length);
  assert.ok(records[0].stderrChars > 0);
  assert.equal(JSON.stringify(records).includes("fixture-secret"), false);
});

test("a malformed probe records an analysis failure and the next probe still runs", async () => {
  const { example, records } = await createFixture();
  example.emit("unexpected-response", child(`console.log("<html>fixture-secret</html>")`), JSON.parse);
  example.emit("next-probe", child(`console.log('{"ready":true}')`), JSON.parse);
  assert.equal(records[0].error, "ANALYZE_ERROR");
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
  assert.equal(records[1].ok, true);
  assert.deepEqual(records[1].evidence, { ready: true });
  assert.equal(JSON.stringify(records).includes("fixture-secret"), false);
});

test("SMART diagnostic bit combinations retain evidence but command errors do not", async () => {
  const { example, records } = await createFixture();
  const smartReadable = code => code >= 0 && code <= 255 && (code & 7) === 0;
  for (const status of [32, 96, 35]) {
    const result = child(`
      console.log(JSON.stringify({ pending: 24, uncorrectable: 24 }));
      process.exit(${status});
    `);
    example.emit("smart-status", result, JSON.parse, smartReadable);
  }
  for (const record of records.slice(0, 2)) {
    assert.equal(record.ok, true);
    assert.notEqual(record.exit, 0);
    assert.deepEqual(record.evidence, { pending: 24, uncorrectable: 24 });
  }
  assert.equal(records[2].exit, 35);
  assert.equal(records[2].ok, false);
  assert.equal(records[2].evidence, null);
});
