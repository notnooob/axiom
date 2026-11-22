# Notices

## Axiom

Axiom is an independent project derived from VCE Hub's open-source CAS, https://github.com/vcehub/cas (Copyright (C) 2026 VCE Hub, GPL-3.0-or-later). Axiom's source is at https://github.com/notnooob/axiom.

- The original calculator: Copyright (C) 2026 VCE Hub.
- Axiom's modifications: Copyright (C) 2026 the Axiom contributors. Changed from November 2026: the Home screen, My Documents and the document model; `.tns` import and export; the Lists & Spreadsheet, Data & Statistics, Notes, Geometry and Python apps; the assistant, AI mode and WebMCP tools; working offline and installing as an app (the service worker, its build step, the web app manifest and its icons); the Calculator's χ² and F distributions, cubic, quartic and median-median regressions, t procedures, 1-Prop z Test and cash-flow functions; the two-sample, two-proportion, χ², F, regression t, ANOVA and multiple-regression procedures, sinusoidal and logistic regressions and the correlation matrix; functions and programs (Func, Prgm and their control, transfer, I/O and Mode commands), the Program Editor dialogs, libraries, Lock and Recall Definition; LU and QR, cylindrical and spherical vectors, and dbd; the radian and gradian marks; the doc menu's Edit, View (Page Sorter), Problem and Page Layout (split-screen pages); in Graphs, polar curves, sequences, equation templates, bounded area, the zooms and traces, the actions menu, analyze conics, 3D graphing, path plot and the geometry tools; the Geometry app's point on, tangent, vector, arc, rectangle, regular polygon, conic, locus, compass and measurement transfer constructions; the settings (Handheld Setup's keypad layout, keypad, start-up and animation options, Document Settings' Make Default, and the assistant's behaviour settings); the Axiom name and branding.

Everything in this repository is licensed under the GNU General Public License, version 3 or later (`LICENSE`), except where a file says otherwise. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

## Giac

Giac, by Bernard Parisse and Renée De Graeve, Institut Fourier, Université Grenoble Alpes. GNU General Public License, version 3 or later. The build the calculator loads (`giacwasm.js`, giac 1.9.0-996) is not stored in this repository: `scripts/fetch-giac.mjs` downloads it from our unmodified mirror on this repository's GitHub releases, or else from the Giac authors' site, and checks its SHA-256 before `npm run dev` and `npm run build`. Its corresponding source is attached to VCE Hub's `giac-1.9.0` release, and `public/cas/giac/SOURCE.md` records where it came from. Giac's source lists the libraries it includes and their licences.

## Used by the calculator, under their own licences

- React, Vite, Tailwind CSS, Framer Motion, Sonner, fflate, crypto-js, clsx, tailwind-merge: MIT
- idb-keyval, class-variance-authority: Apache 2.0
- Lucide icons: ISC
- Fonts: see Fonts, below

## Trademarks

TI-Nspire is a trademark of Texas Instruments. Neither Axiom nor VCE Hub is affiliated with Texas Instruments. VCE is a registered trademark of the VCAA, which does not endorse this calculator. "Axiom" names this derived, independent project; it is not VCE Hub's product, and VCE Hub does not endorse it.

## amicro

`src/components/amicro/`, `src/hooks/use-web-haptics.ts` and `src/lib/presets.ts` come from amicro, https://github.com/Subhan-code/Amicro--Micro-transitions-, under the MIT licence:

```
MIT License

Copyright (c) 2026 SYED  SUBHAN UDDIN

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## TnsTools

`features/cas/tns/container.ts`, `method13.ts` and `tixc.ts` are ported from TnsTools, https://github.com/MaksimirKurtov/TnsTools, under the MIT licence (Copyright (c) its contributors; see that repository's LICENSE). The port fixes one encoder case (text starting with a space after a repeated tag).

## Pyodide

Python runs on Pyodide, https://pyodide.org, under the Mozilla Public License 2.0 (with Python's own PSF licence for the standard library). It is copied unmodified from the `pyodide` npm package into `public/pyodide/` at build time.

## The assistant's interface

- shadcn/ui components and AI Elements patterns, https://ui.shadcn.com, MIT, in `components/ui/` (generated by the shadcn CLI, then used as they are), on Base UI, https://base-ui.com, MIT.
- The AI SDK (`ai`, `@ai-sdk/*`), https://ai-sdk.dev, Apache License 2.0.
- Streamdown and `@streamdown/math`, https://streamdown.ai, Apache License 2.0.
- Shiki, https://shiki.style, MIT (code blocks); tw-animate-css, MIT.

## KaTeX

The assistant's replies are typeset with KaTeX, https://katex.org, under the MIT licence; its stylesheet and fonts are bundled with the site, unmodified.

## Fonts

STIX Two Text (maths), Source Sans 3 (the screen) and Outfit (the page), all under the SIL Open Font License 1.1, bundled through Fontsource.
