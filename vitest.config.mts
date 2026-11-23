import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests de Pilot (src/pilot), fonctions pures, repris de la livraison du CTO. Le reste
// du Dashboard n'a pas de tests : ce runner ne couvre que Pilot.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/pilot/**/*.test.ts"], env: { NODE_ENV: "test", PILOT_GEOCODAGE: "0" } },
});
