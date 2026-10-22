// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * MessageRouter.ts — the service worker's RPC endpoint.
 *
 * One switch, exhaustive over `UiRequest`, always answering with a `Result`
 * so the UI can render an error instead of throwing.
 */
import { parseToken } from '@Core/Auth/Jwt';
import { tokenProvider } from '@Core/Auth/TokenProvider';
import { createDuoHttpClient } from '@Core/Http/HttpClient';
import { DuolingoApi } from '@Core/Http/DuolingoApi';
import { AnswerBook } from '@Core/Storage/AnswerBook';
import { logger } from '@Shared/Logger';
import type { StreamEvent, UiRequest, UiResponse } from '@Shared/Protocol';
import { err, ok } from '@Shared/Result';
import { mergeShop } from '@Shared/ShopCatalog';
import type { AppContext } from './AppContext';
import type { RunCoordinator } from './RunCoordinator';
import type { Scheduler } from './Scheduler';

export interface RouterDeps {
  app: AppContext;
  coordinator: RunCoordinator;
  scheduler: Scheduler;
}

/** One place that turns stored credentials into an API client. */
async function duoApi(app: AppContext): Promise<DuolingoApi> {
  const settings = await app.settings.load();
  const token = await tokenProvider.resolve({ source: settings.tokenSource, manualToken: settings.manualToken });
  const parsed = parseToken(token);
  return new DuolingoApi(createDuoHttpClient(parsed.token), parsed.userId);
}

export async function route(request: UiRequest, deps: RouterDeps, sender?: chrome.runtime.MessageSender): Promise<UiResponse> {
  const { app, coordinator, scheduler } = deps;

  try {
    switch (request.type) {
      case 'state/get':
        return ok(await app.buildState());

      case 'settings/save': {
        const saved = await app.settings.save(request.settings);
        await scheduler.sync(saved);
        await app.pushState();
        return ok(await app.buildState());
      }

      case 'settings/export': {
        const settings = await app.settings.load();
        return ok({ json: app.settings.exportJson(settings) });
      }

      case 'settings/import': {
        const imported = app.settings.importJson(request.payload);
        const saved = await app.settings.save(imported);
        await scheduler.sync(saved);
        await app.pushState();
        return ok(await app.buildState());
      }

      case 'settings/reset': {
        const reset = await app.settings.reset();
        await scheduler.sync(reset);
        await app.pushState();
        return ok(await app.buildState());
      }

      case 'profile/refresh': {
        const api = await duoApi(app);
        const profile = await api.getProfile();
        app.setProfile(profile);
        await app.pushState();
        return ok(profile);
      }

      case 'shop/list': {
        const api = await duoApi(app);
        try {
          return ok({ items: mergeShop(await api.getShop()), source: 'live' as const });
        } catch (error) {
          // Reference prices beat an empty screen — as long as we say so.
          return ok({
            items: mergeShop(null),
            source: 'catalog' as const,
            error: (error as Error).message,
          });
        }
      }

      case 'shop/buy': {
        const api = await duoApi(app);
        const result = await api.buyItem(request.itemId);
        app.log.info(`Shop: bought ${request.itemId} (HTTP ${result.status}).`);
        // Gems moved, so the cached profile is stale by definition.
        try {
          app.setProfile(await api.getProfile());
        } catch {
          /* best effort — the purchase already landed */
        }
        await app.pushState();
        return ok(result);
      }

      case 'run/start': {
        if (coordinator.isRunning) return err(new Error('A run is already in progress.'));
        const result = await coordinator.start(request.trigger ?? 'manual', request.only);
        return result;
      }

      case 'answers/stats': {
        const book = new AnswerBook();
        await book.load();
        return ok(book.stats());
      }

      case 'answers/clear': {
        const book = new AnswerBook();
        await book.clear();
        app.log.info('Answers: the remembered sentences were cleared.');
        return ok({ cleared: true });
      }

      case 'run/cancel':
        return ok({ cancelled: coordinator.cancel() });

      case 'history/list':
        return ok(await app.history.list());

      case 'history/clear':
        await app.history.clear();
        await app.pushState();
        return ok({ cleared: true });

      case 'logs/clear':
        logger.clear();
        await app.pushState();
        return ok({ cleared: true });

      case 'token/set': {
        const info = tokenProvider.inspect(request.token);
        if (!info.valid) return ok(info);
        const settings = await app.settings.load();
        const saved = await app.settings.save({
          ...settings,
          tokenSource: 'manual',
          manualToken: request.token.trim(),
        });
        await app.settings.save(saved);
        await app.pushState();
        return ok(tokenProvider.inspect(request.token));
      }

      case 'token/test':
        return ok(tokenProvider.inspect(request.token));

      case 'panel/open': {
        if (chrome.sidePanel?.open) {
          const windowId = sender?.tab?.windowId;
          await chrome.sidePanel.open(windowId ? { windowId } : { windowId: chrome.windows.WINDOW_ID_CURRENT });
        }
        return ok({ opened: true });
      }

      case 'tab/open':
        await chrome.tabs.create({ url: request.url });
        return ok({ opened: true });

      default: {
        const exhaustive: never = request;
        return err(new Error(`Unhandled request: ${JSON.stringify(exhaustive)}`));
      }
    }
  } catch (error) {
    return err(error);
  }
}

export function broadcastEvent(app: AppContext, event: StreamEvent): void {
  app.broadcast(event);
}
