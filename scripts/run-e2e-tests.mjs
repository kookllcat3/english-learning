import { createServer } from "vite";

import { runPlaywright } from "./playwright-runner.mjs";

const developmentServer = await createServer({
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});

await developmentServer.listen();

let exitCode = 1;
try {
  exitCode = await runPlaywright("playwright.config.ts");
} finally {
  await developmentServer.close();
}

process.exitCode = exitCode;
