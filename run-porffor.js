import { spawn } from "bun";

if (process.argv.length < 4) {
  console.error(`usage: bun run-porffor.js <attempts> <runtime> [runtime flags...]`);
  process.exit(1);
}

const attempts = parseInt(process.argv[2]);
const ok = /^\s*\u001b\n?\[\n?3\n?3\n?m\n?(NaN|\d+)\n?\u001b\n?\[\n?0\n?m\s*$/;
const runtime = process.argv[3];

let passes = 0;
let fails = 0;
const failureModes = {
  oob: 0,
  exception: 0,
  crash: 0,
  uncategorized: 0,
};

for (let i = 0; i < attempts; i++) {
  const proc = spawn({
    cmd: [
      runtime,
      ...process.argv.slice(4),
      "runner/index.js",
      ...(runtime.includes("bun") ? ["bench/richards.js"] : []),
    ],
    stderr: "pipe",
    stdout: "pipe",
    cwd: __dirname,
  });
  await Promise.race([proc.exited, new Promise(resolve => setTimeout(resolve, 5000).unref())]);
  if (proc.exitCode === null) {
    proc.kill("SIGKILL");
  }
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (stderr.length > 0 || proc.exitCode !== 0 || !stdout.match(ok)) {
    console.log(proc.exitCode, stdout, stderr);
    fails++;
    if (stderr.includes("Bun has crashed") || ['SIGSEGV', 'SIGTRAP', 'SIGBUS'].includes(proc.signalCode)) {
      failureModes.crash++;
    } else if (stderr.includes("Out of bounds")) {
      failureModes.oob++;
    } else if (stderr.includes("Error:") || stdout.includes("Error:")) {
      failureModes.exception++;
    } else {
      failureModes.uncategorized++;
    }
  } else {
    passes++;
  }
  console.log(`${passes + fails}/${attempts}`);
}

console.log(`${passes}/${attempts} attempts succeeded`);
console.log(failureModes);
