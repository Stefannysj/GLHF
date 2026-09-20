(() => {
  "use strict";

  let dotnet = null;
  let keyboard = null;
  let active = "";
  let observer = null;
  const visibleEras = new Set();
  const eraSections = Array.from(document.querySelectorAll("[data-era]"));
  const eraIds = eraSections.map(el => el.id);
  const sectionIds = new Set(eraIds);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const escapeId = id => CSS.escape(id);

  function openSource(hash) {
    if (!hash.startsWith("#source-")) return;
    const details = document.querySelector("#fuentes details");
    if (details) details.open = true;
  }

  // Fragment-only links must remain on this document, including the root HTML preview
  // and the published site under a repository subpath. Absolute sources stay unchanged.
  function normalizeFragmentLinks() {
    const current = new URL(location.href);
    current.hash = "";
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      const fragment = link.getAttribute("href");
      link.dataset.fragment = fragment;
      link.href = current.href + fragment;
    });
  }

  function eraMeta(id) {
    const section = document.getElementById(id);
    return {
      period: section?.querySelector(".era-period")?.textContent?.trim() || id.replace("era-", ""),
      title: section?.querySelector(".era-stamp .eyebrow")?.textContent?.replace(/^\d+\s*\/\s*/, "")?.trim() || "Era"
    };
  }

  function ensureRailLinkVisible(id) {
    const rail = document.querySelector("[data-timeline-rail]");
    const link = rail?.querySelector(`[data-era-rail="${escapeId(id)}"]`);
    if (!rail || !link || rail.dataset.dragging === "true") return;
    const left = link.offsetLeft;
    const right = left + link.offsetWidth;
    const viewLeft = rail.scrollLeft;
    const viewRight = viewLeft + rail.clientWidth;
    if (left < viewLeft + 12) rail.scrollTo({ left: Math.max(0, left - 12), behavior: reduced() ? "auto" : "smooth" });
    else if (right > viewRight - 12) rail.scrollTo({ left: right - rail.clientWidth + 12, behavior: reduced() ? "auto" : "smooth" });
  }

  function setActiveEra(id, syncDotnet = true) {
    if (!sectionIds.has(id)) return;
    const changed = active !== id;
    active = id;
    document.documentElement.dataset.activeEra = id;

    document.querySelectorAll("[data-era-link]").forEach(link => {
      if (link.dataset.eraLink === id) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-era-rail]").forEach(link => {
      if (link.dataset.eraRail === id) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    eraSections.forEach(section => section.classList.toggle("is-active", section.id === id));

    const meta = eraMeta(id);
    const period = document.querySelector("[data-timeline-now-period]");
    const title = document.querySelector("[data-timeline-now-title]");
    if (period) period.textContent = meta.period;
    if (title) title.textContent = meta.title;
    const progressEra = document.querySelector("[data-scroll-progress-era]");
    if (progressEra) progressEra.textContent = `${meta.period} / ${meta.title}`;
    if (!timeMachineDragging) updateTimeMachine(id);
    if (changed) { ensureRailLinkVisible(id); if (progressPersistenceReady) persistEra(id); }

    if (changed && syncDotnet && dotnet) {
      dotnet.invokeMethodAsync("SetVisibleEra", id).catch(console.error);
    }
  }

  function scrollToEra(id, focusSelector) {
    if (!sectionIds.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    history.replaceState(null, "", "#" + id);
    setActiveEra(id, true);
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    if (focusSelector) document.querySelector(`${focusSelector}="${escapeId(id)}"]`)?.focus({ preventScroll: true });
  }

  function initializeTimeline() {
    if (!eraSections.length) return;
    const hashId = location.hash.slice(1);
    setActiveEra(sectionIds.has(hashId) ? hashId : eraIds[0], false);

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) visibleEras.add(entry.target.id);
          else visibleEras.delete(entry.target.id);
        });
        if (!visibleEras.size) return;
        const best = [...visibleEras]
          .map(id => document.getElementById(id))
          .filter(Boolean)
          .sort((a, b) => Math.abs(a.getBoundingClientRect().top - 150) - Math.abs(b.getBoundingClientRect().top - 150))[0];
        if (best) setActiveEra(best.id, true);
      }, { rootMargin: "-10% 0px -58% 0px", threshold: [0, .08, .2] });
      eraSections.forEach(el => observer.observe(el));
    }

    const rail = document.querySelector("[data-timeline-rail]");
    if (rail) {
      let startX = 0;
      let startScroll = 0;
      let moved = false;
      let suppressClickUntil = 0;

      rail.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        startX = event.clientX;
        startScroll = rail.scrollLeft;
        moved = false;
        rail.dataset.dragging = "true";
        rail.setPointerCapture?.(event.pointerId);
      });
      rail.addEventListener("pointermove", event => {
        if (rail.dataset.dragging !== "true") return;
        const delta = event.clientX - startX;
        if (Math.abs(delta) > 5) moved = true;
        if (moved) {
          rail.scrollLeft = startScroll - delta;
          event.preventDefault();
        }
      });
      const finishDrag = event => {
        if (rail.dataset.dragging !== "true") return;
        rail.dataset.dragging = "false";
        if (moved) suppressClickUntil = Date.now() + 180;
        try { rail.releasePointerCapture?.(event.pointerId); } catch { }
      };
      rail.addEventListener("pointerup", finishDrag);
      rail.addEventListener("pointercancel", finishDrag);
      rail.addEventListener("click", event => {
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
      rail.addEventListener("click", event => {
        const link = event.target.closest("[data-era-rail]");
        if (!link || Date.now() < suppressClickUntil) return;
        event.preventDefault();
        scrollToEra(link.dataset.eraRail, null);
      });
      rail.addEventListener("keydown", event => {
        const current = event.target.closest("[data-era-rail]");
        if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let index = eraIds.indexOf(current.dataset.eraRail);
        if (index < 0) index = 0;
        if (event.key === "Home") index = 0;
        else if (event.key === "End") index = eraIds.length - 1;
        else if (event.key === "ArrowLeft") index = Math.max(0, index - 1);
        else index = Math.min(eraIds.length - 1, index + 1);
        scrollToEra(eraIds[index], `[data-era-rail`);
      });
    }
  }

  document.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    if (link.dataset.eraLink && !dotnet) {
      event.preventDefault();
      scrollToEra(link.dataset.eraLink, null);
      return;
    }
    if (link.dataset.fragment && !link.dataset.eraLink) {
      const fragment = link.dataset.fragment;
      if (document.getElementById(fragment.slice(1))) {
        event.preventDefault();
        navigateFragment(fragment);
      }
    }
  });
  window.addEventListener("hashchange", () => {
    openSource(location.hash);
    const id = location.hash.slice(1);
    if (sectionIds.has(id)) setActiveEra(id, true);
  });
  window.addEventListener("beforeprint", () => {
    const details = document.querySelector("#fuentes details");
    if (details) { details.dataset.wasOpen = String(details.open); details.open = true; }
  });
  window.addEventListener("afterprint", () => {
    const details = document.querySelector("#fuentes details");
    if (details) details.open = details.dataset.wasOpen === "true";
  });

  // Stage 03 Hero remains intact; Stage 05 adds motion around it without changing its behavior.
  const hero = document.querySelector(".hero[data-hero-position]");
  const heroPositions = ["center", "top-left", "top-right", "bottom-right", "bottom-left"];
  const heroNames = {
    "center": "CENTRO",
    "top-left": "ARRIBA / IZQUIERDA",
    "top-right": "ARRIBA / DERECHA",
    "bottom-left": "ABAJO / IZQUIERDA",
    "bottom-right": "ABAJO / DERECHA"
  };
  let heroDotnet = null;
  let heroVisible = true;
  let heroPointerInside = false;
  let heroFocusInside = false;
  let heroPauseUntil = 0;
  let heroLastRotation = Date.now();
  let heroTimer = null;
  let heroObserver = null;

  function heroInterval() {
    return window.matchMedia("(max-width: 680px)").matches ? 6500 : 5500;
  }
  function heroCanRotate() {
    return !!hero && !reduced() && heroVisible && !heroPointerInside && !heroFocusInside &&
      document.visibilityState === "visible" && Date.now() >= heroPauseUntil;
  }
  function refreshHeroState() {
    if (!hero) return;
    const running = heroCanRotate();
    hero.dataset.heroAutoState = running ? "running" : "paused";
    const autoLabel = hero.querySelector("[data-hero-auto-label]");
    if (autoLabel) autoLabel.textContent = reduced() ? "MOVIMIENTO REDUCIDO" : (running ? `AUTO ${(heroInterval() / 1000).toFixed(1)}S` : "AUTO EN PAUSA");
  }
  function updateHeroControls(position) {
    if (!hero) return;
    hero.querySelectorAll("[data-hero-position-button]").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.heroPositionButton === position ? "true" : "false");
    });
    const label = hero.querySelector("[data-hero-position-label]");
    if (label) label.textContent = heroNames[position] || "CENTRO";
  }
  function setHeroPosition(position, manual = false, syncDotnet = false) {
    if (!hero || !heroPositions.includes(position)) return;
    hero.dataset.heroPosition = position;
    updateHeroControls(position);
    if (manual) {
      heroPauseUntil = Date.now() + 12000;
      heroLastRotation = Date.now();
    }
    refreshHeroState();
    if (syncDotnet && heroDotnet) heroDotnet.invokeMethodAsync("SetPositionFromBrowser", position).catch(console.error);
  }
  function rotateHero() {
    if (!heroCanRotate()) { refreshHeroState(); return; }
    const now = Date.now();
    if (now - heroLastRotation < heroInterval()) return;
    const current = heroPositions.indexOf(hero.dataset.heroPosition || "center");
    const next = heroPositions[(current + 1 + heroPositions.length) % heroPositions.length];
    heroLastRotation = now;
    setHeroPosition(next, false, true);
  }
  function initializeHero() {
    if (!hero) return;
    updateHeroControls(hero.dataset.heroPosition || "center");
    const interactiveZones = [hero.querySelector(".hero-copy"), hero.querySelector("#hero-controls")].filter(Boolean);
    interactiveZones.forEach(zone => {
      zone.addEventListener("pointerenter", () => { heroPointerInside = true; refreshHeroState(); });
      zone.addEventListener("pointerleave", () => { heroPointerInside = false; heroLastRotation = Date.now(); refreshHeroState(); });
    });
    hero.addEventListener("focusin", () => { heroFocusInside = true; refreshHeroState(); });
    hero.addEventListener("focusout", event => {
      if (event.relatedTarget && hero.contains(event.relatedTarget)) return;
      heroFocusInside = false;
      heroLastRotation = Date.now();
      refreshHeroState();
    });
    hero.addEventListener("click", event => {
      const button = event.target.closest("[data-hero-position-button]");
      if (!button || heroDotnet) return;
      setHeroPosition(button.dataset.heroPositionButton, true, false);
    });
    if ("IntersectionObserver" in window) {
      heroObserver = new IntersectionObserver(entries => {
        heroVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .18);
        if (heroVisible) heroLastRotation = Date.now();
        refreshHeroState();
      }, { threshold: [0, .18, .5] });
      heroObserver.observe(hero);
    }
    document.addEventListener("visibilitychange", () => { heroLastRotation = Date.now(); refreshHeroState(); });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => {
      if (reduced()) setHeroPosition("center", false, true);
      heroLastRotation = Date.now();
      refreshHeroState();
    });
    window.addEventListener("resize", () => { heroLastRotation = Date.now(); refreshHeroState(); }, { passive: true });
    heroTimer = window.setInterval(rotateHero, 500);
    refreshHeroState();
  }

  function initializeGameCards() {
    document.querySelectorAll("[data-tilt-card]").forEach(card => {
      const image = card.querySelector(".game-media img");
      image?.addEventListener("error", () => card.classList.add("media-failed"), { once: true });
      image?.addEventListener("load", () => card.classList.remove("media-failed"));
      card.addEventListener("pointermove", event => {
        if (reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--tilt-y", `${((x - .5) * 7).toFixed(2)}deg`);
        card.style.setProperty("--tilt-x", `${((.5 - y) * 6).toFixed(2)}deg`);
        card.style.setProperty("--shine-x", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--shine-y", `${(y * 100).toFixed(1)}%`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
        card.style.setProperty("--shine-x", "50%");
        card.style.setProperty("--shine-y", "50%");
      });
    });
  }


  // Stage 05 — reveal-on-scroll, continuous chronology progress and section polish.
  let revealObserver = null;
  let sectionObserver = null;
  let scrollFrame = 0;
  let arrivalTimer = 0;

  function markArrival(target) {
    if (!target || reduced()) return;
    target.classList.remove("section-arrival");
    // Force only this small animation to restart; no layout reads on normal scroll.
    void target.offsetWidth;
    target.classList.add("section-arrival");
    clearTimeout(arrivalTimer);
    arrivalTimer = window.setTimeout(() => target.classList.remove("section-arrival"), 850);
  }

  function navigateFragment(fragment) {
    if (!fragment?.startsWith("#") || fragment === "#") return false;
    const id = decodeURIComponent(fragment.slice(1));
    const target = document.getElementById(id);
    if (!target) return false;
    openSource(fragment);
    history.replaceState(null, "", fragment);
    target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    if (!reduced()) window.setTimeout(() => markArrival(target.closest(".section-wrap") || target), 360);
    return true;
  }

  function decorateRevealItems() {
    const groups = [
      ".section-heading > *",
      ".archive-brief-copy",
      ".archive-fact",
      ".archive-reading-key > *",
      ".era",
      ".milestone",
      ".editorial-note",
      ".revolution",
      ".gallery-note",
      ".game-card",
      ".future-layout > *",
      ".sources-section details"
    ];
    const items = [];
    groups.forEach(selector => {
      document.querySelectorAll(selector).forEach((el, index) => {
        if (el.classList.contains("reveal-item")) return;
        el.classList.add("reveal-item");
        el.style.setProperty("--reveal-delay", `${Math.min(index % 6, 5) * 54}ms`);
        items.push(el);
      });
    });

    if (reduced() || !("IntersectionObserver" in window)) {
      items.forEach(el => el.classList.add("is-revealed"));
      return;
    }

    document.documentElement.classList.add("motion-ready");
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver?.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    items.forEach(el => revealObserver.observe(el));
  }

  function initializeSectionFocus() {
    const sections = Array.from(document.querySelectorAll(".section-wrap"));
    if (!sections.length || !("IntersectionObserver" in window)) return;
    sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle("is-section-active", entry.isIntersecting));
    }, { rootMargin: "-18% 0px -42% 0px", threshold: 0 });
    sections.forEach(section => sectionObserver.observe(section));
  }

  function updateScrollEffects() {
    scrollFrame = 0;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const ratio = Math.max(0, Math.min(1, window.scrollY / max));
    doc.style.setProperty("--page-scroll", ratio.toFixed(5));
    const percent = document.querySelector("[data-scroll-progress-percent]");
    if (percent) percent.textContent = `${Math.round(ratio * 100).toString().padStart(2, "0")}%`;

    const progressEra = document.querySelector("[data-scroll-progress-era]");
    if (progressEra) {
      const chapterPoint = Math.min(window.innerHeight * .28, 220);
      const chapters = [
        [hero, "1958—2026 / MUSEO DIGITAL"],
        [document.getElementById("historia"), null],
        [document.getElementById("revoluciones"), "REVOLUCIONES / CAMBIOS DE PARADIGMA"],
        [document.getElementById("coleccion"), "COLECCIÓN / 14 FICHAS"],
        [document.getElementById("futuro"), "FUTURO / LA PARTIDA CONTINÚA"],
        [document.getElementById("fuentes"), "FUENTES / ARCHIVO ABIERTO"]
      ].filter(([el]) => el);
      const currentChapter = chapters.find(([el]) => {
        const rect = el.getBoundingClientRect();
        return rect.top <= chapterPoint && rect.bottom > chapterPoint;
      });
      if (ratio > .965 && document.getElementById("fuentes")) {
        progressEra.textContent = "FUENTES / ARCHIVO ABIERTO";
      } else if (currentChapter) {
        if (currentChapter[1]) progressEra.textContent = currentChapter[1];
        else if (active) {
          const meta = eraMeta(active);
          progressEra.textContent = `${meta.period} / ${meta.title}`;
        }
      }
    }

    if (hero && !reduced()) {
      const heroRect = hero.getBoundingClientRect();
      const traveled = Math.max(0, Math.min(heroRect.height, -heroRect.top + 88));
      hero.style.setProperty("--hero-parallax", `${(traveled * .035).toFixed(2)}px`);
      hero.style.setProperty("--hero-axis-parallax", `${(traveled * -.018).toFixed(2)}px`);
    }
  }

  function scheduleScrollEffects() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateScrollEffects);
  }

  function initializeMotionSystem() {
    decorateRevealItems();
    initializeSectionFocus();
    updateScrollEffects();
    window.addEventListener("scroll", scheduleScrollEffects, { passive: true });
    window.addEventListener("resize", scheduleScrollEffects, { passive: true });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => {
      if (reduced()) {
        document.documentElement.classList.remove("motion-ready");
        document.querySelectorAll(".reveal-item").forEach(el => el.classList.add("is-revealed"));
      }
      scheduleScrollEffects();
    });
  }


  // Stage 06 — time machine, remembered progress and Konami easter egg.
  const STORAGE_ERA = "glhf:last-era";
  const STORAGE_SECRET = "glhf:player2";
  let timeMachineDragging = false;
  let progressPersistenceReady = false;

  function eraIndex(id) { return Math.max(0, eraIds.indexOf(id)); }

  function updateTimeMachine(id) {
    const slider = document.querySelector("[data-time-machine-slider]");
    const period = document.querySelector("[data-time-machine-period]");
    const name = document.querySelector("[data-time-machine-name]");
    if (!slider || !sectionIds.has(id)) return;
    slider.value = String(eraIndex(id));
    const meta = eraMeta(id);
    if (period) period.textContent = meta.period;
    if (name) name.textContent = meta.title;
    slider.setAttribute("aria-valuetext", `${meta.period}: ${meta.title}`);
  }

  function initializeTimeMachine() {
    const slider = document.querySelector("[data-time-machine-slider]");
    if (!slider || !eraIds.length) return;
    updateTimeMachine(active || eraIds[0]);
    const preview = () => {
      const id = eraIds[Math.max(0, Math.min(eraIds.length - 1, Number(slider.value) || 0))];
      timeMachineDragging = true;
      setActiveEra(id, true);
      updateTimeMachine(id);
    };
    slider.addEventListener("input", preview);
    slider.addEventListener("change", () => {
      const id = eraIds[Math.max(0, Math.min(eraIds.length - 1, Number(slider.value) || 0))];
      timeMachineDragging = false;
      scrollToEra(id, null);
      try { localStorage.setItem(STORAGE_ERA, id); } catch { }
    });
    slider.addEventListener("blur", () => { timeMachineDragging = false; });
  }

  function persistEra(id) {
    if (!sectionIds.has(id)) return;
    try { localStorage.setItem(STORAGE_ERA, id); } catch { }
  }

  function initializeResumeProgress() {
    const prompt = document.querySelector("[data-resume-prompt]");
    const label = prompt?.querySelector("[data-resume-label]");
    const go = prompt?.querySelector("[data-resume-go]");
    const dismiss = prompt?.querySelector("[data-resume-dismiss]");
    let saved = "";
    try { saved = localStorage.getItem(STORAGE_ERA) || ""; } catch { }
    if (!prompt || !sectionIds.has(saved) || saved === eraIds[0] || location.hash) return;
    const meta = eraMeta(saved);
    if (label) label.textContent = `Continuar en ${meta.period} · ${meta.title}`;
    prompt.hidden = false;
    go?.addEventListener("click", () => { prompt.hidden = true; scrollToEra(saved, null); }, { once: true });
    dismiss?.addEventListener("click", () => {
      prompt.hidden = true;
      try { localStorage.setItem(STORAGE_ERA, eraIds[0]); } catch { }
      setActiveEra(eraIds[0], true);
    }, { once: true });
  }

  function showSecretToast(message) {
    const toast = document.querySelector("[data-secret-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showSecretToast.timer);
    showSecretToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3600);
  }

  function setSecretMode(enabled, announce = false) {
    document.documentElement.classList.toggle("secret-mode", enabled);
    try { localStorage.setItem(STORAGE_SECRET, enabled ? "1" : "0"); } catch { }
    if (announce) showSecretToast(enabled ? "KONAMI CODE · MODO PLAYER 2 DESBLOQUEADO" : "MODO PLAYER 2 DESACTIVADO");
  }

  function initializeKonamiCode() {
    try { if (localStorage.getItem(STORAGE_SECRET) === "1") setSecretMode(true, false); } catch { }
    const sequence = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    let index = 0;
    document.addEventListener("keydown", event => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === sequence[index]) index += 1;
      else index = key === sequence[0] ? 1 : 0;
      if (index !== sequence.length) return;
      index = 0;
      setSecretMode(!document.documentElement.classList.contains("secret-mode"), true);
    });
  }


  window.glhf = {
    hero: {
      connect(reference) {
        heroDotnet = reference;
        const current = hero?.dataset.heroPosition || "center";
        updateHeroControls(current);
        reference.invokeMethodAsync("SetPositionFromBrowser", current).catch(console.error);
        refreshHeroState();
      },
      setPosition(position, manual) { setHeroPosition(position, Boolean(manual), false); },
      disconnect() { heroDotnet = null; }
    },
    navigation: {
      connect(reference) {
        dotnet = reference;
        normalizeFragmentLinks();
        if (keyboard) document.removeEventListener("keydown", keyboard);
        keyboard = event => {
          const current = event.target.closest(".era-link");
          const root = document.querySelector("#era-controls");
          if (!current || !root?.contains(current) || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          dotnet?.invokeMethodAsync("NavigateKey", event.key, current.dataset.eraLink).catch(console.error);
        };
        document.addEventListener("keydown", keyboard);
        if (active) reference.invokeMethodAsync("SetVisibleEra", active).catch(console.error);
      },
      scrollTo(id, focusLink) {
        scrollToEra(id, focusLink ? `[data-era-link` : null);
      },
      disconnect() {
        if (keyboard) document.removeEventListener("keydown", keyboard);
        keyboard = null;
        dotnet = null;
      }
    }
  };

  normalizeFragmentLinks();
  openSource(location.hash);
  initializeTimeline();
  initializeHero();
  initializeGameCards();
  initializeMotionSystem();
  initializeTimeMachine();
  initializeResumeProgress();
  progressPersistenceReady = true;
  initializeKonamiCode();
})();

