// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * ShopCatalog.ts — what the shop can sell, and how to reconcile it with reality.
 *
 * The live shop endpoint is the source of truth for *what exists and what it
 * costs*. This file only supplies two things the API cannot: a human label for
 * known item ids, and a fallback catalogue for when the endpoint is unreachable
 * or returns a shape we do not recognise.
 *
 * That distinction is deliberate. Prices are the one thing a user will notice
 * being wrong, so a reference price is always labelled as such rather than
 * presented as fact.
 */

export interface CatalogItem {
  id: string;
  name: string;
  note: string;
  /** Reference price in gems. The live shop overrides this when it answers. */
  priceGems: number;
}

export interface LiveShopItem {
  id: string;
  priceGems: number | null;
}

export interface ShopItemView {
  id: string;
  name: string;
  note: string | null;
  priceGems: number | null;
  /** `live` = price came from Duolingo; `catalog` = reference value. */
  source: 'live' | 'catalog';
}

export const SHOP_CATALOG: CatalogItem[] = [
  { id: 'streak_freeze', name: 'Streak Freeze', note: 'Covers one missed day', priceGems: 200 },
  { id: 'streak_repair', name: 'Streak Repair', note: 'Restores a streak you already lost', priceGems: 450 },
  { id: 'heart_refill', name: 'Refill Hearts', note: 'Fills the heart bar back up', priceGems: 350 },
  { id: 'timer_boost', name: 'Timer Boost', note: 'Extra time on timed challenges', priceGems: 100 },
  { id: 'double_or_nothing', name: 'Double or Nothing', note: 'Wager gems on a perfect week', priceGems: 50 },
];

const BY_ID = new Map(SHOP_CATALOG.map((item) => [item.id, item]));

export function findCatalogItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

/** `heart_refill` -> `Heart Refill`, for ids the catalogue does not know. */
export function humaniseId(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Build the list the UI renders.
 *
 * `live === null` means "the shop did not answer", which is the only case where
 * the reference catalogue is shown — and every row is then marked `catalog`.
 */
export function mergeShop(live: LiveShopItem[] | null): ShopItemView[] {
  if (!live) {
    return SHOP_CATALOG.map((item) => ({ ...item, source: 'catalog' as const }));
  }

  const seen = new Set<string>();
  const views: ShopItemView[] = [];

  for (const item of live) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const known = findCatalogItem(item.id);
    views.push({
      id: item.id,
      name: known?.name ?? humaniseId(item.id),
      note: known?.note ?? null,
      priceGems: item.priceGems ?? known?.priceGems ?? null,
      source: 'live',
    });
  }

  return views;
}
