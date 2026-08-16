#!/bin/bash
# If there aren't any mail users yet, create one.
MAIL_USERS=$(management/cli.py user)
if [ -z "$MAIL_USERS" ]; then
	# The output of "management/cli.py user" is a list of mail users. If there
	# aren't any yet, it'll be empty.

	# If we didn't ask for an email address at the start, do so now.
	if [ -z "${EMAIL_ADDR:-}" ]; then
		# In an interactive shell, ask the user for an email address.
		if [ -z "${NONINTERACTIVE:-}" ]; then
			input_box "Mail Account" \
				"Let's create your first mail account.
				\n\nWhat email address do you want?" \
				"me@$(get_default_hostname)" \
				EMAIL_ADDR

			if [ -z "$EMAIL_ADDR" ]; then
				# user hit ESC/cancel
				exit
			fi
			while ! management/mailconfig.py validate-email "$EMAIL_ADDR"
			do
				input_box "Mail Account" \
					"That's not a valid email address.
					\n\nWhat email address do you want?" \
					"$EMAIL_ADDR" \
					EMAIL_ADDR
				if [ -z "$EMAIL_ADDR" ]; then
					# user hit ESC/cancel
					exit
				fi
			done

		# But in a non-interactive shell, just make something up.
		# This is normally for testing.
		else
			# Use me@PRIMARY_HOSTNAME
			EMAIL_ADDR=me@$PRIMARY_HOSTNAME
			EMAIL_PW=12345678
			echo
			echo "Creating a new administrative mail account for $EMAIL_ADDR with password $EMAIL_PW."
			echo
		fi
	else
		echo
		echo "Okay. I'm about to set up $EMAIL_ADDR for you. This account will also"
		echo "have access to the box's control panel."
	fi

	# Create the user's mail account. This will ask for a password if none was given above.
	management/cli.py user add "$EMAIL_ADDR" ${EMAIL_PW:+"$EMAIL_PW"}

	MAIL_USERS=$(management/cli.py user)
fi

# Account creation commits before DNS and nginx regeneration. If a later setup
# action failed, a rerun sees the user but must still finish the privilege and
# required-alias steps instead of treating first-user setup as complete.
MAIL_ADMINS=$(management/cli.py user admins)
if [ -z "$MAIL_ADMINS" ]; then
	if [ -z "${EMAIL_ADDR:-}" ]; then
		EMAIL_ADDR=$(printf '%s\n' "$MAIL_USERS" | sed -n '1{s/\*$//;p;}')
	fi
	if [ -z "$EMAIL_ADDR" ]; then
		echo "Unable to select a mail user for initial administrator access." >&2
		exit 1
	fi
	hide_output management/cli.py user make-admin "$EMAIL_ADDR"
	MAIL_ADMINS=$(management/cli.py user admins)
fi

# Create the required administrative alias if an interrupted setup did not
# reach this step. Preserve an existing operator-selected destination.
ADMIN_ALIAS="administrator@$PRIMARY_HOSTNAME"
if [ -z "$(sqlite3 "$STORAGE_ROOT/mail/users.sqlite" "SELECT 1 FROM aliases WHERE source='$ADMIN_ALIAS' LIMIT 1;")" ]; then
	ADMIN_DESTINATION=$(printf '%s\n' "$MAIL_ADMINS" | sed -n '1p')
	management/cli.py alias add "$ADMIN_ALIAS" "$ADMIN_DESTINATION" > /dev/null
fi
