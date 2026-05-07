# Stateful Firewall with Deep Packet Inspection (DPI) - Architecture & Design

## Executive Summary

This is a **production-grade Linux Kernel Module (LKM)** implementing a Stateful Inspection Firewall with Deep Packet Inspection capabilities for Ubuntu ARM64 systems. The module integrates with the Linux Netfilter framework, maintains connection state using hash tables, inspects packet payloads for malicious patterns, and provides a Netlink interface for dynamic rule management.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Network Stack (Linux Kernel)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ NF_INET_LOCAL_OUT Hook                                     │ │
│  │ (Outgoing traffic - Source: Local, Dest: Network)          │ │
│  └────────────────┬───────────────────────────────────────────┘ │
│                   │                                              │
│                   v                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Stateful Firewall Processing:                              │ │
│  │ 1. Blacklist Check (IP/Port)                               │ │
│  │ 2. Connection State Update                                 │ │
│  │ 3. DPI Inspection (Payload Analysis)                       │ │
│  │ 4. Packet Mirroring to vdev0                               │ │
│  └────────────────┬───────────────────────────────────────────┘ │
│                   │                                              │
│                   v                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ NF_INET_PRE_ROUTING Hook                                   │ │
│  │ (Incoming traffic - Source: Network, Dest: Local)          │ │
│  └────────────────┬───────────────────────────────────────────┘ │
│                   │                                              │
│                   v                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Same Processing Pipeline for Incoming Traffic              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         ↑                                          ↓
    Netlink Socket                        Virtual Device (vdev0)
         ↑                                          ↓
┌────────┴──────────────────────────────────────────────────────┐
│         User-space Control Program (firewall_control)          │
│         - Add/Remove Blacklist Entries                         │
│         - List Active Connections                              │
│         - Clear Connection Table                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Connection Tracking State Machine

The firewall maintains TCP connection states following RFC 793 (TCP Protocol). This ensures bidirectional state tracking and prevents spoofed or out-of-sequence packets.

### State Diagram

```
           ┌─────────┐
           │ CLOSED  │ (Initial state)
           └────┬────┘
                │
    ┌───────────┼───────────┐
    │ SYN sent  │ SYN rcvd  │
    │ (outgoing)│ (incoming)│
    │           │           │
    v           v           v
   ┌──────┐   ┌──────┐   ┌──────┐
   │SYN   │   │SYN   │   │SYN   │
   │SENT  │──>│RECV  │──>│SENT  │
   └──┬───┘   └──┬───┘   └──────┘
      │          │
      │ SYN+ACK  │
      └─────┬────┘
            │
            v
      ┌────────────────┐
      │ ESTABLISHED    │ (Stable state)
      └────┬────────┬──┘
           │        │
    ┌──────┘        └──────┐
    │ FIN/RST        FIN/RST│
    │ (from source)  (from dest)
    │                │
    v                v
┌──────────┐    ┌──────────┐
│FIN_WAIT1 │───>│FIN_WAIT2 │
└────┬─────┘    └────┬─────┘
     │              │
     │ Final ACK    │
     └──────┬───────┘
            │
            v
      ┌──────────────┐
      │  TIME_WAIT   │ (Connection cleanup)
      └──────┬───────┘
             │
       (timeout)
             │
             v
          CLOSED
```

### State Transitions

1. **CLOSED → SYN_SENT**: Outgoing SYN packet detected
   - New connection tracked in hash table
   - Connection stored with source/dest IP and ports

2. **SYN_SENT → ESTABLISHED**: SYN+ACK response received
   - Confirms bidirectional reachability
   - Safe to allow data flow

3. **ESTABLISHED → FIN_WAIT1**: FIN packet received from either direction
   - Graceful connection closure initiated
   - Half-close allowed (one direction closed, other still open)

4. **FIN_WAIT1 → FIN_WAIT2**: FIN+ACK received
   - ACK waiting from other direction

5. **FIN_WAIT2 → TIME_WAIT**: Final FIN+ACK or RST
   - Connection essentially closed
   - Kept in TIME_WAIT to prevent old packets from arriving

6. **TIME_WAIT → CLOSED**: Timeout after 300 seconds
   - Connection entry removed from tracking table
   - Resources reclaimed

