.PHONY: build clean test-wayland follow-log

zip = tactile@lundal.io.zip
schema = schemas/gschemas.compiled

build: $(zip)

install: $(zip)
	mkdir -p ~/.local/share/gnome-shell/extensions/tactile@lundal.io/
	unzip -o $(zip) -d ~/.local/share/gnome-shell/extensions/tactile@lundal.io/

clean:
	rm -f $(zip) $(schema)

$(zip): *.json *.js preferences/*.js *.css schemas/*.xml $(schema)
	zip - $^ > $@

$(schema): schemas/*.xml
	glib-compile-schemas --strict schemas

test-wayland:
	dbus-run-session -- gnome-shell --nested --wayland

follow-log:
	journalctl -f /usr/bin/gnome-shell
