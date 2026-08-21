/**
 * Heuristic denylist for Bash commands that must be confirmed by the owner
 * via Telegram before the agent is allowed to run them. This is a safety
 * net, not a sandbox — anything not matched here runs automatically.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\b[^|;&\n]*(-[a-z]*r[a-z]*f[a-z]*\b|-[a-z]*f[a-z]*r[a-z]*\b|--recursive)[^|;&\n]*--force|--force[^|;&\n]*--recursive/i,
  /\brm\b[^|;&\n]*(-[a-z]*r|--recursive)/i,
  /\bgit\s+push\b[^|;&\n]*(--force|-f\b|--force-with-lease)/i,
  /\bsudo\b/i,
  /\bdd\s+if=/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bshutdown\b|\breboot\b|\bhalt\b|\binit\s+0\b/i,
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bchown\s+-R\b/i,
  /\bcrontab\s+-r\b/i,
  /\bkill\s+-9\s+1\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bstripe\b|\bpaypal\b|\bwire\s+transfer\b|\bbank\s+transfer\b/i,
];

export function isDangerousBashCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}