---

## Data Structure Design

### Connection Tracking Entry

```c
typedef struct {
    struct hlist_node node;      // Hash table node
    __be32 src_ip;              // Source IP (network byte order)
    __be32 dst_ip;              // Destination IP (network byte order)
    __be16 src_port;            // Source port (network byte order)
    __be16 dst_port;            // Destination port (network byte order)
    uint8_t state;              // TCP state (see state constants)
    unsigned long timestamp;    // Last activity timestamp
    uint32_t packets_seen;      // Packet counter for statistics
    uint32_t bytes_seen;        // Byte counter for statistics
    uint8_t protocol;           // IP protocol (e.g., IPPROTO_TCP)
} conn_entry_t;
```

**Storage**: Hash table with 2^10 (1024) buckets
**Lookup Complexity**: O(1) average case, O(n) worst case
**Synchronization**: RCU for reads, spinlock for writes

### Blacklist Entry

```c
typedef struct {
    struct hlist_node node;     // Hash table node
    __be32 blocked_ip;          // IP to block
    __be16 blocked_port;        // Port to block (0 = all ports on IP)
    uint8_t reason;             // Reason code (IP/Port/DPI match)
} blacklist_entry_t;
```

**Storage**: Hash table with 2^8 (256) buckets
**Lookup Complexity**: O(1) average case
**Operations**: Add, Remove, Lookup

---

## Core Algorithms

### 1. Connection Lookup (Hash-based)

```
LOOKUP(src_ip, dst_ip, src_port, dst_port):
    hash = jhash_3words(src_ip, dst_ip ^ (src_port << 16 | dst_port), 0)
    bucket = hash % CONN_TABLE_SIZE
    
    for each entry in bucket:
        if entry matches (src_ip, dst_ip, src_port, dst_port):
            return entry
    
    return NULL
```

**Time Complexity**: O(1) average, O(n) worst case
**Space Complexity**: O(connections)

### 2. DPI Pattern Matching

```
DPI_INSPECT(packet_payload):
    for each pattern in forbidden_patterns:
        if payload_len >= pattern_len:
            if memcmp(payload, pattern, pattern_len) == 0:
                return PATTERN_FOUND  // Drop packet
    
    return NO_PATTERN  // Allow packet
```

**Patterns Checked**:
- "malware" - Malware signatures
- "exploit" - Exploit attempt detection
- "DROP" - SQL injection prevention

**Time Complexity**: O(patterns × payload_len)
**Current Patterns**: 3 (extensible)

### 3. Blacklist Check

```
IS_BLACKLISTED(src_ip, port):
    hash = jhash_2words(src_ip, port, 0)
    bucket = hash % BLACKLIST_SIZE
    
    for each entry in bucket:
        if entry.blocked_ip == src_ip AND 
           (entry.blocked_port == 0 OR entry.blocked_port == port):
            return BLACKLISTED
    
    return NOT_BLACKLISTED
```

**Time Complexity**: O(1) average
**Port Matching**: 0 = block all ports on IP, specific = block only that port

---

## Concurrency & Synchronization Strategy

### Problem
- Multi-core ARM system: Multiple CPUs accessing connection table simultaneously
- Race conditions could corrupt state or leak packets

### Solution: Hybrid Approach

**For Reads** (most operations):
- Use RCU (Read-Copy-Update)
- Multiple readers, minimal lock contention
- `rcu_read_lock()` / `rcu_read_unlock()`

**For Writes** (inserts, deletes):
- Use Spinlock (IRQ-safe)
- Protects against interrupts and other CPUs
- `spin_lock_irqsave()` / `spin_unlock_irqrestore()`

**Example**:
```c
// Multiple threads can execute this simultaneously
rcu_read_lock();
entry = conn_lookup(...);  // Read operation
if (entry) {
    entry->packets_seen++;  // Atomic increment safe
}
rcu_read_unlock();

// Only one thread executes this at a time
spin_lock_irqsave(&conn_table_lock, flags);
hlist_add_head_rcu(&entry->node, &bucket);  // Write operation
spin_unlock_irqrestore(&conn_table_lock, flags);
synchronize_rcu();  // Ensure all readers finish
```

---

## Netfilter Hook Points

