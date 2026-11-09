(() => {
    "use strict";

    const AUTOPLAY_MS = 4800;
    const TRANSITION_MS = 1100;
    const CONTENT_SWAP_MS = 320;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const els = {
        media: document.getElementById("hero-media"),
        imgA: document.getElementById("hero-img-a"),
        imgB: document.getElementById("hero-img-b"),
        category: document.getElementById("hero-category"),
        content: document.getElementById("hero-content"),
        title: document.getElementById("hero-title"),
        tagline: document.getElementById("hero-tagline"),
        prevBtn: document.getElementById("slide-prev"),
        nextBtn: document.getElementById("slide-next"),
        courseCards: document.querySelectorAll(".course-card"),
        heroOverlays: document.querySelectorAll(".hero-cell--content, .hero-cell--courses, .hero-controls__btn"),
        controls: document.getElementById("hero-controls"),
        hero: document.querySelector(".airborne-hero"),
        heroGrid: document.getElementById("hero-grid"),
        coursesCell: document.querySelector(".hero-cell--courses"),
        slideNodes: document.querySelectorAll("[data-hero-slide]"),
    };

    const slides = Array.from(els.slideNodes).map((node) => ({
        titleHtml: node.querySelector(".hero-slide__title")?.innerHTML || "",
        tagline: node.querySelector(".hero-slide__tagline")?.textContent?.trim() || "",
        image: node.dataset.image || "",
        imageSmall: node.dataset.imageSmall || "",
        imageAlt: node.dataset.imageAlt || "",
        category: node.dataset.category || "",
        nearCourses:
            node.dataset.contentPosition === "near-courses" ||
            /(?:^|[\\/])bg2\.jpg(?:$|[?#])/i.test(node.dataset.image || ""),
        overlayOff:
            node.dataset.overlay === "off" ||
            /(?:^|[\\/])bg2\.jpg(?:$|[?#])/i.test(node.dataset.image || ""),
    }));

    const coursesMq = window.matchMedia("(max-width: 768px)");
    const heroControlsMq = window.matchMedia("(max-width: 899px)");

    function resolveSlideImage(slide) {
        if (!slide) return "";
        // Below 899px prefer the taller small-screen asset when provided (bg3 for bg2 slides).
        if (heroControlsMq.matches && slide.imageSmall) return slide.imageSmall;
        return slide.image;
    }

    function applyHeroImage(img, slide) {
        if (!img || !slide) return;
        const src = resolveSlideImage(slide);
        if (img.dataset.heroSrc !== src) {
            img.dataset.heroSrc = src;
            img.src = src;
        }
        img.alt = slide.imageAlt || "";
    }
    const coursesInlineParent = els.coursesCell ? els.coursesCell.parentElement : null;
    const coursesInlineNext = els.coursesCell ? els.coursesCell.nextElementSibling : null;

    let currentSlide = 0;
    let activeLayer = "a";
    let isAnimating = false;
    let autoplayTimer = null;
    let pauseReasons = new Set();

    function mountCoursesForViewport() {
        if (!els.coursesCell || !els.hero || !coursesInlineParent) return;

        if (coursesMq.matches) {
            // Place course cards immediately after the hero section on small screens.
            if (els.coursesCell.previousElementSibling !== els.hero) {
                els.hero.insertAdjacentElement("afterend", els.coursesCell);
            }
            return;
        }

        if (els.coursesCell.parentElement === coursesInlineParent) return;

        if (coursesInlineNext && coursesInlineNext.parentElement === coursesInlineParent) {
            coursesInlineParent.insertBefore(els.coursesCell, coursesInlineNext);
        } else {
            coursesInlineParent.appendChild(els.coursesCell);
        }
    }

    function getContainedImageMetrics(img) {
        const layer = img.closest(".hero-media__layer") || els.media;
        if (!layer) return null;

        const box = layer.getBoundingClientRect();
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh || box.width < 1 || box.height < 1) return null;

        // Matches object-fit: contain + object-position: top center
        const scale = Math.min(box.width / nw, box.height / nh);
        const renderW = nw * scale;
        const renderH = nh * scale;
        const top = box.top;
        const left = box.left + (box.width - renderW) / 2;

        return { top, left, width: renderW, height: renderH };
    }

    function clearHeroControlsImageAlign() {
        els.hero?.style.removeProperty("--hero-img-center-y");
        els.hero?.style.removeProperty("--hero-img-render-h");
        els.controls?.style.removeProperty("height");
        els.controls?.style.removeProperty("bottom");
        [els.prevBtn, els.nextBtn].forEach((btn) => {
            if (!btn) return;
            btn.style.removeProperty("top");
        });
    }

    function syncHeroControlsToImage() {
        if (!els.hero || !els.controls) return;

        if (!heroControlsMq.matches) {
            clearHeroControlsImageAlign();
            return;
        }

        const img = getActiveImg();
        if (!img) return;

        const applyCenter = () => {
            const controlsRect = els.controls.getBoundingClientRect();
            const metrics = getContainedImageMetrics(img);
            if (!metrics || controlsRect.height < 1) return;

            // Position relative to .hero-controls (same box as the hero media stack)
            const centerY = metrics.top - controlsRect.top + metrics.height / 2;
            const centerPx = `${Math.max(0, centerY)}px`;
            els.hero.style.setProperty("--hero-img-center-y", centerPx);
            els.hero.style.setProperty("--hero-img-render-h", `${metrics.height}px`);

            // Shrink the controls hit-area to the painted image so 50% === image mid
            els.controls.style.bottom = "auto";
            els.controls.style.height = `${metrics.height}px`;

            const arrowSize = (els.prevBtn && els.prevBtn.offsetHeight) ||
                Number.parseFloat(getComputedStyle(els.hero).getPropertyValue("--hero-arrow-size")) ||
                42;
            const topPx = `${Math.max(0, metrics.height / 2 - arrowSize / 2)}px`;
            if (els.prevBtn) els.prevBtn.style.top = topPx;
            if (els.nextBtn) els.nextBtn.style.top = topPx;
        };

        const run = () => window.requestAnimationFrame(applyCenter);

        if (img.complete && img.naturalHeight > 0) {
            run();
        } else {
            img.addEventListener("load", run, { once: true });
        }
    }

    function getNextIndex(index = currentSlide) {
        return (index + 1) % slides.length;
    }

    function getPrevIndex(index = currentSlide) {
        return (index - 1 + slides.length) % slides.length;
    }

    function preloadImages() {
        slides.forEach((slide) => {
            if (slide.image) {
                const img = new Image();
                img.src = slide.image;
            }
            if (slide.imageSmall) {
                const imgSmall = new Image();
                imgSmall.src = slide.imageSmall;
            }
        });
    }

    function refreshHeroImagesForViewport() {
        if (!slides.length) return;
        applyHeroImage(getActiveImg(), slides[currentSlide]);
        applyHeroImage(getInactiveImg(), slides[getNextIndex()]);
        syncHeroControlsToImage();
    }

    function getActiveImg() {
        return activeLayer === "a" ? els.imgA : els.imgB;
    }

    function getInactiveImg() {
        return activeLayer === "a" ? els.imgB : els.imgA;
    }

    function getActiveLayerEl() {
        return els.media.querySelector(`[data-layer="${activeLayer}"]`);
    }

    function getInactiveLayerEl() {
        const other = activeLayer === "a" ? "b" : "a";
        return els.media.querySelector(`[data-layer="${other}"]`);
    }

    function updateCourseHighlight(index) {
        els.courseCards.forEach((card) => {
            const match = Number(card.dataset.course) === index;
            card.classList.toggle("is-active-course", match);
        });
    }

    function syncSlideChrome(index) {
        const slide = slides[index];
        els.hero?.classList.toggle("is-hero-content-near-courses", Boolean(slide?.nearCourses));
        els.hero?.classList.toggle("is-hero-overlay-off", Boolean(slide?.overlayOff));
    }

    function applySlideCopy(index) {
        const slide = slides[index];
        if (els.category && slide.category) els.category.textContent = slide.category;
        els.title.innerHTML = slide.titleHtml;
        els.tagline.textContent = slide.tagline;
        updateCourseHighlight(index);
        syncSlideChrome(index);
    }

    function setInitialSlide() {
        if (!slides.length) return;
        const slide = slides[0];
        const next = slides[1] || slide;

        applyHeroImage(els.imgA, slide);
        applyHeroImage(els.imgB, next);

        const layerA = els.media.querySelector('[data-layer="a"]');
        const layerB = els.media.querySelector('[data-layer="b"]');
        layerA.classList.add("is-active");
        layerB.classList.remove("is-active", "is-exit", "is-enter-from-preview");

        applySlideCopy(0);
        activeLayer = "a";
        syncHeroControlsToImage();
    }

    function animateContent(index) {
        if (prefersReducedMotion) {
            applySlideCopy(index);
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            els.content.classList.add("is-leaving");
            els.content.classList.remove("is-entering");

            window.setTimeout(() => {
                applySlideCopy(index);

                els.content.classList.remove("is-leaving");
                els.content.classList.add("is-entering");

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        els.content.classList.remove("is-entering");
                    });
                });

                resolve();
            }, CONTENT_SWAP_MS);
        });
    }

    function goToSlide(targetIndex, direction = 1) {
        if (isAnimating || !slides.length) return;
        if (targetIndex === currentSlide) return;

        const slide = slides[targetIndex];
        const outgoing = getActiveLayerEl();
        const incoming = getInactiveLayerEl();
        const incomingImg = getInactiveImg();

        isAnimating = true;

        if (direction < 0) {
            els.media.classList.add("is-reverse");
        } else {
            els.media.classList.remove("is-reverse");
        }

        applyHeroImage(incomingImg, slide);

        incoming.classList.remove("is-active", "is-exit");
        if (!prefersReducedMotion && direction > 0) {
            incoming.classList.add("is-enter-from-preview");
        }

        void incoming.offsetWidth;

        outgoing.classList.remove("is-active");
        outgoing.classList.add("is-exit");

        incoming.classList.remove("is-enter-from-preview");
        incoming.classList.add("is-active");

        currentSlide = targetIndex;
        activeLayer = activeLayer === "a" ? "b" : "a";

        animateContent(currentSlide);
        requestAnimationFrame(() => syncHeroControlsToImage());

        window.setTimeout(() => {
            outgoing.classList.remove("is-exit");
            els.media.classList.remove("is-reverse");
            isAnimating = false;
            syncHeroControlsToImage();
        }, prefersReducedMotion ? 200 : TRANSITION_MS);
    }

    function nextSlide() {
        goToSlide(getNextIndex(), 1);
    }

    function prevSlide() {
        goToSlide(getPrevIndex(), -1);
    }

    function startAutoplay() {
        stopAutoplay();
        if (prefersReducedMotion || pauseReasons.size > 0 || slides.length < 2) return;
        autoplayTimer = window.setInterval(nextSlide, AUTOPLAY_MS);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function pauseAutoplay(reason) {
        pauseReasons.add(reason);
        stopAutoplay();
    }

    function resumeAutoplay(reason) {
        pauseReasons.delete(reason);
        if (pauseReasons.size === 0) {
            startAutoplay();
        }
    }

    function restartAutoplay() {
        stopAutoplay();
        if (pauseReasons.size === 0) {
            startAutoplay();
        }
    }

    function bindEvents() {
        els.prevBtn.addEventListener("click", () => {
            prevSlide();
            restartAutoplay();
        });

        els.nextBtn.addEventListener("click", () => {
            nextSlide();
            restartAutoplay();
        });

        els.courseCards.forEach((card) => {
            card.addEventListener("click", (event) => {
                if (event.target.closest("a")) return;
                const index = Number(card.dataset.course);
                const direction = index >= currentSlide || (currentSlide === slides.length - 1 && index === 0) ? 1 : -1;
                goToSlide(index, direction);
                restartAutoplay();
            });
        });

        els.heroOverlays.forEach((overlay) => {
            overlay.addEventListener("mouseenter", () => pauseAutoplay("hover"));
            overlay.addEventListener("mouseleave", () => resumeAutoplay("hover"));
        });

        els.controls.addEventListener("focusin", () => pauseAutoplay("focus"));
        els.controls.addEventListener("focusout", (event) => {
            if (!els.controls.contains(event.relatedTarget)) {
                resumeAutoplay("focus");
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "ArrowRight") {
                nextSlide();
                restartAutoplay();
            } else if (event.key === "ArrowLeft") {
                prevSlide();
                restartAutoplay();
            }
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                pauseAutoplay("hidden");
            } else {
                resumeAutoplay("hidden");
            }
        });

        const onCoursesMqChange = () => {
            mountCoursesForViewport();
            syncHeroControlsToImage();
        };
        if (typeof coursesMq.addEventListener === "function") {
            coursesMq.addEventListener("change", onCoursesMqChange);
        } else if (typeof coursesMq.addListener === "function") {
            coursesMq.addListener(onCoursesMqChange);
        }

        const onHeroControlsMqChange = () => refreshHeroImagesForViewport();
        if (typeof heroControlsMq.addEventListener === "function") {
            heroControlsMq.addEventListener("change", onHeroControlsMqChange);
        } else if (typeof heroControlsMq.addListener === "function") {
            heroControlsMq.addListener(onHeroControlsMqChange);
        }

        window.addEventListener("resize", () => {
            window.requestAnimationFrame(() => {
                refreshHeroImagesForViewport();
            });
        });

        if (typeof ResizeObserver === "function" && els.media) {
            const heroControlsRo = new ResizeObserver(() => {
                window.requestAnimationFrame(syncHeroControlsToImage);
            });
            heroControlsRo.observe(els.media);
            if (els.hero) heroControlsRo.observe(els.hero);
        }
    }

    function init() {
        if (!els.media || !els.content || !slides.length) return;

        preloadImages();
        setInitialSlide();
        mountCoursesForViewport();
        bindEvents();
        syncHeroControlsToImage();
        startAutoplay();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/* ---------- Site navigation (shared by every page) ---------- */
(() => {
    "use strict";

    const els = {
        menuToggle: document.getElementById("menu-toggle"),
        primaryNav: document.getElementById("primary-nav"),
        navDropdowns: document.querySelectorAll(".nav-item--dropdown"),
    };

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const isDrawerNav = () => window.innerWidth < 930;

    // Keep a stable mount point so the drawer can leave <header> on small screens
    // without inflating .site-header scroll width via translateX(100%).
    const navInlineParent = els.primaryNav ? els.primaryNav.parentElement : null;
    const navInlineNext = els.primaryNav ? els.primaryNav.nextElementSibling : null;

    function setHeaderOffset() {
        const header = document.querySelector(".site-header");
        if (!header) return;
        const height = header.offsetHeight;
        document.documentElement.style.setProperty("--header-offset", `${height}px`);
    }

    function mountNavForViewport() {
        if (!els.primaryNav || !navInlineParent) return;

        if (isDrawerNav()) {
            if (els.primaryNav.parentElement !== document.body) {
                document.body.appendChild(els.primaryNav);
            }
            return;
        }

        if (els.primaryNav.parentElement === navInlineParent) return;

        if (navInlineNext && navInlineNext.parentElement === navInlineParent) {
            navInlineParent.insertBefore(els.primaryNav, navInlineNext);
        } else {
            navInlineParent.appendChild(els.primaryNav);
        }
    }

    function setDropdown(item, open) {
        item.classList.toggle("is-open", open);
        item.querySelector(".nav-link").setAttribute("aria-expanded", String(open));
    }

    function closeDropdowns(except) {
        els.navDropdowns.forEach((item) => {
            if (item !== except) setDropdown(item, false);
        });
    }

    function closeMobileNav() {
        if (!els.primaryNav || !els.menuToggle) return;
        els.primaryNav.classList.remove("is-open");
        els.menuToggle.setAttribute("aria-expanded", "false");
        els.menuToggle.setAttribute("aria-label", "Open menu");
        document.body.classList.remove("nav-open");
        closeDropdowns();
    }

    function toggleMobileNav() {
        const open = !els.primaryNav.classList.contains("is-open");
        els.primaryNav.classList.toggle("is-open", open);
        els.menuToggle.setAttribute("aria-expanded", String(open));
        els.menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        document.body.classList.toggle("nav-open", open);
    }

    function init() {
        setHeaderOffset();
        mountNavForViewport();
        window.addEventListener("resize", setHeaderOffset);

        if (!els.menuToggle || !els.primaryNav) return;

        els.menuToggle.addEventListener("click", toggleMobileNav);

        // Registered before the generic link handler so a toggle tap can cancel navigation first.
        els.navDropdowns.forEach((item) => {
            const trigger = item.querySelector(".nav-link");

            trigger.addEventListener("click", (event) => {
                if (finePointer.matches && !isDrawerNav()) return;
                const open = item.classList.contains("is-open");
                if (open && !isDrawerNav()) return;
                event.preventDefault();
                closeDropdowns(item);
                setDropdown(item, !open);
            });

            item.addEventListener("mouseenter", () => {
                if (finePointer.matches && !isDrawerNav()) setDropdown(item, true);
            });

            item.addEventListener("mouseleave", () => {
                if (finePointer.matches && !isDrawerNav()) setDropdown(item, false);
            });
        });

        els.primaryNav.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", (event) => {
                if (!event.defaultPrevented) closeMobileNav();
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeMobileNav();
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".nav-item--dropdown")) {
                closeDropdowns();
            }

            if (
                document.body.classList.contains("nav-open") &&
                !els.primaryNav.contains(event.target) &&
                !els.menuToggle.contains(event.target)
            ) {
                closeMobileNav();
            }
        });

        window.addEventListener("resize", () => {
            mountNavForViewport();
            if (!isDrawerNav()) {
                closeMobileNav();
            }
            setHeaderOffset();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/* ---------- Scroll-linked gallery rows ---------- */
(() => {
    "use strict";

    const TRAVEL_RATIO = 0.35;
    const EASE = 0.12;
    const MAX_FILL_PASSES = 12;

    function initGallery() {
        const section = document.querySelector(".gallery-scroll");
        if (!section) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const rows = Array.from(section.querySelectorAll(".gallery-row")).map((row, index) => ({
            row,
            track: row.querySelector(".gallery-row__track"),
            originals: Array.from(row.querySelectorAll(".gallery-row__item")),
            direction: index % 2 === 0 ? -1 : 1,
            travel: 0,
            current: 0,
            target: 0,
        })).filter((item) => item.track && item.originals.length);

        if (!rows.length) return;

        let rafId = null;
        let inView = false;

        // Repeats the row's own HTML images until the track can cover the row plus its scroll travel.
        function fillTrack(item) {
            item.track.querySelectorAll("[data-gallery-clone]").forEach((node) => node.remove());

            const rowWidth = item.row.clientWidth;
            item.travel = rowWidth * TRAVEL_RATIO;
            const needed = rowWidth + item.travel;

            for (let pass = 0; item.track.scrollWidth < needed && pass < MAX_FILL_PASSES; pass++) {
                item.originals.forEach((original) => {
                    const clone = original.cloneNode(true);
                    clone.setAttribute("data-gallery-clone", "");
                    clone.setAttribute("aria-hidden", "true");
                    const img = clone.querySelector("img");
                    if (img) img.alt = "";
                    item.track.appendChild(clone);
                });
            }
        }

        function getProgress() {
            const rect = section.getBoundingClientRect();
            const viewport = window.innerHeight;
            const progress = (viewport - rect.top) / (viewport + rect.height);
            return Math.min(Math.max(progress, 0), 1);
        }

        function computeTargets() {
            const progress = reduceMotion.matches ? 0.5 : getProgress();
            rows.forEach((item) => {
                item.target = item.direction < 0
                    ? -progress * item.travel
                    : -item.travel + progress * item.travel;
            });
        }

        function applyTransforms() {
            rows.forEach((item) => {
                item.track.style.transform = `translate3d(${item.current.toFixed(2)}px, 0, 0)`;
            });
        }

        function render() {
            let moving = false;

            rows.forEach((item) => {
                const diff = item.target - item.current;
                if (Math.abs(diff) > 0.1) {
                    item.current += diff * EASE;
                    moving = true;
                } else {
                    item.current = item.target;
                }
            });

            applyTransforms();
            rafId = moving ? requestAnimationFrame(render) : null;
        }

        function requestRender() {
            computeTargets();
            if (reduceMotion.matches) {
                rows.forEach((item) => { item.current = item.target; });
                applyTransforms();
                return;
            }
            if (!rafId) rafId = requestAnimationFrame(render);
        }

        function snapToTargets() {
            computeTargets();
            rows.forEach((item) => { item.current = item.target; });
            applyTransforms();
        }

        function layout() {
            rows.forEach(fillTrack);
            snapToTargets();
        }

        const observer = new IntersectionObserver((entries) => {
            inView = entries.some((entry) => entry.isIntersecting);
            if (inView) requestRender();
        }, { rootMargin: "200px 0px" });
        observer.observe(section);

        window.addEventListener("scroll", () => {
            if (inView) requestRender();
        }, { passive: true });

        let resizeTimer = null;
        window.addEventListener("resize", () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(layout, 150);
        });

        reduceMotion.addEventListener("change", snapToTargets);

        layout();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initGallery);
    } else {
        initGallery();
    }
})();

