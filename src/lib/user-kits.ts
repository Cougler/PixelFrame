import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Kit, KitSprite } from "./kits";

const USER_KITS_KEY = "pixelframe:user-kits";
export const USER_KIT_ID_PREFIX = "user-";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function isUserKit(kitId: string): boolean {
  return kitId.startsWith(USER_KIT_ID_PREFIX);
}

export async function loadUserKitsFromStorage(): Promise<Kit[]> {
  const stored = (await idbGet(USER_KITS_KEY)) as Kit[] | undefined;
  return stored ?? [];
}

export async function saveUserKitsToStorage(kits: Kit[]): Promise<void> {
  await idbSet(USER_KITS_KEY, kits);
}

export function makeUserKit(name: string): Kit {
  return {
    id: `${USER_KIT_ID_PREFIX}${uid()}`,
    name,
    version: 1,
    format: "indexed-palette-v1",
    categories: { sprites: [] },
  };
}

/** Add or replace a sprite in a user kit (mutates in place). */
export function upsertSpriteInUserKit(kit: Kit, sprite: KitSprite): void {
  const cat = "sprites";
  if (!kit.categories[cat]) kit.categories[cat] = [];
  const list = kit.categories[cat];
  const idx = list.findIndex((s) => s.id === sprite.id);
  if (idx >= 0) list[idx] = sprite;
  else list.push(sprite);
}
