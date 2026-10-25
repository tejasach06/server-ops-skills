---
name: server-ops
description: Audit, diagnose, or maintain Linux and Proxmox servers. Use for host health, security, networking, packages, containers, storage, backups, and guest operations.
---

# Server operations

Optimize for a verified result with few useful round trips. Keep audits read-only, batch related probes, and follow evidence. This is the complete skill; no companion skill or reference reads are needed.

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

Keep one-host work inline. Delegate only two independent substantial slices or a large read set that would crowd context. Give workers disjoint ownership and verified facts, without repeated discovery or skill reads. Keep shared mutations with one owner.

## Execute efficiently

1. Discover OS, tools, privilege, services, and interfaces once. Reuse the facts.
2. Batch related read-only probes with a status for each; run independent probes concurrently when useful. An unframed `a; b` sequence reports only the last status. Use separate captures or explicit per-probe status markers.
3. Parse complete captures inside Context-Mode. Emit decision fields, not raw dumps or response metadata wrappers.
4. Follow up only on findings, incomplete evidence, or unmet acceptance conditions.
5. Reuse the helper below; read tool schemas only when the calling convention is unknown.

Use this JavaScript inside `ctx_execute`. Raw bytes stay in the sandbox. `ok` means execution and analysis succeeded, not that the host is healthy. Log patterns are triage counts, not diagnoses.

