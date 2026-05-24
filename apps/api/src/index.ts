import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

console.log(`Starting Vigil API on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT,
});
