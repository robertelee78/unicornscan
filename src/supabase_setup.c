/**********************************************************************
 * Copyright (C) 2025 Robert E. Lee <robert@unicornscan.org>          *
 *                                                                    *
 * This program is free software; you can redistribute it and/or      *
 * modify it under the terms of the GNU General Public License        *
 * as published by the Free Software Foundation; either               *
 * version 2 of the License, or (at your option) any later            *
 * version.                                                           *
 *                                                                    *
 * This program is distributed in the hope that it will be useful,    *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of     *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the      *
 * GNU General Public License for more details.                       *
 *                                                                    *
 * You should have received a copy of the GNU General Public License  *
 * along with this program; if not, write to the Free Software        *
 * Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.          *
 **********************************************************************/

/*
 * Supabase Setup Wizard
 *
 * Provides interactive configuration for Supabase cloud database integration.
 * Saves configuration to ~/.unicornscan/supabase.conf for automatic loading
 * on subsequent runs.
 */

#include <config.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <termios.h>
#include <pwd.h>

#include <settings.h>
#include <scan_progs/options.h>
#include <unilib/output.h>
#include <unilib/xmalloc.h>
#include <supabase_setup.h>

#define SUPABASE_CONFIG_DIR	".unicornscan"
#define SUPABASE_CONFIG_FILE	"supabase.conf"
#define MAX_INPUT_LEN		1024

/* Static buffer for config path */
static char config_path_buf[PATH_MAX];
static int config_path_valid = 0;

/*
 * Get the user's home directory
 */
static const char *get_home_dir(void) {
	const char *home = NULL;
	struct passwd *pw = NULL;

	/* Try $HOME first */
	home = getenv("HOME");
	if (home != NULL && strlen(home) > 0) {
		return home;
	}

	/* Fall back to passwd entry */
	pw = getpwuid(getuid());
	if (pw != NULL && pw->pw_dir != NULL) {
		return pw->pw_dir;
	}

	return NULL;
}

/*
 * Get path to Supabase config file
 */
const char *supabase_config_path(void) {
	const char *home = NULL;

	if (config_path_valid) {
		return config_path_buf;
	}

	home = get_home_dir();
	if (home == NULL) {
		ERR("Cannot determine home directory");
		return NULL;
	}

	snprintf(config_path_buf, sizeof(config_path_buf), "%s/%s/%s",
		home, SUPABASE_CONFIG_DIR, SUPABASE_CONFIG_FILE);
	config_path_valid = 1;

	return config_path_buf;
}

/*
 * Ensure config directory exists
 */
static int ensure_config_dir(void) {
	const char *home = NULL;
	char dir_path[PATH_MAX];
	struct stat st;

	home = get_home_dir();
	if (home == NULL) {
		return -1;
	}

	snprintf(dir_path, sizeof(dir_path), "%s/%s", home, SUPABASE_CONFIG_DIR);

	if (stat(dir_path, &st) == 0) {
		if (S_ISDIR(st.st_mode)) {
			return 0; /* Already exists */
		}
		ERR("%s exists but is not a directory", dir_path);
		return -1;
	}

	if (mkdir(dir_path, 0700) != 0) {
		ERR("Cannot create directory %s: %s", dir_path, strerror(errno));
		return -1;
	}

	return 0;
}

/*
 * Read a line from stdin with optional echo disabled (for passwords)
 */
static int read_input(const char *prompt, char *buf, size_t buflen, int hide_input) {
	struct termios oldt, newt;
	int tty_modified = 0;

	printf("%s", prompt);
	fflush(stdout);

	if (hide_input && isatty(STDIN_FILENO)) {
		if (tcgetattr(STDIN_FILENO, &oldt) == 0) {
			newt = oldt;
			newt.c_lflag &= ~ECHO;
			if (tcsetattr(STDIN_FILENO, TCSANOW, &newt) == 0) {
				tty_modified = 1;
			}
		}
	}

	if (fgets(buf, buflen, stdin) == NULL) {
		if (tty_modified) {
			tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
			printf("\n");
		}
		return -1;
	}

	if (tty_modified) {
		tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
		printf("\n");
	}

	/* Remove trailing newline */
	buf[strcspn(buf, "\r\n")] = '\0';

	return 0;
}

