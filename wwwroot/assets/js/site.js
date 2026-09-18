(() => {
  "use strict";

  let observer = null;
  let dotnet = null;
  let keyboard = null;
  let active = "";
  const sectionIds = new Set(Array.from(document.querySelectorAll("[data-era]")).map(el => el.id));
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

  document.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (link?.dataset.fragment) openSource(link.dataset.fragment);
  });
  window.addEventListener("hashchange", () => openSource(location.hash));
  window.addEventListener("beforeprint", () => {
    const details = document.querySelector("#fuentes details");
    if (details) { details.dataset.wasOpen = String(details.open); details.open = true; }
  });
  window.addEventListener("afterprint", () => {
    const details = document.querySelector("#fuentes details");
    if (details) details.open = details.dataset.wasOpen === "true";
  });

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
    if (autoLabel) {
      autoLabel.textContent = reduced() ? "MOVIMIENTO REDUCIDO" : (running ? `AUTO ${(heroInterval() / 1000).toFixed(1)}S` : "AUTO EN PAUSA");
    }
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
    if (syncDotnet && heroDotnet) {
      heroDotnet.invokeMethodAsync("SetPositionFromBrowser", position).catch(console.error);
    }
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
    document.addEventListener("visibilitychange", () => {
      heroLastRotation = Date.now();
      refreshHeroState();
    });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => {
      if (reduced()) setHeroPosition("center", false, true);
      heroLastRotation = Date.now();
      refreshHeroState();
    });
    window.addEventListener("resize", () => { heroLastRotation = Date.now(); refreshHeroState(); }, { passive: true });
    heroTimer = window.setInterval(rotateHero, 500);
    refreshHeroState();
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
      setPosition(position, manual) {
        setHeroPosition(position, Boolean(manual), false);
      },
      disconnect() {
        heroDotnet = null;
      }
    },
    navigation: {
      connect(reference) {
        this.disconnect();
        dotnet = reference;
        normalizeFragmentLinks();
        const root = document.querySelector("#era-controls");
        keyboard = event => {
          if (!event.target.closest(".era-link")) return;
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          dotnet?.invokeMethodAsync("NavigateKey", event.key, event.target.closest(".era-link").dataset.eraLink).catch(console.error);
        };
        root?.addEventListener("keydown", keyboard);
        if ("IntersectionObserver" in window) {
          observer = new IntersectionObserver(entries => {
            const visible = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
            const id = visible[0]?.target.id;
            if (id && id !== active) {
              active = id;
              dotnet?.invokeMethodAsync("SetVisibleEra", id).catch(console.error);
            }
          }, { rootMargin: "-8% 0px -62% 0px", threshold: 0 });
          document.querySelectorAll("[data-era]").forEach(el => observer.observe(el));
        }
        const hashId = location.hash.slice(1);
        if (sectionIds.has(hashId)) dotnet?.invokeMethodAsync("SetVisibleEra", hashId).catch(console.error);
      },
      scrollTo(id, focusLink) {
        if (!sectionIds.has(id)) return;
        const el = document.getElementById(id);
        if (!el) return;
        history.replaceState(null, "", "#" + id);
        el.scrollIntoView({ behavior: reduced() ? "instant" : "smooth", block: "start" });
        if (focusLink) document.querySelector(`[data-era-link="${escapeId(id)}"]`)?.focus({preventScroll:true});
      },
      disconnect() {
        observer?.disconnect(); observer = null;
        if (keyboard) document.querySelector("#era-controls")?.removeEventListener("keydown", keyboard);
        keyboard = null; dotnet = null; active = "";
      }
    }
  };

  normalizeFragmentLinks();
  openSource(location.hash);
  initializeHero();
})();