/* Promo banner video modal */
(() => {
    "use strict";

    function initVideoModal() {
        const modal = document.getElementById("promo-video-modal");
        if (!modal || typeof modal.showModal !== "function") return;

        const video = modal.querySelector("video");
        const openers = document.querySelectorAll("[data-video-open]");
        const closeBtn = modal.querySelector("[data-video-close]");
        const root = document.documentElement;

        const open = () => {
            if (modal.open) return;
            root.classList.add("is-video-modal-open");
            modal.showModal();
            if (video) {
                const playback = video.play();
                if (playback && typeof playback.catch === "function") playback.catch(() => { });
            }
        };

        const close = () => {
            if (modal.open) modal.close();
        };

        openers.forEach((btn) => btn.addEventListener("click", open));
        closeBtn?.addEventListener("click", close);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
        });

        modal.addEventListener("close", () => {
            root.classList.remove("is-video-modal-open");
            if (video) {
                video.pause();
                video.currentTime = 0;
            }
        });

        // Keep the hero slider's document-level arrow-key handler from firing while the video has focus.
        modal.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initVideoModal);
    } else {
        initVideoModal();
    }
})();

/* Testimonials card-deck slider */
(() => {
    "use strict";

    const INTERVAL = 4000;
    const SWIPE_THRESHOLD = 40;

    function initTestimonials() {
        const slider = document.querySelector("[data-testimonial-slider]");
        if (!slider) return;

        const deck = slider.querySelector("[data-testimonial-deck]");
        const cards = deck ? Array.from(deck.querySelectorAll(".testimonial-card")) : [];
        const total = cards.length;
        if (!total) return;

        const prevBtn = slider.querySelector("[data-testimonial-prev]");
        const nextBtn = slider.querySelector("[data-testimonial-next]");
        const dotsWrap = document.querySelector("[data-testimonial-dots]");
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        // Must stay in sync with --deck-duration in style.css.
        const duration = parseFloat(getComputedStyle(slider.closest(".testimonials") || slider).getPropertyValue("--deck-duration")) || 900;

        let current = 0;
        let isAnimating = false;
        let timer = null;
        const pauseReasons = new Set();

        const dots = dotsWrap
            ? cards.map((_, i) => {
                const dot = document.createElement("button");
                dot.type = "button";
                dot.className = "testimonials__dot";
                dot.setAttribute("aria-label", `Show testimonial ${i + 1}`);
                dot.addEventListener("click", () => {
                    if (i !== current) goTo(i, i > current ? 1 : -1, true);
                });
                dotsWrap.appendChild(dot);
                return dot;
            })
            : [];

        function layout() {
            cards.forEach((card, i) => {
                const pos = (i - current + total) % total;
                card.dataset.pos = pos <= 2 ? String(pos) : "back";
                card.setAttribute("aria-label", `${i + 1} of ${total}`);
                card.setAttribute("aria-hidden", String(pos !== 0));
            });

            dots.forEach((dot, i) => {
                const active = i === current;
                dot.classList.toggle("is-active", active);
                dot.setAttribute("aria-current", active ? "true" : "false");
            });
        }

        function schedule() {
            window.clearTimeout(timer);
            if (pauseReasons.size || total < 2) return;
            timer = window.setTimeout(() => {
                if (isAnimating) {
                    schedule();
                    return;
                }
                goTo(current + 1, 1, false);
            }, INTERVAL);
        }

        function pause(reason) {
            pauseReasons.add(reason);
            window.clearTimeout(timer);
        }

        function resume(reason) {
            pauseReasons.delete(reason);
            schedule();
        }

        // dir > 0: front card swings out and tucks behind the deck.
        // dir < 0: target card swings out from behind the deck to the front.
        function goTo(index, dir, fromUser) {
            const target = (index + total) % total;
            if (isAnimating || target === current) return;

            const outgoing = cards[current];
            const incoming = cards[target];
            current = target;

            deck.setAttribute("aria-live", fromUser ? "polite" : "off");

            if (reduceMotion.matches) {
                layout();
                schedule();
                return;
            }

            const animated = dir > 0 ? outgoing : incoming;
            const className = dir > 0 ? "is-to-back" : "is-from-back";
            let fallback = null;

            const finish = () => {
                window.clearTimeout(fallback);
                animated.removeEventListener("animationend", onEnd);
                animated.classList.remove(className);
                isAnimating = false;
            };

            const onEnd = (e) => {
                if (e.target === animated) finish();
            };

            isAnimating = true;
            animated.classList.add(className);
            animated.addEventListener("animationend", onEnd);
            fallback = window.setTimeout(finish, duration + 150);
            layout();
            schedule();
        }

        const next = (fromUser) => goTo(current + 1, 1, fromUser);
        const prev = (fromUser) => goTo(current - 1, -1, fromUser);

        nextBtn?.addEventListener("click", () => next(true));
        prevBtn?.addEventListener("click", () => prev(true));

        // Stop the hero slider's document-level arrow-key handler from also firing.
        slider.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                next(true);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                prev(true);
            }
        });

        let touchStartX = null;
        let touchStartY = null;

        deck.addEventListener("touchstart", (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        deck.addEventListener("touchend", (e) => {
            if (touchStartX === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            touchStartX = null;
            if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0) next(true);
            else prev(true);
        }, { passive: true });

        slider.addEventListener("mouseenter", () => pause("hover"));
        slider.addEventListener("mouseleave", () => resume("hover"));
        slider.addEventListener("focusin", () => pause("focus"));
        slider.addEventListener("focusout", (e) => {
            if (!slider.contains(e.relatedTarget)) resume("focus");
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) pause("hidden");
            else resume("hidden");
        });

        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) resume("offscreen");
                    else pause("offscreen");
                });
            }, { threshold: 0.25 });
            observer.observe(slider);
        }

        layout();
        schedule();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTestimonials);
    } else {
        initTestimonials();
    }
})();

