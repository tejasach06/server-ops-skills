import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { exportCommands } from "../scripts/export-commands.mjs";

const script = fileURLToPath(new URL("../scripts/export-commands.mjs", import.meta.url));
const sources = Object.fromEntries([
  ["server-ops", new URL("../SKILL.md", import.meta.url)],
  ["ansible-brain", new URL("../skills/ansible-brain/SKILL.md", import.meta.url)]
].map(([name, url]) => [name, fileURLToPath(url).replaceAll("\\", "/")]));
const layouts = {
  agy: "manual",
  codex: ".agents/skills",
  omp: ".omp/prompts",
  pi: ".pi/agent/prompts",
  claude: ".claude/skills"
};

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), "export commands with spaces-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cli(args, cwd, entry = script) {
  return spawnSync(process.execPath, [entry, ...args], { cwd, encoding: "utf8", timeout: 5000 });
}

function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1).replaceAll("\\", "/"))
    .sort();
}

for (const [harness, layout] of Object.entries(layouts)) {
  test(`${harness}: thin wrappers, native metadata, placeholders and explicit safety`, t => {
    const out = join(temp(t), "new output");
    assert.equal(exportCommands({ harness, out }), out);
    const native = harness === "claude" || harness === "codex";
    const expected = Object.keys(sources).flatMap(name => [
      `${layout}/${name}${native ? "/SKILL.md" : ".md"}`,
      ...(harness === "codex" ? [`${layout}/${name}/agents/openai.yaml`] : [])
    ]).sort();
    assert.deepEqual(files(out), expected);
    for (const [name, source] of Object.entries(sources)) {
      const text = readFileSync(join(out, layout, native ? `${name}/SKILL.md` : `${name}.md`), "utf8");
      assert.ok(text.includes(`\`${source}\``));
      assert.ok(!text.includes("\\"), "source paths use forward slashes");
      assert.match(text, /explicitly invoked/);
      assert.match(text, /Honor the current request and all safety constraints/);
      assert.match(text, /ask for target and scope before loading either full procedure/);
      assert.match(text, /read and follow the corresponding canonical procedure/);
      assert.match(text, /source checkout must remain in place/);
      assert.equal(text.includes("$ARGUMENTS"), ["omp", "pi", "claude"].includes(harness));
      assert.ok(text.length < 2000, "wrapper stays small");
      assert.ok(!text.includes(readFileSync(source, "utf8")), "wrapper does not copy canonical content");
      assert.ok(!text.includes("```javascript"));
      if (name === "server-ops") {
        assert.ok(text.includes(`\`${sources["ansible-brain"]}\``));
        assert.match(text, /authorized writes to 2\+ hosts/);
      }
      if (harness === "agy") {
        assert.ok(!text.startsWith("---"));
        assert.match(text, /manual|Manual/);
        assert.match(text, /agy --print/);
        assert.match(text, /no native command or workflow/);
      } else {
        const metadata = text.split("---\n")[1].trim().split("\n");
        const description = metadata.find(line => line.startsWith("description: ")).slice(13);
        assert.equal(typeof JSON.parse(description), "string");
        assert.match(text, new RegExp(`Native command: \\${harness === "codex" ? "$" : "/"}${name}\\.`));
        if (native) assert.ok(metadata.includes(`name: ${name}`));
        else assert.deepEqual(metadata, [`description: ${description}`]);
        assert.equal(metadata.includes("disable-model-invocation: true"), harness === "claude");
        if (harness === "codex") {
          assert.equal(readFileSync(join(out, layout, name, "agents/openai.yaml"), "utf8"), "policy:\n  allow_implicit_invocation: false\n");
        }
      }
    }
  });

  test(`${harness}: CLI runs outside checkout with a spaced output path`, t => {
    const cwd = temp(t);
    const result = cli(["--out", "relative output", "--harness", harness], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.error, undefined);
    assert.ok(files(join(cwd, "relative output")).length >= 2);
    const wrapper = readFileSync(join(cwd, "relative output", layout,
      harness === "codex" || harness === "claude" ? "server-ops/SKILL.md" : "server-ops.md"), "utf8");
    assert.ok(wrapper.includes(sources["server-ops"]));
  });
}

