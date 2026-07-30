import { spawn } from "node:child_process";
import { preview } from "vite";

const previewServer = await preview({
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});

function runPlaywright() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "playwright.production.config.ts",
      ],
      {
        shell: false,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Playwright stopped with signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

let exitCode = 1;
try {
  exitCode = await runPlaywright();
} finally {
  await previewServer.close();
}

process.exitCode = exitCode;
