---
name: server-ops
description: Audit, diagnose, or maintain Linux and Proxmox servers. Use for host health, security, networking, packages, containers, storage, backups, and guest operations.
---

# Server operations

Optimize for a verified result with few round trips, not fewer safeguards. Keep audits read-only, batch relevant probes, and follow evidence. Complete skill; no companion skill needed.

## Scope and safety

- Resolve targets from the configured memory interface, SSH config, or inventory. Verify live identity, OS, access, and privilege before relying on remembered facts.
- An audit authorizes inspection, not repairs. A request to fix authorizes the named repair. Ask before destructive actions, reboots, or changes with unclear scope.
- Preserve access, unrelated services, and recovery paths. Do not weaken SSH, TLS verification, SELinux, AppArmor, or a firewall to make a check pass.
- Use Context-Mode for uncertain or large output. Keep credentials, hashes, environment dumps, private keys, and full application configuration out of returned text.
- Use existing Ansible automation for repeatable changes. Do not hardcode homelab addresses, credentials, controller paths, or service lists in this skill.
- Preserve unrelated working-tree changes. Never reset or check out files to manufacture a clean tree.

## Clarify the goal first

Before discovery, resolve target, outcome, owning layer, authorized scope/policy, and observable acceptance:

- Ask clarifying questions until no consequential choice depends on guessed intent. Batch unresolved choices with concrete tradeoffs; ask again when an answer or scope correction leaves another choice open.
- Derive addresses, identity, ownership, and tooling from memory/inventory and narrow read-only checks; ask only for intent. Never infer an address from a VM ID.
- Separate guest OS, VM/NIC, hypervisor, and cluster scope. If firewall layer remains unspecified, ask UFW/firewalld versus Proxmox before probing either. A scope correction does not select a layer. A named VM permits no unrelated guest inspection or host/cluster mutation.
- For access policy, obtain the allowed client/network → service matrix. Listening does not authorize global or whole-subnet exposure.
- Briefly restate the goal and exclusions, then act unless new evidence introduces a material choice.
- Once intent is explicit, proceed with targeted discovery; do not re-ask answered questions. Reconcile new findings with the policy before writes.

## Select work

| Request | Work |
|---|---|
| Quick check or specific failure | Verify the symptom, trace the owning layer, stop at a proven cause or verified repair. |
| Health check | Resources, services, updates, retained errors, backups. |
| Security audit | Effective authentication, privileges, firewall path, listeners, confinement, sensitive permissions. |
| Broad host audit | Health and security. Add Proxmox checks only on a detected Proxmox node. |
| Network failure | DNS, routes, firewall, listener, application, dependencies. |
| Maintenance | Baseline, recovery plan, targeted dry run, apply, behavioral verification. |

Keep single-host work inline. Delegate only two independent substantial slices or large read sets. Give workers disjoint ownership and verified facts without repeated discovery. Keep shared mutations with one owner.

## Execute efficiently

1. Discover only the OS, tools, privilege, services, and interfaces required by the resolved goal, once. Reuse facts and earlier probe results; keep a short list of unanswered decision fields.
2. Batch related read-only probes with a status for each; run independent probes concurrently when useful. An unframed `a; b` sequence reports only the last status. Use separate captures or explicit per-probe status markers.
3. Parse complete captures inside Context-Mode. Emit decision fields, not raw dumps or response metadata wrappers.
4. Follow up only on findings, incomplete evidence, or unmet acceptance conditions. Once a decision field is answered, stop searching for it; do not browse histories, unrelated projects, sibling guests, or hardening scripts to infer user intent.
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

Pass a whitelisting analyzer to `emit`, or `logEvidence` for counts. When `stderrChars` > 0, inspect stderr in sandbox and classify warnings before concluding; diagnostics can contain secrets. Empty/unrecognized output is not healthy. On timeout, overflow, or parse failure, narrow that probe and finish unaffected checks.

