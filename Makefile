.PHONY: build clean test-wayland follow-log

zip = tactile@lundal.io.zip

build: $(zip)

install: $(zip)
	mkdir -p ~/.local/share/gnome-shell/extensions/tactile@lundal.io/
	unzip -o $(zip) -d ~/.local/share/gnome-shell/extensions/tactile@lundal.io/

clean:
	npm run clean
	rm -f $(zip)

$(zip): $(wildcard src/*)
	npm ci
	npm run check
	npm run build
	(cd build && zip -r - *) > $@

test-wayland:
	dbus-run-session -- gnome-shell --nested --wayland

follow-log:
	journalctl -f /usr/bin/gnome-shell
