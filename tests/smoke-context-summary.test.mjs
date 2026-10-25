import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadExample } from "../scripts/skill-example.mjs";

function child(code, options = {}) {
  return spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8", timeout: 5000, ...options
  });
}

test("log triage counts the whole capture without exposing raw messages", async () => {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  const result = child(`
    for (let i = 0; i < 12000; i++) console.log("request maxTimeout=60000");
    console.log("failed Authorization: Bearer fixture-secret");
    console.log("I/O error at https://user:pass@example.invalid/?token=fixture-secret");
    console.log("Out of memory: killed process 123");
  `);
  example.emit("journal-triage", result, example.logEvidence);
  assert.deepEqual(records, [{
    check: "journal-triage", exit: 0, signal: null, error: null, complete: true, ok: true,
    evidence: { scanned: 12003, patternMatches: { oom: 1, storage: 1, failure: 2 } }
  }]);
  const returned = JSON.stringify(records);
  assert.equal(/fixture-secret|user:pass|https:|maxTimeout/.test(returned), false);
});

test("a failed process cannot turn empty output into a healthy check", async () => {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  let analyzed = false;
  example.emit("failed-command", child("process.exit(7)"), () => { analyzed = true; });
  assert.equal(analyzed, false);
  assert.deepEqual(records[0], {
    check: "failed-command", exit: 7, signal: null, error: null,
    complete: true, ok: false, evidence: null
  });
});

test("a documented success status can differ from zero", async () => {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  example.emit("dnf-status", child("process.exit(100)"), () => ({ updatesAvailable: true }), [0, 100]);
  assert.equal(records[0].ok, true);
  assert.deepEqual(records[0].evidence, { updatesAvailable: true });
});

test("timeouts retain the failure and suppress partial evidence", async () => {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  const result = child("setInterval(() => {}, 1000)", { timeout: 500 });
  example.emit("timed-out", result, example.logEvidence);
  assert.equal(records[0].error, "ETIMEDOUT");
  assert.equal(records[0].complete, false);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
});

test("buffer overflow is incomplete evidence, not a successful scan", async () => {
  const records = [];
  const example = await loadExample(line => records.push(JSON.parse(line)));
  const result = child("console.log('error '.repeat(10000))", { maxBuffer: 1024 });
  example.emit("overflow", result, example.logEvidence);
  assert.equal(records[0].error, "ENOBUFS");
  assert.equal(records[0].complete, false);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].evidence, null);
});
