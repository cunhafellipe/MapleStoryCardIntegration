import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  access,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const stage = fileURLToPath(
  new URL("./stage-presentation.mjs", import.meta.url),
);
for (const kind of ["directory", "archive", "link", "overlap"]) {
  test(`staging rejects ${kind} before writing output`, async () => {
    const temporaryRoot = await realpath(tmpdir());
    const root = await mkdtemp(path.join(temporaryRoot, "card-stage-"));
    try {
      const content = path.join(root, "content"),
        outside = path.join(root, "outside");
      await mkdir(path.join(content, "night"), { recursive: true });
      await mkdir(outside);
      await writeFile(path.join(outside, "sentinel.txt"), "Test sentinel");
      await writeFile(path.join(root, "outside.dcard"), "Test sentinel");
      const row = { id: "example.night", directory: "night" };
      if (kind === "directory") row.directory = "../outside";
      if (kind === "archive") row.archive = "../outside.dcard";
      if (kind === "link")
        await symlink(
          outside,
          path.join(content, "night", "linked"),
          process.platform === "win32" ? "junction" : "dir",
        );
      await writeFile(path.join(content, "cards.json"), JSON.stringify([row]));
      const dist =
        kind === "overlap"
          ? path.join(content, "dist")
          : path.join(root, "dist");
      const result = spawnSync(process.execPath, [stage, content, dist], {
        encoding: "utf8",
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(
        result.stderr,
        kind === "link"
          ? /links are not supported/
          : kind === "overlap"
            ? /must not overlap/
            : /Invalid card content path/,
      );
      await assert.rejects(access(dist), { code: "ENOENT" });
    } finally {
      const relative = path.relative(temporaryRoot, await realpath(root));
      assert.ok(
        relative &&
          relative !== ".." &&
          !relative.startsWith(".." + path.sep) &&
          !path.isAbsolute(relative),
      );
      await rm(root, { recursive: true, force: true });
    }
  });
}
