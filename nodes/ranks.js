const RANKS = new Map([
  ["section chief", { badgeId: "section-chief", level: 6 }],
  ["supervisor", { badgeId: "supervisor", level: 5 }],
  ["senior agent", { badgeId: "senior-agent", level: 4 }],
  ["agent", { badgeId: "agent", level: 3 }],
  ["probationary agent", { badgeId: "probationary-agent", level: 2 }],
  ["ncrp staff", { badgeId: null, level: 1 }],
  ["ncpd command", { badgeId: null, level: 0 }],
  ["ncpd detective", { badgeId: null, level: 0 }]
]);

export const RANK_LABELS = [...RANKS.keys()].map((rank) =>
  formatRank(rank)
);

export function normalizeRank(rank) {
  return String(rank ?? "").trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function getBadgeIdForRank(rank) {
  return RANKS.get(normalizeRank(rank))?.badgeId;
}

export function getRankLevel(rank) {
  const normalized = normalizeRank(rank);
  if (!normalized) return 0;
  return RANKS.get(normalized)?.level ?? -1;
}

export function isAuthorizedRank(rank) {
  return RANKS.has(normalizeRank(rank));
}

export function hasProfileFlag(profile, flag) {
  return Array.isArray(profile?.flags) && profile.flags.includes(flag);
}

export function isReadOnlyRank(rank) {
  return ["ncpd command", "ncpd detective"].includes(normalizeRank(rank));
}

export function isTraceOnlyRank(rank) {
  return normalizeRank(rank) === "ncpd detective";
}

export function formatRank(rank) {
  const normalized = normalizeRank(rank);
  if (normalized === "ncrp staff") return "NCRP Staff";
  if (normalized === "ncpd command") return "NCPD Command";
  if (normalized === "ncpd detective") return "NCPD Detective";
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}
