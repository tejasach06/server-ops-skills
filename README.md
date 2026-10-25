# server-ops-skills

Build and validate the staged `server-ops` skill for Linux and Proxmox operations.

The objective is efficient, reliable server work. A short prompt is useful only if it preserves safety, coverage, and proof of the result. The skill batches related probes, reuses discovery, limits output at its source, and avoids unnecessary workers and repeated checks.

## Check the package

Use Node.js 20 or newer. There are no npm dependencies to install.

```powershell
npm test
npm run smoke
```

`npm test` checks discoverable frontmatter, size limits, and absence of companion skill or Markdown dependencies. Behavioral tests execute the actual JavaScript from `SKILL.md` against real child processes. They cover bounded log summaries, diagnostic secrecy, expected nonzero statuses, native SMART bit combinations, analyzer-failure isolation, timeouts, and buffer overflow.

The size limits are 220 lines, 16,000 UTF-8 bytes, and a 4,000-token estimate based on characters divided by four. The estimate is not a model tokenizer count or a billing measurement.

`npm run smoke` executes the embedded example against a local log fixture. No remote server is contacted by default.

## Exercise SSH without changing a server

After verifying the SSH alias and target scope, run:

```powershell
npm run smoke -- --host <verified-ssh-alias>
```

The optional remote smoke runs only `hostname`, `uname -s`, and `uname -r` through the skill's SSH helper. Existing SSH host-key policy applies. This proves the execution path, not the agent's ability to conduct every audit mode.

## Review before installation

The repository does not install skills, change OMP configuration, uninstall marketplace packages, or publish to GitHub. `SKILL.md` is the complete agent procedure.

1. Review `SKILL.md`, including repair authority, backup verification boundaries, and network/SSH trust safeguards.
2. Check real homelab cases before cutover:
   - Standalone vs clustered Proxmox: missing `/etc/pve/corosync.conf` is standalone, not a broken cluster.
   - Alpine/OpenRC: use portable `df -P`, `rc-status --all`, and named service status. Verify native status semantics; an empty `rc-status --crashed` returned exit 1 on the tested guest.
   - SMART: preserve native health/history bit combinations without treating command/access failures as readable diagnostics. `ok` means analysis succeeded, not that the disk is healthy.
   - Stale host libraries: check long-lived hypervisor QEMU mappings after host package updates; verify mapped libraries before and after approved guest restarts.
   - Automation scope: inspect full play/import graphs before Ansible runs; `--limit` restricts target hosts, not action scope.
3. When installation is approved, copy or link this directory as `server-ops` in the active OMP skill discovery location.
4. Check competing marketplace/router triggers before cutover. Do not leave two procedures eligible and mistake duplicate loading for a result of this skill.
5. Retain the prior installed package until cutover and rollback are clear.

## Compare completed work

For an efficiency claim, capture the same prompt, host state, model, required checks, and tool availability for both procedures. Run each in a separate fresh session and record cache state.

Compare main-agent plus subagent input, output, cache reads, tool calls, turns, elapsed time, retries, failures, and reported evidence. Keep recorded cost separate from an invoice. Repeat matched trials when practical; label single observations as such.

Reject an apparent improvement if the new run skipped required checks, hid errors, weakened safety, or did not verify the outcome. Attribute savings to the skill only with a matched comparison. Historical runs with different hosts, remediation scope, context length, or model routing cannot establish causation.

## Maintain the skill

Edit `SKILL.md` as the single source of operating instructions. Its embedded example is also the source used by the smoke and behavior tests. Keep new instructions tied to a demonstrated operational risk or repeated waste. Run both package commands before review.

The design uses the existing server router, health/security checklists, and host-maintenance procedures as conceptual templates. Runtime use has no dependency on those marketplace skills. Existing environment-level instructions still apply, so staging this skill alone cannot prevent the host from independently loading another mandated skill.

## Gap-closure evidence

Three added regressions failed before the helper fix and passed afterward: stderr visibility without secret leakage, analyzer failure without losing subsequent probes, and SMART native-status combinations. Existing timeout and overflow checks remain in force. Diagnostics are represented by a character count; raw stderr and exception messages stay inside the sandbox.

Read-only live checks exercised portable disk inspection on Alpine CT112, native SMART exit 32 on Proxmox while retaining pending-sector evidence, and a denied-privilege probe followed by a successful independent probe. Ansible import scope, effective transport trust, and dry-run behavior must be inspected before any tasks execute. The staged skill does not repair the existing controller playbooks.

QEMU stop/start, package upgrades, storage removal, backup restore, and matched efficiency trials remain unexercised. No runtime token or latency savings are claimed.
