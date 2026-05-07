/*
 * Firewall Control Program - User-space Interface
 * ================================================
 * 
 * Communicates with the Stateful Firewall kernel module via Netlink socket.
 * Provides CLI interface to dynamically manage firewall rules.
 * 
 * Usage:
 *   ./firewall_control add_blacklist <IP> [<PORT>]
 *   ./firewall_control remove_blacklist <IP> [<PORT>]
 *   ./firewall_control list_connections
 *   ./firewall_control clear_connections
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <linux/netlink.h>
#include <linux/socket.h>
#include <sys/socket.h>

#define NETLINK_FIREWALL    27
#define FIREWALL_CMD_ADD_BLACKLIST      1
#define FIREWALL_CMD_REMOVE_BLACKLIST   2
#define FIREWALL_CMD_LIST_CONNECTIONS   3
#define FIREWALL_CMD_CLEAR_CONNECTIONS  4

typedef struct {
    __u32 ip;           /* Network byte order */
    __u16 port;         /* Network byte order */
    __u8 command;
} firewall_msg_t;

int main(int argc, char *argv[]) {
    int sock;
    struct sockaddr_nl src_addr, dest_addr;
    struct nlmsghdr *nlh = NULL;
    struct iovec iov;
    struct msghdr msg;
    firewall_msg_t *fw_msg;
    struct in_addr ip_addr;
    unsigned short port = 0;

    if (argc < 2) {
        fprintf(stderr, "Usage:\n");
        fprintf(stderr, "  %s add_blacklist <IP> [<PORT>]\n", argv[0]);
        fprintf(stderr, "  %s remove_blacklist <IP> [<PORT>]\n", argv[0]);
        fprintf(stderr, "  %s list_connections\n", argv[0]);
        fprintf(stderr, "  %s clear_connections\n", argv[0]);
        fprintf(stderr, "\nExamples:\n");
        fprintf(stderr, "  %s add_blacklist 192.168.1.100\n", argv[0]);
        fprintf(stderr, "  %s add_blacklist 192.168.1.100 8080\n", argv[0]);
        fprintf(stderr, "  %s remove_blacklist 192.168.1.100 8080\n", argv[0]);
        return 1;
    }

    /* Create Netlink socket */
    sock = socket(PF_NETLINK, SOCK_RAW, NETLINK_FIREWALL);
    if (sock < 0) {
        perror("[ERROR] socket");
        fprintf(stderr, "Note: Make sure the firewall kernel module is loaded\n");
        return 1;
    }

    memset(&src_addr, 0, sizeof(src_addr));
    src_addr.nl_family = AF_NETLINK;
    src_addr.nl_pid = getpid();
    src_addr.nl_groups = 0;

    if (bind(sock, (struct sockaddr *)&src_addr, sizeof(src_addr)) < 0) {
        perror("[ERROR] bind");
        close(sock);
        return 1;
    }

    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.nl_family = AF_NETLINK;
    dest_addr.nl_pid = 0;  /* Kernel module */
    dest_addr.nl_groups = 0;

    /* Allocate netlink message */
    nlh = (struct nlmsghdr *)malloc(NLMSG_SPACE(sizeof(firewall_msg_t)));
    if (!nlh) {
        perror("[ERROR] malloc");
        close(sock);
        return 1;
    }

    memset(nlh, 0, NLMSG_SPACE(sizeof(firewall_msg_t)));
    nlh->nlmsg_len = NLMSG_SPACE(sizeof(firewall_msg_t));
    nlh->nlmsg_pid = getpid();
    nlh->nlmsg_flags = 0;

    fw_msg = (firewall_msg_t *)NLMSG_DATA(nlh);

    /* Parse command */
    if (strcmp(argv[1], "add_blacklist") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Error: Missing IP address\n");
            free(nlh);
            close(sock);
            return 1;
        }

        if (inet_pton(AF_INET, argv[2], &ip_addr) <= 0) {
            fprintf(stderr, "Error: Invalid IP address: %s\n", argv[2]);
            free(nlh);
            close(sock);
            return 1;
        }

        fw_msg->ip = ip_addr.s_addr;  /* Already in network byte order */
        fw_msg->command = FIREWALL_CMD_ADD_BLACKLIST;

        if (argc >= 4) {
            port = htons(atoi(argv[3]));
            fw_msg->port = port;
            printf("[INFO] Adding %s:%u to blacklist...\n", argv[2], ntohs(port));
        } else {
            fw_msg->port = htons(0);  /* Block all ports on this IP */
            printf("[INFO] Adding %s (all ports) to blacklist...\n", argv[2]);
        }

    } else if (strcmp(argv[1], "remove_blacklist") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Error: Missing IP address\n");
            free(nlh);
            close(sock);
            return 1;
        }

        if (inet_pton(AF_INET, argv[2], &ip_addr) <= 0) {
            fprintf(stderr, "Error: Invalid IP address: %s\n", argv[2]);
            free(nlh);
            close(sock);
            return 1;
        }

        fw_msg->ip = ip_addr.s_addr;
        fw_msg->command = FIREWALL_CMD_REMOVE_BLACKLIST;

        if (argc >= 4) {
            port = htons(atoi(argv[3]));
            fw_msg->port = port;
            printf("[INFO] Removing %s:%u from blacklist...\n", argv[2], ntohs(port));
        } else {
            fw_msg->port = htons(0);
            printf("[INFO] Removing %s (all ports) from blacklist...\n", argv[2]);
        }

    } else if (strcmp(argv[1], "list_connections") == 0) {
        fw_msg->command = FIREWALL_CMD_LIST_CONNECTIONS;
        printf("[INFO] Requesting connection list from kernel...\n");

    } else if (strcmp(argv[1], "clear_connections") == 0) {
        fw_msg->command = FIREWALL_CMD_CLEAR_CONNECTIONS;
        printf("[INFO] Requesting to clear all connections...\n");

    } else {
        fprintf(stderr, "Error: Unknown command: %s\n", argv[1]);
        free(nlh);
        close(sock);
        return 1;
    }

    /* Send message to kernel */
    iov.iov_base = (void *)nlh;
    iov.iov_len = nlh->nlmsg_len;

    memset(&msg, 0, sizeof(msg));
    msg.msg_name = (void *)&dest_addr;
    msg.msg_namelen = sizeof(dest_addr);
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;

    if (sendmsg(sock, &msg, 0) < 0) {
        perror("[ERROR] sendmsg");
        free(nlh);
        close(sock);
        return 1;
    }

    printf("[SUCCESS] Message sent to kernel\n");
    printf("[INFO] Check kernel logs with: dmesg | tail -20\n");

    free(nlh);
    close(sock);
    return 0;
}
