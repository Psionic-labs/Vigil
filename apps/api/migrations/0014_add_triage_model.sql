ALTER TABLE projects
ADD COLUMN triage_model TEXT NOT NULL DEFAULT 'nvidia/nemotron-3-ultra-550b-a55b:free';
