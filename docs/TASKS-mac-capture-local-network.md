# Task Checklist: MAC Address Capture for Local Network IP Scans

**PRD:** `docs/PRD-mac-capture-local-network.md`
**Schema Version:** v9
**Status:** Planning

---

## Phase 1: Core Infrastructure [Priority: Critical]

### Task 1.1: Modify ip_report_t Structure
- **File:** `src/scan_progs/scan_export.h`
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** Add `eth_hwaddr[6]` and `eth_hwaddr_valid` fields to `ip_report_t`
- **Dependencies:** None
- **Notes:** Structure is `_PACKED_` - verify alignment

### Task 1.2: Save Ethernet MAC Before Skip
- **File:** `src/scan_progs/packet_parse.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** In `packet_parse()`, save `ether_shost` before `packet += header_len`
- **Dependencies:** Task 1.1
- **Key Lines:** 290-296

### Task 1.3: Add is_local_target() Function
- **File:** `src/scan_progs/packet_parse.c` or `src/unilib/route.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Create function that calls `getroutes()` and returns true if `gw == NULL`
- **Dependencies:** None
- **Reference:** `workunits.c:257-278` for existing usage pattern

### Task 1.4: Modify decode_ip() to Populate MAC
- **File:** `src/scan_progs/packet_parse.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Pass saved MAC to `decode_ip()`, call `is_local_target()`, populate `r_u.i.eth_hwaddr`
- **Dependencies:** Tasks 1.1, 1.2, 1.3

### Task 1.5: Update IPC Protocol (if needed)
- **Files:** `src/scan_progs/report.c`, `src/unilib/xipc.c`
- **Status:** [ ] Todo
- **Estimate:** 2 hours
- **Description:** Ensure IPC handles new `ip_report_t` size
- **Dependencies:** Task 1.1
- **Notes:** May need version negotiation

---

## Phase 2: Database Storage [Priority: Critical]

### Task 2.1: Add eth_hwaddr Column to uni_ipreports
- **File:** `src/output_modules/database/sql/pgsql_schema.sql`
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** Add `eth_hwaddr macaddr` column (nullable)
- **Dependencies:** None

### Task 2.2: Update Schema Version to v9
- **File:** `src/output_modules/database/pgsql_schema_embedded.h`
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** Update `PGSQL_SCHEMA_VERSION` to 9, add migration DDL
- **Dependencies:** Task 2.1

### Task 2.3: Store MAC in pgsql_dealwith_ipreport()
- **File:** `src/output_modules/database/pgsqldb.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Format and store `eth_hwaddr` when `eth_hwaddr_valid == 1`
- **Dependencies:** Tasks 1.1, 2.1

### Task 2.4: Call pgsql_record_mac_ip() for IP Reports
- **File:** `src/output_modules/database/pgsqldb.c`
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** When storing IP report with valid MAC, also record in `uni_mac_ip_history`
- **Dependencies:** Tasks 2.3
- **Reference:** Existing call in `pgsql_dealwith_arpreport()`

### Task 2.5: Add v9 Migration Function
- **File:** `src/output_modules/database/pgsqldb.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Add migration in `pgsql_migrate_schema()` for v8→v9
- **Dependencies:** Task 2.2

---

## Phase 3: Output & Display [Priority: Medium]

### Task 3.1: Add %M Format Specifier for IP Reports
- **File:** `src/scan_progs/report.c`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Add `%M` to display MAC in `ip_report_fmt` when available
- **Dependencies:** Task 1.1
- **Reference:** Existing `%M` in ARP format

### Task 3.2: Update strreport() Output
- **File:** `src/scan_progs/report.c`
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** Include MAC in structured report output
- **Dependencies:** Task 3.1

### Task 3.3: Update XML Output Module
- **File:** `src/output_modules/xml/xml.c` (if exists)
- **Status:** [ ] Todo
- **Estimate:** 30 min
- **Description:** Include MAC in XML output
- **Dependencies:** Task 1.1

---

## Phase 4: Frontend [Priority: Medium]

### Task 4.1: Update IpReport TypeScript Type
- **File:** `alicorn/src/types/database.ts`
- **Status:** [ ] Todo
- **Estimate:** 15 min
- **Description:** Add `eth_hwaddr?: string` to `IpReport` interface
- **Dependencies:** Task 2.1

### Task 4.2: Display MAC in Scan Results
- **File:** `alicorn/src/features/scans/`
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Show MAC column in IP reports table when available
- **Dependencies:** Task 4.1

### Task 4.3: Add User Column Configuration
- **Files:** `alicorn/src/features/*/` (various components)
- **Status:** [ ] Todo
- **Estimate:** 4 hours
- **Description:** User-configurable column sorting, hiding, rearranging
- **Dependencies:** None (separate feature)
- **Notes:** Applies to hosts view, scans view, etc.

---

## Phase 5: Testing [Priority: Critical]

### Task 5.1: Unit Test is_local_target()
- **File:** `src/scan_progs/tests/test_local_target.c` (new)
- **Status:** [ ] Todo
- **Estimate:** 2 hours
- **Description:** Test with local IPs, remote IPs, edge cases
- **Dependencies:** Task 1.3

### Task 5.2: Integration Test - Local Network Scan
- **Status:** [ ] Todo
- **Estimate:** 2 hours
- **Description:** Run TCP scan against local host, verify MAC captured
- **Dependencies:** All Phase 1 & 2 tasks

### Task 5.3: Integration Test - Remote Scan
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Run scan against remote host, verify MAC NOT captured
- **Dependencies:** All Phase 1 & 2 tasks

### Task 5.4: Verify ARP Mode Unchanged
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Run `-mA` scan, verify existing behavior unchanged
- **Dependencies:** All Phase 1 & 2 tasks

### Task 5.5: Test Schema Migration v8→v9
- **Status:** [ ] Todo
- **Estimate:** 1 hour
- **Description:** Create v8 database, run migration, verify v9 schema
- **Dependencies:** Task 2.5

---

## Summary

| Phase | Tasks | Est. Hours | Priority |
|-------|-------|------------|----------|
| 1. Core | 5 | 5.5 | Critical |
| 2. Database | 5 | 3.5 | Critical |
| 3. Output | 3 | 2 | Medium |
| 4. Frontend | 3 | 5.25 | Medium |
| 5. Testing | 5 | 7 | Critical |
| **Total** | **21** | **~23 hours** | |

---

## Notes

### Link Type Check
Only extract MAC when `s->ss->header_len == 14` (Ethernet DLT_EN10MB)

### Performance Consideration
Consider caching `is_local_target()` results per target IP to avoid repeated route lookups.

### Backward Compatibility
- `ip_report_t` size change affects IPC
- New DB column is nullable for backward compat
- `eth_hwaddr_valid` flag indicates whether MAC is present

### What NOT to Change
- ARP mode behavior (MAC comes from ARP payload, not Ethernet header)
- MAC<->IP history function `fn_record_mac_ip()` works as-is
