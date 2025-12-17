/**********************************************************************
 * Copyright (C) 2024-2025 unicornscan contributors                   *
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
#ifndef _SUPABASE_SETUP_H
#define _SUPABASE_SETUP_H

/*
 * Run the interactive Supabase setup wizard
 * Prompts user for URL and password, saves to config file
 * Returns: 0 on success, -1 on error
 */
int supabase_run_wizard(void);

/*
 * Load Supabase configuration from ~/.unicornscan/supabase.conf
 * Called during startup before CLI argument parsing
 * Returns: 0 on success or file not found, -1 on parse error
 */
int supabase_load_config(void);

/*
 * Get path to Supabase config file
 * Returns: statically allocated path string, or NULL on error
 */
const char *supabase_config_path(void);

#endif /* _SUPABASE_SETUP_H */
