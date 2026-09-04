#!/usr/bin/env bash
# Side-by-side migration helper for S5 Mail 2026.08.x.
#
# This script deliberately copies only S5 data and /etc/s5mail.conf.  It does
# not copy the source host's Postfix, Dovecot, nginx, PHP, systemd, or other
# package configuration.  Run it on the old (Ubuntu) server for preseed/final
# and on the old server with --phase import after the Debian target is ready.
set -Eeuo pipefail

readonly EXPECTED_RELEASE_RE='^2026\.08\.[0-9]+$'
readonly EXPECTED_NEXTCLOUD_MAJOR='34'
readonly TARGET_READY_MARKER='/var/lib/s5mail/debian13-provisioning-complete'

SOURCE_ROOT="/"
TARGET_ROOT=""
TARGET_HOST="local"
PHASE="all"
SOURCE_RELEASE=""
STATE_FILE=""
DRAIN_TIMEOUT=300
DRY_RUN=0
FINAL_SYNC_SUCCEEDED=0
declare -a SERVICE_STATES=()

usage() {
	cat <<'EOF'
Usage: tools/migrate-side-by-side.sh [options]

Perform a resumable side-by-side migration.  The target is either a local
mounted Debian root or an SSH host (root must be able to run rsync and the
target commands).

Required:
  --target-root PATH       Target filesystem root (absolute path).
  --target-host HOST       SSH host; omit for a local target.

Phases:
  --phase preseed           Copy data while the source remains online.
  --phase final             Quiesce source, checkpoint SQLite, and final-sync.
  --phase import            Clean legacy target state and validate the import.
  --phase all               Dry-run the full sequence (real cutovers need the
                            post-final target provisioning step described below).

Options:
  --source-root PATH        Source filesystem root (default: /).
  --source-release VERSION  Explicit source release, e.g. 2026.08.2.
  --state-file PATH         In-progress marker (default: source /var/lib/s5mail/...).
  --drain-timeout SECONDS   Maximum time to wait for PHP/management jobs (300).
  --dry-run                 Show checks and copy/stop operations without changes.
  -h, --help                Show this help.

The source release is read from --source-release, S5MAIL_RELEASE in
/etc/s5mail.conf, /etc/s5mail-release, or setup/bootstrap.sh.  A release must
be 2026.08.x.  The source remains the rollback copy; after final-sync succeeds
its services stay stopped so it cannot diverge from the Debian target. Until
import succeeds, the marker records which source services had been active so
the same set can be restored if the cutover is abandoned.

For a real remote cutover: preseed the target, provision it once, repeat
preseed as needed, run final, rerun setup/start.sh on the Debian target to
reconcile the authoritative final databases, then run import. The import phase
will not clear the source marker until that post-final provisioning succeeded.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
log() { printf '[s5mail-migration] %s\n' "$*"; }
warn() { printf '[s5mail-migration] WARNING: %s\n' "$*" >&2; }

run() {
	if (( DRY_RUN )); then
		printf '[dry-run]'
		printf ' %q' "$@"
	printf '\n'
		return 0
	fi
	"$@"
}

is_absolute_safe_path() {
	[[ "$1" == /* && "$1" != *$'\n'* && "$1" != *$'\r'* ]]
}

source_path() {
	local relative=$1
	if [[ "$SOURCE_ROOT" == "/" ]]; then
		printf '/%s\n' "${relative#/}"
	else
		printf '%s/%s\n' "${SOURCE_ROOT%/}" "${relative#/}"
	fi
}

target_path() {
	local absolute=$1
	if [[ "$TARGET_ROOT" == "/" ]]; then
		printf '/%s\n' "${absolute#/}"
	else
		printf '%s/%s\n' "${TARGET_ROOT%/}" "${absolute#/}"
	fi
}

target_command() {
	# Target paths and commands are validated before this function is called.
	if (( DRY_RUN )); then
		run target-command "$@"
		return 0
	fi
	if [[ "$TARGET_HOST" == "local" ]]; then
		"$@"
		return
	fi
	local escaped
	printf -v escaped '%q ' "$@"
	ssh -- "$TARGET_HOST" "$escaped"
}

target_rsync_spec() {
	local path=$1
	if [[ "$TARGET_HOST" == "local" ]]; then
		printf '%s\n' "$path"
	else
		printf '%s:%s\n' "$TARGET_HOST" "$path"
	fi
}

target_file_exists() {
	target_command test -f "$1"
}

read_conf_value() {
	local file=$1 key=$2 value
	value=$(awk -v wanted="$key" '
		$0 ~ "^[[:space:]]*" wanted "=" {
			line=$0
			sub("^[[:space:]]*" wanted "=", "", line)
			sub(/[[:space:]]+#.*/, "", line)
			sub(/^[[:space:]]*/, "", line); sub(/[[:space:]]*$/, "", line)
			print line; exit
		}' "$file")
	value=${value#\"}; value=${value%\"}
	value=${value#\'}; value=${value%\'}
	printf '%s\n' "$value"
}

get_source_release() {
	local conf release_file bootstrap
	if [[ -n "$SOURCE_RELEASE" ]]; then
		printf '%s\n' "$SOURCE_RELEASE"
		return
	fi
	conf=$(source_path /etc/s5mail.conf)
	if [[ -f "$conf" ]]; then
		local configured_release
		configured_release=$(read_conf_value "$conf" S5MAIL_RELEASE)
		if [[ -n "$configured_release" ]]; then
			printf '%s\n' "$configured_release"
			return 0
		fi
	fi
	release_file=$(source_path /etc/s5mail-release)
	if [[ -f "$release_file" ]]; then
		sed -n '1{s/[[:space:]]*$//;p;}' "$release_file"
		return 0
	fi
	for bootstrap in \
		"$(source_path /root/s5mail/setup/bootstrap.sh)" \
		"$(source_path /root/mailinabox/setup/bootstrap.sh)" \
		"$(source_path /setup/bootstrap.sh)"; do
		if [[ -f "$bootstrap" ]]; then
			sed -n 's/^[[:space:]]*TAG=v\([0-9][0-9.]*\).*$/\1/p' "$bootstrap" | head -n 1
			return 0
		fi
	done
	printf '\n'
}

source_preflight() {
	local conf storage users nextcloud release nc_version migration
	conf=$(source_path /etc/s5mail.conf)
	[[ -f "$conf" ]] || die "source configuration is missing: $conf"
	storage=$(read_conf_value "$conf" STORAGE_ROOT)
	is_absolute_safe_path "$storage" || die "STORAGE_ROOT in $conf is not an absolute safe path"
	[[ "$storage" != "/" ]] || die "refusing STORAGE_ROOT=/"
	users=$(source_path "$storage/mail/users.sqlite")
	nextcloud=$(source_path "$storage/owncloud/owncloud.db")
	[[ -f "$users" ]] || die "source users database is missing: $users"
	[[ -f "$nextcloud" ]] || die "source Nextcloud database is missing: $nextcloud"
	[[ -f "$(source_path "$storage/s5mail.version")" || -f "$(source_path "$storage/mailinabox.version")" ]] \
		|| die "source has no S5 Mail migration marker (s5mail.version/mailinabox.version)"
	release=$(get_source_release)
	[[ "$release" =~ $EXPECTED_RELEASE_RE ]] || die "source release '$release' is not S5 Mail 2026.08.x (use --source-release to identify it)"

	if command -v sqlite3 >/dev/null 2>&1; then
		migration=$(sqlite3 "$users" 'PRAGMA integrity_check;' | tr -d '\r')
		[[ "$migration" == "ok" ]] || die "source users.sqlite integrity check failed: $migration"
		migration=$(sqlite3 "$nextcloud" 'PRAGMA integrity_check;' | tr -d '\r')
		[[ "$migration" == "ok" ]] || die "source owncloud.db integrity check failed: $migration"
		nc_version=$(sqlite3 "$nextcloud" "SELECT configvalue FROM oc_appconfig WHERE appid='core' AND configkey='version' LIMIT 1;" 2>/dev/null || true)
		if [[ -n "$nc_version" && "$nc_version" != "$EXPECTED_NEXTCLOUD_MAJOR."* ]]; then
			die "source Nextcloud version '$nc_version' is not Nextcloud 34"
		fi
	elif (( ! DRY_RUN )); then
		die "sqlite3 is required for source integrity and Nextcloud version checks"
	else
		warn "sqlite3 is unavailable; dry-run skipped source database checks"
	fi

	SOURCE_STORAGE="$storage"
	SOURCE_USERS_DB="$users"
	SOURCE_NEXTCLOUD_DB="$nextcloud"
	TARGET_STORAGE=$(target_path "$storage")
	TARGET_USERS_DB="$TARGET_STORAGE/mail/users.sqlite"
	TARGET_NEXTCLOUD_DB="$TARGET_STORAGE/owncloud/owncloud.db"
	log "validated source S5 Mail $release with STORAGE_ROOT=$storage"
}

ensure_options() {
	is_absolute_safe_path "$SOURCE_ROOT" || die "--source-root must be an absolute path"
	is_absolute_safe_path "$TARGET_ROOT" || die "--target-root must be an absolute path"
	[[ "$SOURCE_ROOT" != "$TARGET_ROOT" || "$TARGET_HOST" != "local" ]] || die "source and local target roots must differ"
	[[ "$TARGET_ROOT" != "/" || "$TARGET_HOST" != "local" ]] || die "refusing local target root /; mount the Debian target explicitly"
	[[ -z "$STATE_FILE" || "$STATE_FILE" == /* ]] || die "--state-file must be an absolute path"
	[[ "$DRAIN_TIMEOUT" =~ ^[0-9]+$ ]] || die "--drain-timeout must be an integer"
	if [[ "$TARGET_HOST" != "local" ]]; then
		[[ "$TARGET_HOST" =~ ^[A-Za-z0-9_.@:-]+$ ]] || die "unsafe --target-host"
	fi
}

sync_storage() {
	local source_storage target_storage
	source_storage=$(source_path "$SOURCE_STORAGE")
	target_storage=$(target_path "$SOURCE_STORAGE")
	log "syncing S5 storage to $TARGET_HOST:$target_storage (legacy webmail/spam state excluded)"
	run target_command mkdir -p "$target_storage"
	local -a options=(-aHAX --numeric-ids --partial --protect-args --exclude=mail/roundcube/ --exclude=mail/spamassassin/ --exclude=mail/postgrey/)
	if (( DRY_RUN )); then
		run rsync "${options[@]}" "$source_storage/" "$(target_rsync_spec "$target_storage")/"
	else
		if [[ "$TARGET_HOST" == "local" ]]; then
			run rsync "${options[@]}" "$source_storage/" "$target_storage/"
		else
			run rsync "${options[@]}" "$source_storage/" "$(target_rsync_spec "$target_storage")/"
		fi
	fi
}

sync_environment_file() {
	local source_conf target_conf
	source_conf=$(source_path /etc/s5mail.conf)
	target_conf=$(target_path /etc/s5mail.conf)
	[[ -f "$source_conf" ]] || die "source configuration is missing: $source_conf"
	log "copying only /etc/s5mail.conf to target (host package configuration is not copied)"
	run target_command mkdir -p "$(target_path /etc)"
	if (( DRY_RUN )); then
		run rsync -a "$source_conf" "$(target_rsync_spec "$target_conf")"
	elif [[ "$TARGET_HOST" == "local" ]]; then
		run rsync -a "$source_conf" "$target_conf"
	else
		run rsync -a "$source_conf" "$(target_rsync_spec "$target_conf")"
	fi
}

preseed() {
	log "phase preseed: source remains online"
	source_preflight
	sync_storage
	sync_environment_file
	log "preseed complete; repeat this phase whenever the source changes"
}

service_is_active() {
	command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$1"
}

capture_service_states() {
	local service state
	SERVICE_STATES=()
	for service in php8.4-fpm php8.3-fpm php8.2-fpm php8.1-fpm php-fpm cron s5mail mailinabox postfix dovecot postgrey; do
		state=0
		if (( ! DRY_RUN )) && service_is_active "$service"; then state=1; fi
		SERVICE_STATES+=("$service=$state")
	done
}

stop_source_services() {
	local service state service_state
	log "quiescing source writers (PHP-FPM, cron, management, Postfix, Dovecot, Postgrey)"
	for service_state in "${SERVICE_STATES[@]}"; do
		service=${service_state%%=*}; state=${service_state##*=}
		if [[ "$state" == 1 ]]; then
			run systemctl stop "$service"
		fi
	done
	if (( DRY_RUN )); then
		log "[dry-run] would drain running Nextcloud cron/occ and management jobs"
		return
	fi
	local waited=0 pattern='(php([0-9.]+)?|python|uv).*(/usr/local/lib/owncloud/(cron\.php|occ)|management/|s5mail)'
	while pgrep -f -- "$pattern" >/dev/null 2>&1; do
		if (( waited >= DRAIN_TIMEOUT )); then
			pgrep -af -- "$pattern" >&2 || true
			die "timed out draining Nextcloud/management jobs; source was restored if possible"
		fi
		sleep 1
		waited=$((waited + 1))
	done
}

restore_source_services() {
	local service_state service state
	log "restoring source service state after unsuccessful final sync"
	for service_state in "${SERVICE_STATES[@]}"; do
		service=${service_state%%=*}; state=${service_state##*=}
		if [[ "$state" == 1 ]]; then
			if ! systemctl start "$service" >/dev/null 2>&1; then
				warn "could not restore $service; start it manually"
			fi
		fi
	done
}

write_state() {
	local value=$1
	[[ -n "$STATE_FILE" ]] || STATE_FILE=$(source_path /var/lib/s5mail/side-by-side-migration.state)
	if (( DRY_RUN )); then
		log "[dry-run] state $STATE_FILE <- $value"
		return
	fi
	install -d -m 0750 "$(dirname "$STATE_FILE")"
	{
		printf 'status=%s\n' "$value"
		for service_state in "${SERVICE_STATES[@]}"; do
			if [[ "${service_state##*=}" == 1 ]]; then
				printf 'active_service=%s\n' "${service_state%%=*}"
			fi
		done
	} >"$STATE_FILE"
	chmod 0600 "$STATE_FILE"
}

remove_state() {
	if (( DRY_RUN )); then log "[dry-run] remove state $STATE_FILE"; return; fi
	rm -f -- "$STATE_FILE"
}

checkpoint_databases() {
	local db result
	for db in "$SOURCE_USERS_DB" "$SOURCE_NEXTCLOUD_DB"; do
		log "checkpointing and integrity-checking $db"
		if (( DRY_RUN )); then
			log "[dry-run] sqlite3 $db PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;"
			continue
		fi
		result=$(sqlite3 "$db" 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;' | tail -n 1 | tr -d '\r')
		[[ "$result" == "ok" ]] || die "database integrity check failed for $db: $result"
	done
}

final_sync() {
	log "phase final: source will be stopped for an exclusive maintenance window"
	source_preflight
	STATE_FILE=${STATE_FILE:-$(source_path /var/lib/s5mail/side-by-side-migration.state)}
	capture_service_states
	write_state final-sync-in-progress
	restore_on_failure() {
		if (( FINAL_SYNC_SUCCEEDED == 0 )); then restore_source_services || true; fi
	}
	trap restore_on_failure EXIT
	stop_source_services
	checkpoint_databases
	# A prior target provisioning run is no longer proof of readiness after the
	# authoritative databases are overwritten by this final sync.
	target_command rm -f -- "$(target_path "$TARGET_READY_MARKER")"
	sync_storage
	sync_environment_file
	# Keep a durable marker until target cleanup and database validation also
	# succeed. An interrupted rerun must not mistake copied-but-unvalidated data
	# for a completed migration.
	write_state final-sync-complete-import-pending
	FINAL_SYNC_SUCCEEDED=1
	log "final sync complete; target import remains pending and source services remain stopped for rollback safety"
	trap - EXIT
}

target_cleanup_legacy_state() {
	local target_storage=$1
	log "removing retired Roundcube and legacy spam/Postgrey state on target only"
	target_command rm -rf -- \
		"$target_storage/mail/roundcube" \
		"$target_storage/mail/spamassassin" \
		"$target_storage/mail/postgrey" \
		"$(target_path /usr/local/lib/roundcubemail)" \
		"$(target_path /var/log/roundcubemail)" \
		"$(target_path /var/tmp/roundcubemail)" \
		"$(target_path /var/lib/postgrey)" \
		"$(target_path /var/cache/postgrey)" \
		"$(target_path /var/lib/spamassassin)"
	target_command rm -f -- \
		"$(target_path /etc/logrotate.d/roundcubemail)" \
		"$(target_path /etc/fail2ban/filter.d/s5mail-roundcube.conf)" \
		"$(target_path /etc/fail2ban/filter.d/miab-roundcube.conf)" \
		"$(target_path /etc/cron.daily/mailinabox-postgrey-whitelist)" \
		"$(target_path /etc/cron.daily/s5mail-postgrey-whitelist)"
	target_command rm -rf -- \
		"$(target_path /etc/postgrey)" \
		"$(target_path /etc/spamassassin)" \
		"$(target_path /etc/default/spamassassin)" \
		"$(target_path /etc/default/spampd)"
}

target_import() {
	local target_conf target_storage target_release target_nc_version target_storage_config result awk_script
	log "phase import: validating target data and removing legacy target-only state"
	# source_preflight sets SOURCE_STORAGE and target paths without modifying source.
	source_preflight
	target_conf=$(target_path /etc/s5mail.conf)
	target_storage=$(target_path "$SOURCE_STORAGE")
	if (( DRY_RUN )); then
		log "[dry-run] would validate target config, SQLite integrity, Nextcloud version, and retired state"
		target_cleanup_legacy_state "$target_storage"
		return
	fi
	STATE_FILE=${STATE_FILE:-$(source_path /var/lib/s5mail/side-by-side-migration.state)}
	[[ -f "$STATE_FILE" ]] || die "source final-sync marker is missing; run --phase final before import"
	grep -Fqx 'status=final-sync-complete-import-pending' "$STATE_FILE" \
		|| die "source migration marker is not ready for import: $STATE_FILE"
	target_file_exists "$(target_path "$TARGET_READY_MARKER")" \
		|| die "target provisioning is not reconciled with the final data; rerun setup/start.sh on the Debian target, then repeat --phase import"
	target_file_exists "$target_conf" || die "target configuration is missing: $target_conf"
	target_file_exists "$TARGET_USERS_DB" || die "target users database is missing: $TARGET_USERS_DB"
	target_file_exists "$TARGET_NEXTCLOUD_DB" || die "target Nextcloud database is missing: $TARGET_NEXTCLOUD_DB"
	awk_script="\$1==\"STORAGE_ROOT\" {sub(/^[^=]*=/, \"\", \$0); print \$0; exit}"
	target_storage_config=$(target_command awk -F= "$awk_script" "$target_conf" | sed -e "s/[\"']//g" -e 's/[[:space:]]//g')
	if [[ -n "$target_storage_config" && "$target_storage_config" != "${SOURCE_STORAGE#/}" && "$target_storage_config" != "$SOURCE_STORAGE" ]]; then
		die "target STORAGE_ROOT '$target_storage_config' does not match source '$SOURCE_STORAGE'"
	fi
	target_cleanup_legacy_state "$target_storage"
	result=$(target_command sqlite3 "$TARGET_USERS_DB" 'PRAGMA integrity_check;' | tr -d '\r')
	[[ "$result" == "ok" ]] || die "target users.sqlite integrity check failed: $result"
	result=$(target_command sqlite3 "$TARGET_NEXTCLOUD_DB" 'PRAGMA integrity_check;' | tr -d '\r')
	[[ "$result" == "ok" ]] || die "target owncloud.db integrity check failed: $result"
	target_nc_version=$(target_command sqlite3 "$TARGET_NEXTCLOUD_DB" "SELECT configvalue FROM oc_appconfig WHERE appid='core' AND configkey='version' LIMIT 1;" 2>/dev/null || true)
	if [[ -n "$target_nc_version" && "$target_nc_version" != "$EXPECTED_NEXTCLOUD_MAJOR."* ]]; then
		die "target Nextcloud version '$target_nc_version' is not Nextcloud 34"
	fi
	awk_script="\$1==\"S5MAIL_RELEASE\" {print \$2; exit}"
	target_release=$(target_command awk -F= "$awk_script" "$target_conf" | tr -d "'\"")
	if [[ -n "$target_release" && ! "$target_release" =~ $EXPECTED_RELEASE_RE ]]; then
		die "target S5MAIL_RELEASE '$target_release' is not 2026.08.x"
	fi
	for retired in \
		"$target_storage/mail/roundcube" "$target_storage/mail/spamassassin" "$target_storage/mail/postgrey" \
		"$(target_path /usr/local/lib/roundcubemail)" "$(target_path /var/lib/postgrey)"; do
		if target_command test -e "$retired"; then die "retired target state remains: $retired"; fi
	done
	remove_state
	log "target import validated; start Debian services only after the acceptance suite passes"
}

parse_args() {
	while (($#)); do
		case "$1" in
			--source-root) [[ $# -ge 2 ]] || die "$1 requires a value"; SOURCE_ROOT=$2; shift 2 ;;
			--target-root) [[ $# -ge 2 ]] || die "$1 requires a value"; TARGET_ROOT=$2; shift 2 ;;
			--target-host) [[ $# -ge 2 ]] || die "$1 requires a value"; TARGET_HOST=$2; shift 2 ;;
			--phase) [[ $# -ge 2 ]] || die "$1 requires a value"; PHASE=$2; shift 2 ;;
			--source-release) [[ $# -ge 2 ]] || die "$1 requires a value"; SOURCE_RELEASE=$2; shift 2 ;;
			--state-file) [[ $# -ge 2 ]] || die "$1 requires a value"; STATE_FILE=$2; shift 2 ;;
			--drain-timeout) [[ $# -ge 2 ]] || die "$1 requires a value"; DRAIN_TIMEOUT=$2; shift 2 ;;
			--dry-run) DRY_RUN=1; shift ;;
			-h|--help) usage; exit 0 ;;
			*) die "unknown option: $1" ;;
		esac
	done
	[[ -n "$TARGET_ROOT" ]] || die "--target-root is required"
	case "$PHASE" in preseed|final|import|all) ;; *) die "invalid --phase: $PHASE" ;; esac
	ensure_options
	if [[ "$PHASE" == final || "$PHASE" == all ]] && (( EUID != 0 )) && (( ! DRY_RUN )); then
		die "final sync must run as root so source services and SQLite writers can be quiesced"
	fi
	if [[ "$PHASE" == all ]] && (( ! DRY_RUN )); then
		die "--phase all is dry-run only; use preseed, final, target provisioning, and import as separate resumable steps"
	fi
	if [[ "$PHASE" == final || "$PHASE" == all ]] && [[ "$SOURCE_ROOT" != "/" ]] && (( ! DRY_RUN )); then
		die "final sync must run on the live source root (/); use --source-root only for preseed/import checks or --dry-run"
	fi
}

main() {
	parse_args "$@"
	if [[ "$PHASE" == preseed || "$PHASE" == all ]]; then preseed; fi
	if [[ "$PHASE" == final || "$PHASE" == all ]]; then final_sync; fi
	if [[ "$PHASE" == import || "$PHASE" == all ]]; then target_import; fi
	log "migration phase '$PHASE' finished"
}

main "$@"
