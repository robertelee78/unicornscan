/**
 * Well-known port to service name mappings
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

export interface PortEntry {
  name: string
  description: string
  category: 'system' | 'database' | 'web' | 'mail' | 'file' | 'remote' | 'security' | 'network' | 'messaging' | 'other'
}

/**
 * Comprehensive well-known ports database
 * Includes both TCP and UDP common services
 */
export const WELL_KNOWN_PORTS: Record<number, PortEntry> = {
  // System/Reserved (0-1023)
  7: { name: 'echo', description: 'Echo Protocol', category: 'network' },
  9: { name: 'discard', description: 'Discard Protocol', category: 'network' },
  13: { name: 'daytime', description: 'Daytime Protocol', category: 'network' },
  19: { name: 'chargen', description: 'Character Generator', category: 'network' },
  20: { name: 'ftp-data', description: 'FTP Data Transfer', category: 'file' },
  21: { name: 'ftp', description: 'FTP Control', category: 'file' },
  22: { name: 'ssh', description: 'Secure Shell', category: 'remote' },
  23: { name: 'telnet', description: 'Telnet', category: 'remote' },
  25: { name: 'smtp', description: 'Simple Mail Transfer', category: 'mail' },
  37: { name: 'time', description: 'Time Protocol', category: 'network' },
  42: { name: 'nameserver', description: 'Host Name Server', category: 'network' },
  43: { name: 'whois', description: 'WHOIS', category: 'network' },
  49: { name: 'tacacs', description: 'TACACS Login Host', category: 'security' },
  53: { name: 'dns', description: 'Domain Name System', category: 'network' },
  67: { name: 'dhcp-server', description: 'DHCP Server', category: 'network' },
  68: { name: 'dhcp-client', description: 'DHCP Client', category: 'network' },
  69: { name: 'tftp', description: 'Trivial File Transfer', category: 'file' },
  70: { name: 'gopher', description: 'Gopher Protocol', category: 'web' },
  79: { name: 'finger', description: 'Finger Protocol', category: 'network' },
  80: { name: 'http', description: 'Hypertext Transfer Protocol', category: 'web' },
  88: { name: 'kerberos', description: 'Kerberos Authentication', category: 'security' },
  102: { name: 'iso-tsap', description: 'ISO-TSAP Class 0', category: 'network' },
  110: { name: 'pop3', description: 'Post Office Protocol v3', category: 'mail' },
  111: { name: 'rpcbind', description: 'RPC Port Mapper', category: 'network' },
  113: { name: 'ident', description: 'Identification Protocol', category: 'security' },
  119: { name: 'nntp', description: 'Network News Transfer', category: 'messaging' },
  123: { name: 'ntp', description: 'Network Time Protocol', category: 'network' },
  135: { name: 'msrpc', description: 'Microsoft RPC', category: 'remote' },
  137: { name: 'netbios-ns', description: 'NetBIOS Name Service', category: 'network' },
  138: { name: 'netbios-dgm', description: 'NetBIOS Datagram', category: 'network' },
  139: { name: 'netbios-ssn', description: 'NetBIOS Session', category: 'network' },
  143: { name: 'imap', description: 'Internet Message Access', category: 'mail' },
  161: { name: 'snmp', description: 'Simple Network Management', category: 'network' },
  162: { name: 'snmp-trap', description: 'SNMP Trap', category: 'network' },
  177: { name: 'xdmcp', description: 'X Display Manager', category: 'remote' },
  179: { name: 'bgp', description: 'Border Gateway Protocol', category: 'network' },
  194: { name: 'irc', description: 'Internet Relay Chat', category: 'messaging' },
  199: { name: 'smux', description: 'SNMP Multiplexer', category: 'network' },
  220: { name: 'imap3', description: 'IMAP v3', category: 'mail' },
  264: { name: 'bgmp', description: 'Border Gateway Multicast', category: 'network' },
  318: { name: 'pkix-timestamp', description: 'PKIX Time Stamp', category: 'security' },
  389: { name: 'ldap', description: 'LDAP', category: 'security' },
  443: { name: 'https', description: 'HTTP Secure', category: 'web' },
  445: { name: 'microsoft-ds', description: 'Microsoft Directory Services', category: 'file' },
  464: { name: 'kpasswd', description: 'Kerberos Password Change', category: 'security' },
  465: { name: 'smtps', description: 'SMTP over TLS', category: 'mail' },
  500: { name: 'isakmp', description: 'IPSec IKE', category: 'security' },
  512: { name: 'exec', description: 'Remote Execution', category: 'remote' },
  513: { name: 'login', description: 'Remote Login', category: 'remote' },
  514: { name: 'shell', description: 'Remote Shell / Syslog', category: 'remote' },
  515: { name: 'printer', description: 'Line Printer Daemon', category: 'other' },
  520: { name: 'rip', description: 'Routing Information Protocol', category: 'network' },
  521: { name: 'ripng', description: 'RIP next generation', category: 'network' },
  540: { name: 'uucp', description: 'Unix-to-Unix Copy', category: 'file' },
  543: { name: 'klogin', description: 'Kerberos Login', category: 'remote' },
  544: { name: 'kshell', description: 'Kerberos Shell', category: 'remote' },
  554: { name: 'rtsp', description: 'Real Time Streaming', category: 'web' },
  563: { name: 'nntps', description: 'NNTP over TLS', category: 'messaging' },
  587: { name: 'submission', description: 'Message Submission', category: 'mail' },
  591: { name: 'filemaker', description: 'FileMaker Pro', category: 'database' },
  593: { name: 'http-rpc', description: 'HTTP RPC Ep Map', category: 'remote' },
  631: { name: 'ipp', description: 'Internet Printing', category: 'other' },
  636: { name: 'ldaps', description: 'LDAP over TLS', category: 'security' },
  646: { name: 'ldp', description: 'Label Distribution Protocol', category: 'network' },
  691: { name: 'ms-exchange', description: 'MS Exchange Routing', category: 'mail' },
  749: { name: 'kerberos-adm', description: 'Kerberos Administration', category: 'security' },
  873: { name: 'rsync', description: 'Remote Sync', category: 'file' },
  902: { name: 'vmware-auth', description: 'VMware Authentication', category: 'remote' },
  989: { name: 'ftps-data', description: 'FTP Data over TLS', category: 'file' },
  990: { name: 'ftps', description: 'FTP Control over TLS', category: 'file' },
  992: { name: 'telnets', description: 'Telnet over TLS', category: 'remote' },
  993: { name: 'imaps', description: 'IMAP over TLS', category: 'mail' },
  995: { name: 'pop3s', description: 'POP3 over TLS', category: 'mail' },

  // Registered Ports (1024-49151)
  1080: { name: 'socks', description: 'SOCKS Proxy', category: 'network' },
  1099: { name: 'rmi', description: 'Java RMI Registry', category: 'remote' },
  1194: { name: 'openvpn', description: 'OpenVPN', category: 'security' },
  1241: { name: 'nessus', description: 'Nessus Scanner', category: 'security' },
  1311: { name: 'dell-omsa', description: 'Dell OpenManage', category: 'remote' },
  1433: { name: 'mssql', description: 'Microsoft SQL Server', category: 'database' },
  1434: { name: 'mssql-mon', description: 'MS SQL Monitor', category: 'database' },
  1521: { name: 'oracle', description: 'Oracle Database', category: 'database' },
  1701: { name: 'l2tp', description: 'Layer 2 Tunneling', category: 'security' },
  1723: { name: 'pptp', description: 'Point-to-Point Tunneling', category: 'security' },
  1812: { name: 'radius', description: 'RADIUS Authentication', category: 'security' },
  1813: { name: 'radius-acct', description: 'RADIUS Accounting', category: 'security' },
  1883: { name: 'mqtt', description: 'MQTT Messaging', category: 'messaging' },
  1900: { name: 'upnp', description: 'Universal Plug and Play', category: 'network' },
  2049: { name: 'nfs', description: 'Network File System', category: 'file' },
  2181: { name: 'zookeeper', description: 'Apache ZooKeeper', category: 'database' },
  2222: { name: 'ssh-alt', description: 'SSH Alternate', category: 'remote' },
  2375: { name: 'docker', description: 'Docker REST API (unenc)', category: 'remote' },
  2376: { name: 'docker-tls', description: 'Docker REST API (TLS)', category: 'remote' },
  2379: { name: 'etcd-client', description: 'etcd Client', category: 'database' },
  2380: { name: 'etcd-peer', description: 'etcd Peer', category: 'database' },
  3000: { name: 'dev-server', description: 'Development Server', category: 'web' },
  3128: { name: 'squid', description: 'Squid Proxy', category: 'web' },
  3268: { name: 'gc-ldap', description: 'Global Catalog LDAP', category: 'security' },
  3269: { name: 'gc-ldaps', description: 'Global Catalog LDAPS', category: 'security' },
  3306: { name: 'mysql', description: 'MySQL Database', category: 'database' },
  3389: { name: 'rdp', description: 'Remote Desktop', category: 'remote' },
  4369: { name: 'epmd', description: 'Erlang Port Mapper', category: 'network' },
  4443: { name: 'pharos', description: 'Pharos / HTTPS Alt', category: 'web' },
  4505: { name: 'saltstack-pub', description: 'SaltStack Publisher', category: 'remote' },
  4506: { name: 'saltstack-req', description: 'SaltStack Request', category: 'remote' },
  5000: { name: 'upnp', description: 'UPnP / Flask', category: 'web' },
  5001: { name: 'synology', description: 'Synology DSM', category: 'web' },
  5060: { name: 'sip', description: 'Session Initiation Protocol', category: 'messaging' },
  5061: { name: 'sips', description: 'SIP over TLS', category: 'messaging' },
  5222: { name: 'xmpp-client', description: 'XMPP Client', category: 'messaging' },
  5269: { name: 'xmpp-server', description: 'XMPP Server', category: 'messaging' },
  5432: { name: 'postgresql', description: 'PostgreSQL Database', category: 'database' },
  5555: { name: 'adb', description: 'Android Debug Bridge', category: 'remote' },
  5601: { name: 'kibana', description: 'Kibana', category: 'web' },
  5672: { name: 'amqp', description: 'AMQP', category: 'messaging' },
  5900: { name: 'vnc', description: 'Virtual Network Computing', category: 'remote' },
  5984: { name: 'couchdb', description: 'CouchDB', category: 'database' },
  5985: { name: 'winrm', description: 'WinRM (HTTP)', category: 'remote' },
  5986: { name: 'winrm-tls', description: 'WinRM (HTTPS)', category: 'remote' },
  6000: { name: 'x11', description: 'X Window System', category: 'remote' },
  6379: { name: 'redis', description: 'Redis Database', category: 'database' },
  6443: { name: 'k8s-api', description: 'Kubernetes API', category: 'remote' },
  6666: { name: 'irc-alt', description: 'IRC Alternate', category: 'messaging' },
  6667: { name: 'irc', description: 'IRC', category: 'messaging' },
  6697: { name: 'ircs', description: 'IRC over TLS', category: 'messaging' },
  7001: { name: 'weblogic', description: 'Oracle WebLogic', category: 'web' },
  7070: { name: 'rtsp-alt', description: 'RTSP Alternate', category: 'web' },
  7443: { name: 'oracleias', description: 'Oracle iAS', category: 'web' },
  8000: { name: 'http-alt', description: 'HTTP Alternate', category: 'web' },
  8008: { name: 'http-proxy', description: 'HTTP Proxy', category: 'web' },
  8080: { name: 'http-proxy', description: 'HTTP Proxy / Tomcat', category: 'web' },
  8081: { name: 'http-alt', description: 'HTTP Alternate', category: 'web' },
  8443: { name: 'https-alt', description: 'HTTPS Alternate', category: 'web' },
  8888: { name: 'http-alt', description: 'HTTP Alternate', category: 'web' },
  9000: { name: 'php-fpm', description: 'PHP-FPM / SonarQube', category: 'web' },
  9090: { name: 'prometheus', description: 'Prometheus', category: 'web' },
  9092: { name: 'kafka', description: 'Apache Kafka', category: 'messaging' },
  9100: { name: 'jetdirect', description: 'HP JetDirect', category: 'other' },
  9200: { name: 'elasticsearch', description: 'Elasticsearch HTTP', category: 'database' },
  9300: { name: 'elasticsearch-t', description: 'Elasticsearch Transport', category: 'database' },
  9418: { name: 'git', description: 'Git Protocol', category: 'file' },
  10000: { name: 'webmin', description: 'Webmin', category: 'web' },
  10050: { name: 'zabbix-agent', description: 'Zabbix Agent', category: 'network' },
  10051: { name: 'zabbix-server', description: 'Zabbix Server', category: 'network' },
  11211: { name: 'memcached', description: 'Memcached', category: 'database' },
  15672: { name: 'rabbitmq-mgmt', description: 'RabbitMQ Management', category: 'web' },
  25565: { name: 'minecraft', description: 'Minecraft Server', category: 'other' },
  27017: { name: 'mongodb', description: 'MongoDB', category: 'database' },
  27018: { name: 'mongodb-shard', description: 'MongoDB Shard', category: 'database' },
  28017: { name: 'mongodb-web', description: 'MongoDB Web Status', category: 'database' },
  32768: { name: 'rpc-high', description: 'RPC High Port', category: 'network' },
  50000: { name: 'sap', description: 'SAP', category: 'other' },
}

