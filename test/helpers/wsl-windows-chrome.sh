#!/usr/bin/env bash
# CHROME_PATH for the opt-in browser suites run from WSL: launches the Windows Chrome (the GPU; a WSL Chromium renders
# WebGL in software, and the GPU-only paths of the render suites never run there).
#
#   CHROME_PATH="$PWD/test/helpers/wsl-windows-chrome.sh" SP_E2E=1 node --test --test-concurrency=1 test/ui/mock.e2e.test.js
#
# One test file at a time (--test-concurrency=1): each file starts its own Windows Chrome, and several at once push the
# suites' short waits (5 s in test/ui/modal.e2e.test.js) past their limit.
#
# Puppeteer starts this script as the browser and reads the DevTools address from its stderr; WSL must use mirrored
# networking (.wslconfig `networkingMode=mirrored`) so 127.0.0.1 is the same on both sides — the browser reaches the
# test servers in WSL and puppeteer the browser's debugging port. The profile must be a Windows folder: Windows Chrome
# cannot open a WSL path and falls back to the user's own profile (an orphaned headless instance then holds it, and the
# user's Chrome windows stop opening). So the --user-data-dir puppeteer passes is replaced by a fresh folder under the
# Windows %TEMP% (the contents copied over when the test prepared one, e.g. a Preferences file), and folders of runs
# older than two hours are removed.
#
# Killing the WSL side of a Windows program does not end the program: a SIGKILL from puppeteer (a timed-out test) or a
# crashed test process would leave a headless Chrome running on Windows. So a watchdog stays beside this script and,
# once the script or the test process is gone, stops every Chrome of this run's profile and removes the profile.
#   WIN_CHROME  the Windows chrome.exe (default: the standard install)
set -u
WIN_CHROME="${WIN_CHROME:-/mnt/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$WIN_CHROME" ] || { echo "wsl-windows-chrome: no Windows Chrome at $WIN_CHROME (set WIN_CHROME)" >&2; exit 127; }
win_temp=$(cd /mnt/c && cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')
[ -n "$win_temp" ] || { echo "wsl-windows-chrome: cannot read the Windows %TEMP%" >&2; exit 1; }
temp_wsl=$(wslpath -u "$win_temp")
find "$temp_wsl" -maxdepth 1 -name 'sp-e2e-*' -type d -mmin +120 -exec rm -rf {} + 2>/dev/null
name="sp-e2e-$(date +%s)-$$"
mkdir -p "$temp_wsl/$name"
args=()
for a in "$@"; do
  case "$a" in
    --user-data-dir=*)
      src="${a#--user-data-dir=}"
      [ -d "$src" ] && cp -r "$src/." "$temp_wsl/$name/" 2>/dev/null
      ;;
    *) args+=("$a") ;;
  esac
done
self=$$ owner=$PPID
(
  trap '' TERM INT HUP
  while kill -0 "$self" 2>/dev/null && kill -0 "$owner" 2>/dev/null; do sleep 1; done
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*$name*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  sleep 1
  rm -rf "${temp_wsl:?}/$name" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
trap 'exit 143' TERM INT HUP
"$WIN_CHROME" "--user-data-dir=$win_temp\\$name" "${args[@]}" &
wait $!