```javascript
const { spawnSync } = require("node:child_process");

function ssh(host, command, timeout = 30_000) {
  return spawnSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "--", host, command
  ], { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
}

function emit(check, result, analyze, accepted = [0]) {
  const complete = !result.error && result.status !== null;
  let ok = false, evidence = null, error = result.error?.code || null;
  try {
    ok = complete && (typeof accepted === "function"
      ? accepted(result.status) : accepted.includes(result.status));
    if (ok) evidence = analyze(result.stdout || "");
  } catch {
    ok = false;
    error = "ANALYZE_ERROR";
  }
  console.log(JSON.stringify({
    check, exit: result.status, signal: result.signal || null,
    error, complete, ok, stderrChars: (result.stderr || "").length, evidence
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

Pass a whitelisting analyzer to `emit`, or `logEvidence` for log counts. When `stderrChars` is nonzero, inspect stderr inside the sandbox and classify warnings or limited visibility before concluding; raw diagnostics and exception text can contain secrets. Empty or unrecognized output is not healthy. After timeout, overflow, or analysis failure, narrow that probe and finish unaffected checks.

On Windows, invoke binaries directly and pass local `cwd` to `spawnSync`; Context-Mode's `cwd` applies to shell mode. Launch success does not prove remote success.

## Discover once

Batch hostname, `/etc/os-release`, `id`, `sudo -n true`, interface addresses, routes, uptime, init system, and available package, firewall, and container tools. Preserve the sudo probe's own exit status. Detect Proxmox via `pveversion`; virtualization alone does not establish a Proxmox node.

Use `BatchMode=yes` and the configured SSH trust policy. Do not disable host-key checks. If privilege is unavailable, complete unprivileged checks and name precisely what remains unverified. Do not install audit utilities or refresh package metadata during an audit.

## Health

- Resources: use portable `df -P`; inspect native options before excluding virtual filesystems. BusyBox lacks GNU `df -x`; filter using available mount metadata instead. Inspect `free` flags or `/proc/meminfo`. Disk use >85% is WARN, >95% CRITICAL; available memory <10%, swap >50%, or 15-minute load above CPU count is WARN, subject to workload context.
- Services: inspect failed units, restart history, actual endpoints, and dependencies. On systemd use `systemctl`/`journalctl`; on OpenRC use `rc-status --all`, inspect crashed service markers, and query `rc-service <name> status`. Discover syslog files or `logread` if available. Verify native exit semantics. Probe dependencies using the application's runtime and trust store.
- Containers: use the service-owning account and engine. Whitelist name, image digest/version, state, healthcheck state, restarts, OOM state, resource limits, privilege, network mode, and mount metadata. Missing healthchecks are not an outage. Rootless container root is not host root.
- Logs: read retained kernel and relevant service errors once, using the host's logger. Preserve event context and retention limits. `maxTimeout` is not a timeout event.
- Hardware: read SMART and temperatures when tools exist; distinguish cumulative errors from current faults. Decode `smartctl`'s exit bitmask. To retain readable diagnostics, pass `code => code >= 0 && code <= 255 && (code & 7) === 0` to `emit`; bits 0–2 mean command/access/data errors, bits 3–7 health/history findings. Preserve the native code, assess attributes, and never equate parsed evidence with a healthy disk. Vendor raw values need vendor interpretation.
- Time and kernel: use the installed time client and compare running/installed kernels. Check stale service and affected long-lived QEMU mappings after host-library updates, mapping each PID to its guest. A reboot inside a guest need not replace its host process; obtain approval for a required stop/start and verify mappings afterward. Report failed helpers as unknown.
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

Discover backup jobs, destinations, completed sets, last success, coverage, and retention tiers. Check configured daily, weekly, and monthly tiers independently against their schedules. A fresh file or successful timer is not recovery proof.

Verify checksum or archive structure only when safe; preserve restore-test status separately. Mark off-host, full-host, offline, and immutable coverage unknown unless observed. Do not trigger backups, restores, scrubs, or write-based tests during an audit.

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

Inspect applicable filesystem, thin-pool, ZFS, SMART, replication, and backup evidence. For affected guests inspect state, locks, task results, and dependencies. Whitelist configuration; cloud-init and storage values can contain credentials.

Before maintenance, check quorum, storage, backups, active migrations/replication, and workloads. Simulate packages; verify affected guests afterward. Ask before node reboot and verify return, storage, quorum, and kernel. Before destructive storage/guest work, map volume → physical devices → guest attachments/mounts/users and require approval plus recovery evidence. For failing sources, avoid automatic mounts, journal replay, repair, or heavy reads; preserve originals until recovery acceptance.

## Maintain and verify

1. State the change, invariant, rollback, baseline, and configuration owner.
2. Inspect the complete play/import graph and `--list-hosts` before selecting existing Ansible automation. A host limit does not constrain action scope; choose security-only tasks for security-only requests.
3. Before simulation inspect effective inventory, target owner/UID/user-manager access, and controller-to-target host-key policy. Review skipped discovery, shell/command tasks, and forced `check_mode: false` tasks; only verified read-only discovery may run during an audit. Then syntax-check and use targeted `--check --diff` only where safe and meaningful, with sensitive diffs suppressed.
4. Preserve unversioned state or atomic rollback. Apply only the named scope; require `failed=0`, `unreachable=0`. For database/container upgrades, validate a consistent staged backup and retain compatible image/config/data rollback. Do not copy a live SQLite main file alone or prune rollback images prematurely.
5. Exercise the changed path and unrelated critical services. Process state, a play recap, or a checksum alone does not prove application behavior or recoverability.

Use graceful service operations and specific PIDs. Do not run blanket process-name termination against the session host. Recheck mutated state once; repeat further only if the result is uncertain or failed.

## Report and stop

Lead with conclusion, target/OS, scope, and read-only/change status. Group findings by CRITICAL, WARN, INFO; give evidence, consequence, and the smallest fix. Include healthy checks, behavioral verification, rollback state, and missing coverage. State evidence once.

Stop when the requested checks or repair acceptance conditions are satisfied. Keep investigation separate from remediation. Do not create audit files, log entries, memory records, or follow-up work unless requested or required by the environment.

## Evaluate efficiency

Compare matched requests and coverage using recorded main-agent plus worker input, cache reads, output, turns, calls, elapsed time, retries, failures, and cost basis. State model, cache, host-state, and scope differences. File-size estimates are not billing or runtime savings; causal claims need a matched control.
