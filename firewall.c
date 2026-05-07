/*
 * Stateful Firewall with Deep Packet Inspection (DPI) - LKM for Ubuntu ARM64
 * ============================================================================
 * 
 * Architecture:
 * - Connection Tracking using Hash Table (linux/hashtable.h)
 * - Netfilter Hooks at NF_INET_LOCAL_OUT and NF_INET_PRE_ROUTING
 * - DPI Inspection Engine for TCP payload analysis
 * - Netlink Control Plane for dynamic rule management
 * - Packet Mirroring to virtual interface (vdev0) for analysis
 * - RCU + Spin Lock protection for multi-core ARM safety
 */

#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/netfilter.h>
#include <linux/netfilter_ipv4.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/skbuff.h>
#include <linux/hashtable.h>
#include <linux/spinlock.h>
#include <linux/rculist.h>
#include <linux/netlink.h>
#include <linux/netdevice.h>
#include <net/netlink.h>
#include <net/sock.h>
#include <net/net_namespace.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Kernel Engineer");
MODULE_DESCRIPTION("Stateful Firewall with DPI Engine");

/* ============================================================================
 * DATA STRUCTURES - Connection Tracking & State Machine
 * ============================================================================
 */

/* Connection State Machine States */
#define CONN_STATE_CLOSED       0
#define CONN_STATE_SYN_SENT     1
#define CONN_STATE_SYN_RECV     2
#define CONN_STATE_ESTABLISHED  3
#define CONN_STATE_FIN_WAIT1    4
#define CONN_STATE_FIN_WAIT2    5
#define CONN_STATE_TIME_WAIT    6

/* Connection Tracking Entry */
typedef struct {
    struct hlist_node node;
    __be32 src_ip;
    __be32 dst_ip;
    __be16 src_port;
    __be16 dst_port;
    uint8_t state;
    unsigned long timestamp;
    uint32_t packets_seen;
    uint32_t bytes_seen;
    uint8_t protocol;
} conn_entry_t;

/* Blacklist Entry */
typedef struct {
    struct hlist_node node;
    __be32 blocked_ip;
    __be16 blocked_port;
    uint8_t reason;             /* 0: IP, 1: Port, 2: DPI pattern */
} blacklist_entry_t;

/* DPI Pattern Matcher */
typedef struct {
    char *pattern;
    uint32_t pattern_len;
    const char *description;
} dpi_pattern_t;

/* ============================================================================
 * GLOBAL STATE & SYNCHRONIZATION
 * ============================================================================
 */

#define CONN_TABLE_BITS     10
#define BLACKLIST_BITS      8

static DECLARE_HASHTABLE(conn_table, CONN_TABLE_BITS);
static DECLARE_HASHTABLE(blacklist_table, BLACKLIST_BITS);
static spinlock_t conn_table_lock;
static spinlock_t blacklist_table_lock;

/* Connection timeout in seconds */
#define CONN_TIMEOUT        300

/* DPI Patterns - Forbidden Keywords */
static dpi_pattern_t dpi_patterns[] = {
    { "malware", 7, "Malware signature detected" },
    { "exploit", 7, "Exploit pattern detected" },
    { "DROP", 4, "SQL Injection attempt" },
    { NULL, 0, NULL }
};

/* Netlink socket for user-space communication */
static struct sock *nl_sock = NULL;
static int nl_pid = 0;

/* Virtual device reference for packet mirroring */
static struct net_device *vdev = NULL;

/* ============================================================================
 * CONNECTION TRACKING STATE MACHINE
 * ============================================================================
 *
 * State Transitions:
 *
 *   CLOSED
 *     |
 *     | SYN (outgoing)
 *     v
 *   SYN_SENT
 *     |
 *     | SYN+ACK (incoming)
 *     v
 *   ESTABLISHED <--------+
 *     |                  |
 *     | FIN or RST       | ACK continuation
 *     v                  |
 *   FIN_WAIT1  ----------+
 *     |
 *     | FIN ACK
 *     v
 *   FIN_WAIT2
 *     |
 *     | Final ACK or timeout
 *     v
 *   TIME_WAIT
 *     |
 *     | Timeout
 *     v
 *   CLOSED
 *
 * This ensures bidirectional TCP connection tracking.
 */

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

