/** Assemble deployment output from the reusable source. Never edit bundled copies. */
import {
  cp,
  mkdir,
  writeFile,
  readdir,
  readFile,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const here = path.dirname(fileURLToPath(import.meta.url));
const [contentArg, distArg] = process.argv.slice(2);
if (!contentArg || !distArg)
  throw new Error("Supply compiled card folder and Site dist");
const framework = path.resolve(
    here,
    "../../DigitalCardFramework/src/presentation",
  ),
  dist = path.resolve(distArg);
const content = await realpath(path.resolve(contentArg)),
  catalog = JSON.parse(
    await readFile(path.join(content, "cards.json"), "utf8"),
  );
if (!Array.isArray(catalog)) throw new Error("Expected a card catalog array");
function contained(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
}
if (contained(content, dist) || contained(dist, content))
  throw new Error("Content and deployment folders must not overlap");
function contentPath(name) {
  if (
    typeof name !== "string" ||
    !name
      .split("/")
      .every(
        (part) =>
          /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith("."),
      )
  )
    throw new Error("Invalid card content path");
  return path.join(content, ...name.split("/"));
}
async function validateTree(file) {
  const stat = await lstat(file);
  if (stat.isSymbolicLink() || !contained(content, await realpath(file)))
    throw new Error("Card content links are not supported");
  if (stat.isDirectory()) {
    for (const name of await readdir(file))
      await validateTree(path.join(file, name));
  } else if (!stat.isFile()) throw new Error("Expected regular card content");
  return stat;
}
await validateTree(path.join(content, "cards.json"));
for (const card of catalog) {
  if (!card || typeof card.id !== "string")
    throw new Error("Invalid card catalog entry");
  const directory =
    card.directory ?? (card.id.endsWith("night") ? "night" : "day");
  if (!(await validateTree(contentPath(directory))).isDirectory())
    throw new Error("Expected a card directory");
  if (card.archive && !(await validateTree(contentPath(card.archive))).isFile())
    throw new Error("Expected a card archive");
}
await mkdir(path.join(dist, "player"), { recursive: true });
const files = [];
for (const name of await readdir(framework)) {
  if (
    (name.endsWith(".js") &&
      ![
        "compiler.js",
        "service.js",
        "node-http.js",
        "import-worker.js",
        "identity.js",
        "adapters.js",
        "layered-source.js",
        "gif-source.js",
        "layered-worker.js",
      ].includes(name)) ||
    name.endsWith(".css")
  ) {
    await cp(path.join(framework, name), path.join(dist, "player", name));
    const bytes = await readFile(path.join(framework, name));
    files.push({
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
await mkdir(path.join(dist, "cards"), { recursive: true });
await cp(
  path.join(content, "cards.json"),
  path.join(dist, "cards", "cards.json"),
);
for (const card of catalog) {
  await cp(
    path.join(
      content,
      card.directory ?? (card.id.endsWith("night") ? "night" : "day"),
    ),
    path.join(
      dist,
      "cards",
      card.directory ?? (card.id.endsWith("night") ? "night" : "day"),
    ),
    { recursive: true },
  );
  if (card.archive)
    await cp(
      path.join(content, card.archive),
      path.join(dist, "cards", card.archive),
    );
}
await writeFile(
  path.join(dist, "player", "build-source.json"),
  JSON.stringify(
    {
      source: "DigitalCardFramework/src/presentation",
      contractVersion: "0.1.0",
      files,
    },
    null,
    2,
  ),
);
console.log(
  `Staged ${files.length} runtime modules and external card packages.`,
);

const { build } = await import(
  new URL(
    "./node_modules/esbuild/lib/main.js",
    new URL("file:///" + framework.replaceAll("\\", "/") + "/package.json"),
  )
);
// Bundle the browser entry points so dependencies outside presentation are included.
await build({
  entryPoints: [
    "index.js",
    "player.js",
    "resolver.js",
    "package.js",
    "studio.js",
  ].map((name) => path.join(framework, name)),
  outdir: path.join(dist, "player"),
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  external: ["node:zlib"],
});
await build({
  entryPoints: [path.join(framework, "adapters.js")],
  outfile: path.join(dist, "player", "adapters-bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  external: ["node:zlib"],
});
await mkdir(path.join(dist, "player", "wasm"), { recursive: true });
for (const [source, name] of [
  ["@rive-app/canvas/rive.wasm", "rive.wasm"],
  ["@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm", "dotlottie.wasm"],
])
  await cp(
    path.join(framework, "node_modules", source),
    path.join(dist, "player", "wasm", name),
  );

await build({
  entryPoints: [path.join(framework, "layered-worker.js")],
  outfile: path.join(dist, "player", "layered-worker-bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  external: ["node:zlib"],
});

for (const name of await readdir(path.join(here, "../demo")))
  await cp(path.join(here, "../demo", name), path.join(dist, name));
