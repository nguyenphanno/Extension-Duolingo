/**
 * Id.ts — collision-resistant ids that work in every context (service worker,
 * content script, page) without relying on `crypto.randomUUID` being present.
 */

let counter = 0;

export function createId(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${(random[0] ?? 0).toString(36)}`;
}
