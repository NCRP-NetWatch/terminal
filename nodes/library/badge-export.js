const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const GATEWAY_RESOURCE_IDS = [
  "blackwall-backdrop",
  "night-city-horizon",
  "cyberspace-floor",
  "icon-border-corners"
];

function rewriteReferences(root, idMap) {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (element.id && idMap.has(element.id)) element.id = idMap.get(element.id);

    for (const attribute of [...element.attributes]) {
      let value = attribute.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
        (match, quote, id) => `url(${quote}#${idMap.get(id) ?? id}${quote})`);
      if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#")) {
        value = `#${idMap.get(value.slice(1)) ?? value.slice(1)}`;
      }
      element.setAttribute(attribute.name, value);
    }

    if (element.localName === "style") {
      element.textContent = element.textContent.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
        (match, quote, id) => `url(${quote}#${idMap.get(id) ?? id}${quote})`);
    }
  }
}

export async function makeBadgeExportSvg(svgText) {
  const parser = new DOMParser();
  const badgeDocument = parser.parseFromString(svgText, "image/svg+xml");
  if (badgeDocument.querySelector("parsererror")) {
    throw new Error("Could not prepare the badge SVG for download");
  }

  const gatewayResponse = await fetch("./data/svg/gateway.svg");
  if (!gatewayResponse.ok) {
    throw new Error(`Could not load the badge background (${gatewayResponse.status})`);
  }
  const gatewayDocument = parser.parseFromString(await gatewayResponse.text(), "image/svg+xml");
  if (gatewayDocument.querySelector("parsererror")) {
    throw new Error("Could not load the badge background");
  }

  const idMap = new Map(
    [...gatewayDocument.querySelectorAll("[id]")]
      .map((element) => [element.id, `gateway-${element.id}`])
  );
  const resources = badgeDocument.createElementNS(SVG_NAMESPACE, "defs");
  const definitions = gatewayDocument.documentElement.querySelector(":scope > defs");
  if (definitions) resources.append(badgeDocument.importNode(definitions, true));
  for (const id of GATEWAY_RESOURCE_IDS) {
    const element = gatewayDocument.getElementById(id);
    if (element) resources.append(badgeDocument.importNode(element, true));
  }

  rewriteReferences(resources, idMap);
  badgeDocument.documentElement.insertBefore(resources, badgeDocument.documentElement.firstChild);

  for (const element of badgeDocument.querySelectorAll("use, image")) {
    const attribute = element.hasAttribute("href") ? "href" : "xlink:href";
    const href = element.getAttribute(attribute);
    if (!href || !href.includes("gateway.svg#")) continue;
    const id = href.slice(href.lastIndexOf("#") + 1);
    element.setAttribute(attribute, `#${idMap.get(id) ?? id}`);
  }

  return new XMLSerializer().serializeToString(badgeDocument.documentElement);
}

export async function makePng(svgText) {
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create an image for the badge download");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not convert the badge to PNG"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
