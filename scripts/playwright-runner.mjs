import { spawn } from "node:child_process";

export function runPlaywright(configPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", "--config", configPath],
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
