---
name: server-ops
description: Audit, diagnose, or maintain Linux and Proxmox servers. Use for host health, security, networking, packages, containers, storage, backups, and guest operations.
---

# Server operations

Optimize for a verified result with the fewest useful round trips. Keep audits read-only, batch related probes, and investigate only the branches supported by evidence. This file is the complete skill; load no companion skills or reference documents for its procedures.

## Scope and safety

- Resolve targets from the configured memory interface, SSH config, or inventory. Verify live identity, OS, access, and privilege before relying on remembered facts.
- An audit authorizes inspection, not repairs. A request to fix authorizes the named repair. Ask before destructive actions, reboots, or changes with unclear scope.
- Preserve access, unrelated services, and recovery paths. Do not weaken SSH, TLS verification, SELinux, AppArmor, or a firewall to make a check pass.
- Use Context-Mode for uncertain or large output. Keep credentials, hashes, environment dumps, private keys, and full application configuration out of returned text.
- Use existing Ansible automation for repeatable changes. Do not hardcode homelab addresses, credentials, controller paths, or service lists in this skill.

## Select work

| Request | Work |
|---|---|
| Quick check or specific failure | Verify the symptom, trace the owning layer, stop at a proven cause or verified repair. |
| Health check | Resources, services, updates, retained errors, backups. |
| Security audit | Effective authentication, privileges, firewall path, listeners, confinement, sensitive permissions. |
| Broad host audit | Health and security. Add Proxmox checks only on a detected Proxmox node. |
| Network failure | DNS, routes, firewall, listener, application, dependencies. |
| Maintenance | Baseline, recovery plan, targeted dry run, apply, behavioral verification. |

Run one-host work inline by default. Delegate only when at least two independent substantial slices justify separate startup contexts, or a large read set would crowd the main context. Give workers disjoint ownership and already-verified facts. Do not make each worker repeat discovery or load this skill again. Keep shared mutations with one owner.

## Execute efficiently

1. Discover once. Capture OS, tools, privilege, active services, and interfaces together. Carry those facts into later checks.
2. Batch related read-only probes, with an exit status for each. Independent probes may run concurrently. Avoid one failing shell command hiding the rest.
3. Parse complete captured output inside Context-Mode. Emit only the fields needed for the decision. Do not print raw journals, package tables, container inspections, or whole tool-response envelopes.
4. Follow up only on a finding, incomplete capture, or unresolved acceptance condition. Do not rerun a successful probe for reassurance.
5. Reuse the bounded pattern below. Change the target and probe, not the execution mechanism. Inspect host-tool schemas only when the calling convention is unknown. Read a response's text field, not duplicate metadata wrappers.

Use this JavaScript inside `ctx_execute`. The helper retains raw bytes only in the sandbox. `emit` refuses to present failed or truncated capture as a successful check. Log matching is a triage count, not a diagnosis; it emits no raw log messages.

```javascript
const { spawnSync } = require("node:child_process");

function ssh(host, command, timeout = 30_000) {
  return spawnSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "--", host, command
  ], { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
}

function emit(check, result, analyze, accepted = [0]) {
  const complete = !result.error && result.status !== null;
  const ok = complete && accepted.includes(result.status);
  console.log(JSON.stringify({
    check, exit: result.status, signal: result.signal || null,
    error: result.error?.code || null, complete, ok,
    evidence: ok ? analyze(result.stdout || "") : null
  }));
}

function logEvidence(text) {
  const patterns = {
    oom: /\b(out of memory|oom-kill|oom-killer|killed process)\b/i,
    storage: /\b(I\/O error|uncorrectable|buffer I\/O|blk_update_request)\b/i,
    failure: /\b(error|failed|fatal|exception)\b/i
  };
  const counts = Object.fromEntries(Object.keys(patterns).map(key => [key, 0]));
  let scanned = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    scanned++;
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(line)) counts[key]++;
    }
  }
  return { scanned, patternMatches: counts };
}
```

Call `emit` with a check-specific analyzer returning whitelisted fields. For journal triage, pass `logEvidence`. Do not pass raw stdout through as evidence. For a necessary log excerpt, select the relevant event and remove credentials, URLs, headers, and personal data first. Unrecognized output is unknown, not healthy. On timeout or buffer overflow, narrow or stream that probe and finish the unaffected checks.

