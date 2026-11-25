const RANKS = new Map([
  ["section chief", { badgeId: "section-chief" }],
  ["supervisor", { badgeId: "supervisor" }],
  ["senior agent", { badgeId: "senior-agent" }],
  ["agent", { badgeId: "agent" }],
  ["probationary agent", { badgeId: "probationary-agent" }],
  ["ncrp staff", { badgeId: null }]
]);

export function normalizeRank(rank) {
  return String(rank ?? "").trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function getBadgeIdForRank(rank) {
  return RANKS.get(normalizeRank(rank))?.badgeId;
}

export function isAuthorizedRank(rank) {
  return RANKS.has(normalizeRank(rank));
}

export function formatRank(rank) {
  const normalized = normalizeRank(rank);
  if (normalized === "ncrp staff") return "NCRP Staff";
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}