static const char *state_name(uint8_t state) {
    switch(state) {
        case CONN_STATE_CLOSED:       return "CLOSED";
        case CONN_STATE_SYN_SENT:     return "SYN_SENT";
        case CONN_STATE_SYN_RECV:     return "SYN_RECV";
        case CONN_STATE_ESTABLISHED:  return "ESTABLISHED";
        case CONN_STATE_FIN_WAIT1:    return "FIN_WAIT1";
        case CONN_STATE_FIN_WAIT2:    return "FIN_WAIT2";
        case CONN_STATE_TIME_WAIT:    return "TIME_WAIT";
        default:                      return "UNKNOWN";
    }
}

static u32 conn_hash(__be32 src_ip, __be32 dst_ip, __be16 src_port, __be16 dst_port) {
    return jhash_3words((__force u32)src_ip,
                       ((__force u32)dst_ip ^ (((__force u32)src_port << 16) | (__force u32)dst_port)),
                       0, 0);
}

/* ============================================================================
 * CONNECTION TRACKING FUNCTIONS
 * ============================================================================
 */

static conn_entry_t *conn_lookup(__be32 src_ip, __be32 dst_ip,
                                  __be16 src_port, __be16 dst_port) {
    conn_entry_t *entry;
    u32 hash = conn_hash(src_ip, dst_ip, src_port, dst_port);

    rcu_read_lock();
    hlist_for_each_entry_rcu(entry, &conn_table[hash_min(hash, CONN_TABLE_BITS)], node) {
        if (entry->src_ip == src_ip && entry->dst_ip == dst_ip &&
            entry->src_port == src_port && entry->dst_port == dst_port) {
            rcu_read_unlock();
            return entry;
        }
    }
    rcu_read_unlock();
    return NULL;
}

static int conn_insert(__be32 src_ip, __be32 dst_ip,
                       __be16 src_port, __be16 dst_port,
                       uint8_t protocol) {
    conn_entry_t *entry;
    unsigned long flags;
    u32 hash;

    entry = kmalloc(sizeof(conn_entry_t), GFP_ATOMIC);
    if (!entry)
        return -ENOMEM;

    entry->src_ip = src_ip;
    entry->dst_ip = dst_ip;
    entry->src_port = src_port;
    entry->dst_port = dst_port;
    entry->protocol = protocol;
    entry->state = CONN_STATE_SYN_SENT;
    entry->timestamp = jiffies;
    entry->packets_seen = 0;
    entry->bytes_seen = 0;

    hash = conn_hash(src_ip, dst_ip, src_port, dst_port);
    
    spin_lock_irqsave(&conn_table_lock, flags);
    hlist_add_head_rcu(&entry->node, &conn_table[hash_min(hash, CONN_TABLE_BITS)]);
    spin_unlock_irqrestore(&conn_table_lock, flags);

    printk(KERN_INFO "[FIREWALL] New connection: %pI4:%u -> %pI4:%u [%s]\n",
           &src_ip, ntohs(src_port), &dst_ip, ntohs(dst_port), state_name(entry->state));

    return 0;
}

static void conn_update_state(conn_entry_t *entry, struct tcphdr *tcph) {
    if (!entry || !tcph)
        return;

    switch(entry->state) {
        case CONN_STATE_SYN_SENT:
            if (tcph->syn && tcph->ack) {
                entry->state = CONN_STATE_ESTABLISHED;
                printk(KERN_INFO "[FIREWALL] Connection ESTABLISHED: %pI4:%u -> %pI4:%u\n",
                       &entry->src_ip, ntohs(entry->src_port),
                       &entry->dst_ip, ntohs(entry->dst_port));
            }
            break;

        case CONN_STATE_ESTABLISHED:
            if (tcph->fin) {
                entry->state = CONN_STATE_FIN_WAIT1;
                printk(KERN_INFO "[FIREWALL] FIN received, state -> FIN_WAIT1\n");
            } else if (tcph->rst) {
                entry->state = CONN_STATE_CLOSED;
                printk(KERN_INFO "[FIREWALL] RST received, connection CLOSED\n");
            }
            break;

        case CONN_STATE_FIN_WAIT1:
            if (tcph->fin && tcph->ack) {
                entry->state = CONN_STATE_TIME_WAIT;
                printk(KERN_INFO "[FIREWALL] Final FIN+ACK, state -> TIME_WAIT\n");
            }
            break;

        default:
            break;
    }

    entry->timestamp = jiffies;
}

/* ============================================================================
 * BLACKLIST MANAGEMENT
 * ============================================================================
 */

static int is_blacklisted(__be32 ip, __be16 port) {
    blacklist_entry_t *entry;
    u32 hash;

    hash = jhash_2words((__force u32)ip, (__force u16)port, 0);
    
    rcu_read_lock();
    hlist_for_each_entry_rcu(entry, &blacklist_table[hash_min(hash, BLACKLIST_BITS)], node) {
        if (entry->blocked_ip == ip && (entry->blocked_port == 0 || entry->blocked_port == port)) {
            rcu_read_unlock();
            return 1;
        }
    }
    rcu_read_unlock();
    return 0;
}