On Windows, invoke executable binaries directly. In Context-Mode JavaScript, pass local `cwd` to `spawnSync`; the tool's `cwd` option applies to its shell mode. A successful launch is not proof that the remote command succeeded.

## Discover once

Batch hostname, `/etc/os-release`, `id`, `sudo -n true`, interface addresses, routes, uptime, init system, and available package, firewall, and container tools. Preserve the sudo probe's own exit status. Detect Proxmox via `pveversion`; virtualization alone does not establish a Proxmox node.

Use `BatchMode=yes` and the configured SSH trust policy. Do not disable host-key checks. If privilege is unavailable, complete unprivileged checks and name precisely what remains unverified. Do not install audit utilities or refresh package metadata during an audit.

## Health

- Resources: use `df -P` excluding virtual and overlay filesystems, `free -b`, `uptime`, and `nproc`. Flag disk use above 85% as WARN, above 95% as CRITICAL; memory available below 10%, swap above 50%, or sustained 15-minute load above CPU count as WARN. Compare against workload context.
- Services: inspect system and relevant user failed units, restart history, and actual application or protocol responses. Distinguish process-running, endpoint-ready, and dependency-working evidence. Probe dependencies from the application's runtime and trust store when host behavior differs.
- Containers: use the service-owning account and engine. Whitelist name, image digest/version, state, healthcheck state, restarts, OOM state, resource limits, privilege, network mode, and mount metadata. Missing healthchecks are not an outage. Rootless container root is not host root.
- Logs: inspect retained kernel errors and relevant service failures once. Count OOM and storage failures; inspect event context before reporting a problem. Record time window and retention gaps. A request field named `maxTimeout` is not a timeout event.
- Hardware: if tools exist, read SMART health, error counters, and current temperatures. Separate cumulative errors from present faults. Vendor raw attributes are not percentages without vendor evidence. Report unavailable checks.
- Time and kernel: check time synchronization and running versus newest installed kernel. Detect stale service code with an available read-only helper; report failed helpers as unknown. Do not restart or reboot during inspection.
- TLS: inspect certificate expiry for discovered TLS services, including application trust failures. Do not bypass verification to claim success.

### Packages

Use existing cache only. Report metadata age and distinguish pending package count, security-tagged packages, and vulnerability count. Verify manager/version flags before use; report unavailable security classification honestly.

| Detected manager | Read-only approach |
|---|---|
| DNF5 | `dnf5 -C -q repoquery --upgrades --latest-limit=1`; add `--security` for security-tagged candidates. |
| DNF4 | `dnf -C -q check-update`; exit 100 means updates exist. Use cached `updateinfo` for advisory classification. |
| APT | `apt-get --simulate upgrade`; analyze candidate origins from existing lists for security classification, not package names alone. |
| Other | Inspect installed manager help for simulation and no-refresh flags. State unsupported coverage rather than inventing equivalents. |

Inspect effective automatic-update configuration and recent successful installation, not only timer enablement. Metadata refresh is not installation. External automation may own patching; do not assume absence from local timers means no managed patch process.

### Backups

Discover jobs, mounts, completed sets, and last successful run. Report data coverage, destination, age against the actual schedule, retention tiers, integrity evidence, and restore-test status. A recent file or successful timer alone does not prove a usable backup. Inspect all configured daily, weekly, and monthly tiers independently.

Verify a checksum or archive readability when safe. Mark full-host coverage, offline copies, and immutable replication unknown unless observed. Do not trigger backup, restore, scrub, or write-based disk tests during an audit.

## Security

