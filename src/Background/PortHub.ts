// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * PortHub.ts — long-lived connections to every open UI surface.
 *
 * Popup, options page, side panel and the content-script pill all attach here.
 * One broadcast reaches all of them, so state stays identical everywhere.
 */
import type { StreamEvent } from '@Shared/Protocol';

export class PortHub {
  private readonly ports = new Set<chrome.runtime.Port>();

  attach(port: chrome.runtime.Port): void {
    this.ports.add(port);
    port.onDisconnect.addListener(() => this.ports.delete(port));
  }

  broadcast(event: StreamEvent): void {
    for (const port of [...this.ports]) {
      try {
        port.postMessage(event);
      } catch {
        this.ports.delete(port);
      }
    }
  }

  get size(): number {
    return this.ports.size;
  }
}
