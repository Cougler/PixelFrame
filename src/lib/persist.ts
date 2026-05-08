"use client";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { SerializedDoc } from "./store";

const KEY = "pixelframe:doc";

export async function loadDoc(): Promise<SerializedDoc | null> {
  try {
    const v = await idbGet<SerializedDoc>(KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveDoc(doc: SerializedDoc): Promise<void> {
  try {
    await idbSet(KEY, doc);
  } catch {
    /* ignore */
  }
}
