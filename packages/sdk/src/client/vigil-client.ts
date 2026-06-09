/**
 * @file vigil-client.ts
 * @description The core bootstrapper for the SDK.
 * Handles configuration validation, state initialization, detector 
 * orchestration, and ensures clean shutdown/teardown mechanics.
 */
import { record } from "rrweb";
import { getOrCreateSessionId, clearSessionId } from "../session";
import { isSessionSampled } from "../sampling/session-sampling";
import { startFlushTimer, setupFinalFlush } from "../flush";
import { setupErrorCapture } from "../errors";
import { setupConsoleCapture } from "../console";
import { setupRageClickCapture } from "../detectors/rage-click-detector";
import { setupDeadClickCapture } from "../detectors/dead-click-detector";
import { setupSignificantClickCapture } from "../detectors/significant-click-detector";
import { setupNavigationCapture } from "../detectors/navigation-observer";
import { sanitizeUrl } from "../utils";
import type { VigilOptions } from "../types";
import { normalizeConfig } from "../config/normalize-config";
import { validateConfig } from "../config/validate-config";
import { createSDKState, MAX_EVENTS, type RrwebEvent } from "./state";
import { createLifecycleManager } from "./lifecycle";

const SDK_VERSION = "0.1.0";

// Global singleton state
const state = createSDKState();
const lifecycle = createLifecycleManager();
let triggerFinalFlush: (() => void) | null = null;

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

    state.lifecycle = "active";
    state.terminalPayloadDispatched = false;
    state.lifecycleEpoch++;

    try {
      // Session sampling
      const isSampled = isSessionSampled(config.sessionSampleRate);
      const effectiveConfig = {
        ...config,
        disableSessionReplay: !isSampled || config.disableSessionReplay,
        disableClickTracking: !isSampled || config.disableClickTracking,
      };

      if (!isSampled && effectiveConfig.debug) {
        console.log("Vigil SDK: Session sampled out. Disabling expensive telemetry.");
      }

      state.sessionId = getOrCreateSessionId();
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const screen = window.screen;

      if (effectiveConfig.debug) {
        console.log("Vigil SDK initialized", {
          projectKey: effectiveConfig.projectKey,
          sessionId: state.sessionId,
          endpoint: effectiveConfig.endpoint,
          flushInterval: effectiveConfig.flushInterval,
        });
      }

      state.metadata = {
        url: sanitizeUrl(window.location.href),
        userAgent,
        startedAt: Date.now(),
        screenWidth: screen?.width ?? 0,
        screenHeight: screen?.height ?? 0,
        environment: effectiveConfig.environment,
        release: effectiveConfig.release,
        commitSha: effectiveConfig.commitSha,
        userId: effectiveConfig.userId,
      };

      // Shared flush context
      const flushCtx = {
        sessionId: state.sessionId,
        projectKey: effectiveConfig.projectKey,
        endpoint: effectiveConfig.endpoint,
        sdkVersion: SDK_VERSION,
        events: state.events,
        summaryEvents: state.summaryEvents,
        metadata: state.metadata,
        debug: effectiveConfig.debug,
      };

      // Start periodic flush
      const flushTimer = startFlushTimer(flushCtx, effectiveConfig.flushInterval, state);
      lifecycle.addCleanup(flushTimer.stop);

      // Final flush on close
      const finalFlush = setupFinalFlush(flushCtx, flushTimer, state, () => lifecycle.cleanupAll());
      lifecycle.addCleanup(finalFlush.cleanup);
      triggerFinalFlush = finalFlush.triggerFinalFlush;

      // 1. Setup Session Replay
      if (!effectiveConfig.disableSessionReplay) {
        try {
          const stopRecording = record({
            emit(event: RrwebEvent) {
              if (state.lifecycle !== "active") return;
              state.events.push(event);
              if (state.events.length > MAX_EVENTS) {
                state.events.splice(0, state.events.length - MAX_EVENTS + 100);
              }
            },
            maskAllInputs: effectiveConfig.maskAllInputs !== false,
            maskTextClass: "vigil-mask",
          });
          if (stopRecording) {
            lifecycle.addCleanup(stopRecording);
          }
        } catch (err) {
          if (effectiveConfig.debug) {
            console.warn("Vigil SDK: rrweb failed to initialize. Proceeding in summary-only mode.", err);
          }
        }
      }

      // 2. Setup Error Tracking
      if (!effectiveConfig.disableErrorTracking) {
        const removeErrorCapture = setupErrorCapture({ summaryEvents: state.summaryEvents, debug: effectiveConfig.debug });
        lifecycle.addCleanup(removeErrorCapture);

        const removeConsoleCapture = setupConsoleCapture({ summaryEvents: state.summaryEvents, debug: effectiveConfig.debug });
        lifecycle.addCleanup(removeConsoleCapture);
      }

      // 3. Setup Navigation Tracking
      let navigationSubscribe: undefined | ReturnType<typeof setupNavigationCapture>["subscribe"];
      if (!effectiveConfig.disableNavigationTracking) {
        const navigation = setupNavigationCapture({ summaryEvents: state.summaryEvents, debug: effectiveConfig.debug });
        lifecycle.addCleanup(navigation.cleanup);
        navigationSubscribe = navigation.subscribe;
      }

      // 4. Setup Click Tracking
      if (!effectiveConfig.disableClickTracking) {
        const removeRageClickCapture = setupRageClickCapture({ summaryEvents: state.summaryEvents, debug: effectiveConfig.debug });
        lifecycle.addCleanup(removeRageClickCapture);

        const removeSignificantClickCapture = setupSignificantClickCapture({ summaryEvents: state.summaryEvents, debug: effectiveConfig.debug });
        lifecycle.addCleanup(removeSignificantClickCapture);

        const removeDeadClickCapture = setupDeadClickCapture({
          summaryEvents: state.summaryEvents,
          debug: effectiveConfig.debug,
          onNavigation: navigationSubscribe,
        });
        lifecycle.addCleanup(removeDeadClickCapture);
      }

      // Expose to window for debugging
      if (effectiveConfig.debug) {
        window.__vigil = {
          sessionId: state.sessionId,
          events: state.events,
          summaryEvents: state.summaryEvents,
          metadata: state.metadata,
          cleanup: () => Vigil.shutdown(),
        };
      }

      // Mark as initialized at the very end to avoid partial state leaks
      state.initialized = true;
    } catch (err) {
      Vigil.shutdown();
      if (config.debug) {
        console.error("Vigil SDK: Initialization failed, cleaned up partial state.", err);
      }
    }
  },

  /**
   * Completely shut down the SDK and remove all listeners.
   */
  shutdown() {
    triggerFinalFlush?.();
    if (state.lifecycle === "active") {
      state.lifecycle = "finalized";
      state.lifecycleEpoch++;
    }
    triggerFinalFlush = null;

    // Run cleanups regardless of initialized state to prevent partial initialization leaks
    lifecycle.cleanupAll();
    clearSessionId();
    state.initialized = false;
    state.sessionId = "";
    state.metadata = null;
    state.events.length = 0;
    state.summaryEvents.length = 0;
    if (typeof window !== "undefined" && window.__vigil) {
      delete window.__vigil;
    }
  }
};