Do not hand-interpolate multi-line shell/regex code into JSON args for `ctx_execute`; unescaped quotes or newlines cause parse errors. Use single-line commands, stream complex scripts via stdin/heredocs in the sandbox, or use `eval` with JSON serialization.

On Windows, invoke binaries directly with local `cwd` in `spawnSync`; Context-Mode's `cwd` applies to shell mode. Launch success does not prove remote success.
## Discover once

For broad audits, batch hostname, `/etc/os-release`, `id`, `sudo -n true`, interface addresses, routes, uptime, init system, and package/firewall/container tools. For a named repair, collect only the required subset. Preserve sudo probe exit status. Detect Proxmox via `pveversion`; virtualization alone does not make a node Proxmox. For multi-node tasks, inspect configured controller inventory first to establish topology before target probes.

Use `BatchMode=yes` and configured SSH trust. Do not disable host-key checks. If unprivileged, complete available checks and name unverified items precisely. Do not install audit tools or refresh package metadata during audits.

## Health

- Resources: use portable `df -P`; inspect native options before excluding filesystems. Disk >85% is WARN, >95% CRITICAL; available memory <10%, swap >50%, or 15-minute load above CPU count is WARN, subject to workload.
- Services: inspect failed units, restarts, endpoints, and dependencies. Use systemd or OpenRC-native commands and verify their exit semantics. Probe dependencies with the application's runtime and trust store.
- Containers: use the owning account and engine. Inspect identity/version, state/health, restarts/OOM, limits, privilege, network, and mounts. Missing healthchecks are not outages; rootless container root is not host root.
- Logs: read retained kernel and relevant service errors once with event context and retention limits. `maxTimeout` is not a timeout event.
- Hardware: inspect SMART/temperature when available. Decode native `smartctl` bits: pass `code => code >= 0 && code <= 255 && (code & 7) === 0` to `emit`; bits 0–2 are command/access/data errors, 3–7 health/history. Assess attributes; vendor raw values need vendor meaning.
- Time/kernel: compare running and installed kernels. After host-library updates, map stale QEMU process libraries to guests. Guest reboot need not replace its host process; approval is required for stop/start.
- TLS: inspect discovered certificates and application trust failures; never bypass verification as proof.

### Packages

Use cached metadata only; report its age, pending updates, security-tagged candidates, and vulnerabilities separately. Verify supported no-refresh/simulation flags: DNF5 `dnf5 -C -q repoquery --upgrades --latest-limit=1` (`--security` for advisories), DNF4 `dnf -C -q check-update` (100 means updates), APT `apt-get --simulate upgrade` plus candidate origins. State unsupported classification. Inspect effective auto-update policy and recent installs; metadata refresh is not installation.

### Backups

Discover backup jobs, destinations, completed sets, last success, coverage, and each retention tier. Fresh files/timers are not recovery proof. Safely validate checksum/archive structure; report restore-test, off-host, full-host, offline, and immutable coverage separately. Audits do not trigger backups, restores, scrubs, or writes.

## Security

- SSH: validate syntax and effective `sshd -T`, including real-context `-C` Match rules. Check password/keyboard-interactive/root policy, methods, algorithms, and PAM lockout.
- Privileges: inspect sudo, UID 0 accounts, login shells, and empty-password account status without hashes. Unrestricted application-owner sudo is host escalation risk, not proof containers already grant root.
- Firewall: identify firewalld, UFW, nftables, and compatibility layers; trace hooks, assignments, verdicts, persistence, and competing owners. Base `accept` can still reject later.
- Exposure: map wildcard listeners to processes and allowances; distinguish loopback, LAN, VPN, and WAN. Check protected endpoints reject unauthenticated requests.
- Confinement/files: inspect SELinux/AppArmor, relevant labels, material sysctls, sensitive modes, cron paths, and bounded world-writable/unowned/SUID scans. Explain concrete risk; package ownership is not integrity proof.

### Firewall changes

