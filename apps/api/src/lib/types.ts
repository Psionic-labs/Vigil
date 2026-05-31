import type { ProjectCacheEntry } from "./rate-limit-store";

export interface IngestIdentity {
  projectKey: string;
  sessionId?: string;
}

export type AppEnv = {
  Variables: {
    requestId: string;
    ingestIdentity?: IngestIdentity;
    projectId?: string;
    projectCacheEntry?: ProjectCacheEntry | null;
  };
};
