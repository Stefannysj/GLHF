(() => {
  "use strict";
  const mode = document.querySelector('meta[name="glhf-mode"]')?.content;
  if (mode !== "blazor") return; // The delivered root file is an explicit static preview.
  const status = document.getElementById("runtime-status");
  const controls = document.getElementById("era-controls");
  const fallbackNavigation = controls?.innerHTML;
  const failure = error => {
    if (controls && fallbackNavigation) controls.innerHTML = fallbackNavigation;
    if (status) status.textContent = "Navegación HTML";
    document.getElementById("engine-error").hidden = false;
    console.error("GLHF: no se pudo iniciar Blazor.", error);
  };
  const script = document.createElement("script");
  script.src = new URL("_framework/blazor.webassembly.js", document.baseURI).href;
  script.setAttribute("autostart", "false");
  script.onerror = () => failure(new Error("No se encontró el runtime de Blazor."));
  script.onload = async () => {
    try {
      await Blazor.start();
      document.documentElement.dataset.engine = "blazor";
      if (status) status.textContent = "Navegación C# activa";
    } catch (error) { failure(error); }
  };
  document.body.append(script);
})();
