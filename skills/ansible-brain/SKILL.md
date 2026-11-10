---
name: ansible-brain
description: Reuse or write Ansible playbooks for multi-host writes. Use only when server-ops routes a 2+ host write here. Keeps an AI-only playbook store in a local brain directory.
---

# Ansible brain

Store playbooks, roles and inventories in a local, AI-only brain. Reuse a stored playbook with changed variables before writing a new one. Never record secrets. The brain is never read by humans, so keep entries terse and structured.

## Setup (first run only)

1. Ask the user for the brain path. Do not guess it. Record it in the reply, then reuse it.
2. Create the layout if missing: `SCHEMA.md`, `index.jsonl`, `log.jsonl`, `playbooks/`, `roles/`, `inventories/`. Run `git init` there.
3. Import existing playbooks from the controller the user names. Copy them; leave originals untouched. Index each one.

## Store format

- `index.jsonl`, one line per entry: `{"id","intent","triggers":[],"vars":{name:default},"check_safe","idempotent","destructive","distros":[],"last":{"date","result","hosts":[aliases]}}`.
- Playbooks and roles live as files under `playbooks/` and `roles/`. Inventories hold SSH aliases and group names only, never IPs or hostnames.
- `log.jsonl`: append-only; one line per run: `{"date","id","hosts":[aliases],"result","failures","fix"}`.
- `SCHEMA.md`: the rules above, plus this skill's rules, so future sessions read one file.

## Find and reuse

1. Read `index.jsonl` only. Match on `intent` and `triggers`.
2. Best match with changed variables: copy the playbook into the run directory, set variables, run.
3. Playbook must change: adapt it, then save as a new git commit. Keep the old version in history.
4. Destructive entries (delete, remove, overwrite): show the plan and ask before the first run.

## Save rule

Save only after `ansible-playbook --syntax-check`, `--check --diff` and a real run all succeed. Add the entry to `index.jsonl`, the file to `playbooks/` or `roles/`, and one line to `log.jsonl`. Commit.

## Run on a master

Use this when server-ops routes a 2+ host write here.

1. Pick the master: the server that reaches every target. Probe candidates with `ssh -o BatchMode=yes`. Ask the user if the choice is ambiguous. If the user names a permanent controller, record it in `SCHEMA.md` and use it next time.
2. Create a temp directory on the master. Create a venv inside it. Check `python3 -m venv` first; if it fails, report it and stop. Do not install system packages. Run `pip install ansible-core`. Write a minimal `ansible.cfg` in the temp directory and export `ANSIBLE_CONFIG` and `ANSIBLE_HOME` to it; the master's own config can name plugins the venv lacks and fail the run.
3. Aliases from the user's SSH config may not exist on the master. Generate a temp `sshcfg` from local `ssh -G <alias>` (HostName, User, Port, ProxyJump only), and set `ssh_args` in the temp `ansible.cfg` to `-F` that file, `-o UserKnownHostsFile=` a temp copy of the master's `known_hosts` (host-key checks stay on), and `ControlPath=` in the temp dir. Copy the playbook and the alias-only inventory there. Use `ssh -A` (agent forwarding). Never copy a private key to the master.
4. Run `--syntax-check`, then `--check --diff`, then the real run. Use `timeout: 0` for long runs and do not poll.
5. Cleanup runs in a `finally`, even on failure or interrupt. Use the helper below.
6. Log the run here, then save if the save rule passes.

```javascript
const { rmSync } = require("node:fs");

function withCleanup(tempDir, job) {
  try {
    return job();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
```

Cleanup removes the temp directory. It does not remove the `auth.log`, `lastlog` and journal records written by logins. Nothing else to remove: `known_hosts` and sockets live in the temp directory. Never delete audit logs.

## Limits

- The master needs Python 3 with venv and PyPI access or a mirror.
- Agent forwarding exposes the user's keys to root on the master while the run lasts.
- Adapted variants accumulate in git. Nothing prunes them.