/*
 * Validate Supabase URL format
 */
static int validate_url(const char *url) {
	if (url == NULL || strlen(url) < 20) {
		return 0;
	}

	if (strncmp(url, "https://", 8) != 0) {
		return 0;
	}

	if (strstr(url, ".supabase.co") == NULL) {
		return 0;
	}

	return 1;
}

/*
 * Save configuration to file
 */
static int save_config(const char *url, const char *password, const char *region) {
	const char *path = NULL;
	FILE *fp = NULL;

	if (ensure_config_dir() != 0) {
		return -1;
	}

	path = supabase_config_path();
	if (path == NULL) {
		return -1;
	}

	fp = fopen(path, "w");
	if (fp == NULL) {
		ERR("Cannot create config file %s: %s", path, strerror(errno));
		return -1;
	}

	/* Set restrictive permissions before writing sensitive data */
	if (fchmod(fileno(fp), 0600) != 0) {
		ERR("Cannot set permissions on %s: %s", path, strerror(errno));
		fclose(fp);
		unlink(path);
		return -1;
	}

	fprintf(fp, "# Unicornscan Supabase Configuration\n");
	fprintf(fp, "# Generated by --supabase-setup wizard\n");
	fprintf(fp, "# This file is loaded automatically on startup\n");
	fprintf(fp, "#\n");
	fprintf(fp, "# WARNING: This file contains your database password.\n");
	fprintf(fp, "# Permissions are set to 0600 (owner read/write only).\n");
	fprintf(fp, "# Do not share this file or add it to version control.\n");
	fprintf(fp, "\n");
	fprintf(fp, "SUPABASE_URL=%s\n", url);
	fprintf(fp, "SUPABASE_DB_PASSWORD=%s\n", password);
	fprintf(fp, "SUPABASE_REGION=%s\n", region);

	fclose(fp);

	return 0;
}

/*
 * Run the interactive Supabase setup wizard
 */
