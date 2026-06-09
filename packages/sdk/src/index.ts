/**
 * @file index.ts
 * @description Main entry point for the Vigil SDK. 
 * This file exposes the public API surface that consuming applications will interact with.
 * It primarily exports the singleton `Vigil` object and its `init` method, alongside 
 * necessary TypeScript interfaces for configuration and events.
 */

import type { VigilOptions, SummaryEvent, SessionMetadata } from "./types";
import { Vigil } from "./client/vigil-client";

// Export core types for consumers who need strictly typed configurations or event interfaces.
export type { VigilOptions, SummaryEvent, SessionMetadata };

/**
 * Initializes the Vigil SDK observability agent.
 * This is an alias for `Vigil.init()`.
 * 
 * @example
 * import { init } from '@vigil/sdk';
 * init({ projectKey: 'pk_123', endpoint: 'https://ingest.vigil.com' });
 */
export const init = Vigil.init;

/**
 * The Vigil SDK namespace object.
 * Contains methods to bootstrap and manage the observability session.
 */
export { Vigil };
