import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const dir = "dist/web/assets";
const assets = [];
for (const name of await readdir(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const bytes = await readFile(dir + "/" + name);
  assets.push({
    file: name,
    bytes: bytes.length,
    gzip_bytes: gzipSync(bytes).length,
  });
}
const html = await readFile("dist/web/index.html", "utf8");
const initial = assets.filter((a) => html.includes(a.file));
const result = {
  method:
    "Built asset bytes and Node zlib gzip; initial entry only excludes lazy chunks. Not a browser startup latency measurement.",
  assets,
  total_bytes: assets.reduce((n, a) => n + a.bytes, 0),
  total_gzip_bytes: assets.reduce((n, a) => n + a.gzip_bytes, 0),
  initial_bytes: initial.reduce((n, a) => n + a.bytes, 0),
  initial_gzip_bytes: initial.reduce((n, a) => n + a.gzip_bytes, 0),
};
await writeFile(
  "docs/evidence/m5-bundle-final.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
