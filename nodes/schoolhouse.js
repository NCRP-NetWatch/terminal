import { renderNavButtons } from "./navigation.js";
import { getBadgeFields, renderBadgeSvg } from "./badges.js";

export function createSchoolhouseNode({
  viewEl,
  subNavEl,
  badgeNavEl,
  badgePromptEl,
  badgeWorkspaceEl,
  previewEl,
  placeholderFieldsEl,
  downloadBtn
}) {
  let entries = [];
  let activeIndex = -1;
  let badgesOpen = false;

  function getRenderedSvg(item) {
    return renderBadgeSvg(item.svgText, item.fieldValues);
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

  function selectEntry(index) {
    const item = entries[index];
    if (!item) return;

    activeIndex = index;
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

  function renderSectionNav() {
    renderNavButtons(subNavEl, [{
      id: "badges",
      label: "BADGES",
      controls: badgeNavEl.id,
      expanded: badgesOpen
    }], {
      activeId: badgesOpen ? "badges" : undefined,
      onSelect: (_id, _item, button) => {
        badgesOpen = !badgesOpen;
        button.classList.toggle("active", badgesOpen);
        button.setAttribute("aria-current", badgesOpen ? "page" : "false");
        button.setAttribute("aria-expanded", String(badgesOpen));
        badgeNavEl.hidden = !badgesOpen;
        if (badgesOpen) renderBadgeNav();
      }
    });
  }

  downloadBtn.addEventListener("click", () => {
    const item = entries[activeIndex];
    if (!item) return;

    const url = URL.createObjectURL(new Blob([getRenderedSvg(item)], {
      type: "image/svg+xml;charset=utf-8"
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = item.file.split("/").pop() || `${item.id}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return {
    setData(items) {
      entries = Array.isArray(items) ? items : [];
      if (activeIndex >= entries.length) activeIndex = -1;
    },
    show() {
      viewEl.hidden = entries.length === 0;
      badgeNavEl.hidden = !badgesOpen;
      badgePromptEl.hidden = activeIndex >= 0;
      badgeWorkspaceEl.hidden = activeIndex < 0;
      renderSectionNav();
      if (badgesOpen) renderBadgeNav();
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
