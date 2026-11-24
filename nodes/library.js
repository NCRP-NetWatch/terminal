function appendInlineMarkdown(parent, value) {
  const tokenPattern = /(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    parent.append(document.createTextNode(value.slice(lastIndex, match.index)));

    const token = match[0];
    let element;
    let content;
    if (token.startsWith("`")) {
      element = document.createElement("code");
      content = token.slice(1, -1);
    } else if (token.startsWith("**")) {
      element = document.createElement("strong");
      content = token.slice(2, -2);
    } else {
      element = document.createElement("em");
      content = token.slice(1, -1);
    }
    element.textContent = content;
    parent.append(element);
    lastIndex = match.index + token.length;
  }

  parent.append(document.createTextNode(value.slice(lastIndex)));
}

function isTableDivider(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function getTableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function startsBlock(line, nextLine = "") {
  return (
    /^#{1,6}\s/.test(line) ||
    /^\s*([-*+]\s+|\d+[.)]\s+)/.test(line) ||
    /^\s*(---+|\*\*\*+|___+)\s*$/.test(line) ||
    (line.trim().startsWith("|") && isTableDivider(nextLine))
  );
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output = document.createDocumentFragment();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 1);
      const element = document.createElement(`h${level}`);
      appendInlineMarkdown(element, heading[2]);
      output.append(element);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      output.append(document.createElement("hr"));
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|") && isTableDivider(lines[index + 1] ?? "")) {
      const headers = getTableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(getTableCells(lines[index]));
        index += 1;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "library-table-wrap";
      const table = document.createElement("table");
      table.className = "library-table";
      const head = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const cell of headers) {
        const header = document.createElement("th");
        header.scope = "col";
        appendInlineMarkdown(header, cell);
        headerRow.append(header);
      }
      head.append(headerRow);
      const body = document.createElement("tbody");
      for (const row of rows) {
        const tableRow = document.createElement("tr");
        headers.forEach((_, cellIndex) => {
          const cell = document.createElement("td");
          appendInlineMarkdown(cell, row[cellIndex] ?? "");
          tableRow.append(cell);
        });
        body.append(tableRow);
      }
      table.append(head, body);
      wrapper.append(table);
      output.append(wrapper);
      continue;
    }

    const listMatch = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const listTag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        const listItem = document.createElement("li");
        appendInlineMarkdown(listItem, item[2]);
        items.push(listItem);
        index += 1;
      }
      const list = document.createElement(listTag);
      list.append(...items);
      output.append(list);
      continue;
    }

    const paragraph = document.createElement("p");
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index], lines[index + 1] ?? "")) {
      if (paragraph.childNodes.length) paragraph.append(document.createTextNode(" "));
      appendInlineMarkdown(paragraph, lines[index].trim());
      index += 1;
    }
    if (paragraph.childNodes.length) output.append(paragraph);
  }

  return output;
}

export function createLibraryNode({ viewEl, contentEl, subNavEl }) {
  let documents = [];
  let activeDownloadUrl;

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
      subNavEl.replaceChildren();
      showCatalog();
    },
    hide() {
      clearDownloadUrl();
      viewEl.hidden = true;
    }
  };
}
