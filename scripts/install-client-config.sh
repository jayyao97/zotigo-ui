# Called after the paired daemon has been installed. Existing client settings win.
install_client_config() (
  config="$prefix/config/$component.env"
  [ "$component" != desktop ] || config="$prefix/config/desktop.json"
  if [ ! -e "$config" ]; then
    [ ! -L "$config" ] || fail "Client configuration is a broken symlink: $config"
    if [ -e "$root/current/INSTALLATION" ]; then
      # Older Desktop installations have no installer-owned connection settings.
      [ "$component" != desktop ] || return 0
      fail "Existing Web configuration is missing; restore $config before reinstalling."
    fi
    # Do not inherit a token or endpoint from the installer's shell.
    ZOTIGOD_AUTH_TOKEN_FILE=
    ZOTIGOD_ADDR=
    . "$prefix/config/daemon.env"
    daemon_check_url
    local_url=${check_url%/health}
    if [ "$component" = web ]; then
      {
        printf '%s\n' '# Shell assignments; preserved on upgrade.'
        printf 'ZOTIGOD_URL=%s\n' "$(quote "$local_url")"
        printf 'ZOTIGOD_AUTH_TOKEN_FILE=%s\n' "$(quote "$ZOTIGOD_AUTH_TOKEN_FILE")"
        printf '%s\n' 'ZOTIGO_WEB_HOST=127.0.0.1' 'ZOTIGO_WEB_PORT=8080'
      } > "$stage/client-config"
    else
      "$node_executable" -e 'process.stdout.write(JSON.stringify({baseUrl: process.argv[1], tokenFile: process.argv[2]}) + "\n")' "$local_url" "$ZOTIGOD_AUTH_TOKEN_FILE" > "$stage/client-config"
    fi
    mv "$stage/client-config" "$config"
  fi
  if [ "$component" = desktop ]; then
    resources="$stage/output/resources"
    [ "$platform" != Darwin ] || resources="$stage/output/Zotigo.app/Contents/Resources"
    ln -s "$config" "$resources/local-host.json"
  fi
)
