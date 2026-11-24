export function renderNavButtons(navEl, items, { activeId, onSelect }) {
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const button = document.createElement("button");
    const active = item.id === activeId;
    button.type = "button";
    button.textContent = item.label;
    button.dataset.navId = item.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");

    if (item.controls) {
      button.setAttribute("aria-controls", item.controls);
      button.setAttribute("aria-expanded", String(Boolean(item.expanded)));
    }

    button.addEventListener("click", () => {
      for (const sibling of navEl.querySelectorAll("button[data-nav-id]")) {
        const selected = sibling === button;
        sibling.classList.toggle("active", selected);
        sibling.setAttribute("aria-current", selected ? "page" : "false");
      }
      onSelect(item.id, item, button);
    });
    fragment.append(button);
  }

  navEl.replaceChildren(fragment);
}
