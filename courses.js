/* Courses page: filter tabs and "Read More" details modal.
   Course content lives in courses.html; this file only handles interactivity. */
(() => {
    "use strict";

    const CATEGORY_LABELS = {
        all: "All Programs",
        aviation: "Aviation",
        logistics: "Logistics",
        paramedical: "Paramedical",
        management: "Management Studies",
    };

    function initCoursesPage() {
        const root = document.querySelector("[data-courses]");
        if (!root) return;

        const panel = root.querySelector("[data-courses-panel]");
        const grid = root.querySelector("[data-courses-grid]");
        const tabs = Array.from(root.querySelectorAll("[data-course-filter]"));
        const status = root.querySelector("[data-courses-status]");
        const modal = document.getElementById("course-modal");
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const cards = Array.from(grid.querySelectorAll(".course-tile"));

        tabs.forEach((tab) => {
            const key = tab.dataset.courseFilter;
            const count =
                key === "all"
                    ? cards.length
                    : cards.filter((card) => card.dataset.categories.split(" ").includes(key)).length;
            const badge = tab.querySelector("[data-filter-count]");
            if (badge) badge.textContent = String(count);
        });

        function applyFilter(key, { focus = false, updateHash = true } = {}) {
            if (!CATEGORY_LABELS[key]) key = "all";
            let visible = 0;

            tabs.forEach((tab) => {
                const active = tab.dataset.courseFilter === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", String(active));
                tab.tabIndex = active ? 0 : -1;
                if (active) {
                    panel.setAttribute("aria-labelledby", tab.id);
                    if (focus) tab.focus();
                }
            });

            cards.forEach((card) => {
                const show = key === "all" || card.dataset.categories.split(" ").includes(key);
                card.hidden = !show;
                card.classList.remove("is-entering");
                if (show) {
                    card.style.setProperty("--enter-delay", `${Math.min(visible, 8) * 45}ms`);
                    visible += 1;
                }
            });

            if (!reduceMotion.matches) {
                void grid.offsetWidth;
                cards.forEach((card) => {
                    if (!card.hidden) card.classList.add("is-entering");
                });
            }

            if (status) {
                const label = key === "all" ? "programs" : `${CATEGORY_LABELS[key]} programs`;
                status.textContent = `Showing ${visible} ${label}`;
            }

            if (updateHash) {
                const url = key === "all" ? window.location.pathname + window.location.search : `#${key}`;
                history.replaceState(null, "", url);
            }
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => applyFilter(tab.dataset.courseFilter));

            tab.addEventListener("keydown", (event) => {
                let next = null;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                if (next === null) return;
                event.preventDefault();
                applyFilter(tabs[next].dataset.courseFilter, { focus: true });
            });
        });

        const initialKey = window.location.hash.slice(1);
        applyFilter(CATEGORY_LABELS[initialKey] ? initialKey : "all", { updateHash: false });

        window.addEventListener("hashchange", () => {
            const key = window.location.hash.slice(1);
            if (CATEGORY_LABELS[key]) applyFilter(key, { updateHash: false });
        });

        initCourseModal(modal, grid);
    }

    function initCourseModal(modal, grid) {
        if (!modal || typeof modal.showModal !== "function") return;

        const root = document.documentElement;
        const refs = {
            img: modal.querySelector("[data-modal-img]"),
            tags: modal.querySelector("[data-modal-tags]"),
            duration: modal.querySelector("[data-modal-duration]"),
            title: modal.querySelector("[data-modal-title]"),
            overview: modal.querySelector("[data-modal-overview]"),
            facts: modal.querySelector("[data-modal-facts]"),
            highlights: modal.querySelector("[data-modal-highlights]"),
            careers: modal.querySelector("[data-modal-careers]"),
            scroller: modal.querySelector(".course-modal__panel"),
        };
        let opener = null;

        function fill(card) {
            const detail = card.querySelector("[data-course-detail]");
            if (!detail) return;
            const content = detail.content;
            const img = card.querySelector("[data-course-image]");

            refs.img.src = img?.dataset.fullSrc || img?.src || "";
            refs.img.alt = img?.alt || "";
            refs.tags.innerHTML = content.querySelector("[data-detail-tags]")?.innerHTML || "";
            refs.duration.textContent = content.querySelector("[data-detail-duration]")?.textContent || "";
            refs.title.textContent = content.querySelector("[data-detail-title]")?.textContent || "";
            refs.overview.textContent = content.querySelector("[data-detail-overview]")?.textContent || "";

            const duration = content.querySelector("[data-detail-duration]")?.textContent || "";
            const category = content.querySelector("[data-detail-category]")?.textContent || "";
            const eligibility = content.querySelector("[data-detail-eligibility]")?.textContent || "";
            refs.facts.innerHTML = [
                ["fa-regular fa-clock", "Duration", duration],
                ["fa-solid fa-layer-group", "Category", category],
                ["fa-solid fa-user-graduate", "Eligibility", eligibility],
            ]
                .map(
                    ([icon, label, value]) => `
                    <li class="course-modal__fact">
                        <span class="course-modal__fact-icon" aria-hidden="true"><i class="${icon}"></i></span>
                        <span><span class="course-modal__fact-label">${label}</span><span class="course-modal__fact-value">${value}</span></span>
                    </li>`
                )
                .join("");

            refs.highlights.innerHTML = content.querySelector("[data-detail-highlights]")?.innerHTML || "";
            refs.careers.innerHTML = content.querySelector("[data-detail-careers]")?.innerHTML || "";
        }

        function open(id, trigger) {
            const card = grid.querySelector(`[data-course-id="${CSS.escape(id)}"]`);
            if (!card) return;
            opener = trigger || null;
            fill(card);
            root.classList.add("is-course-modal-open");
            if (!modal.open) modal.showModal();
            if (refs.scroller) refs.scroller.scrollTop = 0;
        }

        function close() {
            if (modal.open) modal.close();
        }

        grid.addEventListener("click", (event) => {
            const trigger = event.target.closest("[data-course-open]");
            if (trigger) open(trigger.dataset.courseOpen, trigger);
        });

        modal.querySelectorAll("[data-course-close]").forEach((btn) => btn.addEventListener("click", close));

        modal.addEventListener("click", (event) => {
            if (event.target === modal) close();
        });

        modal.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            close();
        });

        modal.addEventListener("close", () => {
            root.classList.remove("is-course-modal-open");
            if (opener && document.contains(opener)) opener.focus();
            opener = null;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCoursesPage);
    } else {
        initCoursesPage();
    }
})();
