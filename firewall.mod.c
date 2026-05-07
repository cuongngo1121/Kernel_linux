#include <linux/module.h>
#include <linux/export-internal.h>
#include <linux/compiler.h>

MODULE_INFO(name, KBUILD_MODNAME);

__visible struct module __this_module
__section(".gnu.linkonce.this_module") = {
	.name = KBUILD_MODNAME,
	.init = init_module,
#ifdef CONFIG_MODULE_UNLOAD
	.exit = cleanup_module,
#endif
	.arch = MODULE_ARCH_INIT,
};



static const struct modversion_info ____versions[]
__used __section("__versions") = {
	{ 0x147bf2b7, "memcmp" },
	{ 0xe8213e80, "_printk" },
	{ 0x90a48d82, "__ubsan_handle_out_of_bounds" },
	{ 0x0e023ac7, "memset" },
	{ 0xa00ba4ac, "init_net" },
	{ 0x2173e9bf, "nf_register_net_hooks" },
	{ 0xaf2a7539, "__netlink_kernel_create" },
	{ 0xcb7ed2a8, "nf_unregister_net_hooks" },
	{ 0xb8692b2f, "netlink_kernel_release" },
	{ 0xe1e1f979, "_raw_spin_lock_irqsave" },
	{ 0xcb8b6ec6, "kfree" },
	{ 0x81a1a811, "_raw_spin_unlock_irqrestore" },
	{ 0xd272d446, "synchronize_rcu" },
	{ 0x058c185a, "jiffies" },
	{ 0xd272d446, "dynamic_preempt_schedule_notrace" },
	{ 0xa3853d61, "dev_get_by_name" },
	{ 0x18bf38b0, "skb_clone" },
	{ 0x61c25528, "netif_rx" },
	{ 0xd272d446, "__rcu_read_lock" },
	{ 0xd272d446, "__rcu_read_unlock" },
	{ 0xbd03ed67, "random_kmalloc_seed" },
	{ 0xe8f59cda, "kmalloc_caches" },
	{ 0x1269973e, "__kmalloc_cache_noprof" },
	{ 0xd272d446, "__stack_chk_fail" },
	{ 0x7d435000, "module_layout" },
};

static const u32 ____version_ext_crcs[]
__used __section("__version_ext_crcs") = {
	0x147bf2b7,
	0xe8213e80,
	0x90a48d82,
	0x0e023ac7,
	0xa00ba4ac,
	0x2173e9bf,
	0xaf2a7539,
	0xcb7ed2a8,
	0xb8692b2f,
	0xe1e1f979,
	0xcb8b6ec6,
	0x81a1a811,
	0xd272d446,
	0x058c185a,
	0xd272d446,
	0xa3853d61,
	0x18bf38b0,
	0x61c25528,
	0xd272d446,
	0xd272d446,
	0xbd03ed67,
	0xe8f59cda,
	0x1269973e,
	0xd272d446,
	0x7d435000,
};
static const char ____version_ext_names[]
__used __section("__version_ext_names") =
	"memcmp\0"
	"_printk\0"
	"__ubsan_handle_out_of_bounds\0"
	"memset\0"
	"init_net\0"
	"nf_register_net_hooks\0"
	"__netlink_kernel_create\0"
	"nf_unregister_net_hooks\0"
	"netlink_kernel_release\0"
	"_raw_spin_lock_irqsave\0"
	"kfree\0"
	"_raw_spin_unlock_irqrestore\0"
	"synchronize_rcu\0"
	"jiffies\0"
	"dynamic_preempt_schedule_notrace\0"
	"dev_get_by_name\0"
	"skb_clone\0"
	"netif_rx\0"
	"__rcu_read_lock\0"
	"__rcu_read_unlock\0"
	"random_kmalloc_seed\0"
	"kmalloc_caches\0"
	"__kmalloc_cache_noprof\0"
	"__stack_chk_fail\0"
	"module_layout\0"
;

MODULE_INFO(depends, "");


MODULE_INFO(srcversion, "5C065FC9AB1AF5313FA2FF9");