int supabase_run_wizard(void) {
	char url[MAX_INPUT_LEN];
	char password[MAX_INPUT_LEN];
	char region[MAX_INPUT_LEN];
	char confirm[MAX_INPUT_LEN];
	const char *config_file = NULL;

	printf("\n");
	printf("╔══════════════════════════════════════════════════════════════════╗\n");
	printf("║         UNICORNSCAN SUPABASE SETUP WIZARD                        ║\n");
	printf("╚══════════════════════════════════════════════════════════════════╝\n");
	printf("\n");
	printf("This wizard will configure unicornscan to store scan results in\n");
	printf("your Supabase cloud PostgreSQL database.\n");
	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("BEFORE YOU BEGIN - What you'll need:\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("  1. A Supabase account (free at https://supabase.com)\n");
	printf("\n");
	printf("  2. Your Supabase PROJECT URL:\n");
	printf("     • Go to: https://supabase.com/dashboard\n");
	printf("     • Select your project (or create one)\n");
	printf("     • Go to: Project Settings → API\n");
	printf("     • Copy the 'Project URL' (looks like: https://xxxxx.supabase.co)\n");
	printf("\n");
	printf("  3. Your DATABASE PASSWORD:\n");
	printf("     • This is the password you set when you created the project\n");
	printf("     • If you forgot it: Project Settings → Database → Reset password\n");
	printf("     • NOTE: This is NOT your Supabase account password\n");
	printf("     • NOTE: This is NOT an API key\n");
	printf("\n");
	printf("  4. Your project's AWS REGION:\n");
	printf("     • Go to: Project Settings → General\n");
	printf("     • Look for 'Region' (e.g., West US (North California), East US (N. Virginia))\n");
	printf("     • Common regions: us-west-1, us-west-2, us-east-1, eu-west-1\n");
	printf("\n");
	printf("The database tables will be created automatically on your first scan.\n");
	printf("\n");
	printf("Press Enter to continue (or Ctrl+C to cancel)...\n");
	if (read_input("", confirm, sizeof(confirm), 0) != 0) {
		return -1;
	}

	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("STEP 1 OF 3: Enter your Supabase Project URL\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("Where to find it:\n");
	printf("  • Supabase Dashboard → Your Project → Settings → API\n");
	printf("  • Look for 'Project URL' (NOT the API URL)\n");
	printf("\n");
	printf("Format: https://xxxxx.supabase.co\n");
	printf("  (xxxxx is your unique project reference ID)\n");
	printf("\n");
	printf("Leave blank to cancel setup.\n");
	printf("\n");

	/* Get URL */
	while (1) {
		if (read_input("Project URL: ", url, sizeof(url), 0) != 0) {
			ERR("Failed to read input");
			return -1;
		}

		if (strlen(url) == 0) {
			printf("\nSetup cancelled.\n");
			return -1;
		}

		/* Trim whitespace */
		while (strlen(url) > 0 && (url[strlen(url)-1] == ' ' || url[strlen(url)-1] == '\t')) {
			url[strlen(url)-1] = '\0';
		}

		if (validate_url(url)) {
			printf("\n✓ URL looks valid!\n");
			break;
		}

		printf("\n");
		printf("✗ Invalid URL format.\n");
		printf("\n");
		printf("The URL should:\n");
		printf("  • Start with 'https://'\n");
		printf("  • End with '.supabase.co'\n");
		printf("  • Example: https://abcdef123456.supabase.co\n");
		printf("\n");
		printf("Please try again:\n");
	}

	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("STEP 2 OF 3: Enter your Project's AWS Region\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("Where to find it:\n");
	printf("  • Supabase Dashboard → Your Project → Settings → General\n");
	printf("  • Look for 'Region' in the project information\n");
	printf("\n");
	printf("The region is needed to connect via Supabase's IPv4 connection pooler.\n");
	printf("\n");
	printf("Common regions (use the AWS region code, not the display name):\n");
	printf("  • West US (North California)    -> us-west-1\n");
	printf("  • West US (Oregon)              -> us-west-2\n");
	printf("  • East US (N. Virginia)         -> us-east-1\n");
	printf("  • East US (Ohio)                -> us-east-2\n");
	printf("  • Europe (Ireland)              -> eu-west-1\n");
	printf("  • Europe (Frankfurt)            -> eu-central-1\n");
	printf("  • Asia Pacific (Singapore)      -> ap-southeast-1\n");
	printf("  • Asia Pacific (Tokyo)          -> ap-northeast-1\n");
	printf("  • Asia Pacific (Sydney)         -> ap-southeast-2\n");
	printf("  • South America (Sao Paulo)     -> sa-east-1\n");
	printf("\n");

	/* Get region */
	while (1) {
		if (read_input("AWS Region (e.g., us-west-2): ", region, sizeof(region), 0) != 0) {
			ERR("Failed to read input");
			return -1;
		}

		if (strlen(region) == 0) {
			printf("\nRegion cannot be empty. Please enter an AWS region.\n\n");
			continue;
		}

		/* Trim whitespace */
		while (strlen(region) > 0 && (region[strlen(region)-1] == ' ' || region[strlen(region)-1] == '\t')) {
			region[strlen(region)-1] = '\0';
		}

		/* Basic validation */
		if (strchr(region, '-') == NULL) {
			printf("\n");
			printf("✗ Invalid region format.\n");
			printf("  Region should look like: us-west-2, eu-west-1, etc.\n\n");
			continue;
		}

		printf("\n✓ Region looks valid!\n");
		break;
	}

	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("STEP 3 OF 3: Enter your Database Password\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("This is the password you chose when creating your Supabase project.\n");
	printf("\n");
	printf("If you've forgotten it:\n");
	printf("  • Go to: Project Settings → Database\n");
	printf("  • Click 'Reset database password'\n");
	printf("\n");
	printf("IMPORTANT: This is NOT:\n");
	printf("  • Your Supabase account/login password\n");
	printf("  • Your API key (anon or service_role)\n");
	printf("\n");
	printf("Your input will be hidden for security.\n");
	printf("\n");

	/* Get password */
	while (1) {
		if (read_input("Database password: ", password, sizeof(password), 1) != 0) {
			ERR("Failed to read input");
			return -1;
		}

		if (strlen(password) == 0) {
			printf("\nPassword cannot be empty. Please try again.\n\n");
			continue;
		}

		if (strlen(password) < 6) {
			printf("\nPassword seems very short (less than 6 characters).\n");
			printf("Supabase typically requires longer passwords.\n");
			if (read_input("Are you sure this is correct? (y/n): ", confirm, sizeof(confirm), 0) != 0 ||
			    (confirm[0] != 'y' && confirm[0] != 'Y')) {
				printf("\nLet's try again.\n\n");
				continue;
			}
		}

		/* Confirm password */
		if (read_input("Confirm password: ", confirm, sizeof(confirm), 1) != 0) {
			ERR("Failed to read input");
			return -1;
		}

		if (strcmp(password, confirm) == 0) {
			printf("\n✓ Passwords match!\n");
			break;
		}

		printf("\n✗ Passwords do not match. Please try again.\n\n");
	}

	/* Save configuration */
	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("Saving configuration...\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	if (save_config(url, password, region) != 0) {
		ERR("Failed to save configuration");
		/* Clear sensitive data */
		memset(password, 0, sizeof(password));
		memset(confirm, 0, sizeof(confirm));
		return -1;
	}

	config_file = supabase_config_path();

	printf("\n");
	printf("╔══════════════════════════════════════════════════════════════════╗\n");
	printf("║                    SETUP COMPLETE!                               ║\n");
	printf("╚══════════════════════════════════════════════════════════════════╝\n");
	printf("\n");
	printf("Configuration saved to:\n");
	printf("  %s\n", config_file);
	printf("\n");
	printf("The file has been secured (chmod 600 - only you can read it).\n");
	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("NEXT STEPS - Running your first scan with Supabase:\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("Run a scan with the PostgreSQL output module enabled:\n");
	printf("\n");
	printf("  unicornscan -e pgsql -I 192.168.1.0/24\n");
	printf("\n");
	printf("The -e pgsql flag enables database output.\n");
	printf("The database tables will be created automatically.\n");
	printf("\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("USEFUL COMMANDS:\n");
	printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	printf("\n");
	printf("View saved configuration:\n");
	printf("  cat %s\n", config_file);
	printf("\n");
	printf("Remove saved configuration:\n");
	printf("  rm %s\n", config_file);
	printf("\n");
	printf("Override settings for one scan:\n");
	printf("  unicornscan --supabase-url URL --supabase-db-password PASS ...\n");
	printf("\n");
	printf("Run setup again:\n");
	printf("  unicornscan --supabase-setup\n");
	printf("\n");

	/* Clear sensitive data */
	memset(password, 0, sizeof(password));
	memset(confirm, 0, sizeof(confirm));

	return 0;
}

/*
 * Parse a line from the config file
 * Format: KEY=VALUE (no spaces around =)
 */
static int parse_config_line(const char *line, char **key, char **value) {
	const char *eq = NULL;
	size_t key_len = 0;

	/* Skip leading whitespace */
	while (*line == ' ' || *line == '\t') {
		line++;
	}

	/* Skip empty lines and comments */
	if (*line == '\0' || *line == '#' || *line == '\n') {
		return 0; /* Skip line, not an error */
	}

	/* Find equals sign */
	eq = strchr(line, '=');
	if (eq == NULL) {
		return -1; /* Invalid format */
	}

	key_len = eq - line;
	if (key_len == 0) {
		return -1; /* Empty key */
	}

	*key = xmalloc(key_len + 1);
	strncpy(*key, line, key_len);
	(*key)[key_len] = '\0';

	/* Skip the '=' and get value */
	eq++;
	*value = xstrdup(eq);

	/* Remove trailing whitespace/newline from value */
	{
		size_t len = strlen(*value);
		while (len > 0 && ((*value)[len-1] == '\n' ||
		                    (*value)[len-1] == '\r' ||
		                    (*value)[len-1] == ' ' ||
		                    (*value)[len-1] == '\t')) {
			(*value)[--len] = '\0';
		}
	}

	return 1; /* Successfully parsed */
}

/*
 * Load Supabase configuration from ~/.unicornscan/supabase.conf
 */
int supabase_load_config(void) {
	const char *path = NULL;
	FILE *fp = NULL;
	char line[MAX_INPUT_LEN];
	char *key = NULL, *value = NULL;
	int result = 0;
	struct stat st;

	path = supabase_config_path();
	if (path == NULL) {
		return 0; /* Not an error - just no config */
	}

	/* Check if file exists */
	if (stat(path, &st) != 0) {
		return 0; /* File doesn't exist - not an error */
	}

	/* Warn if permissions are too open */
	if ((st.st_mode & 077) != 0) {
		VRB(0, "warning: %s has insecure permissions, should be 0600", path);
	}

	fp = fopen(path, "r");
	if (fp == NULL) {
		if (errno == ENOENT) {
			return 0; /* File doesn't exist - not an error */
		}
		ERR("Cannot open config file %s: %s", path, strerror(errno));
		return -1;
	}

	DBG(M_CNF, "Loading Supabase config from %s", path);

	while (fgets(line, sizeof(line), fp) != NULL) {
		result = parse_config_line(line, &key, &value);

		if (result < 0) {
			ERR("Invalid line in %s: %s", path, line);
			fclose(fp);
			return -1;
		}

		if (result == 0) {
			continue; /* Skip empty/comment lines */
		}

		/* Apply configuration - only if not already set */
		if (strcmp(key, "SUPABASE_URL") == 0) {
			if (s->supabase_url == NULL) {
				if (scan_setsupabaseurl(value) < 0) {
					ERR("Invalid SUPABASE_URL in %s: %s", path, value);
				} else {
					DBG(M_CNF, "Loaded SUPABASE_URL from config");
				}
			}
		}
		else if (strcmp(key, "SUPABASE_KEY") == 0) {
			if (s->supabase_key == NULL) {
				if (scan_setsupabasekey(value) < 0) {
					ERR("Invalid SUPABASE_KEY in %s: %s", path, value);
				} else {
					DBG(M_CNF, "Loaded SUPABASE_KEY from config");
				}
			}
		}
		else if (strcmp(key, "SUPABASE_DB_PASSWORD") == 0) {
			if (s->supabase_db_password == NULL) {
				if (scan_setsupabasedbpassword(value) < 0) {
					ERR("Invalid SUPABASE_DB_PASSWORD in config");
				} else {
					DBG(M_CNF, "Loaded SUPABASE_DB_PASSWORD from config");
				}
			}
		}
		else if (strcmp(key, "SUPABASE_REGION") == 0) {
			if (s->supabase_region == NULL) {
				if (scan_setsupabaseregion(value) < 0) {
					ERR("Invalid SUPABASE_REGION in %s: %s", path, value);
				} else {
					DBG(M_CNF, "Loaded SUPABASE_REGION from config");
				}
			}
		}
		/* Unknown keys are silently ignored for forward compatibility */

		xfree(key);
		xfree(value);
		key = value = NULL;
	}

	fclose(fp);
	return 0;
}