static int blacklist_add(__be32 ip, __be16 port, uint8_t reason) {
    blacklist_entry_t *entry;
    unsigned long flags;
    u32 hash;

    entry = kmalloc(sizeof(blacklist_entry_t), GFP_KERNEL);
    if (!entry)
        return -ENOMEM;

    entry->blocked_ip = ip;
    entry->blocked_port = port;
    entry->reason = reason;

    hash = jhash_2words((__force u32)ip, (__force u16)port, 0);

    spin_lock_irqsave(&blacklist_table_lock, flags);
    hlist_add_head_rcu(&entry->node, &blacklist_table[hash_min(hash, BLACKLIST_BITS)]);
    spin_unlock_irqrestore(&blacklist_table_lock, flags);

    printk(KERN_INFO "[FIREWALL] Blacklist: Added %pI4:%u (reason=%u)\n",
           &ip, ntohs(port), reason);

    return 0;
}

static int blacklist_remove(__be32 ip, __be16 port) {
    blacklist_entry_t *entry;
    unsigned long flags;
    u32 hash;

    hash = jhash_2words((__force u32)ip, (__force u16)port, 0);

    spin_lock_irqsave(&blacklist_table_lock, flags);
    hlist_for_each_entry_rcu(entry, &blacklist_table[hash_min(hash, BLACKLIST_BITS)], node) {
        if (entry->blocked_ip == ip && entry->blocked_port == port) {
            hlist_del_rcu(&entry->node);
            spin_unlock_irqrestore(&blacklist_table_lock, flags);
            synchronize_rcu();
            kfree(entry);
            printk(KERN_INFO "[FIREWALL] Blacklist: Removed %pI4:%u\n", &ip, ntohs(port));
            return 0;
        }
    }
    spin_unlock_irqrestore(&blacklist_table_lock, flags);
    return -ENOENT;
}

/* ============================================================================
 * DEEP PACKET INSPECTION (DPI)
 * ============================================================================
 */

static int dpi_inspect(struct sk_buff *skb, struct iphdr *iph, struct tcphdr *tcph) {
    unsigned char *payload;
    unsigned int payload_len;
    int i;

    if (!skb || !iph || !tcph)
        return 0;

    /* Calculate payload offset */
    payload = (unsigned char *)iph + iph->ihl * 4 + tcph->doff * 4;
    payload_len = ntohs(iph->tot_len) - (iph->ihl * 4) - (tcph->doff * 4);

    if (payload_len == 0)
        return 0;

    /* Search for forbidden patterns */
    for (i = 0; dpi_patterns[i].pattern != NULL; i++) {
        if (payload_len >= dpi_patterns[i].pattern_len) {
            if (memcmp(payload, dpi_patterns[i].pattern, dpi_patterns[i].pattern_len) == 0) {
                printk(KERN_WARNING "[FIREWALL-DPI] ALERT: %s from %pI4:%u\n",
                       dpi_patterns[i].description,
                       &iph->saddr, ntohs(tcph->source));
                return 1;  /* Pattern found - drop packet */
            }
        }
    }

    return 0;  /* No harmful pattern detected */
}

/* ============================================================================
 * PACKET MIRRORING (WIRESHARK ANALYSIS)
 * ============================================================================
 */

static void mirror_to_vdev(struct sk_buff *skb) {
    struct sk_buff *cloned_skb;

    vdev = dev_get_by_name(&init_net, "vdev0");
    if (!vdev)
        return;

    cloned_skb = skb_clone(skb, GFP_ATOMIC);
    if (!cloned_skb) {
        dev_put(vdev);
        return;
    }

    cloned_skb->dev = vdev;
    netif_rx(cloned_skb);
    dev_put(vdev);
}

/* ============================================================================
 * NETFILTER HOOK HANDLERS
 * ============================================================================
 */

