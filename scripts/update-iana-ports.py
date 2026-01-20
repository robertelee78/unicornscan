#!/usr/bin/env python3
"""
Update etc/ports.txt from the latest IANA service-names-port-numbers CSV.

Usage:
    ./scripts/update-iana-ports.py [output_file]

If output_file is not specified, writes to etc/ports.txt relative to script location.

Downloads from:
    https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv
"""

import csv
import os
import re
import sys
import urllib.request
from datetime import datetime

IANA_CSV_URL = "https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv"

# Custom entries to preserve at end (not in IANA)
CUSTOM_ENTRIES = [
    ("pcanywhere", "5631", "tcp", ""),
    ("pcanywhere", "5631", "udp", ""),
    ("pcanywhere", "5632", "tcp", ""),
    ("pcanywhere", "5632", "udp", ""),
    ("winvnc", "5900", "tcp", ""),
    ("rdesktop", "3389", "tcp", ""),
    ("quake3", "27960", "udp", ""),
]


def download_iana_csv(dest_path):
    """Download the IANA CSV file."""
    print(f"Downloading from {IANA_CSV_URL}...", file=sys.stderr)
    urllib.request.urlretrieve(IANA_CSV_URL, dest_path)
    print(f"Downloaded to {dest_path}", file=sys.stderr)


def clean_description(desc, reference):
    """Clean description and append RFC reference if present."""
    if not desc:
        return ""

    desc = desc.strip()

    # Remove quotes if wrapped
    if desc.startswith('"') and desc.endswith('"'):
        desc = desc[1:-1]

    # Append RFC reference if present and not already in description
    if reference:
        rfcs = re.findall(r'\[RFC(\d+)\]', reference)
        for rfc in rfcs:
            rfc_pattern = f"RFC ?{rfc}"
            if not re.search(rfc_pattern, desc, re.IGNORECASE):
                desc = f"{desc} (RFC {rfc})"

    # Convert non-ASCII to ASCII equivalents
    replacements = {
        'É': 'E', 'é': 'e', 'È': 'E', 'è': 'e',
        'ñ': 'n', 'Ñ': 'N',
        'ü': 'u', 'Ü': 'U', 'ú': 'u', 'Ú': 'U',
        'ö': 'o', 'Ö': 'O', 'ó': 'o', 'Ó': 'O',
        'ä': 'a', 'Ä': 'A', 'á': 'a', 'Á': 'A',
        'í': 'i', 'Í': 'I',
        '–': '-', '—': '-',
        '"': '"', '"': '"',
        ''': "'", ''': "'",
    }
    for orig, repl in replacements.items():
        desc = desc.replace(orig, repl)

    return desc


def parse_iana_csv(filepath):
    """Parse IANA CSV and return list of entries."""
    entries = []

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        next(reader)  # Skip header

        for row in reader:
            if len(row) < 4:
                continue

            service_name = row[0].strip() if row[0] else ""
            port_number = row[1].strip() if row[1] else ""
            protocol = row[2].strip().lower() if row[2] else ""
            description = row[3].strip() if row[3] else ""
            reference = row[8].strip() if len(row) > 8 and row[8] else ""

            # Skip entries with no service name
            if not service_name:
                continue

            # Skip non-tcp/udp protocols
            if protocol not in ('tcp', 'udp'):
                continue

            # Skip port ranges (contain '-')
            if '-' in port_number:
                continue

            # Skip non-numeric ports
            if not port_number.isdigit():
                continue

            desc = clean_description(description, reference)
            entries.append((service_name, port_number, protocol, desc))

    return entries


def format_entry(service_name, port, protocol, description):
    """Format a single entry with proper column alignment."""
    port_proto = f"{port}/{protocol}"

    if description:
        return f"{service_name:<18}{port_proto:<12}{description}"
    else:
        return f"{service_name}\t{port_proto}"


def main():
    # Handle --help
    if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    # Determine output file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    default_output = os.path.join(project_root, "etc", "ports.txt")

    output_file = sys.argv[1] if len(sys.argv) > 1 else default_output

    # Download CSV to temp location
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as tmp:
        csv_path = tmp.name

    try:
        download_iana_csv(csv_path)

        # Parse entries
        entries = parse_iana_csv(csv_path)
        print(f"Parsed {len(entries)} entries from IANA CSV", file=sys.stderr)

        # Sort by port number, then protocol (tcp before udp)
        def sort_key(e):
            proto_order = 0 if e[2] == 'tcp' else 1
            return (int(e[1]), proto_order, e[0])

        entries.sort(key=sort_key)

        # Remove duplicates (same service, port, protocol) - keep first
        seen = set()
        unique_entries = []
        for e in entries:
            key = (e[0], e[1], e[2])
            if key not in seen:
                seen.add(key)
                unique_entries.append(e)

        print(f"After dedup: {len(unique_entries)} unique entries", file=sys.stderr)

        # Generate output
        today = datetime.now().strftime("%d %B %Y")

        lines = []
        lines.append(f"# (last updated {today}) from https://www.iana.org/assignments/service-names-port-numbers")
        lines.append("# Keyword         Decimal    Description                     References")
        lines.append("# -------         -------    -----------                     ----------")

        for service_name, port, protocol, desc in unique_entries:
            lines.append(format_entry(service_name, port, protocol, desc))

        # Add custom entries at end
        lines.append("# Custom entries (not from IANA)")
        for service_name, port, protocol, desc in CUSTOM_ENTRIES:
            lines.append(format_entry(service_name, port, protocol, desc))

        # Write output
        with open(output_file, 'w') as f:
            f.write('\n'.join(lines) + '\n')

        print(f"Wrote {len(lines)} lines to {output_file}", file=sys.stderr)

    finally:
        # Cleanup temp file
        if os.path.exists(csv_path):
            os.unlink(csv_path)


if __name__ == '__main__':
    main()
