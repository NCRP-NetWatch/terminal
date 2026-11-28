import { renderNavButtons } from "../navigation.js";
import { renderMarkdown } from "./markdown.js";

export function createLibraryNode({ viewEl, contentEl, subNavEl, badgeNavEl, badges }) {
  let documents = [];
  let activeDownloadUrl;
  let activeSection = "documents";

  function renderSectionNav() {
    renderNavButtons(subNavEl, [
      { id: "badges", label: "BADGES" },
      { id: "documents", label: "DOCUMENTS" }
    ], {
      activeId: activeSection,
      onSelect: (sectionId) => {
        activeSection = sectionId;
        renderSectionNav();
        if (sectionId === "badges") {
          contentEl.hidden = true;
          badges.show();
          return;
        }
        badges.hide();
        contentEl.hidden = false;
        showCatalog();
      }
    });
  }

  function clearDownloadUrl() {
    if (!activeDownloadUrl) return;
    URL.revokeObjectURL(activeDownloadUrl);
    activeDownloadUrl = undefined;
  }

  function showCatalog() {
    clearDownloadUrl();
    contentEl.classList.remove("is-reading");
    contentEl.replaceChildren();

    if (!documents.length) {
      const empty = document.createElement("p");
      empty.className = "library-empty";
      empty.textContent = "No documents are available in the Library.";
      contentEl.append(empty);
      return;
    }

    const catalog = document.createElement("div");
    catalog.className = "library-catalog";
    for (const doc of documents) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "library-card";

      const title = document.createElement("span");
      title.className = "library-card-title";
      title.textContent = doc.title;

      const description = document.createElement("span");
      description.className = "library-card-description";
      description.textContent = doc.description ?? "Official field office document";

      const action = document.createElement("span");
      action.className = "library-card-action";
      action.textContent = "OPEN DOCUMENT →";

      card.append(title, description, action);
      card.addEventListener("click", () => openDocument(doc));
      catalog.append(card);
    }
    contentEl.append(catalog);
  }

  function openDocument(doc) {
    clearDownloadUrl();
    contentEl.classList.add("is-reading");
    contentEl.replaceChildren();

    const toolbar = document.createElement("div");
    toolbar.className = "library-toolbar";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.textContent = "← LIBRARY INDEX";
    backButton.addEventListener("click", showCatalog);

    const download = document.createElement("a");
    download.className = "library-download";
    const filename = String(doc.title || "library-document")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "library-document";
    download.download = `${filename}.md`;
    download.textContent = "DOWNLOAD DOCUMENT";
    toolbar.append(backButton, download);

    const article = document.createElement("article");
    article.className = "library-document";
    article.setAttribute("aria-label", doc.title);

    contentEl.append(toolbar, article);

    if (typeof doc.body !== "string") {
      const message = document.createElement("p");
      message.className = "library-error";
      message.textContent = "This document has no stored content.";
      article.replaceChildren(message);
      return;
    }

    const markdown = doc.body;
    activeDownloadUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    download.href = activeDownloadUrl;
    article.replaceChildren(renderMarkdown(markdown));
    article.scrollIntoView({ block: "start" });
  }

  return {
    setDocuments(data) {
      documents = Array.isArray(data) ? data : [];
    },
    show() {
      viewEl.hidden = false;
      renderSectionNav();
      if (activeSection === "badges") {
        contentEl.hidden = true;
        badges.show();
      } else {
        badges.hide();
        contentEl.hidden = false;
        showCatalog();
      }
    },
    hide() {
      clearDownloadUrl();
      badgeNavEl.hidden = true;
      badges.hide();
      viewEl.hidden = true;
    }
  };
}
