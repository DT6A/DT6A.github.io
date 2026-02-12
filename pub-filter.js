(() => {
  "use strict";

  const filterRoot = document.querySelector(".pub-filter");
  if (!filterRoot) {
    return;
  }

  const buttons = Array.from(filterRoot.querySelectorAll(".pub-filter-btn"));
  const papers = Array.from(document.querySelectorAll(".pub[data-authorship]"));

  if (!buttons.length || !papers.length) {
    return;
  }

  function applyFilter(filterValue) {
    papers.forEach((paper) => {
      const role = paper.dataset.authorship;
      const shouldShow = filterValue === "all" || role === filterValue;
      paper.classList.toggle("is-hidden", !shouldShow);
      paper.classList.remove("is-first-visible");
    });

    const firstVisible = papers.find((paper) => !paper.classList.contains("is-hidden"));
    if (firstVisible) {
      firstVisible.classList.add("is-first-visible");
    }

    buttons.forEach((button) => {
      const active = button.dataset.filter === filterValue;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const filterValue = button.dataset.filter || "all";
      applyFilter(filterValue);
    });
  });

  applyFilter("all");
})();
