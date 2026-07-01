import { loadEnv } from "./setup.js";
loadEnv();

async function listModels() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const json = await res.json() as { data: Array<{ id: string; pricing: { prompt: string; completion: string } }> };
    
    console.log("=== FREE MODELS FROM OPENROUTER ===");
    const freeModels = json.data.filter(m => 
      m.id.includes("free") || 
      (m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0")
    );
    
    for (const m of freeModels) {
      console.log(`- ${m.id}`);
    }
  } catch (err) {
    console.error("Failed to fetch models:", err);
  }
}

listModels();
