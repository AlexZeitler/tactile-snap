import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { Area } from "./common/area.js";
import { TileModal } from "./extension/tileModal.js";
import { getActiveWindow, isEntireWorkAreaHeight, isEntireWorkAreaWidth } from "./extension/utils.js";

export default class TactileExtension extends Extension {
    _modal?: St.Widget;
    _sourceIds?: number[];
    _settings?: Gio.Settings;

    enable(): void {
        this._sourceIds = [];
        this._settings = this.getSettings();

        this.bindKey("show-tiles", () => this.onShowTiles());
        this.bindKey("show-settings", () => this.openPreferences());
    }

    disable(): void {
        // In case the extension is disabled while sources are still active
        this.removeSources();

        // In case the extension is disabled while tiles are shown
        this.onHideTiles();

        this.unbindKey("show-tiles");
        this.unbindKey("show-settings");

        this._settings = undefined;
        this._sourceIds = undefined;
    }

    removeSources(): void {
        this._sourceIds!.forEach((sourceId) => GLib.Source.remove(sourceId));
    }

    addSourceToList(sourceId: number): void {
        this._sourceIds!.push(sourceId);
    }

    removeSourceFromList(sourceId: number): void {
        this._sourceIds = this._sourceIds!.filter((id) => id !== sourceId);
    }

    bindKey(key: string, callback: Meta.KeyHandlerFunc): void {
        Main.wm.addKeybinding(
            key,
            this._settings!,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            callback,
        );
    }

    unbindKey(key: string): void {
        Main.wm.removeKeybinding(key);
    }

    onShowTiles(): void {
        if (!this._modal) {
            this.displayTiles();
        }
    }

    onHideTiles(): void {
        if (this._modal) {
            this.discardTiles();
        }
    }

    displayTiles(): void {
        this.debug("Display tiles (begin)");

        // Find active window
        const activeWindow = getActiveWindow();
        if (!activeWindow) {
            this.debug("No active window");
            return;
        }
        this.debug("Active window: " + activeWindow.get_title());

        // Needs to be rebound with correct action mode after opening modal
        this.unbindKey("show-tiles");

        // Create modal
        this._modal = new TileModal(
            this._settings!,
            activeWindow,
            () => this.onHideTiles(),
            (window, area) => this.moveWindow(window, area),
        );

        this.debug("Display tiles (finish)");
    }

    discardTiles(): void {
        this.debug("Discard tiles (begin)");

        this._modal?.destroy();
        this._modal = undefined;

        // Needs to be rebound with correct action mode after closing modal
        this.bindKey("show-tiles", () => this.onShowTiles());

        this.debug("Discard tiles (finish)");
    }

    moveWindow(window: Meta.Window, area: Area) {
        this.debug("Target area: " + area.stringify());
        this.debug("Window area: " + Area.fromRectangle(window.get_frame_rect()).stringify());

        // GNOME has its own built-in tiling that is activated when pressing
        // Super+Left/Right. There does not appear to be any way to detect this
        // through the Meta APIs, so we always unmaximize to break the tiling.

        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        window.move_resize_frame(true, area.x, area.y, area.width, area.height);

        if (this._settings!.get_boolean("maximize")) {
            if (isEntireWorkAreaWidth(area)) {
                window.maximize(Meta.MaximizeFlags.HORIZONTAL);
            } else {
                window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            }

            if (isEntireWorkAreaHeight(area)) {
                window.maximize(Meta.MaximizeFlags.VERTICAL);
            } else {
                window.unmaximize(Meta.MaximizeFlags.VERTICAL);
            }
        }

        // In some cases move_resize_frame() will only resize the window, and we
        // must call move_frame() to move it. This usually happens when the
        // window's minimum size is larger than the selected area. Movement can
        // also be a bit glitchy on Wayland. We therefore make extra attempts,
        // alternating between move_frame() and move_resize_frame().

        let attempts = 1;
        const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
            const windowArea = Area.fromRectangle(window.get_frame_rect());
            this.debug(`Window area: ${windowArea.stringify()} (attempt ${attempts})`);

            if (attempts >= 5) {
                this.removeSourceFromList(sourceId);
                return GLib.SOURCE_REMOVE;
            }

            if (!windowArea.isEqual(area)) {
                if (attempts % 2 === 1) {
                    window.move_frame(true, area.x, area.y);
                } else {
                    window.move_resize_frame(true, area.x, area.y, area.width, area.height);
                }
            }

            attempts += 1;
            return GLib.SOURCE_CONTINUE;
        });
        this.addSourceToList(sourceId);
    }

    debug(message: string): void {
        if (this._settings!.get_boolean("debug")) {
            console.log("Tactile: " + message);
        }
    }
}