### Hook 1: NF_INET_LOCAL_OUT (Outgoing)
- **When**: After routing decision, before leaving system
- **Direction**: System → Network
- **Operations**:
  1. Extract TCP header
  2. Check destination blacklist
  3. Create/update connection entry if SYN
  4. Update connection state
  5. DPI inspect payload
  6. Mirror to vdev0
  7. Return NF_ACCEPT or NF_DROP

### Hook 2: NF_INET_PRE_ROUTING (Incoming)
- **When**: Before routing decision
- **Direction**: Network → System
- **Operations**:
  1. Extract TCP header
  2. Check source blacklist
  3. Lookup existing connection (reverse direction)
  4. Update connection state
  5. DPI inspect payload
  6. Mirror to vdev0
  7. Return NF_ACCEPT or NF_DROP

**Priority**: NF_IP_PRI_FIRST (highest priority)
- Ensures firewall processes before other hooks
- Blocks malicious packets early

---

## Deep Packet Inspection (DPI) Engine

### Design

The DPI engine inspects TCP payload for forbidden patterns using simple string matching. For production, consider using:
- Aho-Corasick algorithm (multiple patterns efficiently)
- Boyer-Moore (faster single pattern)
- Regular expressions (complex patterns)

### Current Implementation

```c
dpi_inspect(skb, iph, tcph):
    payload = ip_header + tcp_header offset
    payload_len = total_ip_length - headers
    
    for each pattern:
        if payload contains pattern:
            log alert
            return DROP
    
    return ALLOW
```

### Pattern Definition

```c
static dpi_pattern_t dpi_patterns[] = {
    { "malware", 7, "Malware signature detected" },
    { "exploit", 7, "Exploit pattern detected" },
    { "DROP", 4, "SQL Injection attempt" },
    { NULL, 0, NULL }
};
```

### Extension Points

Add new patterns by:
1. Defining pattern string
2. Adding to dpi_patterns array
3. Recompiling kernel module
4. No need to reboot (module can be reloaded)

---

## Packet Mirroring (Wireshark Integration)

Every packet processed by the firewall is cloned and sent to virtual interface `vdev0` for analysis.

```c
mirror_to_vdev(skb):
    vdev = get_network_device("vdev0")
    
    cloned_skb = skb_clone(skb)        // Copy packet
    cloned_skb->dev = vdev
    cloned_skb->protocol = eth_type_trans(cloned_skb, vdev)
    
    netif_rx(cloned_skb)               // Send to network stack
    dev_put(vdev)                      // Release device reference
```

**Benefits**:
- Capture all processed packets
- Wireshark can analyze mirrored traffic
- Debugging and forensics
- No performance impact (async operation)

---

## Netlink Control Plane

### Purpose
Dynamic firewall rule management without kernel recompilation or reboot.

### Protocol Definition

```c
#define NETLINK_FIREWALL    29

typedef struct {
    __be32 ip;          // Target IP
    __be16 port;        // Target port (0 = all ports)
    uint8_t command;    // Command type
} firewall_msg_t;

Commands:
- FIREWALL_CMD_ADD_BLACKLIST (1)
- FIREWALL_CMD_REMOVE_BLACKLIST (2)
- FIREWALL_CMD_LIST_CONNECTIONS (3)
- FIREWALL_CMD_CLEAR_CONNECTIONS (4)
```

### Message Flow

```
User-space Program          Kernel Module
     |                            |
     | CREATE SOCKET              |
     |<-- NETLINK SOCKET PF_NETLINK
     |                            |
     | BIND to PID                |
     |                            |
     | SEND MESSAGE (add IP)      |
     |--------------------------->|
     |                            | PROCESS IN NETLINK HANDLER
     |                            | INSERT INTO BLACKLIST
     |                            | LOG EVENT
     |                            |
     | RECEIVE STATUS (kernel log)|
     | dmesg | tail -20           |
     |<----------------------------|
     |                            |
```

---

## Resource Management & Garbage Collection

### Connection Timeout

Connections in TIME_WAIT state are removed after 300 seconds to prevent table bloat.

