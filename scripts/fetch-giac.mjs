// SPDX-License-Identifier: GPL-3.0-or-later
// Giac's WebAssembly build (19 MB) isn't kept in git. Before dev and build,
// download it from its authors' site if it's missing, and refuse it unless it
// is byte for byte the build public/cas/giac/SOURCE.md records.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = "https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac/giacwasm.js";
const SHA256 = "96cbb37bfe1060ffd9a56f72ab1cc61cf2400577ca9bb13e0992e03f603da378";
const file = join(dirname(fileURLToPath(import.meta.url)), "../public/cas/giac/1.9.0/giacwasm.js");
const sha = (b) => createHash("sha256").update(b).digest("hex");

if (existsSync(file) && sha(readFileSync(file)) === SHA256) process.exit(0);

console.log(`Downloading Giac (19 MB) from ${URL_}`);
const res = await fetch(URL_);
if (!res.ok) throw new Error(`Giac download failed: ${res.status} ${res.statusText}`);
const bytes = Buffer.from(await res.arrayBuffer());
if (sha(bytes) !== SHA256)
  throw new Error(
    `The Giac file on ${URL_} isn't the recorded build (SHA-256 ${sha(bytes)}). ` +
      "See public/cas/giac/SOURCE.md: extract doc/giacwasm.js from giac_1.9.0-996.tar.gz into public/cas/giac/1.9.0/ instead.",
  );
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, bytes);
console.log("Giac 1.9.0-996 saved and verified.");
