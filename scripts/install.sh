#!/usr/bin/env bash
# Install mcx (metacodex-cli) for the current user.
# Does not need sudo. Does not touch ~/.mcx (sessions and keys stay).
#
#   curl -fsSL https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh | bash
#   curl -fsSL ... | bash -s -- --uninstall
#
# The script is always fetched from main (current install logic). The source it
# builds defaults to the latest GitHub release tag, not the tip of main.
#
# Optional env:
#   MCX_REF          git ref (default: latest GitHub release). Trunk: MCX_REF=main
#   MCX_INSTALL_DIR  checkout (default: ~/.local/share/metacodex-cli)
#   MCX_BIN_DIR      symlink dir (default: ~/.local/bin)
#   MCX_FROM_DIR     install from a local checkout instead of GitHub

set -euo pipefail

REPO="victorbenazzi/metacodex-cli"
INSTALL_DIR="${MCX_INSTALL_DIR:-${HOME}/.local/share/metacodex-cli}"
BIN_DIR="${MCX_BIN_DIR:-${HOME}/.local/bin}"
MIN_NODE="22.19.0"
PNPM_VERSION="11.17.0"

say() { printf '%s\n' "$*"; }
err() { printf 'mcx install: %s\n' "$*" >&2; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "missing command: $1"
    exit 1
  fi
}

node_ok() {
  node -e "
    const need = process.argv[1].split('.').map(Number);
    const got = process.versions.node.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const n = need[i] ?? 0;
      const g = got[i] ?? 0;
      if (g > n) process.exit(0);
      if (g < n) process.exit(1);
    }
  " "$MIN_NODE"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    say "Enabling pnpm ${PNPM_VERSION} via corepack..."
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
    return
  fi
  if command -v npm >/dev/null 2>&1; then
    say "Installing pnpm ${PNPM_VERSION} with npm..."
    npm install -g "pnpm@${PNPM_VERSION}"
    return
  fi
  err "need pnpm. Install pnpm, or Node with corepack, then rerun."
  exit 1
}

latest_release_tag() {
  local json tag
  if ! json="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")"; then
    err "could not read latest GitHub release for ${REPO}."
    err "Set MCX_REF=main to install trunk, or MCX_REF=vX.Y.Z to pin a tag."
    exit 1
  fi
  if ! tag="$(printf '%s' "${json}" | node -e '
    const fs = require("fs");
    try {
      const data = JSON.parse(fs.readFileSync(0, "utf8"));
      if (typeof data.tag_name !== "string" || data.tag_name.length === 0) process.exit(1);
      process.stdout.write(data.tag_name);
    } catch {
      process.exit(1);
    }
  ')"; then
    err "no GitHub release found for ${REPO}."
    err "Set MCX_REF=main to install trunk, or wait for a v* tag."
    exit 1
  fi
  printf '%s\n' "${tag}"
}

resolve_ref() {
  if [[ -n "${MCX_REF:-}" ]]; then
    printf '%s\n' "${MCX_REF}"
    return
  fi
  # stderr: this function's stdout is captured into REF for the tarball URL.
  say "Resolving latest GitHub release..." >&2
  latest_release_tag
}

uninstall() {
  if [[ -L "${BIN_DIR}/mcx" ]] || [[ -f "${BIN_DIR}/mcx" ]]; then
    rm -f "${BIN_DIR}/mcx"
    say "Removed ${BIN_DIR}/mcx"
  fi
  if [[ -d "${INSTALL_DIR}" ]]; then
    rm -rf "${INSTALL_DIR}"
    say "Removed ${INSTALL_DIR}"
  fi
  say "Left ~/.mcx in place (auth, sessions, settings)."
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

need_cmd curl
need_cmd tar
need_cmd node

if ! node_ok; then
  err "Node.js >= ${MIN_NODE} required. This machine has $(node -v)."
  err "Install a current Node, then rerun."
  exit 1
fi

ensure_pnpm
mkdir -p "${BIN_DIR}" "${INSTALL_DIR}"

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t mcx-install)"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

if [[ -n "${MCX_FROM_DIR:-}" ]]; then
  SRC="${MCX_FROM_DIR}"
  if [[ ! -f "${SRC}/package.json" ]]; then
    err "MCX_FROM_DIR has no package.json: ${SRC}"
    exit 1
  fi
  say "Installing from local checkout ${SRC}"
  rm -rf "${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}"
  # Copy without git metadata and without node_modules/dist from the source tree.
  tar -C "${SRC}" \
    --exclude .git \
    --exclude node_modules \
    --exclude dist \
    -cf - . | tar -C "${INSTALL_DIR}" -xf -
else
  REF="$(resolve_ref)"
  # A leaked status line on stdout used to become a newline in the URL
  # (curl: (3) URL rejected). Keep the path a single token.
  if [[ -z "${REF}" || "${REF}" == *$'\n'* || "${REF}" == *$'\r'* || "${REF}" == *' '* ]]; then
    err "ref must be a single token, got: ${REF}"
    exit 1
  fi
  ARCHIVE="https://codeload.github.com/${REPO}/tar.gz/${REF}"
  say "Downloading ${REPO}@${REF}..."
  curl -fsSL "${ARCHIVE}" -o "${TMP}/src.tar.gz"
  mkdir -p "${TMP}/src"
  tar -xzf "${TMP}/src.tar.gz" -C "${TMP}/src"
  INNER=""
  for dir in "${TMP}/src"/*; do
    if [[ -d "${dir}" ]]; then
      INNER="${dir}"
      break
    fi
  done
  if [[ -z "${INNER}" ]]; then
    err "archive was empty"
    exit 1
  fi
  rm -rf "${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}"
  tar -C "${INNER}" -cf - . | tar -C "${INSTALL_DIR}" -xf -
fi

say "Installing dependencies..."
(
  cd "${INSTALL_DIR}"
  pnpm install --frozen-lockfile
  say "Building mcx..."
  pnpm build
)

if [[ ! -f "${INSTALL_DIR}/dist/cli.js" ]]; then
  err "build did not produce dist/cli.js"
  exit 1
fi
chmod +x "${INSTALL_DIR}/dist/cli.js"

ln -sfn "${INSTALL_DIR}/dist/cli.js" "${BIN_DIR}/mcx"

say ""
if ! command -v mcx >/dev/null 2>&1 || [[ "$(command -v mcx)" != "${BIN_DIR}/mcx" ]]; then
  case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *)
      say "Add this to your shell rc, then open a new terminal:"
      say "  export PATH=\"${BIN_DIR}:\$PATH\""
      say ""
      ;;
  esac
fi

"${BIN_DIR}/mcx" --version
say "Installed. Run: mcx"
say "Home is ~/.mcx (override with MCX_HOME)."
say "Later: mcx update (latest GitHub release). --uninstall removes the app, not ~/.mcx."
