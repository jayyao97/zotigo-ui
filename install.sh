#!/bin/sh
main() {
set -eu
umask 077
component=desktop version= source_dir= daemon_source= service=yes
prefix="${ZOTIGO_INSTALL_PREFIX:-$HOME/.local/share/zotigo}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --component|--version|--source|--daemon-source|--prefix)
      [ "$#" -ge 2 ] || { echo "Missing value for $1" >&2; exit 2; }
      case "$1" in --component) component=$2 ;; --version) version=$2 ;; --source) source_dir=$2 ;; --daemon-source) daemon_source=$2 ;; --prefix) prefix=$2 ;; esac
      shift 2 ;;
    --no-service) service=no; shift ;;
    --help) echo 'Usage: sh install.sh [--version TAG|COMMIT | --source CHECKOUT] [--component desktop|web] [--daemon-source CHECKOUT] [--prefix PATH] [--no-service]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
case "$component" in desktop|web) ;; *) echo 'Component must be desktop or web.' >&2; exit 2 ;; esac
[ -z "$version" ] || [ -z "$source_dir" ] || { echo 'Choose --version or --source, not both.' >&2; exit 2; }
# Git is needed to resolve release tags and preserve source provenance.
for prerequisite in git curl tar; do
  command -v "$prerequisite" >/dev/null 2>&1 || { echo "Install $prerequisite and retry." >&2; exit 1; }
done
git --version >/dev/null 2>&1 || { echo 'Git is unavailable; on macOS install Command Line Tools first.' >&2; exit 1; }
bootstrap=$(mktemp -d)
trap 'rm -rf "$bootstrap"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [ -z "$source_dir" ]; then
  if [ -z "$version" ]; then
    tags=$(git ls-remote --tags --refs https://github.com/jayyao97/zotigo-ui.git)
    selected=$(printf '%s\n' "$tags" | awk '
      $2 ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/ {
        split(substr($2,12),v,".")
        if (!found || v[1]+0 > major || (v[1]+0 == major && (v[2]+0 > minor || (v[2]+0 == minor && v[3]+0 > patch)))) {
          found=1; major=v[1]+0; minor=v[2]+0; patch=v[3]+0; chosen=$1 " " $2
        }
      }
      END {if (found) print chosen}')
    [ -n "$selected" ] || { echo 'No stable vX.Y.Z release tag is published yet. Use --source for development.' >&2; exit 1; }
    ref=${selected%% *}
    version=${selected#* }; version=${version#refs/tags/}
    printf 'Selected stable version %s (%s)\n' "$version" "$ref"
  else
    case "$version" in *[!a-zA-Z0-9._-]*|-*) echo 'Invalid --version; use a tag or full commit.' >&2; exit 2 ;; esac
    if printf '%s\n' "$version" | grep -Eq '^[0-9a-fA-F]{40}$'; then ref=$version; else ref="refs/tags/$version"; fi
  fi
  git init -q "$bootstrap/ui"
  git -C "$bootstrap/ui" fetch -q --depth=1 https://github.com/jayyao97/zotigo-ui.git "$ref"
  git -C "$bootstrap/ui" checkout -q --detach FETCH_HEAD
  [ -f "$bootstrap/ui/install.sh" ] || { echo "Release $version predates source installation; select a newer tag." >&2; exit 1; }
  set -- --source "$bootstrap/ui" --component "$component" --prefix "$prefix"
  [ "$service" = yes ] || set -- "$@" --no-service
  [ -z "$daemon_source" ] || set -- "$@" --daemon-source "$daemon_source"
  sh "$bootstrap/ui/install.sh" "$@"
  exit
fi
source_dir=$(cd "$source_dir" && pwd -P)
if [ -z "$daemon_source" ]; then
  daemon_ref=$(cat "$source_dir/daemon-version")
  case "$daemon_ref" in ''|*[!a-zA-Z0-9._-]*|-*) echo 'Invalid daemon-version.' >&2; exit 2 ;; esac
  daemon_source="$bootstrap/daemon"
  git init -q "$daemon_source"
  case "$daemon_ref" in ????????????????????????????????????????) ref=$daemon_ref ;; *) ref="refs/tags/$daemon_ref" ;; esac
  git -C "$daemon_source" fetch -q --depth=1 https://github.com/jayyao97/zotigo.git "$ref"
  git -C "$daemon_source" checkout -q --detach FETCH_HEAD
fi
daemon_source=$(cd "$daemon_source" && pwd -P)
. "$daemon_source/scripts/install-common.sh"
install_init
# install_init sets a per-component cleanup trap; retain the bootstrap checkout as well.
trap 'rm -rf "$stage" "$bootstrap"; rmdir "$root/install.lock"' EXIT
toolchain_manifest="$daemon_source/scripts/toolchains.tsv"
. "$daemon_source/scripts/toolchains.sh"
ensure_go "$daemon_source"
ensure_node
ensure_pnpm "$source_dir"
source_identity
version=$("$node_executable" -p 'require(process.argv[1]).version' "$source_dir/package.json")
validate_version
service_check
assert_stopped
if [ "$component" = desktop ]; then
  case "$platform" in
    Darwin)
      app_link="$HOME/Applications/Zotigo.app"
      if [ -e "$app_link" ] || [ -L "$app_link" ]; then
        [ "$(readlink "$app_link" || true)" = "$root/current/Zotigo.app" ] || fail "Refusing to overwrite $app_link."
      fi ;;
    Linux)
      desktop_file="$HOME/.local/share/applications/zotigo.desktop"
      if [ -e "$desktop_file" ] || [ -L "$desktop_file" ]; then
        [ ! -L "$desktop_file" ] && grep -Fx "# Zotigo installer: $prefix" "$desktop_file" >/dev/null || fail "Refusing to overwrite $desktop_file."
      fi ;;
  esac
