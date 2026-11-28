export function escapeDiscordText(value, maxLength = 120, useEllipsis = false) {
  const clean = String(value ?? "")
    .replace(/@/g, "＠")
    .replace(/[\\`*_{}\[\]()<>#+\-.!|~]/g, "\\$&")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  if (!useEllipsis || clean.length <= maxLength) return clean.slice(0, maxLength);
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
