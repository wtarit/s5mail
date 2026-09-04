#!/bin/bash
# Are we running as root?
if [[ $EUID -ne 0 ]]; then
	echo "This script must be run as root. Please re-run like this:"
	echo
	echo "sudo $0"
	echo
	exit 1
fi

# Check that we are running on Debian 13. Pull in the variables in a
# subshell so the installer does not retain unrelated os-release variables.
OS_RELEASE_ID=""
OS_RELEASE_VERSION_ID=""
if [ -r /etc/os-release ]; then
	read -r OS_RELEASE_ID OS_RELEASE_VERSION_ID < <(
		. /etc/os-release
		printf '%s %s\n' "${ID:-}" "${VERSION_ID:-}"
	)
fi
if [ "$OS_RELEASE_ID" != "debian" ] || [ "$OS_RELEASE_VERSION_ID" != "13" ]; then
	echo "S5 Mail only supports being installed on Debian 13, sorry. You are running:"
	echo
	echo "${OS_RELEASE_ID:-"Unknown linux distribution"} ${OS_RELEASE_VERSION_ID:-}"
	echo
	echo "We can't write scripts that run on every possible setup, sorry."
	exit 1
fi

# Check that we have enough memory.
#
# /proc/meminfo reports total memory in kibibytes. Debian 13's supported small
# profile requires one GB of RAM; setup/system.sh adds a one GB swapfile when
# appropriate.
#
# Skip the check if we appear to be running inside of Vagrant, because that's really just for testing.
TOTAL_PHYSICAL_MEM=$(head -n 1 /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_PHYSICAL_MEM" -lt 950000 ] && [ ! -d /vagrant ]; then
	TOTAL_PHYSICAL_MEM_MB=$(( TOTAL_PHYSICAL_MEM / 1024 ))
	echo "Your S5 Mail needs at least 1 GB of memory (RAM) to function properly."
	echo "This machine has ${TOTAL_PHYSICAL_MEM_MB} MiB memory."
	exit 1
fi

# Check that tempfs is mounted with exec
MOUNTED_TMP_AS_NO_EXEC=$(grep "/tmp.*noexec" /proc/mounts || /bin/true)
if [ -n "$MOUNTED_TMP_AS_NO_EXEC" ]; then
	echo "S5 Mail has to have exec rights on /tmp, please mount /tmp with exec"
	exit
fi

# Check that no .wgetrc exists
if [ -e ~/.wgetrc ]; then
	echo "S5 Mail expects no overrides to wget defaults, ~/.wgetrc exists"
	exit
fi

# Check that we are running on the supported x86_64 architecture.
ARCHITECTURE=$(uname -m)
if [ "$ARCHITECTURE" != "x86_64" ]; then
	echo "S5 Mail requires the x86_64 architecture. You are running $ARCHITECTURE." >&2
	exit 1
fi
