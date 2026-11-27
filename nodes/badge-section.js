import { renderNavButtons } from "./navigation.js";
import { getBadgeFields, namespaceBadgeSvgIds, renderBadgeSvg } from "./badges.js";

export function createBadgeSection({
  viewEl,
  badgeNavEl,
  badgePromptEl,
  badgeWorkspaceEl,
  previewEl,
  placeholderFieldsEl,
  downloadBtn,
  isReadOnly = () => false
}) {
  let entries = [];
  let activeIndex = -1;

  function getRenderedSvg(item) {
    return namespaceBadgeSvgIds(renderBadgeSvg(item.svgText, item.fieldValues));
  }

  function renderPreview(item) {
    previewEl.innerHTML = getRenderedSvg(item);
  }

  function renderFields(item) {
    const tokens = getBadgeFields(item.svgText);
    const fragment = document.createDocumentFragment();

    if (!tokens.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "placeholder-empty";
      emptyMessage.textContent = "This badge has no bracketed fields to fill in.";
      fragment.append(emptyMessage);
      placeholderFieldsEl.replaceChildren(fragment);
      return;
    }

    item.fieldValues ??= {};
    for (const token of tokens) {
      const label = document.createElement("label");
      label.className = "placeholder-field";
      label.append(document.createTextNode(token.slice(1, -1)));

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.disabled = isReadOnly();
      input.value = item.fieldValues[token] ?? "";
      input.placeholder = `Enter ${token.slice(1, -1).toLowerCase()}`;
      input.addEventListener("input", () => {
        item.fieldValues[token] = input.value;
        renderPreview(item);
      });

      label.append(input);
      fragment.append(label);
    }

    placeholderFieldsEl.replaceChildren(fragment);
  }

  async function makeBadgeExportSvg(item) {
    const parser = new DOMParser();
    const badgeDocument = parser.parseFromString(getRenderedSvg(item), "image/svg+xml");
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

    const gatewayIds = new Map(
      [...gatewayDocument.querySelectorAll("[id]")]
        .map((element) => [element.id, `gateway-${element.id}`])
    );
    const gatewayResources = badgeDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
    const definitions = gatewayDocument.documentElement.querySelector(":scope > defs");
    if (definitions) gatewayResources.append(badgeDocument.importNode(definitions, true));
    for (const id of ["blackwall-backdrop", "night-city-horizon", "cyberspace-floor", "icon-border-corners"]) {
      const element = gatewayDocument.getElementById(id);
      if (element) gatewayResources.append(badgeDocument.importNode(element, true));
    }

    const rewriteReferences = (root) => {
      for (const element of [root, ...root.querySelectorAll("*")]) {
        if (element.id && gatewayIds.has(element.id)) element.id = gatewayIds.get(element.id);
        for (const attribute of [...element.attributes]) {
          let value = attribute.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
            (match, quote, id) => `url(${quote}#${gatewayIds.get(id) ?? id}${quote})`);
          if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#")) {
            const id = value.slice(1);
            value = `#${gatewayIds.get(id) ?? id}`;
          }
          element.setAttribute(attribute.name, value);
        }
        if (element.localName === "style") {
          element.textContent = element.textContent.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
            (match, quote, id) => `url(${quote}#${gatewayIds.get(id) ?? id}${quote})`);
        }
      }
    };
    rewriteReferences(gatewayResources);
    badgeDocument.documentElement.insertBefore(gatewayResources, badgeDocument.documentElement.firstChild);

    for (const element of badgeDocument.querySelectorAll("use, image")) {
      const hrefAttribute = element.hasAttribute("href") ? "href" : "xlink:href";
      const href = element.getAttribute(hrefAttribute);
      if (!href || !href.includes("gateway.svg#")) continue;
      const id = href.slice(href.lastIndexOf("#") + 1);
      element.setAttribute(hrefAttribute, `#${gatewayIds.get(id) ?? id}`);
    }

    return new XMLSerializer().serializeToString(badgeDocument.documentElement);
  }

  async function makePng(svgText) {
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

  function selectEntry(index) {
    const item = entries[index];
    if (!item) return;

    activeIndex = index;
    downloadBtn.hidden = isReadOnly();
    badgePromptEl.hidden = true;
    badgeWorkspaceEl.hidden = false;
    renderFields(item);
    renderPreview(item);
  }

  function renderBadgeNav() {
    const badgeItems = entries.map((item, index) => ({
      id: String(index),
      label: item.label
    }));

    renderNavButtons(badgeNavEl, badgeItems, {
      activeId: activeIndex >= 0 ? String(activeIndex) : undefined,
      onSelect: (id) => selectEntry(Number(id))
    });
  }

  downloadBtn.addEventListener("click", async () => {
    if (isReadOnly()) return;
    const item = entries[activeIndex];
    if (!item) return;

    downloadBtn.disabled = true;
    try {
      const blob = await makePng(await makeBadgeExportSvg(item));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const svgName = item.downloadName || item.file.split("/").pop() || `${item.id}.svg`;
      link.download = svgName.replace(/\.svg$/i, "") + ".png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Could not download the badge as PNG", error);
    } finally {
      downloadBtn.disabled = false;
    }
  });

  return {
    setData(items) {
      entries = Array.isArray(items) ? items : [];
      if (activeIndex >= entries.length) activeIndex = -1;
    },
    show() {
      viewEl.hidden = false;
      downloadBtn.hidden = isReadOnly();
      badgeNavEl.hidden = false;
      badgePromptEl.hidden = activeIndex >= 0;
      badgeWorkspaceEl.hidden = activeIndex < 0;
      renderBadgeNav();
      if (activeIndex >= 0 && entries[activeIndex]) {
        renderFields(entries[activeIndex]);
        renderPreview(entries[activeIndex]);
      }
    },
    hide() {
      badgeNavEl.hidden = true;
      viewEl.hidden = true;
    }
  };
}