test("invalid CLI inputs never write or modify existing data", t => {
  const cwd = temp(t);
  const out = join(cwd, "existing");
  mkdirSync(out);
  writeFileSync(join(out, "keep.txt"), "user configuration");
  const valid = ["--harness", "omp", "--out", out];
  const cases = [
    [], ["--harness", "omp"], ["--out", out],
    ["--harness", "unsupported", "--out", out],
    ["--harness", "constructor", "--out", out],
    [...valid, "--unknown"], [...valid, "positional"],
    [...valid, "--harness", "pi"], [...valid, "--out", join(cwd, "unowned")],
    ["--harness", "omp", "--out", ""], ["--harness", "omp", "--out", "   "],
    ["--harness", "omp", "--out"], ["--harness", "--out", out],
    ["--harness=agy", "--out=unused", "--help"],
    ["--harness", "omp", "--out", join(out, "keep.txt", "child")],
    ["--harness", "omp", "--out", join(cwd, "missing parent", "child")],
    valid, ["--harness", "pi", "--out", join(out, "keep.txt")],
    ["--harness", "claude", "--out", cwd]
  ];
  for (const args of cases) {
    const result = cli(args, cwd);
    assert.equal(result.status, 1, JSON.stringify({ args, result }));
    assert.ok(result.stderr.trim());
    assert.deepEqual(files(cwd), ["existing/keep.txt"]);
    assert.deepEqual(readdirSync(cwd), ["existing"]);
    assert.equal(readFileSync(join(out, "keep.txt"), "utf8"), "user configuration");
  }
});

test("exported function validates harness and output before creating anything", t => {
  const cwd = temp(t);
  const out = join(cwd, "unused");
  for (const harness of [undefined, null, 1, "", "PI", "__proto__", "toString", "unknown"]) {
    assert.throws(() => exportCommands({ harness, out }), /Unsupported harness/);
  }
  for (const value of [undefined, null, 1, "", "  ", "bad\0path"]) {
    assert.throws(() => exportCommands({ harness: "omp", out: value }), /--out/);
  }
  assert.throws(() => exportCommands(), /Unsupported harness/);
  assert.deepEqual(readdirSync(cwd), []);
});

test("an existing output link and its target remain untouched", t => {
  const cwd = temp(t);
  const target = join(cwd, "user config");
  const out = join(cwd, "output link");
  mkdirSync(target);
  writeFileSync(join(target, "keep.txt"), "user configuration");
  symlinkSync(target, out, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => exportCommands({ harness: "codex", out }), { code: "EEXIST" });
  assert.ok(lstatSync(out).isSymbolicLink());
  assert.deepEqual(readdirSync(target), ["keep.txt"]);
  assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "user configuration");
});

test("canonical files resolve from a spaced module checkout and must both be files", t => {
  const cwd = temp(t);
  const checkout = join(cwd, "source checkout");
  mkdirSync(join(checkout, "scripts"), { recursive: true });
  mkdirSync(join(checkout, "skills", "ansible-brain"), { recursive: true });
  const entry = join(checkout, "scripts", "export-commands.mjs");
  copyFileSync(script, entry);
  const root = join(checkout, "SKILL.md");
  const helper = join(checkout, "skills", "ansible-brain", "SKILL.md");
  const out = join(cwd, "new output");
  const args = ["--harness=agy", `--out=${out}`];
  writeFileSync(root, "fixture server procedure");
  assert.equal(cli(args, cwd, entry).status, 1);
  assert.ok(!existsSync(out));
  writeFileSync(helper, "fixture ansible procedure");
  rmSync(root);
  assert.equal(cli(args, cwd, entry).status, 1);
  assert.ok(!existsSync(out));
  mkdirSync(root);
  assert.equal(cli(args, cwd, entry).status, 1);
  assert.ok(!existsSync(out));
  rmSync(root, { recursive: true });
  writeFileSync(root, "fixture server procedure");
  const result = cli(args, cwd, entry);
  assert.equal(result.status, 0, result.stderr);
  const wrapper = readFileSync(join(out, "manual", "server-ops.md"), "utf8");
  assert.ok(wrapper.includes(root.replaceAll("\\", "/")));
  assert.ok(wrapper.includes(helper.replaceAll("\\", "/")));
  assert.ok(!wrapper.includes("fixture server procedure"));
});

test("write failure removes only the newly owned output", t => {
  const cwd = temp(t);
  const out = join(cwd, "partial output");
  writeFileSync(join(cwd, "keep.txt"), "user configuration");
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.writeFileSync;
    let writes = 0;
    fs.writeFileSync = (...args) => {
      if (++writes === 2) throw new Error('fixture write failure');
      return original(...args);
    };
    syncBuiltinESMExports();
    const { exportCommands } = await import(${JSON.stringify(new URL("../scripts/export-commands.mjs", import.meta.url).href)});
    assert.throws(() => exportCommands({ harness: 'omp', out: ${JSON.stringify(out)} }), /fixture write failure/);
    assert.equal(fs.existsSync(${JSON.stringify(out)}), false);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(files(cwd), ["keep.txt"]);
  assert.equal(readFileSync(join(cwd, "keep.txt"), "utf8"), "user configuration");
});
