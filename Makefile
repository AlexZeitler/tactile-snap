.PHONY: build clean test-wayland follow-log

zip = tactile@lundal.io.zip
schema = src/schemas/gschemas.compiled

build: $(zip)

install: $(zip)
	mkdir -p ~/.local/share/gnome-shell/extensions/tactile@lundal.io/
	unzip -o $(zip) -d ~/.local/share/gnome-shell/extensions/tactile@lundal.io/

clean:
	npm run clean
	rm -f $(zip)

$(zip): $(wildcard src/*) $(schema)
	npm ci
	npm run build
	(cd build && zip -r - *) > $@

$(schema): src/schemas/*.xml
	glib-compile-schemas --strict src/schemas

test-wayland:
	dbus-run-session -- gnome-shell --nested --wayland

follow-log:
	journalctl -f /usr/bin/gnome-shell
