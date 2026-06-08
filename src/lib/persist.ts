"use client";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { SerializedDoc, TabSnapshot } from "./store";

const LEGACY_DOC_KEY = "pixelframe:doc";
const TABS_KEY = "pixelframe:tabs";

type PersistedTabs = {
  version: 1;
  tabs: TabSnapshot[];
  activeTabId: string;
};

/** Legacy single-doc load — used to migrate from the pre-tabs era. */
export async function loadDoc(): Promise<SerializedDoc | null> {
  try {
    const v = await idbGet<SerializedDoc>(LEGACY_DOC_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

/** Legacy single-doc save — no longer called, but kept for compatibility. */
export async function saveDoc(doc: SerializedDoc): Promise<void> {
  try {
    await idbSet(LEGACY_DOC_KEY, doc);
  } catch {
    /* ignore */
  }
}

export async function loadTabs(): Promise<PersistedTabs | null> {
  try {
    const v = await idbGet<PersistedTabs>(TABS_KEY);
    if (v && v.version === 1 && Array.isArray(v.tabs) && v.tabs.length > 0) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveTabs(tabs: TabSnapshot[], activeTabId: string): Promise<void> {
  try {
    await idbSet(TABS_KEY, { version: 1, tabs, activeTabId } satisfies PersistedTabs);
  } catch {
    /* ignore */
  }
}
