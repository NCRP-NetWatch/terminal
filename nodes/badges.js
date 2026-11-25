const RANK_BADGES = new Map([
  ["probationary agent", "probationary-agent"],
  ["agent", "agent"],
  ["senior agent", "senior-agent"],
  ["supervisor", "supervisor"],
  ["section chief", "section-chief"]
]);

const PLACEHOLDER_PATTERN = /\[[^\[\]\r\n]+\]/g;
const BADGE_FILES = new Map();
let manifestPromise;

export function normalizeRank(rank) {
  return String(rank ?? "").trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function getBadgeIdForRank(rank) {
  return RANK_BADGES.get(normalizeRank(rank));
}

export function renderBadgeSvg(svgText, values = {}) {
  return svgText.replace(PLACEHOLDER_PATTERN, (token) => {
    const value = String(values[token] ?? "");
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    })[character]) || token;
  });
}

export function getBadgeFields(svgText) {
  return [...new Set(svgText.match(PLACEHOLDER_PATTERN) ?? [])];
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("./data/badges.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ./data/badges.json (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        manifestPromise = undefined;
        throw error;
      });
  }
  return manifestPromise;
}

export async function loadBadge(id) {
  const item = (await loadManifest()).find((badge) => badge.id === id);
  if (!item) throw new Error(`No badge is configured for ${id}`);

  if (!BADGE_FILES.has(item.file)) {
    BADGE_FILES.set(item.file, fetch(item.file).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${item.file} (${response.status})`);
      return response.text();
    }).catch((error) => {
      BADGE_FILES.delete(item.file);
      throw error;
    }));
  }

  return { ...item, svgText: await BADGE_FILES.get(item.file) };
}

export async function loadBadgeEntries() {
  return Promise.all((await loadManifest()).map(({ id }) => loadBadge(id)));
}