/* FAQ category tabs + accordion */
(() => {
    "use strict";

    // Must match the .faq__panel opacity/transform transition in style.css.
    const LEAVE_DURATION = 180;

    function initFaq() {
        const root = document.querySelector("[data-faq]");
        if (!root) return;

        const tablist = root.querySelector('[role="tablist"]');
        const tabs = Array.from(root.querySelectorAll("[data-faq-tab]"));
        const panels = Array.from(root.querySelectorAll("[data-faq-panel]"));
        if (!tabs.length || !panels.length) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let switchTimer = null;

        panels.forEach((panel) => {
            panel.querySelectorAll(".faq-item").forEach((item, i) => item.style.setProperty("--i", i));
        });

        const panelFor = (tab) => root.querySelector(`[data-faq-panel="${tab.dataset.faqTab}"]`);

        function showPanel(target) {
            panels.forEach((panel) => {
                const isTarget = panel === target;
                panel.hidden = !isTarget;
                panel.classList.remove("is-leaving", "is-entering");
                panel.classList.toggle("is-active", isTarget);
            });

            if (!reduceMotion.matches) {
                void target.offsetWidth;
                target.classList.add("is-entering");
            }
        }

        function scrollTabIntoView(tab) {
            if (tablist.scrollWidth <= tablist.clientWidth) return;
            tablist.scrollTo({
                left: tab.offsetLeft - (tablist.clientWidth - tab.offsetWidth) / 2,
                behavior: reduceMotion.matches ? "auto" : "smooth",
            });
        }

        function activate(tab, moveFocus) {
            if (moveFocus) tab.focus();
            scrollTabIntoView(tab);
            if (tab.classList.contains("is-active")) return;

            tabs.forEach((t) => {
                const active = t === tab;
                t.classList.toggle("is-active", active);
                t.setAttribute("aria-selected", String(active));
                t.tabIndex = active ? 0 : -1;
            });

            const target = panelFor(tab);
            if (!target) return;

            window.clearTimeout(switchTimer);
            const current = panels.find((p) => !p.hidden && p !== target);

            if (!current || reduceMotion.matches) {
                showPanel(target);
                return;
            }

            current.classList.add("is-leaving");
            switchTimer = window.setTimeout(() => showPanel(target), LEAVE_DURATION);
        }

        tabs.forEach((tab) => tab.addEventListener("click", () => activate(tab, false)));

        // Also stops the hero slider's document-level arrow-key handler from firing.
        tablist.addEventListener("keydown", (e) => {
            const index = tabs.indexOf(document.activeElement);
            if (index === -1) return;

            let nextIndex = null;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
            else if (e.key === "Home") nextIndex = 0;
            else if (e.key === "End") nextIndex = tabs.length - 1;
            if (nextIndex === null) return;

            e.preventDefault();
            e.stopPropagation();
            activate(tabs[nextIndex], true);
        });

        function setOpen(item, open) {
            item.classList.toggle("is-open", open);
            item.querySelector(".faq-item__trigger")?.setAttribute("aria-expanded", String(open));
        }

        root.addEventListener("click", (e) => {
            const trigger = e.target.closest(".faq-item__trigger");
            if (!trigger || !root.contains(trigger)) return;

            const item = trigger.closest(".faq-item");
            const panel = item.closest("[data-faq-panel]");
            const willOpen = !item.classList.contains("is-open");

            if (willOpen && panel) {
                panel.querySelectorAll(".faq-item.is-open").forEach((other) => {
                    if (other !== item) setOpen(other, false);
                });
            }
            setOpen(item, willOpen);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFaq);
    } else {
        initFaq();
    }
})();

/* Contact form: inline validation + mock submission */
(() => {
    "use strict";

    const MOCK_SEND_DELAY = 1200;

    const MESSAGES = {
        name: { valueMissing: "Please enter your name.", tooShort: "Name should be at least 2 characters." },
        email: { valueMissing: "Please enter your email address.", typeMismatch: "Please enter a valid email address." },
        phone: { patternMismatch: "Please enter a valid phone number." },
        message: { valueMissing: "Please write a message.", tooShort: "Message should be at least 10 characters." },
    };

    function initContactForm() {
        const form = document.querySelector("[data-contact-form]");
        if (!form) return;

        const fields = Array.from(form.querySelectorAll(".contact-field__input"));
        const submitBtn = form.querySelector(".contact-form__submit");
        const submitLabel = submitBtn?.querySelector(".contact-form__submit-label");
        const status = form.querySelector(".contact-form__status");
        const defaultLabel = submitLabel?.textContent || "Send Message";

        function errorFor(input) {
            const { validity } = input;
            if (validity.valid) return "";
            const map = MESSAGES[input.name] || {};
            const key = Object.keys(map).find((k) => validity[k]);
            return key ? map[key] : input.validationMessage;
        }

        function validate(input) {
            const wrapper = input.closest(".contact-field");
            const errorEl = wrapper?.querySelector(".contact-field__error");
            const message = errorFor(input);
            wrapper?.classList.toggle("is-invalid", Boolean(message));
            input.setAttribute("aria-invalid", String(Boolean(message)));
            if (errorEl) errorEl.textContent = message;
            return !message;
        }

        function setStatus(text, isError) {
            if (!status) return;
            status.textContent = "";
            status.classList.toggle("is-error", Boolean(isError));
            // Re-insert on the next frame so screen readers and the CSS entrance animation both pick up repeated messages.
            window.requestAnimationFrame(() => {
                status.textContent = text;
            });
        }

        fields.forEach((input) => {
            input.addEventListener("blur", () => {
                if (input.value.trim() !== "" || input.hasAttribute("aria-invalid")) validate(input);
            });
            input.addEventListener("input", () => {
                if (input.closest(".contact-field")?.classList.contains("is-invalid")) validate(input);
            });
        });

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (submitBtn?.classList.contains("is-loading")) return;

            fields.forEach((input) => {
                if (input.type !== "email" && input.type !== "tel") return;
                input.value = input.value.trim();
            });

            const results = fields.map(validate);
            const firstInvalid = fields[results.indexOf(false)];
            if (firstInvalid) {
                firstInvalid.focus();
                setStatus("Please fix the highlighted fields.", true);
                return;
            }

            const firstName = (form.elements.namedItem("name")?.value || "").trim().split(/\s+/)[0];

            submitBtn?.classList.add("is-loading");
            submitBtn?.setAttribute("aria-busy", "true");
            if (submitBtn) submitBtn.disabled = true;
            if (submitLabel) submitLabel.textContent = "Sending...";
            setStatus("", false);

            // Mock request: replace with a real fetch() to your form endpoint.
            window.setTimeout(() => {
                submitBtn?.classList.remove("is-loading");
                submitBtn?.removeAttribute("aria-busy");
                if (submitBtn) submitBtn.disabled = false;
                if (submitLabel) submitLabel.textContent = defaultLabel;

                form.reset();
                fields.forEach((input) => {
                    input.removeAttribute("aria-invalid");
                    input.closest(".contact-field")?.classList.remove("is-invalid");
                });

                setStatus(`Thanks${firstName ? `, ${firstName}` : ""}! Your message has been sent. We'll be in touch soon.`, false);
            }, MOCK_SEND_DELAY);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initContactForm);
    } else {
        initContactForm();
    }
})();

