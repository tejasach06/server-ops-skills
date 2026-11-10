import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const layouts = {
  agy: "manual",
  codex: ".agents/skills",
  omp: ".omp/prompts",
  pi: ".pi/agent/prompts",
  claude: ".claude/skills"
};
const descriptions = {
  "server-ops": "Explicit server operations procedure; clarify target and scope before loading.",
  "ansible-brain": "Explicit Ansible procedure for authorized multi-host writes; clarify target and scope before loading."
};

export function exportCommands({ harness, out } = {}) {
  if (typeof harness !== "string" || !Object.hasOwn(layouts, harness)) {
    throw new Error("Unsupported harness: expected agy, codex, omp, pi, or claude");
  }
  if (typeof out !== "string" || !out.trim() || out.includes("\0")) {
    throw new Error("--out must name a new output directory");
  }
  const sources = {
    "server-ops": fileURLToPath(new URL("../SKILL.md", import.meta.url)),
    "ansible-brain": fileURLToPath(new URL("../skills/ansible-brain/SKILL.md", import.meta.url))
  };
  for (const path of Object.values(sources)) {
    if (!statSync(path).isFile()) throw new Error(`Canonical source is not a file: ${path}`);
  }
  const output = resolve(out);
  mkdirSync(output); // Exclusive creation: never merge or remove an existing destination.
  try {
    for (const [name, source] of Object.entries(sources)) {
      const nativeSkill = harness === "codex" || harness === "claude";
      const path = join(output, layouts[harness], nativeSkill ? `${name}/SKILL.md` : `${name}.md`);
      let header = "";
      if (harness !== "agy") {
        header = `---\n${nativeSkill ? `name: ${name}\n` : ""}description: ${JSON.stringify(descriptions[name])}\n${harness === "claude" ? "disable-model-invocation: true\n" : ""}---\n\n`;
      }
      const invocation = harness === "agy"
        ? `Manual ${name} prompt for explicit agy --print use; no native command or workflow is registered.`
        : `Native command: ${harness === "codex" ? "$" : "/"}${name}.`;
      let body = `${invocation}

You were explicitly invoked for ${name}. Honor the current request and all safety constraints.
If the request is ambiguous, ask for target and scope before loading either full procedure.
Otherwise, read and follow the corresponding canonical procedure at \`${source.replaceAll("\\", "/")}\`.
`;
      if (name === "server-ops") {
        body += `For authorized writes to 2+ hosts, read and follow ansible-brain at \`${sources["ansible-brain"].replaceAll("\\", "/")}\`; do not substitute a host loop.\n`;
      }
      body += "The source checkout must remain in place; this wrapper does not copy the procedure.\n";
      if (["omp", "pi", "claude"].includes(harness)) body += "\nCurrent request: $ARGUMENTS\n";
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, header + body, { flag: "wx" });
      if (harness === "codex") {
        const agents = join(dirname(path), "agents");
        mkdirSync(agents);
        writeFileSync(join(agents, "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n", { flag: "wx" });
      }
    }
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, tokens } = parseArgs({
      options: { harness: { type: "string" }, out: { type: "string" } },
      allowPositionals: false,
      tokens: true
    });
    if (["harness", "out"].some(name => tokens.filter(token => token.kind === "option" && token.name === name).length !== 1)) {
      throw new Error("Supply --harness and --out exactly once");
    }
    exportCommands(values);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
