# server-ops-skills

Build and validate the staged `server-ops` skill for Linux and Proxmox operations.

The objective is efficient, reliable server work. A short prompt is useful only if it preserves safety, coverage, and proof of the result. The skill batches related probes, reuses discovery, limits output at its source, and avoids unnecessary workers and repeated checks.

## Check the package

Use Node.js 20 or newer. There are no npm dependencies to install.

```powershell
npm test
npm run smoke
```

`npm test` checks discoverable frontmatter, size limits, and absence of companion skill or Markdown dependencies. Behavioral tests extract the actual JavaScript example from `SKILL.md` and run it against real child processes. They cover large-log summarization, secret exclusion by field selection, command failures, expected nonzero status, timeout, and buffer overflow.

The size limits are 220 lines, 16,000 UTF-8 bytes, and a 4,000-token estimate based on characters divided by four. The estimate is not a model tokenizer count or a billing measurement.

`npm run smoke` executes the embedded example against a local log fixture. No remote server is contacted by default.

## Exercise SSH without changing a server

After verifying the SSH alias and target scope, run:

```powershell
npm run smoke -- --host <verified-ssh-alias>
```

The optional remote smoke runs only `hostname`, `uname -s`, and `uname -r` through the skill's SSH helper. Existing SSH host-key policy applies. This proves the execution path, not the agent's ability to conduct every audit mode.

## Review before installation

The repository does not install skills, change OMP configuration, uninstall marketplace packages, or publish to GitHub. `SKILL.md` is the complete agent procedure. README, test, and script files are development tools, not runtime reference hops.

1. Review `SKILL.md`, especially repair authority, backup handling, and network access safeguards.
2. Validate actual host audits against an explicit acceptance checklist. Include unavailable tools, absent privilege, a failed service, and standalone versus clustered Proxmox nodes.
3. When installation is approved, copy or link this directory as `server-ops` in the active OMP skill discovery location.
4. Check competing marketplace/router triggers before cutover. Do not leave two procedures eligible and mistake duplicate loading for a result of this skill.
5. Retain the prior installed package until the approved cutover and rollback plan are clear. Nothing in this staged repository changes that package.

## Compare completed work

For an efficiency claim, capture the same prompt, host state, model, required checks, and tool availability for both procedures. Run each in a separate fresh session and record cache state.

Compare main-agent plus subagent input, output, cache reads, tool calls, turns, elapsed time, retries, failures, and reported evidence. Keep recorded cost separate from an invoice. Repeat matched trials when practical; label single observations as such.

Reject an apparent improvement if the new run skipped required checks, hid errors, weakened safety, or did not verify the outcome. Attribute savings to the skill only with a matched comparison. Historical runs with different hosts, remediation scope, context length, or model routing cannot establish causation.

## Maintain the skill

Edit `SKILL.md` as the single source of operating instructions. Its embedded example is also the source used by the smoke and behavior tests. Keep new instructions tied to a demonstrated operational risk or repeated waste. Run both package commands before review.

The design uses the existing server router, health/security checklists, and host-maintenance procedures as conceptual templates. Runtime use has no dependency on those marketplace skills. Existing environment-level instructions still apply, so staging this skill alone cannot prevent the host from independently loading another mandated skill.