/* Footer: newsletter validation + mock subscribe, current year */
(() => {
    "use strict";

    const MOCK_SEND_DELAY = 900;

    function initFooter() {
        document.querySelectorAll("[data-current-year]").forEach((el) => {
            el.textContent = String(new Date().getFullYear());
        });

        const form = document.querySelector("[data-newsletter-form]");
        if (!form) return;

        const input = form.querySelector('input[type="email"]');
        const submitBtn = form.querySelector('button[type="submit"]');
        const status = document.getElementById(input?.getAttribute("aria-describedby") || "");
        if (!input || !submitBtn) return;

        const defaultLabel = submitBtn.textContent;

        function setStatus(text, isError) {
            if (!status) return;
            status.textContent = text;
            status.classList.toggle("is-error", Boolean(isError));
        }

        function validate() {
            input.value = input.value.trim();
            let message = "";
            if (input.validity.valueMissing) message = "Please enter your email address.";
            else if (input.validity.typeMismatch) message = "Please enter a valid email address.";

            form.classList.toggle("is-invalid", Boolean(message));
            input.setAttribute("aria-invalid", String(Boolean(message)));
            return message;
        }

        input.addEventListener("input", () => {
            if (!form.classList.contains("is-invalid")) return;
            if (!validate()) setStatus("", false);
        });

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (submitBtn.disabled) return;

            const error = validate();
            if (error) {
                setStatus(error, true);
                input.focus();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Subscribing...";
            setStatus("", false);

            // Mock request: replace with a real call to your newsletter provider.
            window.setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = defaultLabel;
                form.reset();
                input.removeAttribute("aria-invalid");
                setStatus("Thanks for subscribing! Watch your inbox for updates from Airborne.", false);
            }, MOCK_SEND_DELAY);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFooter);
    } else {
        initFooter();
    }
})();

