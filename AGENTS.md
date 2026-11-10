# Repository Guidelines

## Project Overview

This repo builds and validates two OMP skills: `server-ops` (`SKILL.md`) for Linux/Proxmox operations, and `ansible-brain` (`skills/ansible-brain/SKILL.md`) for routed multi-host writes. Both Markdown files are shipped procedures with embedded examples tested from source. The repo does not install skills, change OMP config, or publish anything (see `README.md`, "Review before installation").

## Architecture & Data Flow

- `SKILL.md` is the source of truth for `server-ops`. It holds exactly one fenced ```` ```javascript ```` block defining `ssh`, `emit`, and `logEvidence`, run inside `ctx_execute`.
- `scripts/skill-example.mjs` → `loadExample(log)`:
  1. Reads `SKILL.md`.
  2. Regex-extracts the single `javascript` fence. It throws if the count is not 1.
  3. Evaluates the fence with `node:vm` `runInNewContext`. Only `require` and `console.log` (routed to `log`) are injected. Timeout is 1000 ms.
  4. Returns `{ ssh, emit, logEvidence }`.
- The server-ops behavior tests and smoke script call `loadExample`, so they exercise shipped code, never a copy.
- `skills/ansible-brain/SKILL.md` is the source of truth for Ansible storage/run guidance. `tests/ansible-brain.test.mjs` evaluates its actual local cleanup helper and parses its JSON/JSONL examples. That helper does not perform remote cleanup or handle signals; policy checks are secondary to behavior tests.
- Helper contract (do not break; tests assert it):
  - `ssh(host, cmd, timeout=30_000)` calls `spawnSync("ssh", ["-o","BatchMode=yes","-o","ConnectTimeout=10","--",host,cmd])`. `maxBuffer` is 8 MiB.
  - `emit(check, result, analyze, accepted=[0])` prints one JSON line: `{check, exit, signal, error, complete, ok, stderrChars, evidence}`.
    - `ok` means execution and analysis succeeded. It does not mean the host is healthy.
    - Evidence is computed only when `ok`.
    - A thrown analyzer produces `error: "ANALYZE_ERROR"`.
    - Raw stderr and exception text never leave the sandbox. Only `stderrChars` is reported.
  - `logEvidence(text)` returns `{scanned, patternMatches: {oom, storage, failure}}`. These are counts only. No raw lines are returned.

## Key Directories

- `/` holds `SKILL.md` (`server-ops`), `README.md` (maintainer docs and validation evidence), and `package.json`.
- `skills/ansible-brain/` holds the self-contained Ansible helper skill.
- `scripts/` holds `skill-example.mjs`, the loader for the embedded example.
- `tests/` holds the `*.test.mjs` suites (`node:test`) and `smoke-context-summary.mjs`, a standalone smoke script that is not run by `npm test`.
- `.github/workflows/check.yml` is the CI config.

## Development Commands

```powershell
npm test                                         # node --test tests/*.test.mjs
npm run smoke                                    # local log fixture; no network
npm run smoke -- --host <verified-ssh-alias>     # optional read-only remote: hostname, uname -s, uname -r
node --test tests/validate-skill.test.mjs        # single suite
```

There is no build step, no lint or format tooling, and no npm install, because the package has zero dependencies.

## Code Conventions & Common Patterns

- Use ESM only (`"type": "module"`, `.mjs`) and `node:`-prefixed built-ins. Do not add dependencies.
- Resolve paths with `new URL("../SKILL.md", import.meta.url)`, not `process.cwd()`. This keeps paths correct on both Windows and Linux.
- Normalize `\r\n` → `\n` before measuring or parsing `SKILL.md`. CI runs on Windows.
- Child-process fixtures use `spawnSync(process.execPath, ["-e", code], {encoding:"utf8", timeout:5000})` (see `child()` in `tests/smoke-context-summary.test.mjs`).
- Every exit-status check is explicit. An empty or unrecognized output is not healthy. Timeouts, buffer overflow, and a `null` status set `complete: false`.
- Fixtures plant secrets such as `fixture-secret` and `user:pass`. Tests then assert that the secrets are absent from emitted JSON. Keep this check in any new behavior test.
- `SKILL.md` writing style: terse imperative rules, with sections under `##`/`###` (Scope and safety → Select work → Execute efficiently → Discover once → Health/Security/Network/Proxmox → Maintain and verify → Report and stop). Add an instruction only when it is tied to a demonstrated operational risk or to repeated waste (`README.md`, "Maintain the skill").
- Commits use short, single-line, capitalized imperative subjects. Some use a Conventional Commits prefix (`fix(invariants): ...`).

