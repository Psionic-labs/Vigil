import type { VigilOptions, SummaryEvent, SessionMetadata } from "./types";
import { Vigil } from "./client/vigil-client";

export type { VigilOptions, SummaryEvent, SessionMetadata };

export const init = Vigil.init;
export { Vigil };
