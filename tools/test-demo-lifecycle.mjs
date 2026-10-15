/** Check host controller replacement and real cached-navigation recovery without artwork. */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const [integrationPath, playwrightPath, resultPath] = process.argv.slice(2);
if (!integrationPath || !playwrightPath || !resultPath) throw new Error("Supply integration source directory, Playwright module and output JSON path");
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const source = resolve(integrationPath), pages = new Map();
for (const name of ["library.html", "library.js", "together.html", "together-portable.js", "together.css", "portable.css", "night.css"])
  pages.set("/" + name, readFileSync(join(source, "demo", name)));
const mock = `
window.fixture={pending:[],views:[],stages:[],resolvers:[]};
export function createCardRenderer(){return (card,{onSelect})=>{const b=document.createElement('button');b.textContent=card.definition.name;b.onclick=onSelect;return b}}
export async function directoryResolver(){const r={manifest:{title:'Fixture'},scenes:new Map([['scenes/front.json',{nodes:[]}]]),disposed:false,dispose(){this.disposed=true}};fixture.resolvers.push(r);return r}
export function createPlayerStage(){const stage={disposed:false,mount(root){const v={disposed:false,setSide(){if(this.disposed)throw Error('Disposed view used')},setInputs(value){if(this.disposed)throw Error('Disposed view used');fixture.lastInputs=value},setLayerVisible(){},dispose(){this.disposed=true}};const marker=document.createElement('span');marker.className='test-view';marker.textContent='View '+(fixture.views.length+1);root.replaceChildren(marker);v.ready=new URL(location.href).searchParams.has('auto')?Promise.resolve():new Promise((resolve,reject)=>fixture.pending.push({resolve,reject}));fixture.views.push(v);return v},dispose(){this.disposed=true;for(const v of fixture.views)v.dispose()},invalidateLayout(){if(this.disposed)throw Error('Disposed stage used')},diagnostics(){return{activeViews:fixture.views.filter(v=>!v.disposed).length}}};fixture.stages.push(stage);return stage}
export function browserResolver(){throw Error('Not used by lifecycle test')}
export function importPackage(){throw Error('Not used by lifecycle test')}
`;
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://fixture").pathname;
  if (path === "/away.html") { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>Away</title><p>Navigation fixture</p>"); return; }
  if (path === "/cards/cards.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify([{id:"fixture-night",directory:"night",title:"First fixture",digest:"sha256:"+"a".repeat(64)},{id:"fixture-day",directory:"day",title:"Second fixture",digest:"sha256:"+"b".repeat(64)}])); return; }
  if (path.startsWith("/player/") && path.endsWith(".js")) { res.setHeader("Content-Type", "text/javascript"); res.end(path === "/player/mock.js" ? mock : 'export * from "./mock.js";'); return; }
  const data = pages.get(path);
  if (!data) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html"); res.end(data);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
const results = { renderer: "Controlled public-shape fixture; tests host lifecycle, not GPU or asset loading", cases: [] };
try {
  browser = await chromium.launch({ channel: "msedge", headless: true, ignoreDefaultArgs: ["--disable-back-forward-cache"] });
  results.browser = browser.version();
  const page = await browser.newPage();
  await page.goto(origin + "/library.html");
  await page.locator("#cards button").first().click();
  await page.waitForFunction(() => window.fixture.pending.length === 1);
  await page.locator("#close").click();
  await page.locator("#cards button").nth(1).click();
  await page.waitForFunction(() => window.fixture.pending.length === 2);
  await page.evaluate(() => fixture.pending[1].resolve());
  const before = await page.locator("#viewer").textContent();
  await page.evaluate(async () => { fixture.pending[0].reject(Error("Retired view failed")); await new Promise((r) => requestAnimationFrame(r)); });
  const after = await page.locator("#viewer").textContent();
  results.cases.push({ name: "Late ready failure preserves replacement inspector", pass: before === after && after === "View 2", before, after });
  await page.close();
  for (const name of ["library", "together"]) {
    const p = await browser.newPage();
    await p.addInitScript(() => {
      for (const type of ["pagehide", "pageshow"]) window.addEventListener(type, (event) => {
        const rows = JSON.parse(sessionStorage.getItem("lifecycle-events") ?? "[]"); rows.push({ type, persisted: event.persisted, path: location.pathname }); sessionStorage.setItem("lifecycle-events", JSON.stringify(rows));
      });
    });
    const errors = []; p.on("pageerror", (error) => errors.push(error.message));
    await p.goto(origin + "/" + name + ".html?auto=1");
    if (name === "library") await p.waitForFunction(() => document.querySelectorAll("#cards button").length === 2);
    else await p.waitForFunction(() => window.portableCards?.ready);
    await p.goto(origin + "/away.html");
    await p.goBack({ waitUntil: "commit" });
    await p.waitForFunction(() => window.fixture && document.readyState === "complete");
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const state = await p.evaluate((name) => ({ events: JSON.parse(sessionStorage.getItem("lifecycle-events") ?? "[]"),
      count: name === "library" ? document.querySelectorAll("#cards button").length : portableCards.stage.diagnostics().activeViews }), name);
    const persisted = state.events.some((e) => e.type === "pageshow" && e.path.endsWith(name + ".html") && e.persisted);
    let interactive = false;
    if (state.count === 2) {
      if (name === "library") {
        await p.locator("#cards button").first().click();
        interactive = await p.locator("#viewer .test-view").count() === 1;
      } else {
        const before = await p.locator("#panorama").evaluate((el) => el.classList.contains("separated"));
        await p.locator("#separate").click(); interactive = before !== await p.locator("#panorama").evaluate((el) => el.classList.contains("separated"));
      }
    }
    results.cases.push({ name: name + " actual back-forward cache restoration", pass: persisted && state.count === 2 && interactive && !errors.length, persisted, count: state.count, interactive, errors, events: state.events });
    await p.close();
  }
} catch (error) { results.error = String(error.stack ?? error); }
finally { await browser?.close(); await new Promise((r) => server.close(r)); }
writeFileSync(resolve(resultPath), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results));
if (results.error || results.cases.length !== 3 || results.cases.some((c) => !c.pass)) process.exitCode = 1;
