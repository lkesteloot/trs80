
# Copy and rename binaries to a folder for distribution.

BINARIES=binaries
DIST=$(BINARIES)/trs80-tool

.PHONY: dist
dist: $(DIST)/linux/trs80-tool
dist: $(DIST)/macos/trs80-tool
dist: $(DIST)/windows/trs80-tool.exe

.PHONY: rsync
rsync: dist
	rsync -aP $(DIST) lk@hitch.headcode.com:my-trs-80-website

.PHONY: clean
clean:
	rm -rf $(DIST)

$(DIST)/linux/trs80-tool: $(BINARIES)/main-linux
	mkdir -p $(shell dirname $@)
	cp -a $< $@

$(DIST)/macos/trs80-tool: $(BINARIES)/main-macos
	mkdir -p $(shell dirname $@)
	cp -a $< $@

$(DIST)/windows/trs80-tool.exe: $(BINARIES)/main-win.exe
	mkdir -p $(shell dirname $@)
	cp -a $< $@

