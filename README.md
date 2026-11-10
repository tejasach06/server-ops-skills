# server-ops-skills

Build and validate `server-ops` for Linux/Proxmox operations and `ansible-brain` for routed multi-host writes.

The objective is efficient, reliable server work. A short prompt is useful only if it preserves safety, coverage, and proof of the result. The skill batches related probes, reuses discovery, limits output at its source, and avoids unnecessary workers and repeated checks.

## Check the package

Use Node.js 22 or newer. There are no npm dependencies to install.

```powershell
npm test
npm run smoke
```

`npm test` checks discoverable frontmatter, size limits, and absence of companion skill or Markdown dependencies. Behavioral tests execute the actual JavaScript from `SKILL.md` against real child processes. They cover bounded log summaries, diagnostic secrecy, expected nonzero statuses, native SMART bit combinations, analyzer-failure isolation, timeouts, and buffer overflow.

The size limits are 220 lines, 16,000 UTF-8 bytes, and a 4,000-token estimate based on characters divided by four. The estimate is not a model tokenizer count or a billing measurement.

`npm run smoke` executes the embedded example against a local log fixture. No remote server is contacted by default.

CI runs on push and manual dispatch only, using the self-hosted Linux runner `vm101-server-ops-skills` in a rootless Podman container on VM101. No hosted or local Windows runners are used. Pull requests do not execute on the persistent self-hosted runner. Native Windows behavior is not verified by this Linux-only CI.

## Exercise SSH without changing a server

After verifying the SSH alias and target scope, run:

```powershell
npm run smoke -- --host <verified-ssh-alias>
```

The optional remote smoke runs only `hostname`, `uname -s`, and `uname -r` through the skill's SSH helper. Existing SSH host-key policy applies. This proves the execution path, not the agent's ability to conduct every audit mode.

## Review before installation

The repository does not install skills, change OMP configuration, uninstall marketplace packages, or publish to GitHub. Each skill's `SKILL.md` is its complete procedure.

1. Review both skill files, including repair authority, backup boundaries, SSH trust, dependency inspection and cleanup limits.
2. Check real homelab cases before cutover:
   - Standalone vs clustered Proxmox: missing `/etc/pve/corosync.conf` is standalone, not a broken cluster.
   - Alpine/OpenRC: use portable `df -P`, `rc-status --all`, and named service status. Verify native status semantics; an empty `rc-status --crashed` returned exit 1 on the tested guest.
   - SMART: preserve native health/history bit combinations without treating command/access failures as readable diagnostics. `ok` means analysis succeeded, not that the disk is healthy.
   - Stale host libraries: check long-lived hypervisor QEMU mappings after host package updates; verify mapped libraries before and after approved guest restarts.
   - Automation scope: inspect full play/import graphs before Ansible runs; `--limit` restricts target hosts, not action scope.
3. When installation is approved, install two sibling directories in the active OMP skill discovery root: this directory as `server-ops`, and `skills/ansible-brain/` separately as `ansible-brain`. Do not rely on discovery recursing into `server-ops/skills/`.
4. Check competing marketplace/router triggers before cutover. Do not leave two procedures eligible and mistake duplicate loading for a result of this skill.
5. Retain the prior installed package until cutover and rollback are clear.

## Compare completed work

For an efficiency claim, capture the same prompt, host state, model, required checks, and tool availability for both procedures. Run each in a separate fresh session and record cache state.

Compare main-agent plus subagent input, output, cache reads, tool calls, turns, elapsed time, retries, failures, and reported evidence. Keep recorded cost separate from an invoice. Repeat matched trials when practical; label single observations as such.

Reject an apparent improvement if the new run skipped required checks, hid errors, weakened safety, or did not verify the outcome. Attribute savings to the skill only with a matched comparison. Historical runs with different hosts, remediation scope, context length, or model routing cannot establish causation.

## Maintain the skills

Edit each skill's `SKILL.md` as its source of operating instructions and tested examples. The root smoke tests exercise `server-ops`; the Ansible suite exercises its local cleanup helper and JSON records. Keep instructions tied to demonstrated risk or repeated waste. Run both package commands before review.

The design uses the existing server router, health/security checklists, and host-maintenance procedures as conceptual templates. Runtime use has no dependency on those marketplace skills. Existing environment-level instructions still apply, so staging this skill alone cannot prevent the host from independently loading another mandated skill.

## Gap-closure evidence

Three added regressions failed before the helper fix and passed afterward: stderr visibility without secret leakage, analyzer failure without losing subsequent probes, and SMART native-status combinations. Existing timeout and overflow checks remain in force. Diagnostics are represented by a character count; raw stderr and exception messages stay inside the sandbox.

Read-only live checks exercised portable disk inspection on Alpine CT112, native SMART exit 32 on Proxmox while retaining pending-sector evidence, and a denied-privilege probe followed by a successful independent probe. Ansible import scope, effective transport trust, and dry-run behavior must be inspected before any tasks execute. The staged skill does not repair the existing controller playbooks.

QEMU stop/start, package upgrades, storage removal, backup restore, and matched efficiency trials remain unexercised. No runtime token or latency savings are claimed.

## Helper skill: ansible-brain

`skills/ansible-brain/SKILL.md` handles multi-host writes routed by `server-ops`. First run asks for a local brain path and a permanent-controller decision; the path needs a user-approved persistent discovery reference, not just a reply. Inspect stored playbooks and their full dependencies before execution. Import/stage only secret-safe copies and explicit reviewed git paths; log failed attempts without promoting them.

Runs require a working temporary venv, Python-compatible pinned dependencies/collections, isolated Ansible paths, and trusted strict SSH checking for every target/jump. Agent forwarding requires a trusted controller and usable agent-only keys. Missing venv support blocks execution without installing system packages.

Remote teardown must explicitly stop owned work, clean target temp paths and close sockets before deleting run directories. The embedded awaited Node helper removes only local files after job settlement; it does not clean remote hosts or handle signals. Disconnects, SIGKILL and power loss can leave state requiring recovery. Git is not a remote-data backup or automatic rollback.

`tests/ansible-brain.test.mjs` executes the shipped helper for sync/async success/failure and pending work, parses concrete JSON/JSONL records, and checks policy separately. `npm test` runs it; these local tests do not prove remote cleanup, forwarding or ProxyJump behavior.