static unsigned int firewall_local_out(void *priv, struct sk_buff *skb,
                                       const struct nf_hook_state *state) {
    struct iphdr *iph;
    struct tcphdr *tcph;
    conn_entry_t *conn_entry;

    if (!skb)
        return NF_ACCEPT;

    iph = ip_hdr(skb);
    if (!iph || iph->protocol != IPPROTO_TCP)
        return NF_ACCEPT;

    tcph = (struct tcphdr *)((unsigned char *)iph + iph->ihl * 4);

    /* Check if destination is blacklisted */
    if (is_blacklisted(iph->daddr, tcph->dest)) {
        printk(KERN_WARNING "[FIREWALL] DROPPING: Destination %pI4:%u is blacklisted\n",
               &iph->daddr, ntohs(tcph->dest));
        return NF_DROP;
    }

    /* Track new connections (SYN packets) */
    if (tcph->syn && !tcph->ack) {
        conn_insert(iph->saddr, iph->daddr, tcph->source, tcph->dest, IPPROTO_TCP);
    }

    /* Update connection state */
    conn_entry = conn_lookup(iph->saddr, iph->daddr, tcph->source, tcph->dest);
    if (conn_entry) {
        conn_entry->packets_seen++;
        conn_entry->bytes_seen += skb->len;
        conn_update_state(conn_entry, tcph);
    }

    /* DPI Inspection for outgoing traffic */
    if (dpi_inspect(skb, iph, tcph)) {
        printk(KERN_WARNING "[FIREWALL-DPI] DROPPING packet from %pI4:%u due to payload match\n",
               &iph->saddr, ntohs(tcph->source));
        return NF_DROP;
    }

    /* Mirror packet to vdev0 for analysis */
    mirror_to_vdev(skb);

    return NF_ACCEPT;
}

static unsigned int firewall_pre_routing(void *priv, struct sk_buff *skb,
                                         const struct nf_hook_state *state) {
    struct iphdr *iph;
    struct tcphdr *tcph;
    conn_entry_t *conn_entry;

    if (!skb)
        return NF_ACCEPT;

    iph = ip_hdr(skb);
    if (!iph || iph->protocol != IPPROTO_TCP)
        return NF_ACCEPT;

    tcph = (struct tcphdr *)((unsigned char *)iph + iph->ihl * 4);

    /* Check if source is blacklisted */
    if (is_blacklisted(iph->saddr, tcph->source)) {
        printk(KERN_WARNING "[FIREWALL] DROPPING: Source %pI4:%u is blacklisted\n",
               &iph->saddr, ntohs(tcph->source));
        return NF_DROP;
    }

    /* Track incoming connections (SYN+ACK response) */
    conn_entry = conn_lookup(iph->daddr, iph->saddr, tcph->dest, tcph->source);
    if (conn_entry) {
        conn_entry->packets_seen++;
        conn_entry->bytes_seen += skb->len;
        conn_update_state(conn_entry, tcph);
    }

    /* DPI Inspection for incoming traffic */
    if (dpi_inspect(skb, iph, tcph)) {
        printk(KERN_WARNING "[FIREWALL-DPI] DROPPING packet from %pI4:%u due to payload match\n",
               &iph->saddr, ntohs(tcph->source));
        return NF_DROP;
    }

    /* Mirror packet to vdev0 for analysis */
    mirror_to_vdev(skb);

    return NF_ACCEPT;
}

/* ============================================================================
 * NETLINK HANDLERS FOR USER-SPACE CONTROL
 * ============================================================================
 */

#define NETLINK_FIREWALL_CUSTOM    27
#define FIREWALL_CMD_ADD_BLACKLIST      1
#define FIREWALL_CMD_REMOVE_BLACKLIST   2
#define FIREWALL_CMD_LIST_CONNECTIONS   3
#define FIREWALL_CMD_CLEAR_CONNECTIONS  4

typedef struct {
    __be32 ip;
    __be16 port;
    uint8_t command;
} firewall_msg_t;

static void firewall_netlink_recv(struct sk_buff *skb) {
    struct nlmsghdr *nlh;
    firewall_msg_t *msg;
    int res;

    nlh = nlmsg_hdr(skb);
    if (nlh->nlmsg_len < NLMSG_LENGTH(sizeof(firewall_msg_t))) {
        return;
    }

    msg = (firewall_msg_t *)nlmsg_data(nlh);
    nl_pid = nlh->nlmsg_pid;

    switch(msg->command) {
        case FIREWALL_CMD_ADD_BLACKLIST:
            res = blacklist_add(msg->ip, msg->port, 0);
            printk(KERN_INFO "[FIREWALL-NETLINK] Add blacklist: %pI4:%u (result=%d)\n",
                   &msg->ip, ntohs(msg->port), res);
            break;

        case FIREWALL_CMD_REMOVE_BLACKLIST:
            res = blacklist_remove(msg->ip, msg->port);
            printk(KERN_INFO "[FIREWALL-NETLINK] Remove blacklist: %pI4:%u (result=%d)\n",
                   &msg->ip, ntohs(msg->port), res);
            break;

        case FIREWALL_CMD_LIST_CONNECTIONS:
            printk(KERN_INFO "[FIREWALL-NETLINK] List connections requested\n");
            break;

        case FIREWALL_CMD_CLEAR_CONNECTIONS:
            printk(KERN_INFO "[FIREWALL-NETLINK] Clear connections requested\n");
            break;

        default:
            printk(KERN_WARNING "[FIREWALL-NETLINK] Unknown command: %u\n", msg->command);
    }
}

