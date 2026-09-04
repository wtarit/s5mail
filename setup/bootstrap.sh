#!/bin/bash
#########################################################
# This script is intended to be run like this:
#
#   curl -fsSL https://raw.githubusercontent.com/wtarit/s5mail/v2026.08.2/setup/bootstrap.sh | sudo bash
#
#########################################################

if [ -r /etc/os-release ]; then
	. /etc/os-release
fi
if [ "${ID:-}" != "debian" ] || [ "${VERSION_ID:-}" != "13" ]; then
	echo "This S5 Mail release may be used only on Debian 13."
	exit 1
fi

if [ -z "$TAG" ]; then
	# If a version to install isn't explicitly given as an environment
	# variable, install the current S5 Mail Debian 13 release.
	#
	# Also, the system status checks read this script for TAG = (without the
	# space, but if we put it in a comment it would confuse the status checks!)
	# to get the latest version, so the first such line must be the one that we
	# want to display in status checks.
	#
	TAG=v2026.08.2
fi

# Are we running as root?
if [[ $EUID -ne 0 ]]; then
	echo "This script must be run as root. Did you leave out sudo?"
	exit 1
fi

# Use the S5 Mail checkout for new installations while continuing to recognize
# the legacy checkout location on upgraded systems.
if [ -d "$HOME/s5mail" ]; then
	REPO_DIR="$HOME/s5mail"
elif [ -d "$HOME/mailinabox" ]; then
	REPO_DIR="$HOME/mailinabox"
else
	REPO_DIR="$HOME/s5mail"
fi

if [ "$SOURCE" == "" ]; then
	SOURCE=https://github.com/wtarit/s5mail
fi

# Clone the S5 Mail repository if it doesn't exist.
if [ ! -d "$REPO_DIR" ]; then
	if [ ! -f /usr/bin/git ]; then
		echo "Installing git . . ."
		apt-get -q -q update
		DEBIAN_FRONTEND=noninteractive apt-get -q -q install -y git < /dev/null
		echo
	fi

	echo "Downloading S5 Mail $TAG. . ."
	git clone \
		-b "$TAG" --depth 1 \
		"$SOURCE" \
		"$REPO_DIR" \
		< /dev/null 2> /dev/null

	echo
else
	# Point known legacy checkouts at S5 Mail without overwriting custom remotes.
	CURRENT_SOURCE=$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)
	case "$CURRENT_SOURCE" in
		https://github.com/mail-in-a-box/mailinabox|https://github.com/mail-in-a-box/mailinabox.git|git@github.com:mail-in-a-box/mailinabox.git|https://github.com/wtarit/mailinabox|https://github.com/wtarit/mailinabox.git|git@github.com:wtarit/mailinabox.git)
			git -C "$REPO_DIR" remote set-url origin "$SOURCE"
			;;
	esac
fi

# Change directory to it.
cd "$REPO_DIR" || exit

# Update it.
if [ "$TAG" != "$(git describe --always)" ]; then
	echo "Updating S5 Mail to $TAG . . ."
	git fetch --depth 1 --force --prune origin tag "$TAG"
	if ! git checkout -q "$TAG"; then
		echo "Update failed. Did you modify something in $PWD?"
		exit 1
	fi
	echo
fi

# Start setup script.
setup/start.sh
