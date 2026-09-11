#!/usr/bin/env node
/**
 * Cross-platform Rust test runner.
 *
 * Runs `cargo test` (in `src-tauri`) with forwarded arguments.
 *
 * On Windows there is a known, still-open Tauri crate bug
 * (https://github.com/tauri-apps/tauri/issues/13419, .../issues/14580): the
 * win32 test harness **cannot even start** — the process aborts at load time
 * with `0xc0000139` (`STATUS_ENTRYPOINT_NOT_FOUND`) — regardless of what the
 * tests do. This is independent of application code and equally affects plain
 * `tauri::test::mock_builder` smoke tests.
 *
 * When that exact failure is detected, this runner falls back to verifying that
 * all tests **compile** (`cargo test --no-run`) and exits successfully with a
 * clear notice. Genuine compile/type errors still fail the pipeline; real test
 * failures on macOS/Linux abort immediately.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const crateDir = join(__dirname, '..', 'src-tauri')

const FALLBACK_MARKERS = ['0xc0000139', 'STATUS_ENTRYPOINT_NOT_FOUND']

function runCargo(args) {
  const result = spawnSync('cargo', args, {
    cwd: crateDir,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error && result.error.code === 'ENOENT') {
    console.error(
      'cargo was not found on PATH — is the Rust toolchain installed?'
    )
    process.exit(1)
  }

  if (result.status !== 0) {
    const detail = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status}`
    console.warn(`\n${detail} while running: cargo ${args.join(' ')}`)
  }

  return result
}

const forwardArgs = process.argv.slice(2)

// First attempt: run the tests for real.
let result = runCargo(['test', ...forwardArgs])

if (result.status === 0) {
  process.exit(0)
}

// Only on Windows does the harness fail to *start*; on other platforms a
// non-zero status is a genuine test/compile failure we must propagate.
if (process.platform !== 'win32') {
  process.exit(result.status ?? 1)
}

// Detect the known loader bug. The inherited-stdio run above doesn't capture
// output, so re-run while capturing to inspect the failure reason.
const capture = spawnSync('cargo', ['test', ...forwardArgs], {
  cwd: crateDir,
  encoding: 'utf8',
  env: process.env,
})
const output = `${capture.stdout ?? ''}${capture.stderr ?? ''}`
const isLoaderBug = FALLBACK_MARKERS.some(marker => output.includes(marker))

if (!isLoaderBug) {
  console.error(output)
  process.exit(capture.status ?? 1)
}

console.warn(
  '\n⚠ Detected the known Tauri Windows test-harness loader bug ' +
    '(0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND — tauri-apps/tauri#13419).\n' +
    '  The test harness cannot start on Windows regardless of test code.\n' +
    '  Re-running as `cargo test --no-run` to verify compilation…'
)

result = runCargo(['test', '--no-run', ...forwardArgs])
process.exit(result.status ?? 1)