/**
 * Get port information
 * @param port Port number
 * @returns Port entry or undefined if not in database
 */
export function getPortInfo(port: number): PortEntry | undefined {
  return WELL_KNOWN_PORTS[port]
}

/**
 * Get service name for port
 * @param port Port number
 * @returns Service name or port number as string if unknown
 */
export function getServiceName(port: number): string {
  return WELL_KNOWN_PORTS[port]?.name ?? `port-${port}`
}

/**
 * Get category color class for port category
 * Uses semantic CSS variables for WCAG AA compliance in both themes
 */
export function getCategoryColor(category: PortEntry['category']): string {
  switch (category) {
    case 'web': return 'text-port-category-web'
    case 'database': return 'text-port-category-database'
    case 'mail': return 'text-port-category-mail'
    case 'file': return 'text-port-category-file'
    case 'remote': return 'text-port-category-remote'
    case 'security': return 'text-port-category-security'
    case 'network': return 'text-port-category-network'
    case 'messaging': return 'text-port-category-messaging'
    case 'system': return 'text-port-category-system'
    default: return 'text-muted'
  }
}

/**
 * Determine if a port is typically dangerous/sensitive
 */
export function isDangerousPort(port: number): boolean {
  const dangerous = [
    21, 22, 23, 25,    // FTP, SSH, Telnet, SMTP
    135, 137, 138, 139, 445, // Windows networking
    512, 513, 514,     // BSD r-services
    1433, 1521,        // Databases
    3389,              // RDP
    5900,              // VNC
  ]
  return dangerous.includes(port)
}
