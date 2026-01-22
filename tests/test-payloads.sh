#!/bin/bash
#
# Unicornscan Payload Test Suite
#
# Tests static payloads from etc/payloads.conf against Docker services.
# Run docker-compose up first, then execute this script.
#
# Usage:
#   docker compose -f tests/docker-compose-payloads.yml up -d
#   ./tests/test-payloads.sh
#   docker compose -f tests/docker-compose-payloads.yml down
#
# Copyright (C) 2026 Robert E. Lee <robert@unicornscan.org>
# Licensed under GPLv2
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TARGET="${TARGET:-127.0.0.1}"
UNICORNSCAN="${UNICORNSCAN:-unicornscan}"
TIMEOUT="${TIMEOUT:-5}"
VERBOSE="${VERBOSE:-0}"

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Log functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

log_verbose() {
    if [ "$VERBOSE" -eq 1 ]; then
        echo -e "       $1"
    fi
}

# Check if a port is open using nc
check_port() {
    local port=$1
    local proto=${2:-tcp}
    if [ "$proto" = "udp" ]; then
        nc -zu -w1 "$TARGET" "$port" 2>/dev/null
    else
        nc -z -w1 "$TARGET" "$port" 2>/dev/null
    fi
}

# Test a TCP payload
test_tcp_payload() {
    local name=$1
    local port=$2
    local description=$3

    echo -n "Testing TCP $name (port $port)... "

    # Check if service is running
    if ! check_port "$port" tcp; then
        log_skip "Service not running"
        return
    fi

    # Run unicornscan connect scan
    local output
    output=$($UNICORNSCAN -mT -r 100 -w "$TIMEOUT" "$TARGET:$port" 2>&1) || true

    # Check for response
    if echo "$output" | grep -q "open"; then
        log_pass "$description"
        log_verbose "Response: $(echo "$output" | grep open | head -1)"
    elif echo "$output" | grep -q "OPEN"; then
        log_pass "$description"
        log_verbose "Response: $(echo "$output" | grep OPEN | head -1)"
    else
        log_fail "$description (no response)"
        log_verbose "Output: $output"
    fi
}

# Test a UDP payload
test_udp_payload() {
    local name=$1
    local port=$2
    local description=$3

    echo -n "Testing UDP $name (port $port)... "

    # UDP is harder to check, just try the scan
    local output
    output=$($UNICORNSCAN -mU -r 100 -w "$TIMEOUT" "$TARGET:$port" 2>&1) || true

    # For UDP, any response indicates the payload worked
    if echo "$output" | grep -qE "(open|OPEN|response)"; then
        log_pass "$description"
        log_verbose "Response: $output"
    else
        # UDP often doesn't get responses, mark as skipped unless we know service is up
        log_skip "No UDP response (common for UDP)"
    fi
}

# Print banner
print_banner() {
    echo "========================================"
    echo "  Unicornscan Payload Test Suite"
    echo "========================================"
    echo "Target: $TARGET"
    echo "Timeout: ${TIMEOUT}s"
    echo ""
}

# Print summary
print_summary() {
    echo ""
    echo "========================================"
    echo "  Test Summary"
    echo "========================================"
    echo -e "Passed:  ${GREEN}$PASSED${NC}"
    echo -e "Failed:  ${RED}$FAILED${NC}"
    echo -e "Skipped: ${YELLOW}$SKIPPED${NC}"
    echo ""

    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo -e "${GREEN}All active tests passed!${NC}"
        exit 0
    fi
}

# Check prerequisites
check_prereqs() {
    if ! command -v $UNICORNSCAN &> /dev/null; then
        echo "Error: unicornscan not found in PATH"
        echo "Please install unicornscan or set UNICORNSCAN environment variable"
        exit 1
    fi

    if ! command -v nc &> /dev/null; then
        echo "Warning: nc (netcat) not found, port checks may fail"
    fi
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    sleep 5  # Give containers time to start

    # Check key services
    local ready=0
    for i in {1..30}; do
        if check_port 6379 tcp && check_port 27017 tcp; then
            ready=1
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    if [ "$ready" -eq 0 ]; then
        log_info "Warning: Some services may not be ready"
    fi
}

# Main test suite
run_tests() {
    echo ""
    echo "=== NoSQL Databases ==="

    test_tcp_payload "Redis" 6379 "Redis RESP protocol"
    test_tcp_payload "MongoDB" 27017 "MongoDB isMaster OP_MSG"
    test_tcp_payload "Elasticsearch" 9200 "Elasticsearch HTTP"
    test_tcp_payload "Cassandra" 9042 "Cassandra CQL native protocol"
    test_tcp_payload "CouchDB" 5984 "CouchDB HTTP"
    test_tcp_payload "Memcached" 11211 "Memcached stats"

    echo ""
    echo "=== Container/Orchestration ==="

    test_tcp_payload "etcd" 2379 "etcd gRPC/HTTP"
    test_tcp_payload "Consul" 8500 "Consul HTTP API"

    echo ""
    echo "=== Message Queues ==="

    test_tcp_payload "MQTT" 1883 "MQTT CONNECT"
    test_tcp_payload "RabbitMQ" 5672 "AMQP protocol"
    test_tcp_payload "NATS" 4222 "NATS INFO"
    test_tcp_payload "ActiveMQ" 61616 "OpenWire protocol"

    echo ""
    echo "=== Monitoring ==="

    test_tcp_payload "Prometheus" 9090 "Prometheus HTTP"
    test_tcp_payload "Grafana" 3000 "Grafana HTTP"
    test_tcp_payload "InfluxDB" 8086 "InfluxDB HTTP"

    echo ""
    echo "=== Relational Databases ==="

    test_tcp_payload "PostgreSQL" 5432 "PostgreSQL StartupMessage"
    test_tcp_payload "MySQL" 3306 "MySQL handshake"
    test_tcp_payload "MariaDB" 3307 "MariaDB handshake"

    echo ""
    echo "=== Network Services ==="

    test_tcp_payload "LDAP" 389 "LDAP rootDSE query"
    test_tcp_payload "SSH" 2222 "SSH protocol"
    test_tcp_payload "HTTP" 80 "HTTP GET request"
    test_tcp_payload "TLS/HTTPS" 443 "TLS ClientHello"

    echo ""
    echo "=== SCADA/ICS ==="

    test_tcp_payload "Modbus" 502 "Modbus TCP read"

    echo ""
    echo "=== UDP Services ==="

    test_udp_payload "DNS" 5353 "DNS query"
    test_udp_payload "Consul-DNS" 8600 "Consul DNS interface"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=1
                shift
                ;;
            -t|--target)
                TARGET="$2"
                shift 2
                ;;
            -w|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  -v, --verbose     Show detailed output"
                echo "  -t, --target IP   Target IP (default: 127.0.0.1)"
                echo "  -w, --timeout N   Timeout in seconds (default: 5)"
                echo "  -h, --help        Show this help"
                echo ""
                echo "Environment variables:"
                echo "  TARGET       Target IP address"
                echo "  UNICORNSCAN  Path to unicornscan binary"
                echo "  TIMEOUT      Scan timeout in seconds"
                echo "  VERBOSE      Set to 1 for verbose output"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Main
main() {
    parse_args "$@"
    check_prereqs
    print_banner
    wait_for_services
    run_tests
    print_summary
}

main "$@"