fi
# Build in a disposable checkout so packaging never mutates a developer's working tree.
mkdir "$stage/ui"
(cd "$source_dir" && tar --exclude=.git --exclude=node_modules --exclude=build --exclude=dist --exclude=dist-electron --exclude=dist-tests -cf "$stage/source.tar" .)
(cd "$stage/ui" && tar -xf "$stage/source.tar")
if [ "$component" = web ]; then
  (cd "$stage/ui" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile && pnpm build:web)
else
  (cd "$stage/ui" && pnpm install --frozen-lockfile && pnpm package:desktop)
fi
mkdir "$stage/output"
if [ "$component" = web ]; then
  cp -R "$stage/ui/dist" "$stage/ui/dist-electron" "$stage/output/"
  cp "$source_dir/LICENSE" "$source_dir/THIRD_PARTY_NOTICES.md" "$stage/output/"
  config="$prefix/config/web.env"
  [ -e "$config" ] || printf '%s\n' '# Shell assignments; preserved on upgrade.' 'ZOTIGOD_URL=http://127.0.0.1:8766' 'ZOTIGO_WEB_HOST=127.0.0.1' 'ZOTIGO_WEB_PORT=8080' > "$config"
  {
    echo '#!/bin/sh'
    printf 'PATH=%s; export PATH\n' "$(quote "$PATH")"
    echo 'set -a'
    printf '. %s\n' "$(quote "$config")"
    echo 'set +a'
    printf 'exec %s %s\n' "$(quote "$node_executable")" "$(quote "$root/current/dist-electron/web/main.js")"
  } > "$stage/output/run"
  chmod +x "$stage/output/run"
else
  package_dir=$(find "$stage/ui/build/desktop" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  [ -n "$package_dir" ] || fail 'Desktop package was not produced.'
  cp -R "$package_dir/." "$stage/output/"
fi

# UI defaults to a local daemon. Reuse only the exact paired build, and never stop it implicitly.
if installed_daemon_matches "$prefix/daemon/current/zotigod" "$daemon_source"; then
  echo 'Reusing the installed paired daemon.'
  if [ "$service" = yes ]; then
    (
      component=daemon root="$prefix/daemon"
      version=$(sed -n 's/^version=//p' "$root/current/INSTALLATION")
      service_check
      if ! service_running; then
        # A loaded but stopped LaunchAgent needs unloading before bootstrap.
        if [ "$platform" = Darwin ] && launchctl print "gui/$(id -u)/com.zotigo.daemon" >/dev/null 2>&1; then
          launchctl bootout "gui/$(id -u)/com.zotigo.daemon"
        fi
        service_install
      fi
      . "$prefix/config/daemon.env"
      daemon_check_url
      service_verify
    )
  fi
else
  set -- --source "$daemon_source" --component daemon --prefix "$prefix"
  [ "$service" = yes ] || set -- "$@" --no-service
  sh "$daemon_source/install.sh" "$@"
fi
publish_install
if [ "$component" = web ]; then
  service_install
  . "$config"
  check_bind=${ZOTIGO_WEB_HOST:-127.0.0.1}
  case "$check_bind" in 0.0.0.0) check_bind=127.0.0.1 ;; ::) check_bind='[::1]' ;; *:*) check_bind="[$check_bind]" ;; esac
  check_url="http://$check_bind:${ZOTIGO_WEB_PORT:-8080}/"
  check_host=$(node -p 'new URL(process.argv[1]).host' "${ZOTIGO_WEB_ORIGIN:-http://127.0.0.1:${ZOTIGO_WEB_PORT:-8080}}")
  service_verify
else
  case "$platform" in
    Darwin)
      mkdir -p "$HOME/Applications"
      app_link="$HOME/Applications/Zotigo.app"
      if [ -e "$app_link" ] && [ "$(readlink "$app_link" || true)" != "$root/current/Zotigo.app" ]; then fail "Refusing to overwrite $app_link."; fi
      atomic_link "$root/current/Zotigo.app" "$app_link"
      printf 'Open: %s\n' "$app_link" ;;
    Linux)
      mkdir -p "$HOME/.local/share/applications"
      cat > "$HOME/.local/share/applications/zotigo.desktop" <<EOF
[Desktop Entry]
# Zotigo installer: $prefix
Type=Application
Name=Zotigo
Exec="$root/current/zotigo-desktop"
Terminal=false
Categories=Development;
EOF
      printf 'Open Zotigo from your applications menu, or run: %s/current/zotigo-desktop\n' "$root" ;;
  esac
fi
printf 'Installed %s: %s\nVersion record: %s/current/INSTALLATION\n' "$component" "$version" "$root"

}
main "$@"