/* ================================================================
   ETAPA EXTRA V2 — Edge-aware navigation dock
   - Center/top: horizontal utility bar.
   - Left/right edge: vertical utility rail.
   - Mouse, touch, keyboard and persistence supported.
   ================================================================ */
(() => {
  "use strict";
  const dock = document.querySelector("[data-movable-dock]");
  if (!dock) return;

  const grip = dock.querySelector("[data-dock-drag]");
  const live = dock.querySelector("[data-dock-live]");
  const storageKey = "glhf-nav-dock-v2";
  const legacyKey = "glhf-nav-dock-v1";
  const edgeGap = 10;
  const step = 34;
  let drag = null;

  const clamp = (value, minValue, maxValue) => Math.max(minValue, Math.min(maxValue, value));
  const isVertical = () => dock.dataset.dockOrientation === "vertical";
  const sideThreshold = () => Math.min(170, Math.max(88, Math.round(window.innerWidth * 0.18)));

  function announce(message) {
    if (live) live.textContent = message;
  }

  function setOrientation(orientation, edge = "free") {
    dock.dataset.dockOrientation = orientation;
    dock.dataset.dockEdge = edge;
    dock.dataset.dockMode = orientation === "horizontal" && edge === "top" ? "default" : "custom";
  }

  function bounds() {
    return {
      maxX: Math.max(edgeGap, window.innerWidth - dock.offsetWidth - edgeGap),
      maxY: Math.max(edgeGap, window.innerHeight - dock.offsetHeight - edgeGap)
    };
  }

  function currentPoint() {
    const rect = dock.getBoundingClientRect();
    return { x: Math.round(rect.left), y: Math.round(rect.top) };
  }

  function place(x, y) {
    const limit = bounds();
    let nextX = clamp(Math.round(x), edgeGap, limit.maxX);
    const nextY = clamp(Math.round(y), edgeGap, limit.maxY);

    if (isVertical()) {
      nextX = dock.dataset.dockEdge === "right" ? limit.maxX : edgeGap;
    }

    dock.classList.add("is-user-positioned");
    dock.style.left = `${nextX}px`;
    dock.style.top = `${nextY}px`;
    dock.style.right = "auto";
    dock.style.transform = "none";
    dock.dataset.dockX = String(nextX);
    dock.dataset.dockY = String(nextY);
    return { x: nextX, y: nextY };
  }

  function stateFromCurrent() {
    const point = currentPoint();
    const limit = bounds();
    return {
      orientation: isVertical() ? "vertical" : "horizontal",
      edge: dock.dataset.dockEdge || "free",
      x: point.x / Math.max(1, limit.maxX),
      y: point.y / Math.max(1, limit.maxY)
    };
  }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(stateFromCurrent())); } catch { }
  }

  function horizontalAt(x, y, { say = true, save = true } = {}) {
    setOrientation("horizontal", "free");
    const point = place(x, y);
    if (save) persist();
    if (say) announce("Menú horizontal.");
    return point;
  }

  function verticalAt(side, y, { say = true, save = true } = {}) {
    setOrientation("vertical", side);
    // Reading offsetWidth after the orientation attribute forces the correct rail dimensions.
    const limit = bounds();
    const x = side === "right" ? limit.maxX : edgeGap;
    const point = place(x, y);
    if (save) persist();
    if (say) announce(`Menú vertical en el lado ${side === "right" ? "derecho" : "izquierdo"}.`);
    return point;
  }

  function defaultPosition({ say = false } = {}) {
    setOrientation("horizontal", "top");
    const x = Math.max(edgeGap, Math.round((window.innerWidth - dock.offsetWidth) / 2));
    const point = place(x, 12);
    if (say) announce("Menú horizontal restablecido en la parte superior.");
    return point;
  }

  function reset() {
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(legacyKey);
    } catch { }
    defaultPosition({ say: true });
  }

  function restore() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!Number.isFinite(saved?.x) || !Number.isFinite(saved?.y)) return false;
      if (saved.orientation === "vertical" && (saved.edge === "left" || saved.edge === "right")) {
        setOrientation("vertical", saved.edge);
        const limit = bounds();
        verticalAt(saved.edge, saved.y * Math.max(1, limit.maxY), { say: false, save: false });
      } else {
        setOrientation("horizontal", "free");
        const limit = bounds();
        horizontalAt(saved.x * Math.max(1, limit.maxX), saved.y * Math.max(1, limit.maxY), { say: false, save: false });
      }
      return true;
    } catch { return false; }
  }

  function snapFromPointer(pointerX, currentY) {
    const threshold = sideThreshold();
    if (pointerX <= threshold) return verticalAt("left", currentY);
    if (pointerX >= window.innerWidth - threshold) return verticalAt("right", currentY);
    const point = currentPoint();
    return horizontalAt(point.x, currentY);
  }

  function nudge(direction) {
    const point = currentPoint();

    if (isVertical()) {
      if (direction === "left") return verticalAt("left", point.y);
      if (direction === "right") return verticalAt("right", point.y);
      if (direction === "up") point.y -= step;
      if (direction === "down") point.y += step;
      place(point.x, point.y);
      persist();
      announce(`Menú vertical, ${dock.dataset.dockEdge === "right" ? "derecha" : "izquierda"}.`);
      return;
    }

    if (direction === "left") point.x -= step;
    if (direction === "right") point.x += step;
    if (direction === "up") point.y -= step;
    if (direction === "down") point.y += step;

    const placed = place(point.x, point.y);
    const rect = dock.getBoundingClientRect();
    if (direction === "left" && rect.left <= sideThreshold() * .45) return verticalAt("left", placed.y);
    if (direction === "right" && rect.right >= window.innerWidth - sideThreshold() * .45) return verticalAt("right", placed.y);
    dock.dataset.dockEdge = "free";
    dock.dataset.dockMode = "custom";
    persist();
    announce("Menú horizontal movido.");
  }

  grip?.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const point = currentPoint();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: point.x,
      y: point.y
    };
    dock.classList.add("is-dragging");
    dock.dataset.dockMode = "custom";
    grip.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  grip?.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Keep the current orientation while dragging; orientation changes cleanly on release.
    place(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
    event.preventDefault();
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const currentY = currentPoint().y;
    drag = null;
    dock.classList.remove("is-dragging");
    try { grip?.releasePointerCapture?.(event.pointerId); } catch { }
    snapFromPointer(event.clientX, currentY);
  }

  grip?.addEventListener("pointerup", finishDrag);
  grip?.addEventListener("pointercancel", finishDrag);

  dock.querySelectorAll("[data-dock-nudge]").forEach(button => {
    button.addEventListener("click", () => nudge(button.dataset.dockNudge));
  });
  dock.querySelector("[data-dock-reset]")?.addEventListener("click", reset);

  grip?.addEventListener("keydown", event => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (!map[event.key]) return;
    event.preventDefault();
    nudge(map[event.key]);
  });

  window.addEventListener("resize", () => {
    const state = stateFromCurrent();
    if (state.orientation === "vertical") {
      verticalAt(state.edge === "right" ? "right" : "left", state.y * Math.max(1, bounds().maxY), { say: false, save: false });
    } else {
      const limit = bounds();
      horizontalAt(state.x * Math.max(1, limit.maxX), state.y * Math.max(1, limit.maxY), { say: false, save: false });
    }
  }, { passive: true });

  try { localStorage.removeItem(legacyKey); } catch { }
  if (!restore()) defaultPosition();
})();
