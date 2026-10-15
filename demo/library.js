import {
  createCardRenderer,
  createPlayerStage,
  directoryResolver,
  importPackage,
  browserResolver,
} from "./player/index.js";
const cards = document.getElementById("cards"),
  dialog = document.getElementById("inspect"),
  viewer = document.getElementById("viewer"),
  message = document.getElementById("message");
let stage,
  view,
  resolver,
  side = "front",
  generation = 0;
const render = createCardRenderer();
const catalog = await fetch("./cards/cards.json").then((r) => r.json());
function close() {
  generation++;
  view?.dispose();
  stage?.dispose();
  resolver?.dispose();
  view = stage = resolver = null;
  viewer.replaceChildren();
  dialog.close();
}
async function inspect(load) {
  close();
  const revision = generation;
  dialog.showModal();
  try {
    const loaded = await load();
    if (revision !== generation) {
      loaded.dispose();
      return;
    }
    resolver = loaded;
    stage = createPlayerStage({
      root: viewer,
      budget: { estimatedGpuBytes: 96 * 1024 * 1024 },
    });
    view = stage.mount(
      viewer,
      { resolver },
      { quality: "standard", inputMode: "drag" },
    );
    side = "front";
    document.getElementById("angle").value = "0";
    await view.ready;
  } catch (error) {
    if (revision === generation) viewer.textContent = error.message;
  }
}
for (const item of catalog) {
  const presentation = {
    contract: "digital-card@0.1",
    digest: item.digest,
    baseURL: new URL(`./cards/${item.directory}/`, location.href).href,
  };
  cards.append(
    render(
      { definition: { name: item.title, presentation } },
      {
        onSelect: () =>
          inspect(() =>
            directoryResolver(presentation.baseURL, {
              digest: presentation.digest,
            }),
          ),
      },
    ),
  );
}
document.getElementById("close").onclick = close;
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  close();
});
document.getElementById("flip").onclick = () =>
  view?.setSide((side = side === "front" ? "back" : "front"));
document.getElementById("angle").oninput = (event) =>
  view?.setInputs({ tilt: { x: Number(event.target.value) / 100, y: 0 } });
document.getElementById("open").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".dcard";
  input.onchange = () => {
    const file = input.files[0];
    if (file)
      inspect(async () =>
        browserResolver(
          await importPackage(new Uint8Array(await file.arrayBuffer())),
        ),
      );
  };
  input.click();
};
window.addEventListener(
  "pagehide",
  () => {
    close();
    cards.replaceChildren();
  },
  { once: true },
);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