/* ---------- Floating WhatsApp chat widget ---------- */
(() => {
    "use strict";

    const WA_NUMBER = "919207185501";
    const DEFAULT_MESSAGE = "Hello Airborne! I would like to know more about your courses.";

    function buildWidget() {
        const root = document.createElement("div");
        root.className = "wa-widget";
        root.dataset.waWidget = "";
        root.innerHTML = `
            <div class="wa-widget__panel" id="wa-chat-panel" role="dialog" aria-modal="false" aria-labelledby="wa-chat-title" hidden>
                <div class="wa-widget__header">
                    <span class="wa-widget__avatar" aria-hidden="true"><i class="fa-brands fa-whatsapp"></i></span>
                    <div class="wa-widget__heading">
                        <p class="wa-widget__title" id="wa-chat-title">Airborne Admissions</p>
                        <p class="wa-widget__status">Typically replies within minutes</p>
                    </div>
                    <button type="button" class="wa-widget__close" aria-label="Close WhatsApp chat">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="wa-widget__body">
                    <div class="wa-widget__bubble">
                        <strong>Welcome to AIRBORNE!</strong>
                        Ask us about admissions, courses, or campus life. Type your message below and tap send to continue on WhatsApp.
                    </div>
                </div>
                <form class="wa-widget__footer" data-wa-form>
                    <input
                        id="wa-chat-input"
                        class="wa-widget__input"
                        type="text"
                        name="message"
                        maxlength="500"
                        placeholder="Type your message..."
                        autocomplete="off"
                        aria-label="Your message"
                    />
                    <button type="submit" class="wa-widget__send" aria-label="Send on WhatsApp">
                        <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                    </button>
                </form>
            </div>
            <button type="button" class="wa-widget__fab" aria-label="Open WhatsApp chat" aria-expanded="false" aria-controls="wa-chat-panel">
                <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
                <i class="fa-solid fa-xmark wa-widget__fab-close" aria-hidden="true"></i>
            </button>
        `;
        return root;
    }

    function initWhatsAppWidget() {
        if (document.querySelector("[data-wa-widget]")) return;

        const widget = buildWidget();
        document.body.appendChild(widget);

        const fab = widget.querySelector(".wa-widget__fab");
        const panel = widget.querySelector(".wa-widget__panel");
        const closeBtn = widget.querySelector(".wa-widget__close");
        const form = widget.querySelector("[data-wa-form]");
        const input = widget.querySelector(".wa-widget__input");

        const setOpen = (open) => {
            widget.classList.toggle("is-open", open);
            fab.setAttribute("aria-expanded", open ? "true" : "false");
            fab.setAttribute("aria-label", open ? "Close WhatsApp chat" : "Open WhatsApp chat");
            if (open) {
                panel.removeAttribute("hidden");
                window.requestAnimationFrame(() => input.focus());
            } else {
                window.setTimeout(() => {
                    if (!widget.classList.contains("is-open")) panel.setAttribute("hidden", "");
                }, 320);
            }
        };

        fab.addEventListener("click", () => {
            setOpen(!widget.classList.contains("is-open"));
        });

        closeBtn.addEventListener("click", () => setOpen(false));

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && widget.classList.contains("is-open")) {
                setOpen(false);
                fab.focus();
            }
        });

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const message = (input.value || "").trim() || DEFAULT_MESSAGE;
            const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
            window.open(url, "_blank", "noopener,noreferrer");
            setOpen(false);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWhatsAppWidget);
    } else {
        initWhatsAppWidget();
    }
})();

/* ---------- Back to top ---------- */
(() => {
    "use strict";

    const SHOW_AFTER_PX = 420;

    function initBackToTop() {
        if (document.querySelector("[data-back-to-top]")) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "back-to-top";
        btn.dataset.backToTop = "";
        btn.setAttribute("aria-label", "Back to top");
        btn.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
        document.body.appendChild(btn);

        let ticking = false;

        const syncVisibility = () => {
            const shouldShow = window.scrollY > SHOW_AFTER_PX;
            btn.classList.toggle("is-visible", shouldShow);
            ticking = false;
        };

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(syncVisibility);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        syncVisibility();

        btn.addEventListener("click", () => {
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({
                top: 0,
                behavior: reduceMotion ? "auto" : "smooth",
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBackToTop);
    } else {
        initBackToTop();
    }
})();
