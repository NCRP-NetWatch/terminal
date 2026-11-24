const PLACEHOLDER_PATTERN = /\[[^\[\]\r\n]+\]/g;

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]);
}

export function createSchoolhouseNode({ viewEl, subNavEl, previewEl, placeholderFieldsEl, downloadBtn }) {
  let entries = [];
  let activeIndex = 0;

  function getRenderedSvg(item) {
    const values = item.fieldValues ?? {};
    return item.svgText.replace(PLACEHOLDER_PATTERN, (token) => {
      const value = values[token];
      return value ? escapeXml(value) : token;
    });
  }

  function renderPreview(item) {
    previewEl.innerHTML = getRenderedSvg(item);
  }

  function renderFields(item) {
    const tokens = [...new Set(item.svgText.match(PLACEHOLDER_PATTERN) ?? [])];
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
    for (const button of subNavEl.querySelectorAll("button")) {
      const active = button.dataset.svgIndex === String(index);
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    }

    renderFields(item);
    renderPreview(item);
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
      if (activeIndex >= entries.length) activeIndex = 0;
    },
    renderSubNav() {
      const fragment = document.createDocumentFragment();

      entries.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        button.dataset.svgIndex = String(index);
        button.classList.toggle("active", index === activeIndex);
        button.setAttribute("aria-current", index === activeIndex ? "page" : "false");
        button.addEventListener("click", () => selectEntry(index));
        fragment.append(button);
      });

      subNavEl.replaceChildren(fragment);
    },
    show() {
      viewEl.hidden = entries.length === 0;
      this.renderSubNav();
      if (entries.length > 0) selectEntry(activeIndex);
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
