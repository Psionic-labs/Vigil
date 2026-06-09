/**
 * @file index.ts
 * @description Main module exports for SDK packages.
 * @why Unified integration API package entrypoint.
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
