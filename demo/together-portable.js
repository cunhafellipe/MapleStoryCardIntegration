import { createPlayerStage } from "./player/player.js";
import { directoryResolver } from "./player/resolver.js";

let stage;
const resolvers = [];
const status = document.getElementById("cardStatus"),
  retry = document.getElementById("retryCards"),
  controls = [...document.querySelectorAll(".pair-controls button, .pair-controls input")];
for (const control of controls) control.disabled = true;
retry.addEventListener("click", () => location.reload());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
async function start() {
const panorama = document.getElementById("panorama"),
  slider = document.getElementById("turn"),
  motionButton = document.getElementById("motion");
stage = createPlayerStage({
  root: panorama,
  budget: {
    maxDpr: 3,
    maxZoom: 3,
    maxTextureEdge: matchMedia("(pointer:coarse)").matches ? 1024 : 1536,
    estimatedGpuBytes:
      (matchMedia("(pointer:coarse)").matches ? 96 : 192) * 1024 * 1024,
  },
  onDiagnostic: console.info,
});
const response = await fetch("./cards/cards.json");
if (!response.ok) throw new Error("Unable to load the card catalog");
const catalog = await response.json();
const views = [];
let x = 0,
  y = 0,
  auto = false,
  raf = 0;
function turn(nx, ny) {
  x = Math.max(-1, Math.min(1, nx));
  y = Math.max(-1, Math.min(1, ny));
  for (const view of views) view.setInputs({ tilt: { x, y } });
  panorama.style.setProperty("--rx", `${-y * 7}deg`);
  panorama.style.setProperty("--ry", `${x * 11}deg`);
  slider.value = String(Math.round(x * 100));
  document.getElementById("turnValue").textContent = `${Math.round(x * 11)}°`;
}
for (const [index, which] of ["night", "day"].entries()) {
  const resolver = await directoryResolver(
    `./cards/${catalog[index].directory ?? which}/`,
    { digest: catalog[index].digest },
  );
  resolvers.push(resolver);
  const view = stage.mount(
    document.getElementById(which === "night" ? "scene" : "dayScene"),
    { title: resolver.manifest.title, resolver },
    {
      quality: "standard",
      onEvent: (event) => {
        if (event.type === "fallback") console.warn(event);
      },
    },
  );
  views.push(view);
  const list = document.getElementById(
    which === "night" ? "layerList" : "dayLayerList",
  );
  for (const node of [
    ...resolver.scenes.get("scenes/front.json").nodes,
  ].reverse()) {
    if (
      node.id.startsWith("petal-") ||
      node.id.startsWith("star-") ||
      node.id.includes("highlight") ||
      node.id.includes("glint")
    )
      continue;
    const row = document.createElement("label");
    row.className = "layer-row";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = true;
    toggle.onchange = () => view.setLayerVisible(node.id, toggle.checked);
    row.append(toggle, document.createTextNode(node.name ?? node.id));
    list.append(row);
  }
  await view.ready;
}
const outfit = document.getElementById("dayOutfit");
for (const name of [
  "Elfine Ponytail · Royal hair",
  "Pastel Dreams Face · Royal face",
  "Pink Bow",
  "Pink Picnic Dress",
  "Bunny Slippers",
  "Rainbow Earrings",
]) {
  const li = document.createElement("li");
  li.textContent = name;
  outfit.append(li);
}
const downloads = document.createElement("div");
downloads.className = "action-row";
for (const [which, label] of [
  ["night", "Download night card"],
  ["day", "Download day card"],
]) {
  const link = document.createElement("a");
  link.href = `./cards/${which}.dcard`;
  link.download = `${which}.dcard`;
  link.textContent = label;
  link.className = "quiet-button";
  downloads.append(link);
}
for (const [href, label] of [
  ["./studio.html", "Card studio"],
  ["./library.html", "Card library"],
]) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.className = "quiet-button";
  downloads.append(link);
}
document.querySelector(".pair-controls").append(downloads);
function point(e) {
  const box = panorama.getBoundingClientRect();
  turn(
    ((e.clientX - box.left) / box.width) * 2 - 1,
    ((e.clientY - box.top) / box.height) * 2 - 1,
  );
}
panorama.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" || panorama.hasPointerCapture(e.pointerId))
    point(e);
});
panorama.addEventListener("pointerdown", (e) => {
  panorama.setPointerCapture(e.pointerId);
  point(e);
});
panorama.addEventListener("pointerup", (e) => {
  if (panorama.hasPointerCapture(e.pointerId))
    panorama.releasePointerCapture(e.pointerId);
});
panorama.addEventListener("pointerleave", () => {
  if (!auto) turn(0, 0);
});
panorama.addEventListener("keydown", (e) => {
  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(e.key)
  )
    return;
  e.preventDefault();
  turn(
    e.key === "Home"
      ? 0
      : x + (e.key === "ArrowLeft" ? -0.15 : e.key === "ArrowRight" ? 0.15 : 0),
    e.key === "Home"
      ? 0
      : y + (e.key === "ArrowUp" ? -0.15 : e.key === "ArrowDown" ? 0.15 : 0),
  );
});
slider.addEventListener("input", () => turn(Number(slider.value) / 100, 0));
function animate(time) {
  if (!auto || document.hidden) {
    raf = 0;
    return;
  }
  turn(Math.sin(time * 0.00022) * 0.96, Math.cos(time * 0.00017) * 0.2);
  raf = requestAnimationFrame(animate);
}
motionButton.addEventListener("click", () => {
  auto = !auto;
  motionButton.setAttribute("aria-pressed", String(auto));
  motionButton.textContent = auto ? "Pause motion" : "Gentle motion";
  cancelAnimationFrame(raf);
  raf = auto ? requestAnimationFrame(animate) : 0;
});
document.getElementById("reset").addEventListener("click", () => {
  auto = false;
  cancelAnimationFrame(raf);
  motionButton.setAttribute("aria-pressed", "false");
  motionButton.textContent = "Gentle motion";
  turn(0, 0);
});
document.getElementById("separate").addEventListener("click", (event) => {
  const split = panorama.classList.toggle("separated");
  event.currentTarget.textContent = split ? "Join cards" : "Separate cards";
  event.currentTarget.setAttribute("aria-pressed", String(split));
  stage.invalidateLayout();
});
panorama.addEventListener("transitionend", () => stage.invalidateLayout());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else if (auto && !raf) raf = requestAnimationFrame(animate);
});
window.addEventListener(
  "pagehide",
  () => {
    cancelAnimationFrame(raf);
    stage.dispose();
    for (const r of resolvers) r.dispose();
  },
  { once: true },
);
window.portableCards = { stage, views, resolvers, turn, ready: true };
turn(0, 0);
}
start().then(() => {
  status.parentElement.hidden = true;
  for (const control of controls) control.disabled = false;
}).catch((error) => {
  stage?.dispose();
  for (const resolver of resolvers) resolver.dispose();
  status.textContent = "The card artwork couldn't load. Check your connection and sign-in, then try again.";
  retry.hidden = false;
  console.error("Card demo failed to load", error);
});