static struct netlink_kernel_cfg cfg = {
    .input = firewall_netlink_recv,
};

/* ============================================================================
 * MODULE INITIALIZATION & CLEANUP
 * ============================================================================
 */

static struct nf_hook_ops firewall_hooks[] = {
    {
        .hook = firewall_local_out,
        .pf = PF_INET,
        .hooknum = NF_INET_LOCAL_OUT,
        .priority = NF_IP_PRI_FIRST,
    },
    {
        .hook = firewall_pre_routing,
        .pf = PF_INET,
        .hooknum = NF_INET_PRE_ROUTING,
        .priority = NF_IP_PRI_FIRST,
    },
};

static int __init firewall_init(void) {
    int ret;

    printk(KERN_INFO "========================================\n");
    printk(KERN_INFO "Stateful Firewall with DPI Loading...\n");
    printk(KERN_INFO "========================================\n");

    /* Initialize hash tables */
    hash_init(conn_table);
    hash_init(blacklist_table);
    spin_lock_init(&conn_table_lock);
    spin_lock_init(&blacklist_table_lock);

    /* Register Netfilter hooks */
    ret = nf_register_net_hooks(&init_net, firewall_hooks, ARRAY_SIZE(firewall_hooks));
    if (ret < 0) {
        printk(KERN_ERR "[FIREWALL] Failed to register netfilter hooks: %d\n", ret);
        return ret;
    }

    /* Create Netlink socket */
    nl_sock = netlink_kernel_create(&init_net, NETLINK_FIREWALL_CUSTOM, &cfg);
    if (!nl_sock) {
        printk(KERN_ERR "[FIREWALL] Failed to create netlink socket\n");
        nf_unregister_net_hooks(&init_net, firewall_hooks, ARRAY_SIZE(firewall_hooks));
        return -ENOMEM;
    }

    printk(KERN_INFO "[FIREWALL] Module initialized successfully\n");
    printk(KERN_INFO "[FIREWALL] Netlink protocol: %d\n", NETLINK_FIREWALL_CUSTOM);
    printk(KERN_INFO "[FIREWALL] Connection tracking table: %u buckets\n", 1 << CONN_TABLE_BITS);
    printk(KERN_INFO "[FIREWALL] Blacklist table: %u buckets\n", 1 << BLACKLIST_BITS);

    return 0;
}

static void __exit firewall_exit(void) {
    conn_entry_t *entry;
    blacklist_entry_t *bl_entry;
    struct hlist_node *tmp;
    unsigned long flags;
    int i;

    printk(KERN_INFO "========================================\n");
    printk(KERN_INFO "Stateful Firewall Unloading...\n");
    printk(KERN_INFO "========================================\n");

    /* Unregister hooks */
    nf_unregister_net_hooks(&init_net, firewall_hooks, ARRAY_SIZE(firewall_hooks));

    /* Cleanup netlink socket */
    if (nl_sock) {
        netlink_kernel_release(nl_sock);
    }

    /* Cleanup connection table */
    spin_lock_irqsave(&conn_table_lock, flags);
    for (i = 0; i < (1 << CONN_TABLE_BITS); i++) {
        hlist_for_each_entry_safe(entry, tmp, &conn_table[i], node) {
            hlist_del_rcu(&entry->node);
            kfree(entry);
        }
    }
    spin_unlock_irqrestore(&conn_table_lock, flags);

    /* Cleanup blacklist table */
    spin_lock_irqsave(&blacklist_table_lock, flags);
    for (i = 0; i < (1 << BLACKLIST_BITS); i++) {
        hlist_for_each_entry_safe(bl_entry, tmp, &blacklist_table[i], node) {
            hlist_del_rcu(&bl_entry->node);
            kfree(bl_entry);
        }
    }
    spin_unlock_irqrestore(&blacklist_table_lock, flags);

    synchronize_rcu();

    printk(KERN_INFO "[FIREWALL] Module unloaded\n");
}

module_init(firewall_init);
module_exit(firewall_exit);
