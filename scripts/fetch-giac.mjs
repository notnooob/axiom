// SPDX-License-Identifier: GPL-3.0-or-later
// Giac's WebAssembly build (19 MB) isn't kept in git. Before dev and build,
// download it if it's missing, and refuse it unless it is byte for byte the
// build public/cas/giac/SOURCE.md records.
//
// Two sources, tried in turn, each a few times: our mirror on the repo's
// GitHub releases, then its authors' site. The authors' server is sometimes
// slow to answer build machines (Cloudflare's builds timed out connecting),
// and one slow connection shouldn't fail a deploy. The hash check means either
// source gives the same file.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = [
  "https://github.com/notnooob/axiom/releases/download/giac-1.9.0-996/giacwasm.js",
  "https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac/giacwasm.js",
];
const TRIES = 3;
const TIMEOUT_MS = 120_000; // the whole download, per try
const SHA256 = "96cbb37bfe1060ffd9a56f72ab1cc61cf2400577ca9bb13e0992e03f603da378";
const file = join(dirname(fileURLToPath(import.meta.url)), "../public/cas/giac/1.9.0/giacwasm.js");
const sha = (b) => createHash("sha256").update(b).digest("hex");

if (existsSync(file) && sha(readFileSync(file)) === SHA256) process.exit(0);

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // A wrong file is no use from any source: say so rather than retrying it.
  if (sha(bytes) !== SHA256) throw Object.assign(new Error(`not the recorded build (SHA-256 ${sha(bytes)})`), { wrongFile: true });
  return bytes;
}

const failures = [];
for (const url of SOURCES) {
  for (let i = 1; i <= TRIES; i++) {
    console.log(`Downloading Giac (19 MB) from ${url}${i > 1 ? ` (try ${i} of ${TRIES})` : ""}`);
    try {
      const bytes = await download(url);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      console.log("Giac 1.9.0-996 saved and verified.");
      process.exit(0);
    } catch (err) {
      const why = err?.name === "TimeoutError" ? "timed out" : (err?.cause?.code ?? err?.message ?? String(err));
      console.warn(`  failed: ${why}`);
      failures.push(`${url}: ${why}`);
      if (err?.wrongFile) break;
      if (i < TRIES) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
throw new Error(
  `Couldn't download Giac from any source:\n  ${failures.join("\n  ")}\n` +
    "See public/cas/giac/SOURCE.md: you can extract doc/giacwasm.js from giac_1.9.0-996.tar.gz into public/cas/giac/1.9.0/ instead.",
);