## Important Files

- `SKILL.md`: frontmatter `name: server-ops` plus a `description` trigger. The embedded JS helper is at about lines 53–96.
- `scripts/skill-example.mjs`: the loader used by server-ops behavior tests and smoke.
- `tests/validate-skill.test.mjs`: structural invariants (listed below).
- `tests/smoke-context-summary.test.mjs`: behavior tests covering log triage, failed status, custom accepted status, timeout, overflow, stderr secrecy, analyzer-failure isolation, and SMART bit combinations.
- `tests/smoke-context-summary.mjs`: the smoke CLI (`--host SSH_ALIAS` is the only accepted argument).

## Runtime/Tooling Preferences

- Node `>=22` (`engines`). CI runs Node 22 on a self-hosted Linux runner (VM101) and runs `npm test` then `npm run smoke`. Windows is not in CI; `node --test tests/*.test.mjs` needs Node 22 for glob expansion under `cmd.exe`.
- npm is the script runner only. There is no lockfile and none is needed.
- The skill targets OMP with Context-Mode (`ctx_execute`). On Windows, `spawnSync` must invoke binaries directly with a local `cwd`.

## Testing & QA

- The framework is `node:test` with `node:assert/strict`. No coverage tool is configured. The expectation is that every behavior of the helpers has a test.
- Hard invariants on `SKILL.md` (`tests/validate-skill.test.mjs`). Exceeding any of these fails CI:
  - The frontmatter parses as `key: value` lines.
  - `name` equals `server-ops`.
  - `description` is non-empty and at most 220 characters.
  - `disable-model-invocation` is not `true`.
  - The file is at most **220 lines**, **16,000 UTF-8 bytes**, and **4,000 estimated tokens** (chars/4).
  - There are no `skill://` references and no links to `.md` files or `references/`/`docs/` paths. The skill must stay self-contained.
- Each skill contains exactly one ```` ```javascript ```` fence. The root loader reads only `SKILL.md`; the Ansible tests read only `skills/ansible-brain/SKILL.md`. Do not label extra snippets `javascript` to evade the loader's count.
- When changing the server-ops helper, update `tests/smoke-context-summary.test.mjs` and `tests/smoke-context-summary.mjs`. For Ansible cleanup/schema changes, update `tests/ansible-brain.test.mjs`; exercise synchronous/asynchronous success/failure and parse records, not just policy phrases.
- Run both `npm test` and `npm run smoke` before review.

## Agent skills

### Issue tracker

GitHub Issues in `tejasach06/server-ops-skills`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Agent tooling

- **context-mode**: For commands or files with large output (logs, test/build output, big JSON, long files), use `ctx_execute`/`ctx_search` and print only the answer. Do not dump raw output into the conversation.
- **context7**: For library/framework/API docs, call `mcp__context7_resolve_library_id` then `mcp__context7_query_docs` instead of relying on memory.
- **ponytail**: Write the smallest complete change. Reuse existing code and built-ins first, add no unrequested features or dependencies, and add a small check for non-trivial logic.

## Recommended skills

The products are two Markdown agent skills validated by Node `node:test` suites. Pick skills by task:

| Task | Skill |
| --- | --- |
| Edit `SKILL.md` or `AGENTS.md` (agent-facing docs) | `writing-for-agents` |
| Edit `README.md` or other maintainer docs | `technical-writing`, then `unslop` |
| Add or change tests in `tests/` | `tdd` |
| Failing CI, test or smoke script | `diagnosing-bugs` |
| Check a change against repo standards before merge | `code-review`, `blast-radius` |
| Validate server-ops guidance (Linux, networking, nginx, SSH hardening) | `sysadmin`, `linux-networking`, `nginx`, `heinzel-security` |
| Triage issues | `triage` |
| Resolve terms and decisions | `domain-modeling`, `grill-with-docs` |

Skip TypeScript, UI and PR-description skills: the repo has none of those artifacts.

## Two skills

- `SKILL.md` is `server-ops`. `skills/ansible-brain/SKILL.md` is the helper for multi-host Ansible writes. Each skill has its own size limits, checked in `tests/`.
- `server-ops` may name `ansible-brain` in plain text. Do not add `skill://` links or Markdown links between the two.
