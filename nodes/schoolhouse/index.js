export function createSchoolhouseNode({ viewEl, subNavEl }) {
  const content = viewEl.querySelector("[data-schoolhouse-content]");
  const topics = [
    "Command structure",
    "Monitoring alerts",
    "Bloodhound execution",
    "WATCHTOWER logging",
    "Trace-history sanctions",
    "Force classifications",
    "NODE security",
    "Blackwall and AI directives"
  ];

  return {
    show() {
      viewEl.hidden = false;
      subNavEl.replaceChildren();
      if (!content.childElementCount) {
        const heading = document.createElement("h2");
        heading.className = "home-kicker";
        heading.textContent = "PROBATIONARY AGENT INSTRUCTION";
        const list = document.createElement("ul");
        for (const topic of topics) {
          const item = document.createElement("li");
          item.textContent = topic;
          list.append(item);
        }
        content.append(heading, list);
      }
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