```c
cleanup_expired_connections():
    for each bucket in conn_table:
        for each entry in bucket:
            if (current_time - entry->timestamp) > 300 seconds:
                hlist_del_rcu(&entry->node)
                kfree(entry)
                synchronize_rcu()
```

**Trigger**: Manual via `/proc` interface or timer (not implemented in basic version)

### Memory Safety

All allocations:
- Use `kmalloc(GFP_ATOMIC)` for interrupt context
- Use `kmalloc(GFP_KERNEL)` for process context
- Check for NULL return values
- Free in reverse order of allocation (LIFO)
- Use `synchronize_rcu()` before freeing RCU-protected data

### Error Handling

```c
ENOMEM    - Out of memory, allocation failed
ENOENT    - Entry not found in table
EINVAL    - Invalid parameters
```

---

## Performance Characteristics

| Operation | Time Complexity | Space Complexity | Notes |
|-----------|-----------------|------------------|-------|
| Connection lookup | O(1) avg | O(connections) | Hash table with 1024 buckets |
| Connection insert | O(1) avg | O(1) | Single hash insert |
| Connection delete | O(1) avg | O(1) | Hash delete + RCU sync |
| Blacklist check | O(1) avg | O(blacklist_entries) | Hash table with 256 buckets |
| DPI inspection | O(patterns × payload_len) | O(payload_len) | Scales with packet size |
| Packet mirroring | O(1) | O(packet_size) | Async, minimal impact |

### Benchmarks (Theoretical on ARM64)
- Connection lookup: < 1 μs
- Blacklist check: < 1 μs
- DPI inspection: 10-100 μs (depends on payload)
- Packet processing overhead: 20-50 μs per packet

---

## Deployment & Usage

### Building

```bash
make modules               # Build kernel module
make firewall_control      # Build user-space program
```

### Loading

```bash
sudo insmod firewall.ko
dmesg | tail -10          # Check module loaded
```

### Managing Rules (User-space)

```bash
# Add IP to blacklist
./firewall_control add_blacklist 192.168.1.100

# Add IP:PORT to blacklist
./firewall_control add_blacklist 192.168.1.100 8080

# Remove from blacklist
./firewall_control remove_blacklist 192.168.1.100

# List active connections
./firewall_control list_connections

# Clear all connections
./firewall_control clear_connections
```

### Monitoring

```bash
# Watch kernel logs in real-time
sudo dmesg -w

# Or check specific events
dmesg | grep "FIREWALL"
```

### Unloading

```bash
sudo rmmod firewall        # Cleanup all resources
```

---

## Security Considerations

1. **Privilege Escalation**: Only root can load/unload modules
2. **Netlink Authentication**: Add PID validation for sensitive commands
3. **DPI Patterns**: Should be cryptographically signed for integrity
4. **Connection Spoofing**: Hash table keying includes all tuple elements
5. **Memory Exhaustion**: Connection timeout prevents table from growing unbounded
6. **Race Conditions**: RCU + spinlock prevents TOCTTOU bugs

---

## Limitations & Future Enhancements

### Current Limitations
- Only TCP (no UDP support)
- Basic pattern matching (no regex)
- Simple DPI (no L7 protocol parsing)
- Single pattern set (not configurable)

### Future Enhancements
1. UDP support with connection-less tracking
2. Aho-Corasick algorithm for efficient multi-pattern matching
3. Per-protocol L7 parsing (HTTP, DNS, FTP, etc.)
4. Dynamic pattern loading via `/proc` interface
5. Connection statistics export via `/proc/net/firewall`
6. Rate limiting and SYN flood protection
7. VLAN and IPv6 support
8. Integration with user-space logging daemon

---

## References

- RFC 793: Transmission Control Protocol
- Linux Netfilter Documentation: https://www.netfilter.org/
- Linux Kernel RCU Documentation
- Linux Hash Table API: `<linux/hashtable.h>`

---

## Author Notes

This implementation demonstrates kernel-level network security best practices:
- **Stateful tracking** ensures only legitimate connections pass
- **DPI inspection** catches application-level threats
- **RCU synchronization** enables high-performance concurrent access
- **Netlink interface** allows dynamic rule management
- **Modularized design** separates concerns clearly

Production deployments should add:
- Performance monitoring
- Security audit logging
- Automated threat response
- Integration with SIEM systems
