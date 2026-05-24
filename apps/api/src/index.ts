import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./app";

let PORT = 3001;
if (process.env.PORT) {
  const parsed = parseInt(process.env.PORT, 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    PORT = parsed;
  } else {
    console.warn(`Invalid PORT environment variable "${process.env.PORT}". Falling back to 3001.`);
  }
}

console.log(`Starting Vigil API on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT,
});
