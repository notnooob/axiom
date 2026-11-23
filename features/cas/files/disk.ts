// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Writing back to a file on the computer: the installed app, opened with a
 * .tns or .py (double-click, Open with), keeps the file's handle, and Save
 * then updates that file as a desktop app would. Chromium only; elsewhere
 * there are no handles and documents stay in My Documents.
 */

type Permissioned = FileSystemFileHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
};

/**
 * Write the bytes to the file. The browser asks the student the first time
 * (and again after a restart); "denied" when they say no or the browser
 * can't write files.
 */
export async function writeToDisk(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<"written" | "denied"> {
  const h = handle as Permissioned;
  if (typeof h.createWritable !== "function") return "denied";
  const mode = { mode: "readwrite" as const };
  if ((await h.queryPermission?.(mode)) !== "granted" && (await h.requestPermission?.(mode)) !== "granted") return "denied";
  const w = await h.createWritable();
  try {
    await w.write(bytes as BlobPart);
  } catch (err) {
    await w.abort().catch(() => undefined);
    throw err;
  }
  await w.close();
  return "written";
}
