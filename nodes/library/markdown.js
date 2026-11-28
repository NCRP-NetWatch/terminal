function appendInlineMarkdown(parent, value) {
  const tokenPattern = /(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    parent.append(document.createTextNode(value.slice(lastIndex, match.index)));

    const token = match[0];
    const element = token.startsWith("`")
      ? document.createElement("code")
      : token.startsWith("**")
        ? document.createElement("strong")
        : document.createElement("em");
    const markerLength = token.startsWith("**") ? 2 : 1;
    element.textContent = token.slice(markerLength, -markerLength);
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

function renderTable(lines, index) {
  const headers = getTableCells(lines[index]);
  const rows = [];
  index += 2;

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
  for (const value of headers) {
    const header = document.createElement("th");
    header.scope = "col";
    appendInlineMarkdown(header, value);
    headerRow.append(header);
  }
  head.append(headerRow);

  const body = document.createElement("tbody");
  for (const values of rows) {
    const row = document.createElement("tr");
    headers.forEach((_, cellIndex) => {
      const cell = document.createElement("td");
      appendInlineMarkdown(cell, values[cellIndex] ?? "");
      row.append(cell);
    });
    body.append(row);
  }

  table.append(head, body);
  wrapper.append(table);
  return { element: wrapper, nextIndex: index };
}

function renderList(lines, index, ordered) {
  const list = document.createElement(ordered ? "ol" : "ul");
  while (index < lines.length) {
    const item = lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (!item || /^\d/.test(item[1]) !== ordered) break;
    const listItem = document.createElement("li");
    appendInlineMarkdown(listItem, item[2]);
    list.append(listItem);
    index += 1;
  }
  return { element: list, nextIndex: index };
}

export function renderMarkdown(markdown) {
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
      const element = document.createElement(`h${Math.min(6, heading[1].length + 1)}`);
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
      const table = renderTable(lines, index);
      output.append(table.element);
      index = table.nextIndex;
      continue;
    }

    const listMatch = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)/);
    if (listMatch) {
      const list = renderList(lines, index, /^\d/.test(listMatch[1]));
      output.append(list.element);
      index = list.nextIndex;
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
