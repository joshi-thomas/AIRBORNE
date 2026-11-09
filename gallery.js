/* Gallery page: category filter tabs, masonry layout and image lightbox.
   Photo content lives in gallery.html; this file only handles interactivity. */
(() => {
    "use strict";

    const CATEGORY_LABELS = {
        all: "All",
        campus: "Airborne New Campus",
        ceremony: "Ceremony & Awards",
        christmas: "Christmas",
        "college-day": "College Day",
        onam: "Onam",
        sports: "Sports",
        tour: "Tour",
    };

    function columnCount(width) {
        if (width >= 1080) return 4;
        if (width >= 720) return 3;
        if (width >= 340) return 2;
        return 1;
    }

    function readPhoto(item) {
        const btn = item.querySelector("[data-gallery-open]");
        const img = item.querySelector("img");
        const title = item.querySelector(".gallery-item__title");
        const tag = item.querySelector(".gallery-item__tag");
        const width = Number(img?.getAttribute("width")) || img?.naturalWidth || 1;
        const height = Number(img?.getAttribute("height")) || img?.naturalHeight || 1;
        return {
            item,
            category: item.dataset.category || "",
            src: img?.currentSrc || img?.src || "",
            full: btn?.dataset.fullSrc || img?.src || "",
            w: width,
            h: height,
            title: title?.textContent?.trim() || "",
            alt: img?.alt || "",
            tagHtml: tag?.innerHTML || "",
        };
    }

    function initGalleryPage() {
        const root = document.querySelector("[data-gallery]");
        if (!root) return;

        const panel = root.querySelector("[data-gallery-panel]");
        const grid = root.querySelector("[data-gallery-grid]");
        const tabs = Array.from(root.querySelectorAll("[data-gallery-filter]"));
        const status = root.querySelector("[data-gallery-status]");
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        const items = Array.from(grid.querySelectorAll(".gallery-item"));
        const photos = items.map(readPhoto);

        let activeKey = "all";
        let visibleIndexes = [];
        let currentColumns = 0;

        tabs.forEach((tab) => {
            const key = tab.dataset.galleryFilter;
            const count = key === "all" ? photos.length : photos.filter((p) => p.category === key).length;
            const badge = tab.querySelector("[data-filter-count]");
            if (badge) badge.textContent = String(count);
        });

        function layout({ animate = false } = {}) {
            const cols = columnCount(grid.clientWidth);
            currentColumns = cols;

            const columns = Array.from({ length: cols }, () => {
                const col = document.createElement("div");
                col.className = "gallery-masonry__col";
                col.setAttribute("role", "none");
                return col;
            });
            const heights = new Array(cols).fill(0);

            visibleIndexes.forEach((photoIndex, order) => {
                const photo = photos[photoIndex];
                const item = items[photoIndex];
                const target = heights.indexOf(Math.min(...heights));
                heights[target] += photo.h / photo.w + 0.08;
                item.classList.remove("is-entering");
                if (animate) item.style.setProperty("--enter-delay", `${Math.min(order, 10) * 40}ms`);
                columns[target].appendChild(item);
            });

            grid.replaceChildren(...columns);

            if (animate && !reduceMotion.matches) {
                void grid.offsetWidth;
                visibleIndexes.forEach((photoIndex) => items[photoIndex].classList.add("is-entering"));
            }
        }

        function applyFilter(key, { focus = false, updateHash = true } = {}) {
            if (!CATEGORY_LABELS[key]) key = "all";
            activeKey = key;

            tabs.forEach((tab) => {
                const active = tab.dataset.galleryFilter === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", String(active));
                tab.tabIndex = active ? 0 : -1;
                if (active) {
                    panel.setAttribute("aria-labelledby", tab.id);
                    if (focus) tab.focus();
                }
            });

            visibleIndexes = photos.reduce((list, photo, index) => {
                if (key === "all" || photo.category === key) list.push(index);
                return list;
            }, []);

            layout({ animate: true });

            if (status) {
                const label = key === "all" ? "photos" : `${CATEGORY_LABELS[key]} photos`;
                status.textContent = `Showing ${visibleIndexes.length} ${label}`;
            }

            if (updateHash) {
                const url = key === "all" ? window.location.pathname + window.location.search : `#${key}`;
                history.replaceState(null, "", url);
            }
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => {
                if (tab.dataset.galleryFilter !== activeKey) applyFilter(tab.dataset.galleryFilter);
            });

            tab.addEventListener("keydown", (event) => {
                let next = null;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                if (next === null) return;
                event.preventDefault();
                applyFilter(tabs[next].dataset.galleryFilter, { focus: true });
            });
        });

        const initialKey = window.location.hash.slice(1);
        applyFilter(CATEGORY_LABELS[initialKey] ? initialKey : "all", { updateHash: false });

        window.addEventListener("hashchange", () => {
            const key = window.location.hash.slice(1);
            if (CATEGORY_LABELS[key] && key !== activeKey) applyFilter(key, { updateHash: false });
        });

        const relayout = () => {
            if (columnCount(grid.clientWidth) !== currentColumns) layout();
        };
        if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(grid);
        else window.addEventListener("resize", relayout);

        initLightbox(document.getElementById("gallery-lightbox"), grid, () => visibleIndexes, photos);
    }

    function initLightbox(dialog, grid, getVisible, photos) {
        if (!dialog || typeof dialog.showModal !== "function") return;

        const root = document.documentElement;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const refs = {
            stage: dialog.querySelector("[data-lightbox-stage]"),
            img: dialog.querySelector("[data-lightbox-img]"),
            counter: dialog.querySelector("[data-lightbox-counter]"),
            tag: dialog.querySelector("[data-lightbox-tag]"),
            title: dialog.querySelector("[data-lightbox-title]"),
            size: dialog.querySelector("[data-lightbox-size]"),
            prev: dialog.querySelector("[data-lightbox-prev]"),
            next: dialog.querySelector("[data-lightbox-next]"),
        };

        let list = [];
        let position = 0;
        let opener = null;
        let token = 0;
        let loadingTimer = null;

        function preload(photoIndex) {
            const img = new Image();
            img.decoding = "async";
            img.src = photos[photoIndex].full;
        }

        function show(newPosition, direction = 0) {
            position = (newPosition + list.length) % list.length;
            const photo = photos[list[position]];
            const current = ++token;

            refs.counter.textContent = `${position + 1} / ${list.length}`;
            refs.tag.innerHTML = photo.tagHtml;
            refs.title.textContent = photo.title;

            const multiple = list.length > 1;
            refs.prev.hidden = !multiple;
            refs.next.hidden = !multiple;

            clearTimeout(loadingTimer);
            loadingTimer = setTimeout(() => refs.stage.classList.add("is-loading"), 150);

            const loader = new Image();
            loader.decoding = "async";
            loader.src = photo.full;
            const ready = loader.decode ? loader.decode() : new Promise((resolve) => (loader.onload = resolve));

            ready
                .catch(() => {})
                .then(() => {
                    if (current !== token) return;
                    clearTimeout(loadingTimer);
                    refs.stage.classList.remove("is-loading");
                    refs.img.src = photo.full;
                    refs.img.alt = photo.alt;
                    refs.img.width = photo.w;
                    refs.img.height = photo.h;
                    refs.img.classList.remove("is-from-next", "is-from-prev", "is-fading");
                    if (!reduceMotion.matches) {
                        void refs.img.offsetWidth;
                        refs.img.classList.add(direction > 0 ? "is-from-next" : direction < 0 ? "is-from-prev" : "is-fading");
                    }
                });

            if (multiple) {
                preload(list[(position + 1) % list.length]);
                preload(list[(position - 1 + list.length) % list.length]);
            }
        }

        function setExpanded(expanded) {
            dialog.classList.toggle("is-expanded", expanded);
            refs.size.setAttribute("aria-pressed", String(expanded));
            refs.size.setAttribute("aria-label", expanded ? "Reduce viewer size" : "Expand viewer size");
            refs.size.innerHTML = `<i class="fa-solid ${expanded ? "fa-compress" : "fa-expand"}" aria-hidden="true"></i>`;
        }

        function open(photoIndex, trigger) {
            list = getVisible().slice();
            const start = list.indexOf(photoIndex);
            if (start === -1) return;
            opener = trigger || null;
            setExpanded(false);
            refs.img.removeAttribute("src");
            show(start);
            root.classList.add("is-gallery-lightbox-open");
            if (!dialog.open) dialog.showModal();
        }

        function close() {
            if (dialog.open) dialog.close();
        }

        grid.addEventListener("click", (event) => {
            const trigger = event.target.closest("[data-gallery-open]");
            if (trigger) open(Number(trigger.dataset.galleryOpen), trigger);
        });

        refs.prev.addEventListener("click", () => show(position - 1, -1));
        refs.next.addEventListener("click", () => show(position + 1, 1));
        refs.size.addEventListener("click", () => setExpanded(!dialog.classList.contains("is-expanded")));
        dialog.querySelectorAll("[data-lightbox-close]").forEach((btn) => btn.addEventListener("click", close));

        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) close();
        });

        dialog.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            } else if (event.key === "ArrowRight" && list.length > 1) {
                event.preventDefault();
                show(position + 1, 1);
            } else if (event.key === "ArrowLeft" && list.length > 1) {
                event.preventDefault();
                show(position - 1, -1);
            }
        });

        let swipeStartX = null;
        let swipeStartY = null;
        refs.stage.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button")) return;
            swipeStartX = event.clientX;
            swipeStartY = event.clientY;
        });
        refs.stage.addEventListener("pointerup", (event) => {
            if (swipeStartX === null) return;
            const dx = event.clientX - swipeStartX;
            const dy = event.clientY - swipeStartY;
            swipeStartX = null;
            if (list.length < 2 || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0) show(position + 1, 1);
            else show(position - 1, -1);
        });
        refs.stage.addEventListener("pointercancel", () => {
            swipeStartX = null;
        });

        dialog.addEventListener("close", () => {
            token += 1;
            clearTimeout(loadingTimer);
            refs.stage.classList.remove("is-loading");
            root.classList.remove("is-gallery-lightbox-open");
            if (opener && document.contains(opener)) opener.focus();
            opener = null;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initGalleryPage);
    } else {
        initGalleryPage();
    }
})();
