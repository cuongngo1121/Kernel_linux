obj-m += firewall.o

KDIR ?= /lib/modules/$(shell uname -r)/build
PWD := $(shell pwd)

all: modules

modules:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

modules_install:
	$(MAKE) -C $(KDIR) M=$(PWD) modules_install

firewall_control: firewall_control.c
	gcc -o firewall_control firewall_control.c

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean
	rm -f firewall_control