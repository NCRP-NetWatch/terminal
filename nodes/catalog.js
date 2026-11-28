import {
  hasProfileFlag,
  isAuthorizedRank,
  isProbationaryRank,
  isReadOnlyRank,
  isTraceOnlyRank,
  normalizeRank
} from "./ranks.js";

export const NODE_CATALOG = [
  { id: "command", label: "NODE-0X-COMMAND", title: "Command", description: "Personnel controls, budget ledger, and budget forms." },
  { id: "watchtower", label: "NODE-01-WATCHTOWER", title: "Watchtower", description: "Authoritative record of successful traces and high-priority investigations." },
  { id: "library", label: "NODE-02-LIBRARY", title: "Library", description: "Administrative records, personnel records, access tokens, equipment logs, fines, and acting designations." },
  { id: "schoolhouse", label: "NODE-03-SCHOOLHOUSE", title: "Schoolhouse", description: "Isolated training simulations and compliance exercises." }
];

export function getAllowedNodes(profile) {
  if (!isAuthorizedRank(profile.rank)) return [];
  if (isTraceOnlyRank(profile.rank)) {
    return NODE_CATALOG.filter((node) => node.id === "watchtower");
  }
  if (isProbationaryRank(profile.rank)) {
    return NODE_CATALOG.filter((node) => ["watchtower", "library", "schoolhouse"].includes(node.id));
  }
  if (normalizeRank(profile.rank) === "ncpd command") return NODE_CATALOG;
  return NODE_CATALOG.filter((node) => node.id !== "command"
    || hasProfileFlag(profile, "COMMAND")
    || hasProfileFlag(profile, "FINANCE")
    || !isReadOnlyRank(profile.rank));
}
