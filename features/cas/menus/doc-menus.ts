// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { app, off, rule, sub, type Menu } from "./types";

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
    [off("Add Program Editor"), "program"],
    [sub("Add Python", [app("New...", "addPython"), app("Shell", "addShell")]), "python"],
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
  ]),
  off("Edit"),
  off("View"),
  sub("Insert", [
    app("Problem", "insertProblem"),
    rule(app("Calculator", "addCalculator")),
    app("Graphs", "addGraphs"),
    app("Lists & Spreadsheet", "addLists"),
    app("Data & Statistics", "addData"),
    app("Notes", "addNotes"),
    app("Python", "addPython"),
  ]),
  off("Problem"),
  off("Page Layout"),
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
];