- SSH: validate syntax and inspect effective `sshd -T`, including `-C` for the real user/source and applicable Match rules. Check password, keyboard-interactive, root policy, authentication methods, weak algorithms, and PAM lockout. Keep account/session PAM separate from password authentication.
- Privileges: inspect sudo grants, UID 0 accounts, system login shells, and empty password fields by account name/status only. Never emit password hashes. An application owner's unrestricted sudo is a host-account escalation risk, not proof that container execution already grants host root.
- Firewall: identify firewalld, UFW, native nftables, and compatibility layers. Trace hooks, zones, interface/source assignment, and final verdicts. A base `policy accept` can still reject later. Compare runtime and persistent policy and check for competing owners.
- Exposure: map wildcard listeners to processes and firewall allowances. Distinguish loopback, LAN, VPN, and WAN evidence. Verify allowed and disallowed source paths where available. Check protected application endpoints reject unauthenticated requests; public readiness endpoints are not authentication bypasses.
- Confinement: inspect SELinux/AppArmor enforcement and relevant process labels. Check ASLR, forwarding, redirects, protected links, ptrace, dumps, and kernel log/address controls. Explain a concrete risk; do not present optional hardening or platform defaults as established vulnerabilities.
- Files: inspect sensitive ownership/modes, cron paths, and bounded local scans for world-writable system files, unowned files, and SUID/SGID programs. Package ownership is not integrity verification. Preserve real scan failures and coverage exclusions.

## Network and proxy diagnosis

Trace `client -> DNS -> route -> server interface -> firewall -> listener -> application -> dependency`. Use name resolution, `ip route get`, `ss`, effective rules, and protocol probes. Separate refused, timeout, HTTP failure, and TLS failure.

On a proxied workstation, use `curl --noproxy '*'` for a direct LAN test. For reverse proxies, inspect effective configuration and upstream reachability; validate configuration before reload and verify both direct upstream and proxied request afterward. Keep credential-bearing URLs and access logs inside the sandbox.

Before changing network or SSH policy, retain the current session and recovery access. Establish the new allow path before removing the old one. Test a reversible runtime change before persisting it; confirm runtime and persistent state agree afterward.

## Proxmox

Collect bounded `pveversion -v`, `pvesm status`, `qm list`, `pct list`, failed units, and cluster/quorum state when cluster configuration exists. A standalone node without cluster configuration is not a broken cluster.

Inspect applicable filesystem, thin-pool, ZFS, SMART, replication, and backup evidence. For an affected guest, inspect state, lock, task result, resource dependencies, and recovery state. Whitelist guest configuration fields; cloud-init and storage configuration can contain credentials.

Before maintenance, check quorum, storage health, recent backups, active migration/replication, and affected workloads. Simulate the package plan. Ask before node reboot; afterward verify node reachability, quorum where applicable, storage, running kernel, and affected guests. Require explicit approval and a verified recovery path before guest deletion, destructive storage action, or irreversible migration.

## Maintain and verify

1. State the named change, intended invariant, and rollback path. Capture baseline and inspect existing automation/configuration ownership.
2. Prefer the existing Ansible playbook. Verify inventory and privilege, run syntax checking, then targeted `--check --diff`. Protect sensitive diffs; identify tasks that cannot simulate.
3. Preserve unversioned configuration or an atomic rollback. Apply only to the requested host/group. Require Ansible `failed=0` and `unreachable=0`.
4. For database/container upgrades, make a consistent backup and validate staged databases before schema migration. Preserve rollback-compatible image/config/data versions. Never copy a live SQLite main file without its consistency mechanism.
5. Exercise the changed path and inspect errors plus unrelated critical services. A play recap, listener, process state, or checksum is not alone proof of application behavior or recoverability.

Use graceful service operations and specific PIDs. Do not run blanket process-name termination against the session host. Recheck mutated state once; repeat further only if the result is uncertain or failed.

## Report and stop

Lead with the conclusion, target, verified OS, scope, and read-only/change status. Group populated findings by CRITICAL, WARN, and INFO. Each finding needs concrete evidence, consequence, and the smallest fix. Include important healthy checks, behavioral verification, rollback state for changes, and explicit unverified coverage. Avoid repeating the same evidence in several tables.

Stop when the requested checks or repair acceptance conditions are satisfied. Keep investigation separate from remediation. Do not create audit files, log entries, memory records, or follow-up work unless requested or required by the environment.

## Evaluate efficiency

Judge completed work, not prompt length alone. Compare matched requests and coverage with recorded main-agent plus subagent input, cache reads, output, turns, tool calls, elapsed time, retry/failure counts, and cost basis. State model, cache, host-state, and task-scope differences. Character/byte estimates describe this file, not measured billing or proven savings. Without a matched control, causal savings remain unproven.
