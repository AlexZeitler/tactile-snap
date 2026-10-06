.PHONY: build clean test-wayland follow-log

zip = tactile-snap@alexanderzeitler.com.zip

build: $(zip)

install: $(zip)
	gnome-extensions uninstall tactile-snap@alexanderzeitler.com || rm -rf ~/.local/share/gnome-shell/extensions/tactile-snap@alexanderzeitler.com/
	gnome-extensions install --force $(zip)

clean:
	npm run clean
	rm -f $(zip)

$(zip): $(wildcard src/*)
	npm ci --ignore-scripts
	npm run check
	npm run build
	(cd build && zip -r - *) > $@

test-wayland:
	dbus-run-session gnome-shell --devkit --wayland

follow-log:
	journalctl -f /usr/bin/gnome-shell

shexli: $(zip)
	virtualenv .venv && source .venv/bin/activate && pip install --upgrade shexli && shexli $(zip)
