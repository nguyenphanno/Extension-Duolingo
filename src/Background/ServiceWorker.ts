/**
 * ServiceWorker.ts — the extension's brain.
 *
 * Boot sequence: hydrate caches -> register log fan-out -> wire every entry
 * point (messages, ports, alarms, commands, context menus).
 */
import {
  ALARM_SCHEDULE,
  COMMAND_PANEL,
  COMMAND_RUN,
  MENU_OPEN_PANEL,
  MENU_RUN_NOW,
  PORT_NAME,
} from '@Shared/Constants';
import { logger } from '@Shared/Logger';
import type { StreamEvent, UiRequest } from '@Shared/Protocol';
import { app } from './AppContext';
import { route } from './MessageRouter';
import { notificationService } from './NotificationService';
import { RunCoordinator } from './RunCoordinator';
import { Scheduler } from './Scheduler';

const coordinator = new RunCoordinator(app);
const scheduler = new Scheduler(app);
const deps = { app, coordinator, scheduler };

let keepAlive: ReturnType<typeof setInterval> | null = null;

/* ------------------------------------------------------------------ *
 * Log fan-out: every log entry reaches every open surface.
 * ------------------------------------------------------------------ */
logger.subscribe((entry) => {
  const event: StreamEvent = { type: 'log', entry };
  app.broadcast(event);
});

function startKeepAlive(): void {
  if (keepAlive) return;
  keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20_000);
}

function stopKeepAlive(): void {
  if (!keepAlive) return;
  clearInterval(keepAlive);
  keepAlive = null;
}

async function runNow(trigger: Parameters<RunCoordinator['start']>[0]): Promise<void> {
  const settings = await app.settings.load();
  if (settings.behavior.keepServiceWorkerAlive) startKeepAlive();
  try {
    await coordinator.start(trigger);
  } finally {
    stopKeepAlive();
  }
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    app.log.info(`Installed (${details.reason})`);
    await app.settings.load(true);
    await scheduler.sync(await app.settings.load());
    createMenus();
    try {
      await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
    } catch {
      /* side panel unsupported on this build */
    }
    await app.pushState();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    await app.hydrate();
    const settings = await app.settings.load(true);
    await scheduler.sync(settings);
    if (settings.schedule.runOnStartup && settings.schedule.enabled) {
      if (!scheduler.blockReason(settings)) await runNow('schedule');
    }
  })();
});

/* ------------------------------------------------------------------ *
 * UI connections
 * ------------------------------------------------------------------ */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  app.ports.attach(port);

  port.onMessage.addListener((message: unknown) => {
    void (async () => {
      const request = message as UiRequest;
      const response = await route(request, deps);
      try {
        port.postMessage({ type: 'response', requestType: request?.type, response });
      } catch {
        /* port closed */
      }
    })();
  });

  void (async () => {
    const state = await app.buildState();
    try {
      port.postMessage({ type: 'hello', state } satisfies StreamEvent);
    } catch {
      /* port closed */
    }
  })();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void (async () => {
    const response = await route(message as UiRequest, deps, sender);
    sendResponse(response);
  })();
  return true;
});

/* ------------------------------------------------------------------ *
 * Alarms
 * ------------------------------------------------------------------ */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_SCHEDULE) return;
  void (async () => {
    const settings = await app.settings.load();
    const block = scheduler.blockReason(settings);
    if (block) {
      app.log.info(scheduler.describeBlock(block) ?? 'Scheduled run skipped.');
      return;
    }
    await runNow('schedule');
  })();
});

/* ------------------------------------------------------------------ *
 * Commands + context menu
 * ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener((command) => {
  if (command === COMMAND_RUN) void runNow('command');
  if (command === COMMAND_PANEL) {
    void openPanel();
  }
});

/** Opens the side panel; silently no-ops where the API is missing. */
async function openPanel(): Promise<void> {
  try {
    await chrome.sidePanel?.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  } catch {
    /* requires a user gesture, or the panel is unavailable */
  }
}

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_RUN_NOW,
      title: 'Run Duo Assist now',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: MENU_OPEN_PANEL,
      title: 'Open live console',
      contexts: ['action'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_RUN_NOW) void runNow('context-menu');
  if (info.menuItemId === MENU_OPEN_PANEL) {
    void openPanel();
  }
});

/* ------------------------------------------------------------------ *
 * Storage reactions (settings changed from another surface)
 * ------------------------------------------------------------------ */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['duo.settings']) return;
  void (async () => {
    const settings = await app.settings.load(true);
    await scheduler.sync(settings);
    await notificationService.updateBadge(app.run, settings, app.profile?.streak ?? null);
    await app.pushState();
  })();
});

/* ------------------------------------------------------------------ *
 * Wake-up hydration
 * ------------------------------------------------------------------ */

void app.hydrate();
