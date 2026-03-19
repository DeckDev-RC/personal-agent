const { spawn } = require("node:child_process");
const path = require("node:path");
const electronBinary = require("electron");

const appPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const env = { ...process.env };

// Some shells export this flag, which makes Electron behave like plain Node.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [appPath], {
  stdio: "inherit",
  windowsHide: false,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
