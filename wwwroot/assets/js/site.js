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
  window.glhf = {
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
})();
