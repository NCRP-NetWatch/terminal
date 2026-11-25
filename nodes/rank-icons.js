const RANK_ICONS = {
  agent: `
    <path d="M -35,-2 L 0,-22 L 35,-2" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M -35,-18 L 0,-38 L 35,-18" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  "probationary-agent": `
    <path d="M -35,-10 L 0,-30 L 35,-10" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  "section-chief": `
    <rect x="-27" y="-58" width="20" height="76" rx="2" fill="#020b12" stroke="#00f2fe" stroke-width="3"/>
    <rect x="7" y="-58" width="20" height="76" rx="2" fill="#020b12" stroke="#00f2fe" stroke-width="3"/>`,
  "senior-agent": `
    <path d="M -35,6 L 0,-14 L 35,6" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M -35,-10 L 0,-30 L 35,-10" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M -35,-26 L 0,-46 L 35,-26" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  supervisor: `
    <rect x="-12" y="-58" width="24" height="76" rx="2" fill="#020b12" stroke="#00f2fe" stroke-width="3"/>`
};

export function getRankIcon(iconId, accent = "#00f2fe") {
  const icon = RANK_ICONS[iconId];
  if (!icon) throw new Error(`No rank icon is configured for ${iconId}`);
  return icon.replaceAll("#00f2fe", accent);
}
