// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
/* CAS engine worker: loads Giac (WebAssembly) and evaluates one command per
 * message. Kept out of the bundle so Giac's 19 MB script loads only here.
 *
 * In:  { id, cmd }            evaluate cmd, reply { id, out, ms }
 * Out: { type: "ready", ms }  once Giac has loaded
 *      { id, error }          if Giac throws
 */
/* global importScripts, Module */
// Relative to this file, so the app works from any folder or subpath.
const GIAC = "giac/1.9.0/giacwasm.js";
const started = Date.now();
let caseval = null;
const queue = [];

self.Module = {
  print: () => {},
  printErr: () => {},
  onRuntimeInitialized() {
    caseval = Module.cwrap("caseval", "string", ["string"]);
    self.postMessage({ type: "ready", ms: Date.now() - started });
    while (queue.length) handle(queue.shift());
  },
};

function handle({ id, cmd }) {
  const t = Date.now();
  try {
    const out = caseval(cmd);
    self.postMessage({ id, out, ms: Date.now() - t });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
}

self.onmessage = (event) => {
  if (caseval) handle(event.data);
  else queue.push(event.data);
};

importScripts(GIAC);
