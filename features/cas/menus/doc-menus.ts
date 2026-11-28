// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { app, off, rule, sub, type Menu } from "./types";
import { PTT } from "../state/ptt";

/** Ctrl+I's list of apps; the ones not built yet are greyed, as the handheld lists them. */
export const ADD_PAGE: Menu = (
  [
    [app("Add Calculator", "addCalculator"), "calculator"],
    [app("Add Graphs", "addGraphs"), "graphs"],
    [app("Add Geometry", "addGeometry"), "geometry"],
    [app("Add Lists & Spreadsheet", "addLists"), "lists"],
    [app("Add Data & Statistics", "addData"), "data"],
    [app("Add Notes", "addNotes"), "notes"],
    [off("Add Vernier DataQuest™"), "vernier"],
    [off("Add Widget"), "widget"],
    [sub("Add Program Editor", [app("New...", "prgmNew"), app("Open...", "prgmOpen"), app("Import...", "prgmImport"), app("View...", "prgmView")]), "program"],
    // Greyed while Press-to-Test switches Python off.
    [PTT?.noPython ? off("Add Python") : sub("Add Python", [app("New...", "addPython"), app("Shell", "addShell")]), "python"],
  ] as const
).map(([item, icon]) => ({ ...item, icon }));

/** The doc key's menu: File, Insert and Settings. */
export const DOC_MENU: Menu = [
  sub("File", [
    app("New Document", "fileNew"),
    app("Open Document...", "fileOpen"),
    app("Close", "fileClose"),
    rule(app("Save Document", "fileSave")),
    app("Save As...", "fileSaveAs"),
    rule(app("Download .tns (experimental)", "fileDownload")),
    app("Copy Share Link", "fileShareLink"),
  ]),
  sub("Edit", [
    { ...app("Undo", "editUndo"), hint: "Ctrl+Z" },
    { ...app("Redo", "editRedo"), hint: "Ctrl+Y" },
    rule({ ...app("Cut", "editCut"), hint: "Ctrl+X" }),
    { ...app("Copy", "editCopy"), hint: "Ctrl+C" },
    { ...app("Paste", "editPaste"), hint: "Ctrl+V" },
    app("Delete", "editDelete"),
    // Not on the handheld: maths for homework write-ups and word processors, after its own items.
    rule(app("Copy as LaTeX", "editCopyLatex")),
    app("Copy as MathML", "editCopyMathml"),
  ]),
  sub("View", [app("Page Sorter", "pageSorter")]),
  sub("Insert", [
    app("Problem", "insertProblem"),
    rule(app("Calculator", "addCalculator")),
    app("Graphs", "addGraphs"),
    app("Lists & Spreadsheet", "addLists"),
    app("Data & Statistics", "addData"),
    app("Notes", "addNotes"),
    PTT?.noPython ? off("Python") : app("Python", "addPython"),
    // A picture behind a Data & Statistics plot (data/image.ts).
    rule(app("Image...", "insertImage")),
  ]),
  sub("Problem", [app("Rename...", "problemRename"), app("Delete", "problemDelete")]),
  sub("Page Layout", [
    sub(
      "Select Layout",
      Array.from({ length: 8 }, (_, i) => app(`Layout ${i + 1}`, `layout${i + 1}`)),
    ),
    app("Custom Split", "layoutCustom"),
    app("Swap Application", "layoutSwap"),
    app("Delete Application", "layoutDelete"),
    rule(app("Group", "layoutGroup")),
    app("Ungroup", "layoutUngroup"),
  ]),
  sub("Settings", [app("Document Settings...", "docSettings"), app("Handheld Setup...", "handheldSetup")]),
];

/** Home → 5 Settings: as the handheld lists it. */
export const SETTINGS_MENU: Menu = [
  off("Change Language..."),
  app("Document Settings...", "docSettings"),
  app("Handheld Setup...", "handheldSetup"),
  app("Status...", "status"),
  off("Login..."),
  off("Network..."),
  app("Restore Factory Defaults...", "factoryReset"),
  // The handheld starts Press-to-Test from a key combination as it turns on; here it's after its Settings items.
  app(PTT ? "Exit Press-to-Test..." : "Press-to-Test...", "pressToTest"),
];

/** The menu key in My Documents. */
export const BROWSE_MENU: Menu = [
  app("New Folder", "browseNewFolder"),
  app("Rename", "browseRename"),
  app("Delete", "browseDelete"),
  rule(app("Copy", "browseCopy")),
  app("Paste", "browsePaste"),
  rule(app("Upload...", "browseUpload")),
  app("Download", "browseDownload"),
  app("Export All (zip)", "browseExportAll"),
  rule(sub("Sort", [app("By Name", "browseSortName"), app("By Size", "browseSortSize")])),
  // A TI-Nspire on the USB cable (link/), after the handheld's own items.
  rule(app("Send to Handheld", "browseSendHandheld")),
];
