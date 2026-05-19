import { record } from "rrweb";
import { getOrCreateSessionId, isSessionSampled } from "../session";
import { startFlushTimer, setupFinalFlush } from "../flush";
import { setupErrorCapture } from "../errors";
import { setupConsoleCapture } from "../console";
import { setupRageClickCapture } from "../detectors/rage-click-detector";
import { setupDeadClickCapture } from "../detectors/dead-click-detector";
import { setupSignificantClickCapture } from "../detectors/significant-click-detector";
import { setupNavigationCapture } from "../detectors/navigation-observer";
import { sanitizeUrl } from "../utils";
import type { VigilOptions, SessionMetadata } from "../types";
import { normalizeConfig } from "../config/normalize-config";
import { validateConfig } from "../config/validate-config";
import { createSDKState, MAX_EVENTS, RrwebEvent } from "./state";
import { createLifecycleManager } from "./lifecycle";

const SDK_VERSION = "0.1.0";

// Global singleton state
const state = createSDKState();
const lifecycle = createLifecycleManager();

export const Vigil = {
  init(options: VigilOptions) {
    // SSR guard
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (state.initialized) {
      if (options.debug) console.warn("Vigil SDK: already initialized, skipping.");
      return;
    }

    const config = normalizeConfig(options);
    if (!validateConfig(config)) {
      return; // Invalid config, abort
    }

    // Session sampling
    if (!isSessionSampled(config.sessionSampleRate)) {
      if (config.debug) console.log("Vigil SDK: Session sampled out.");
      return;
    }

    state.sessionId = getOrCreateSessionId();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const screen = window.screen
    state.initialized = true

    if (config.debug) {
      console.log("Vigil SDK initialized", {
        projectKey: config.projectKey,
        sessionId: state.sessionId,
        endpoint: config.endpoint,
        flushInterval: config.flushInterval,
      });
    }

    state.metadata = {
      url: sanitizeUrl(window.location.href),
      userAgent,
      startedAt: Date.now(),
      screenWidth: screen?.width ?? 0,
      screenHeight: screen?.height ?? 0,
      environment: config.environment,
      release: config.release,
      commitSha: config.commitSha,
      userId: config.userId,
    };

    // Shared flush context
    const flushCtx = {
      sessionId: state.sessionId,
      projectKey: config.projectKey,
      endpoint: config.endpoint,
      sdkVersion: SDK_VERSION,
      events: state.events,
      summaryEvents: state.summaryEvents,
      metadata: state.metadata,
      debug: config.debug,
    };

    // Start periodic flush
    const flushTimer = startFlushTimer(flushCtx, config.flushInterval);
    lifecycle.addCleanup(flushTimer.stop);

    // Final flush on close
    const removeFinalFlush = setupFinalFlush(flushCtx, flushTimer);
    lifecycle.addCleanup(removeFinalFlush);

    // 1. Setup Session Replay
    if (!config.disableSessionReplay) {
      try {
        const stopRecording = record({
          emit(event: RrwebEvent) {
            state.events.push(event);
            if (state.events.length > MAX_EVENTS) {
              state.events.splice(0, state.events.length - MAX_EVENTS + 100);
            }
          },
          maskAllInputs: config.maskAllInputs !== false,
          maskTextClass: "vigil-mask",
        });
        if (stopRecording) {
          lifecycle.addCleanup(stopRecording);
        }
      } catch (err) {
        if (config.debug) {
          console.warn("Vigil SDK: rrweb failed to initialize. Proceeding in summary-only mode.", err);
        }
      }
    }

    // 2. Setup Error Tracking
    if (!config.disableErrorTracking) {
      const removeErrorCapture = setupErrorCapture({ summaryEvents: state.summaryEvents, debug: config.debug });
      lifecycle.addCleanup(removeErrorCapture);

      const removeConsoleCapture = setupConsoleCapture({ summaryEvents: state.summaryEvents, debug: config.debug });
      lifecycle.addCleanup(removeConsoleCapture);
    }

    // 3. Setup Navigation Tracking
    let navigationSubscribe: undefined | ReturnType<typeof setupNavigationCapture>["subscribe"];
    if (!config.disableNavigationTracking) {
      const navigation = setupNavigationCapture({ summaryEvents: state.summaryEvents, debug: config.debug });
      lifecycle.addCleanup(navigation.cleanup);
      navigationSubscribe = navigation.subscribe;
    }

    // 4. Setup Click Tracking
    if (!config.disableClickTracking) {
      const removeRageClickCapture = setupRageClickCapture({ summaryEvents: state.summaryEvents, debug: config.debug });
      lifecycle.addCleanup(removeRageClickCapture);

      const removeSignificantClickCapture = setupSignificantClickCapture({ summaryEvents: state.summaryEvents, debug: config.debug });
      lifecycle.addCleanup(removeSignificantClickCapture);

      const removeDeadClickCapture = setupDeadClickCapture({
        summaryEvents: state.summaryEvents,
        debug: config.debug,
        onNavigation: navigationSubscribe,
      });
      lifecycle.addCleanup(removeDeadClickCapture);
    }

    // Expose to window for debugging
    if (config.debug) {
      (window as any).__vigil = {
        sessionId: state.sessionId,
        events: state.events,
        summaryEvents: state.summaryEvents,
        metadata: state.metadata,
        cleanup: lifecycle.cleanupAll,
      };
    }
  },

  /**
   * Completely shut down the SDK and remove all listeners.
   */
  shutdown() {
    if (!state.initialized) return;
    lifecycle.cleanupAll();
    state.initialized = false;
    state.events.length = 0;
    state.summaryEvents.length = 0; // The proxy interceptor handles this gracefully or just clears the underlying array
    if ((window as any).__vigil) {
      delete (window as any).__vigil;
    }
  }
};
