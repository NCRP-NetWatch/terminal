import { getRankIcon } from "./rank-icons.js";

const PLACEHOLDER_PATTERN = /\[[^\[\]\r\n]+\]/g;
const HTML_ESCAPE_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};
const BADGE_FILES = new Map();
let manifestPromise;
let svgInstanceSequence = 0;

export function renderBadgeSvg(svgText, values = {}) {
  return svgText.replace(PLACEHOLDER_PATTERN, (token) => {
    const value = String(values[token] ?? "");
    return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_ENTITIES[character]) || token;
  });
}

export function namespaceBadgeSvgIds(svgText) {
  const prefix = `badge-${++svgInstanceSequence}-`;
  const idMap = new Map(
    [...svgText.matchAll(/\bid=(['"])([^'"]+)\1/g)]
      .map((match) => [match[2], `${prefix}${match[2]}`])
  );
  if (!idMap.size) return svgText;

  return svgText
    .replace(/\bid=(['"])([^'"]+)\1/g, (match, quote, id) => `id=${quote}${idMap.get(id) ?? id}${quote}`)
    .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (match, quote, id) =>
      `url(${quote}#${idMap.get(id) ?? id}${quote})`)
    .replace(/((?:xlink:)?href\s*=\s*['"])#([^'"]+)(['"])/g, (match, before, id, after) =>
      `${before}#${idMap.get(id) ?? id}${after}`)
    .replace(/\b(aria-labelledby|aria-describedby)\s*=\s*(['"])([^'"]+)\2/g, (match, attribute, quote, ids) =>
      `${attribute}=${quote}${ids.split(/\s+/).map((id) => idMap.get(id) ?? id).join(" ")}${quote}`);
}

export function getBadgeFields(svgText) {
  return [...new Set(svgText.match(PLACEHOLDER_PATTERN) ?? [])]
    .filter((token) => token !== "[NCFO]");
}

const GATEWAY_PALETTE = {
  gold: { accent: "#ffd166", highlight: "#fff0a6" },
  blue: { accent: "#00f2fe", highlight: "#7bf0ff" },
  red: { accent: "#ff4766", highlight: "#ff8fa3" }
};

const RANK_PALETTES = {
  "section-chief": GATEWAY_PALETTE.gold,
  supervisor: GATEWAY_PALETTE.blue,
  "senior-agent": GATEWAY_PALETTE.blue,
  agent: GATEWAY_PALETTE.red,
  "probationary-agent": GATEWAY_PALETTE.red
};

function renderRankBadgeSvg(svgText, item) {
  const palette = RANK_PALETTES[item.iconId];
  if (!palette) throw new Error(`No color palette is configured for ${item.iconId}`);
  svgText = svgText.replaceAll("#RANK_ACCENT#", palette.accent).replaceAll("#RANK_HIGHLIGHT#", palette.highlight);
  const gatewayUrl = new URL("../data/svg/gateway.svg", import.meta.url).href;
  svgText = svgText.replaceAll("GATEWAY_BACKGROUND_URL", gatewayUrl);
  const namedSvg = renderBadgeSvg(svgText, { "[RANK NAME]": item.label });
  const iconSlot = '<g id="rankIconSlot"></g>';
  if (!namedSvg.includes(iconSlot)) throw new Error("The shared rank badge is missing its icon slot");
  return namedSvg.replace(iconSlot, `<g transform="translate(450, 406)">${getRankIcon(item.iconId, palette.accent)}</g>`);
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

async function loadBadgeSvg(file) {
  if (!BADGE_FILES.has(file)) {
    BADGE_FILES.set(file, fetch(file).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
      return response.text();
    }).catch((error) => {
      BADGE_FILES.delete(file);
      throw error;
    }));
  }
  return BADGE_FILES.get(file);
}

export async function loadBadge(id) {
  const item = (await loadManifest()).find((badge) => badge.id === id);
  if (!item) throw new Error(`No badge is configured for ${id}`);

  const template = await loadBadgeSvg(item.file);
  return { ...item, svgText: item.iconId ? renderRankBadgeSvg(template, item) : template };
}

export async function loadBadgeEntries() {
  return Promise.all((await loadManifest()).map(({ id }) => loadBadge(id)));
}
