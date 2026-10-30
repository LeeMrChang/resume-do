#!/usr/bin/env bash
# One-time trusted Mac/Linux terminal setup; no secrets are printed.
set -Eeuo pipefail
umask 077
host=${1:-175.178.194.116}
user=${2:-ubuntu}
port=${3:-22}
repo=LeeMrChang/resume-do
root=/home/ubuntu/resume-do
[[ "$host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || exit 1
[[ "$user" =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 1
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port > 0 && 10#$port <= 65535)) || exit 1
cd "$(dirname "$0")/.."
for tool in gh ssh scp ssh-keygen python3; do command -v "$tool" >/dev/null; done
gh auth status --hostname github.com
[[ "$(gh api "repos/$repo" --jq '.permissions.admin')" == true ]] || { echo 'GitHub repository admin permission required' >&2; exit 1; }
scratch=$(mktemp -d "${TMPDIR:-/tmp}/resume-do-cicd.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
known_name=$host
[[ "$port" == 22 ]] || known_name="[$host]:$port"
ssh-keygen -F "$known_name" -f "$HOME/.ssh/known_hosts" > "$scratch/known_hosts"
test -s "$scratch/known_hosts" || { echo 'Connect manually and verify the server fingerprint first.' >&2; exit 1; }
options=(-p "$port" -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$scratch/known_hosts" -o ConnectTimeout=10)
remote="$user@$host"
# The existing account may prompt for its SSH password; this script never reads it.
ssh "${options[@]}" "$remote" "bash -s -- '$root'" < scripts/bootstrap-cloud.sh
ssh-keygen -q -t ed25519 -N '' -C "resume-do-actions-$(date -u +%Y%m%dT%H%M%SZ)" -f "$scratch/key"
printf 'no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty %s\n' "$(cat "$scratch/key.pub")" > "$scratch/authorized_key"
ssh "${options[@]}" "$remote" \
  'umask 077; mkdir -p ~/.ssh; chmod 700 ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys' < "$scratch/authorized_key"
ssh "${options[@]}" -i "$scratch/key" -o IdentitiesOnly=yes -o BatchMode=yes "$remote" 'true'
gh secret set RESUME_DO_DEPLOY_HOST --repo "$repo" --body "$host"
gh secret set RESUME_DO_DEPLOY_USER --repo "$repo" --body "$user"
gh secret set RESUME_DO_DEPLOY_PORT --repo "$repo" --body "$port"
gh secret set RESUME_DO_DEPLOY_KNOWN_HOSTS --repo "$repo" < "$scratch/known_hosts"
gh secret set RESUME_DO_DEPLOY_SSH_KEY --repo "$repo" < "$scratch/key"
echo 'Resume Do SSH and GitHub Secrets configured. Existing cost credentials were not reused.'
echo 'After pushing this workflow to main: gh workflow run ci-cd.yml --repo LeeMrChang/resume-do --ref main'