1. Confirm layer and allowed source/service matrix. Inspect relevant listeners, IPv4/IPv6, effective/persistent policy, and competing owners once. Query rootless containers as their owner.
2. Preserve management and dependencies, including dynamic NFS/RPC ports and VPN clients. Determine source after NAT and IPv6 scope; ask before changing exposure. Listening ports are not an allowlist; global admin access or subnet trust requires explicit intent.
3. Before any rule write, capture full prior policy and enablement. Prove independent recovery or arm timed rollback; dry run is not recovery. Restore staged rules as well as runtime/boot state on failure. Cancel rollback only after fresh management and required service checks pass.
4. Activate only the authorized layer. Guest firewalls need no Proxmox mutation. A VM/NIC flag under a disabled cluster firewall is not enforced protection; ask before expanding scope.
5. From an allowed external client, verify fresh SSH and real application requests with proxy bypass, deadlines, and exit codes. Loopback proves the app, not ingress. Test a disallowed source against a known listener when available; otherwise mark blocking untested and inspect effective verdicts. Verify persistence separately.

## Network and proxy diagnosis

Trace `client -> DNS -> route -> server interface -> firewall -> listener -> application -> dependency`. Use name resolution, `ip route get`, `ss`, effective rules, and protocol probes. Separate refused, timeout, HTTP failure, and TLS failure.

On a proxied workstation, use `curl --noproxy '*'` for a direct LAN test. For reverse proxies, inspect effective configuration and upstream reachability; validate configuration before reload and verify both direct upstream and proxied request afterward. Keep credential-bearing URLs and access logs inside the sandbox.

For network/SSH changes, retain the current session and recovery path. Establish new access before removing old access. Prefer reversible runtime trials; when activation persists immediately, protect it with the firewall rollback procedure. Verify runtime and boot policy agree.

## Proxmox

For Proxmox audits, collect bounded version, storage, guest, failure, and applicable quorum state. For named guest work, inspect only that guest and required host prerequisites. Standalone is not broken cluster. Inspect relevant filesystem/thin-pool/ZFS/SMART/replication/backup evidence and guest state/locks/dependencies; whitelist configs.

Before host maintenance, check quorum, storage, backups, migrations, and workloads. Simulate packages. Reboots and required guest stop/start need approval and return-path verification. Before destructive storage work, map volume → devices → attachments and require recovery evidence; avoid mounts, replay, or heavy reads on failing sources.

## Maintain and verify

1. State change, invariant, rollback, baseline, and configuration owner.
2. Before Ansible, inspect play/import graph, `--list-hosts`, inventory, owner/user manager, host-key policy, skipped discovery, shell tasks, and forced `check_mode: false`. Host limits restrict hosts, not actions. During audits run only verified read-only tasks. Syntax-check; use targeted safe `--check --diff`, suppressing secrets.
3. Preserve controller working-tree changes. Edit remote files with anchored operations or verified atomic replacement plus rollback copies.
4. Preserve unversioned state or atomic rollback. Apply only named scope; require `failed=0`, `unreachable=0`; size timeouts to work. For database/container upgrades, validate backups and retain compatible data/images. Never copy only a live SQLite main file.
5. Exercise changed paths and critical services; process state, recaps, and checksums are not behavioral proof. Recheck mutated state once unless uncertain or failed. Use graceful service operations and specific PIDs.

## Report and stop

Lead with conclusion, target/OS, scope, and read-only/change status. Group audit findings by CRITICAL, WARN, INFO; for a named repair give the change and acceptance evidence. Include rollback state and missing coverage. Distinguish running from healthchecked containers, process activity from enforced policy, and observed from inferred results. State evidence once; never claim completion from a tool invocation, placeholder, or malformed response.

Stop when the requested checks or repair acceptance conditions are satisfied. Keep investigation separate from remediation. Do not create audit files, log entries, memory records, or follow-up work unless requested or required by the environment.

## Evaluate efficiency

Compare matched requests using recorded main-agent plus worker input, cache reads, output, turns, calls, elapsed time, retries, failures, and cost. State model, cache, host-state, and scope differences. Causal claims need a matched control.
