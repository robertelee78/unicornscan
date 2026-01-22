#!/usr/bin/env npx tsx
/**
 * Alicorn Setup Wizard
 * Interactive CLI for configuring database connection and starting the frontend
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { PostgrestClient } from '@supabase/postgrest-js'
import { spawn } from 'child_process'
import { resolve } from 'path'

// =============================================================================
// Types
// =============================================================================

type DatabaseBackend = 'postgrest' | 'demo'

interface DatabaseConfig {
  backend: DatabaseBackend
  postgrestUrl?: string
}

// =============================================================================
// Constants
// =============================================================================

const ENV_PATH = resolve(process.cwd(), '.env')

const REQUIRED_TABLES = [
  'uni_scan',
  'uni_ipreport',
  'uni_hosts',
]

const OPTIONAL_TABLES = [
  'uni_arpreport',
  'uni_hops',
  'uni_notes',
  'uni_scan_tags',
  'uni_saved_filters',
  'uni_geoip',
]

// =============================================================================
// Helpers
// =============================================================================

function printBanner(): void {
  console.log()
  console.log(chalk.cyan('  ╔═══════════════════════════════════════════════════════════╗'))
  console.log(chalk.cyan('  ║') + chalk.bold.white('           Alicorn Setup Wizard                        ') + chalk.cyan('║'))
  console.log(chalk.cyan('  ║') + chalk.gray('           Unicornscan Web Frontend                      ') + chalk.cyan('║'))
  console.log(chalk.cyan('  ╚═══════════════════════════════════════════════════════════╝'))
  console.log()
}

function printSteps(): void {
  console.log(chalk.bold('  This wizard will guide you through:'))
  console.log()
  console.log(chalk.gray('  1.') + ' Choose your database backend')
  console.log(chalk.gray('  2.') + ' Enter connection details')
  console.log(chalk.gray('  3.') + ' Verify the connection works')
  console.log(chalk.gray('  4.') + ' Check database schema')
  console.log(chalk.gray('  5.') + ' Save configuration')
  console.log(chalk.gray('  6.') + ' Start the frontend (optional)')
  console.log()
}

function printDivider(): void {
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────'))
}

function envFileExists(): boolean {
  return existsSync(ENV_PATH)
}

function getCurrentBackend(): string | null {
  if (!envFileExists()) return null
  try {
    const content = readFileSync(ENV_PATH, 'utf-8')
    const match = content.match(/VITE_DB_BACKEND=(\w+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// =============================================================================
// Database Connection Testing
// =============================================================================

async function testPostgrestConnection(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new PostgrestClient(url)
    const { error } = await client.from('uni_scan').select('scan_id', { head: true, count: 'exact' })

    if (error) {
      // PGRST116 = no rows, which is fine (table exists but empty)
      // 42P01 = table doesn't exist
      if (error.code === 'PGRST116') {
        return { success: true }
      }
      if (error.code === '42P01') {
        return { success: false, error: 'Table uni_scan not found. Schema may not be initialized.' }
      }
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      return { success: false, error: 'Could not connect to PostgREST. Check the URL and ensure the service is running.' }
    }
    return { success: false, error: message }
  }
}

async function checkSchema(config: DatabaseConfig): Promise<{ found: string[]; missing: string[]; optional: string[] }> {
  const found: string[] = []
  const missing: string[] = []
  const optionalMissing: string[] = []

  let client: PostgrestClient | null = null
  if (config.backend === 'postgrest' && config.postgrestUrl) {
    client = new PostgrestClient(config.postgrestUrl)
  } else {
    return { found: [], missing: REQUIRED_TABLES, optional: OPTIONAL_TABLES }
  }

  // Check required tables
  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await client.from(table).select('*', { head: true, count: 'exact' })
      if (error && error.code === '42P01') {
        missing.push(table)
      } else {
        found.push(table)
      }
    } catch {
      missing.push(table)
    }
  }

  // Check optional tables
  for (const table of OPTIONAL_TABLES) {
    try {
      const { error } = await client.from(table).select('*', { head: true, count: 'exact' })
      if (error && error.code === '42P01') {
        optionalMissing.push(table)
      } else {
        found.push(table)
      }
    } catch {
      optionalMissing.push(table)
    }
  }

  return { found, missing, optional: optionalMissing }
}

// =============================================================================
// Configuration File Generation
// =============================================================================

function generateEnvContent(config: DatabaseConfig): string {
  const lines: string[] = [
    '# Alicorn Web UI Configuration',
    '# Generated by setup wizard',
    `# ${new Date().toISOString()}`,
    '',
    '# =============================================================================',
    '# Database Backend',
    '# =============================================================================',
    '',
    `VITE_DB_BACKEND=${config.backend}`,
    '',
  ]

  if (config.backend === 'postgrest') {
    lines.push(
      '# =============================================================================',
      '# PostgREST Configuration',
      '# =============================================================================',
      '',
      `VITE_POSTGREST_URL=${config.postgrestUrl}`,
      '',
    )
  }

  lines.push(
    '# =============================================================================',
    '# App Settings',
    '# =============================================================================',
    '',
    'VITE_APP_TITLE=Alicorn',
    'VITE_DEBUG=false',
    '',
  )

  return lines.join('\n')
}

function saveConfig(config: DatabaseConfig): void {
  const content = generateEnvContent(config)
  writeFileSync(ENV_PATH, content, 'utf-8')
}

// =============================================================================
// Docker Management
// =============================================================================

function dockerComposeExists(): boolean {
  return existsSync(resolve(process.cwd(), 'docker-compose.yml'))
}

function startDocker(): boolean {
  try {
    console.log()
    console.log(chalk.cyan('  Starting Docker containers...'))
    console.log()

    // Use spawn to show output in real-time
    const child = spawn('docker', ['compose', 'up', '-d', '--build'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    child.on('error', () => {
      console.log(chalk.red('  Failed to start Docker. Is Docker installed and running?'))
    })

    return true
  } catch {
    return false
  }
}

function startDevServer(): void {
  console.log()
  console.log(chalk.cyan('  Starting development server...'))
  console.log()

  const child = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
  })

  child.on('error', (err) => {
    console.log(chalk.red(`  Failed to start dev server: ${err.message}`))
  })
}

// =============================================================================
// Wizard Steps
// =============================================================================

async function promptReconfigure(): Promise<boolean> {
  const currentBackend = getCurrentBackend()

  console.log(chalk.yellow(`  Existing configuration found: ${chalk.bold(currentBackend || 'unknown')}`))
  console.log()

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'Reconfigure (start fresh)', value: 'reconfigure' },
      { title: 'Keep existing and exit', value: 'exit' },
    ],
  })

  return action === 'reconfigure'
}

async function promptBackend(): Promise<DatabaseBackend | null> {
  console.log()
  console.log(chalk.bold('  Step 1: Choose Database Backend'))
  console.log()
  console.log(chalk.gray('  Your unicornscan scan data is stored in PostgreSQL.'))
  console.log(chalk.gray('  Choose how Alicorn will connect to it:'))
  console.log()

  const { backend } = await prompts({
    type: 'select',
    name: 'backend',
    message: 'Database backend',
    choices: [
      {
        title: 'PostgREST',
        description: 'PostgREST REST API pointed at PostgreSQL (recommended)',
        value: 'postgrest',
      },
      {
        title: 'Demo Mode',
        description: 'Mock data for testing (no database)',
        value: 'demo',
      },
    ],
  })

  if (!backend) return null
  return backend as DatabaseBackend
}

async function promptPostgrestDetails(): Promise<{ url: string } | null> {
  console.log()
  console.log(chalk.bold('  Step 2: PostgREST Connection Details'))
  console.log()
  console.log(chalk.gray('  Enter the URL where PostgREST is running.'))
  console.log(chalk.gray('  Default port is 3000.'))
  console.log()

  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    const { url } = await prompts({
      type: 'text',
      name: 'url',
      message: 'PostgREST URL',
      initial: 'http://localhost:31338',
      validate: (value) => {
        if (!value) return 'URL is required'
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return 'URL must start with http:// or https://'
        }
        return true
      },
    })

    if (!url) return null

    // Test connection
    console.log()
    const spinner = ora('  Testing connection...').start()

    const result = await testPostgrestConnection(url)

    if (result.success) {
      spinner.succeed(chalk.green('  Connection successful!'))
      return { url }
    } else {
      spinner.fail(chalk.red(`  Connection failed: ${result.error}`))
      attempts++

      if (attempts < maxAttempts) {
        console.log()
        const { retry } = await prompts({
          type: 'confirm',
          name: 'retry',
          message: `Try again? (${maxAttempts - attempts} attempts remaining)`,
          initial: true,
        })

        if (!retry) return null
        console.log()
      } else {
        console.log(chalk.red(`  Maximum attempts (${maxAttempts}) reached.`))
        return null
      }
    }
  }

  return null
}

async function runSchemaCheck(config: DatabaseConfig): Promise<boolean> {
  if (config.backend === 'demo') {
    return true
  }

  console.log()
  console.log(chalk.bold('  Step 4: Schema Check'))
  console.log()

  const spinner = ora('  Checking database schema...').start()
  const { found, missing, optional } = await checkSchema(config)
  spinner.stop()

  if (found.length > 0) {
    console.log(chalk.green(`  ✓ Found ${found.length} tables`))
  }

  if (missing.length > 0) {
    console.log(chalk.red(`  ✗ Missing ${missing.length} required tables:`))
    for (const table of missing) {
      console.log(chalk.red(`      - ${table}`))
    }
    console.log()
    console.log(chalk.yellow('  The database schema needs to be initialized.'))
    console.log(chalk.yellow('  Run unicornscan with --setup-db or apply the SQL schema manually.'))
    console.log()

    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Continue anyway? (you can run scans to create tables)',
      initial: true,
    })

    return proceed
  }

  if (optional.length > 0) {
    console.log(chalk.yellow(`  ⚠ ${optional.length} optional tables not found (will be created as needed)`))
  }

  console.log(chalk.green('  ✓ Schema looks good!'))
  return true
}

async function promptStartServer(): Promise<'docker' | 'dev' | 'none'> {
  console.log()
  console.log(chalk.bold('  Step 6: Start Frontend'))
  console.log()

  const choices = [
    { title: 'Start development server (npm run dev)', value: 'dev' },
    { title: 'Exit (I\'ll start it myself)', value: 'none' },
  ]

  if (dockerComposeExists()) {
    choices.unshift({ title: 'Start with Docker (docker compose up)', value: 'docker' })
  }

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'How would you like to start Alicorn?',
    choices,
  })

  return action || 'none'
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  printBanner()

  // Check for existing config
  if (envFileExists()) {
    const shouldReconfigure = await promptReconfigure()
    if (!shouldReconfigure) {
      console.log()
      console.log(chalk.gray('  Exiting. Your existing configuration was not changed.'))
      console.log()
      process.exit(0)
    }
    console.log()
  }

  printDivider()
  printSteps()
  printDivider()

  // Step 1: Choose backend
  const backend = await promptBackend()
  if (!backend) {
    console.log(chalk.gray('\n  Setup cancelled.\n'))
    process.exit(0)
  }

  const config: DatabaseConfig = { backend }

  // Step 2 & 3: Get connection details with verification
  if (backend === 'postgrest') {
    const details = await promptPostgrestDetails()
    if (!details) {
      console.log(chalk.gray('\n  Setup cancelled.\n'))
      process.exit(1)
    }
    config.postgrestUrl = details.url
  } else {
    // Demo mode - no connection details needed
    console.log()
    console.log(chalk.cyan('  Demo mode selected - using mock data.'))
  }

  // Step 4: Schema check
  const schemaOk = await runSchemaCheck(config)
  if (!schemaOk) {
    console.log(chalk.gray('\n  Setup cancelled.\n'))
    process.exit(1)
  }

  // Step 5: Save configuration
  console.log()
  console.log(chalk.bold('  Step 5: Save Configuration'))
  console.log()

  const spinner = ora('  Writing .env file...').start()
  try {
    saveConfig(config)
    spinner.succeed(chalk.green('  Configuration saved to .env'))
  } catch (err) {
    spinner.fail(chalk.red(`  Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`))
    process.exit(1)
  }

  // Step 6: Start server
  const startAction = await promptStartServer()

  printDivider()
  console.log()

  if (startAction === 'docker') {
    startDocker()
  } else if (startAction === 'dev') {
    console.log(chalk.green.bold('  Setup complete!'))
    console.log()
    console.log(chalk.gray('  The development server will start shortly.'))
    console.log(chalk.gray('  Press Ctrl+C to stop it.'))
    console.log()
    startDevServer()
  } else {
    console.log(chalk.green.bold('  Setup complete!'))
    console.log()
    console.log(chalk.gray('  To start Alicorn, run one of:'))
    console.log()
    console.log(chalk.cyan('    npm run dev          ') + chalk.gray('# Development server'))
    console.log(chalk.cyan('    npm run build        ') + chalk.gray('# Production build'))
    if (dockerComposeExists()) {
      console.log(chalk.cyan('    docker compose up    ') + chalk.gray('# Docker container'))
    }
    console.log()
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.gray('\n\n  Setup cancelled.\n'))
  process.exit(0)
})

main().catch((err) => {
  console.error(chalk.red(`\n  Error: ${err.message}\n`))
  process.exit(1)
})
