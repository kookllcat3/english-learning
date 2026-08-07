import { preview } from "vite";

import { runPlaywright } from "./playwright-runner.mjs";

const previewServer = await preview({
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});

let exitCode = 1;
try {
  exitCode = await runPlaywright("playwright.production.config.ts");
} finally {
  await previewServer.close();
}

process.exitCode = exitCode;
