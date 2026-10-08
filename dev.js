import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processes = [
  spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }),
  spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }),
];

let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error('Unable to start a development process:', error);
    stopAll(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) stopAll(code || 0);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
