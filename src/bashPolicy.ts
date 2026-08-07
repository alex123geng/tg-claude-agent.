interface DangerRule {
  label: string;
  pattern: RegExp;
}

// Anything matching one of these needs an explicit "Разрешить" tap from the
// owner via Telegram inline buttons. Everything else auto-runs. This is a
// blocklist, not a sandbox — it catches obviously destructive/irreversible
// commands, not a hostile actor.
const DANGER_RULES: DangerRule[] = [
  { label: 'rm -rf / recursive force delete', pattern: /\brm\s+(-\w*[rf]\w*\s+)*-\w*[rf]\w*\b/i },
  { label: 'git push --force', pattern: /\bgit\s+push\b.*(--force|-f)\b/i },
  { label: 'git reset --hard', pattern: /\bgit\s+reset\s+--hard\b/i },
  { label: 'git clean -f', pattern: /\bgit\s+clean\b.*-\w*f/i },
  { label: 'sudo', pattern: /\bsudo\b/i },
  { label: 'dd (raw disk write)', pattern: /\bdd\s+if=/i },
  { label: 'mkfs (format filesystem)', pattern: /\bmkfs(\.\w+)?\b/i },
  { label: 'disk partitioning', pattern: /\b(fdisk|parted|wipefs)\b/i },
  { label: 'shutdown/reboot', pattern: /\b(shutdown|reboot|halt|poweroff)\b/i },
  { label: 'recursive chmod/chown', pattern: /\bch(mod|own)\s+(-\w*[Rr]\w*|--recursive)\b/i },
  { label: 'fork bomb', pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/ },
  { label: 'pipe remote script into shell', pattern: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i },
  { label: 'overwrite a block device', pattern: />\s*\/dev\/(sd|nvme|hd|xvd)\w*/i },
  { label: 'payment / secret credential material', pattern: /\b(stripe|paypal|sk_live_|pk_live_|api[_-]?key|secret[_-]?key|credit[_-]?card|card[_-]?number|iban|swift[_-]?code|wire[_-]?transfer)\b/i },
];

export function findDangerousReason(command: string): string | null {
  for (const rule of DANGER_RULES) {
    if (rule.pattern.test(command)) {
      return rule.label;
    }
  }
  return null;
}
