/**
 * GeoIP Lookup API Service
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 *
 * Provides REST API for MMDB lookups (DB-IP, MaxMind, IP2Location, IPinfo)
 * Designed to run as a lightweight container alongside PostgREST.
 */

import { createServer } from 'http'
import { open } from 'maxmind'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

const PORT = parseInt(process.env.GEOIP_PORT || '3001', 10)
const GEOIP_DIR = process.env.GEOIP_DIR || '/usr/share/GeoIP'

/* Database handles */
let cityDb = null
let asnDb = null
let dbInfo = { city: null, asn: null, provider: 'unknown' }

/**
 * Find and open MMDB databases
 */
async function initDatabases() {
  const cityPatterns = [
    'GeoLite2-City.mmdb',
    'GeoIP2-City.mmdb',
    'dbip-city-lite.mmdb',
    'dbip-city.mmdb',
    'IP2LOCATION-LITE-DB11.mmdb',
    'ipinfo-city.mmdb',
    'GeoLite2-Country.mmdb',  /* Fallback */
    'GeoIP2-Country.mmdb',
    'dbip-country-lite.mmdb',
  ]

  const asnPatterns = [
    'GeoLite2-ASN.mmdb',
    'GeoIP2-ISP.mmdb',
    'dbip-asn-lite.mmdb',
    'dbip-asn.mmdb',
    'ipinfo-asn.mmdb',
  ]

  /* List available files */
  let files = []
  try {
    files = await readdir(GEOIP_DIR)
  } catch (err) {
    console.error(`Cannot read GeoIP directory ${GEOIP_DIR}: ${err.message}`)
    return
  }

  /* Find city database */
  for (const pattern of cityPatterns) {
    if (files.includes(pattern)) {
      const path = join(GEOIP_DIR, pattern)
      try {
        cityDb = await open(path)
        const stats = await stat(path)
        dbInfo.city = {
          path,
          filename: pattern,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        }
        console.log(`Loaded city database: ${pattern}`)

        /* Detect provider from filename */
        if (pattern.startsWith('dbip')) {
          dbInfo.provider = 'dbip'
        } else if (pattern.startsWith('GeoLite2') || pattern.startsWith('GeoIP2')) {
          dbInfo.provider = 'maxmind'
        } else if (pattern.startsWith('IP2LOCATION')) {
          dbInfo.provider = 'ip2location'
        } else if (pattern.startsWith('ipinfo')) {
          dbInfo.provider = 'ipinfo'
        }
        break
      } catch (err) {
        console.error(`Failed to open ${pattern}: ${err.message}`)
      }
    }
  }

  /* Find ASN database */
  for (const pattern of asnPatterns) {
    if (files.includes(pattern)) {
      const path = join(GEOIP_DIR, pattern)
      try {
        asnDb = await open(path)
        const stats = await stat(path)
        dbInfo.asn = {
          path,
          filename: pattern,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        }
        console.log(`Loaded ASN database: ${pattern}`)
        break
      } catch (err) {
        console.error(`Failed to open ${pattern}: ${err.message}`)
      }
    }
  }

  if (!cityDb) {
    console.warn('No city/country database found - lookups will fail')
  }
}

/**
 * Perform GeoIP lookup
 */
function lookup(ip) {
  if (!cityDb) {
    return null
  }

  const result = {
    country_code: null,
    country_name: null,
    region_code: null,
    region_name: null,
    city: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    timezone: null,
    asn: null,
    as_org: null,
    provider: dbInfo.provider,
  }

  /* City/Country lookup */
  try {
    const cityResult = cityDb.get(ip)
    if (cityResult) {
      if (cityResult.country) {
        result.country_code = cityResult.country.iso_code || null
        result.country_name = cityResult.country.names?.en || null
      }
      if (cityResult.subdivisions && cityResult.subdivisions.length > 0) {
        result.region_code = cityResult.subdivisions[0].iso_code || null
        result.region_name = cityResult.subdivisions[0].names?.en || null
      }
      if (cityResult.city) {
        result.city = cityResult.city.names?.en || null
      }
      if (cityResult.postal) {
        result.postal_code = cityResult.postal.code || null
      }
      if (cityResult.location) {
        result.latitude = cityResult.location.latitude || null
        result.longitude = cityResult.location.longitude || null
        result.timezone = cityResult.location.time_zone || null
      }
    }
  } catch (err) {
    /* IP not found or invalid - leave fields null */
  }

  /* ASN lookup */
  if (asnDb) {
    try {
      const asnResult = asnDb.get(ip)
      if (asnResult) {
        result.asn = asnResult.autonomous_system_number || null
        result.as_org = asnResult.autonomous_system_organization || null
      }
    } catch (err) {
      /* ASN not found */
    }
  }

  return result
}

/**
 * Parse JSON body from request
 */
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Send JSON response
 */
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

/**
 * Request handler
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  /* CORS preflight */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  /* Health check */
  if (path === '/health' || path === '/') {
    return sendJson(res, 200, {
      status: 'ok',
      databases: {
        city: dbInfo.city ? true : false,
        asn: dbInfo.asn ? true : false,
      },
      provider: dbInfo.provider,
    })
  }

  /* Database info */
  if (path === '/info') {
    return sendJson(res, 200, dbInfo)
  }

  /* Single IP lookup: GET /lookup/:ip */
  const singleMatch = path.match(/^\/lookup\/([^/]+)$/)
  if (singleMatch && req.method === 'GET') {
    const ip = decodeURIComponent(singleMatch[1])
    const startTime = performance.now()
    const result = lookup(ip)
    const lookupTime = performance.now() - startTime

    if (!result) {
      return sendJson(res, 404, { error: 'Not found', ip })
    }

    return sendJson(res, 200, {
      ip,
      ...result,
      lookup_time_ms: lookupTime,
    })
  }

  /* Batch lookup: POST /lookup with { ips: [...] } */
  if (path === '/lookup' && req.method === 'POST') {
    try {
      const body = await parseBody(req)
      const ips = body.ips

      if (!Array.isArray(ips)) {
        return sendJson(res, 400, { error: 'ips must be an array' })
      }

      if (ips.length > 100) {
        return sendJson(res, 400, { error: 'Maximum 100 IPs per batch' })
      }

      const startTime = performance.now()
      const results = {}

      for (const ip of ips) {
        if (typeof ip === 'string') {
          results[ip] = lookup(ip)
        }
      }

      const lookupTime = performance.now() - startTime

      return sendJson(res, 200, {
        results,
        count: Object.keys(results).length,
        lookup_time_ms: lookupTime,
      })
    } catch (err) {
      return sendJson(res, 400, { error: err.message })
    }
  }

  /* Not found */
  sendJson(res, 404, { error: 'Not found' })
}

/**
 * Start server
 */
async function main() {
  console.log('Initializing GeoIP databases...')
  await initDatabases()

  const server = createServer(handleRequest)
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoIP API listening on port ${PORT}`)
    console.log(`Databases: city=${dbInfo.city?.filename || 'none'}, asn=${dbInfo.asn?.filename || 'none'}`)
  })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
