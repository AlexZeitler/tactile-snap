import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { Area } from "./common/area.js";
import { Layout } from "./common/layout.js";
import { Styles } from "./common/styles.js";

type TileDef = {
    id: string;
    area: Area;
    actor: Clutter.Actor;
};

const Tile = GObject.registerClass(
    class Tile extends St.BoxLayout {
        constructor(area: Area, name: string, styles: Styles) {
            super({
                style_class: "tile",
                style:
                    `border-color: ${styles.borderColor};` +
                    `background-color: ${styles.backgroundColor};` +
                    `border-width: ${styles.borderSize}px;`,
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
            });

            const label = new St.Label({
                style_class: "name",
                style: `color: ${styles.textColor}; font-size: ${styles.textSize}px;`,
                text: name.toUpperCase(),
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(label);
        }
    },
);

export default class TactileExtension extends Extension {
    _tiles?: TileDef[];
    _window?: Meta.Window;
    _monitor?: number;
    _tile?: TileDef;
    _date?: number;
    _sourceIds?: number[];
    _settings?: Gio.Settings;

    enable(): void {
        this._tiles = [];
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
        this._tiles = undefined;
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
        if (this._tiles!.length > 0) {
            this.discardTiles();
        } else {
            this.displayTiles();
        }
    }

    onHideTiles(): void {
        if (this._tiles!.length > 0) {
            this.discardTiles();
        }
    }

    onActivateTile(tile: TileDef): void {
        const lastTile = this._tile;
        const lastDate = this._date;

        // Assume this is the first tile if more than one second of inactivity
        if (!lastDate || lastDate + 1000 < Date.now()) {
            this._tile = tile;
            this._date = Date.now();
            return;
        }
        // Once two tiles are activated, move the window
        this.moveWindow(this._window!, lastTile!.area.combineWith(tile.area));
        this.discardTiles();

        this._tile = undefined;
        this._date = undefined;
    }

    onNextMonitor(): void {
        if (this._monitor != undefined) {
            const nextMonitor = (this._monitor + 1) % this.getNumMonitors();
            this.discardTiles();
            this.displayTiles(nextMonitor);
        }
    }

    onPrevMonitor(): void {
        if (this._monitor != undefined) {
            const prevMonitor = (this._monitor - 1 + this.getNumMonitors()) % this.getNumMonitors();
            this.discardTiles();
            this.displayTiles(prevMonitor);
        }
    }

    onActivateLayout(n: number): void {
        // Save the new layout for current monitor
        this.saveMonitorLayout(this._settings!, this._monitor!, n);

        // Remember the active monitor and window
        const monitor = this._monitor;
        const window = this._window;

        this.discardTiles();
        this.displayTiles(monitor, window);
    }

    displayTiles(monitor?: number, window?: Meta.Window): void {
        this.debug("Display tiles (begin)");

        // Find active window
        const activeWindow = window ?? this.getActiveWindow();
        if (!activeWindow) {
            this.debug("No active window");
            return;
        }
        this.debug("Active window: " + activeWindow.get_title());
        const activeMonitor = monitor ?? activeWindow.get_monitor();
        this.debug("Active monitor: " + activeMonitor);

        // Create tiles
        const workarea = this.getWorkAreaForMonitor(activeMonitor);
        this.debug("Workarea: " + workarea.stringify());
        const layoutNumber = this.loadMonitorLayout(this._settings!, activeMonitor);
        this.debug("Layout: " + layoutNumber);
        const layout = Layout.fromSettings(this._settings!, layoutNumber);
        const tiles = this.createTiles(workarea, layout);
        if (tiles.length < 1) {
            this.debug("No tiles in layout");
            return;
        }

        // Save tiles and active window
        this._window = activeWindow;
        this._monitor = activeMonitor;
        this._tiles = tiles;

        // Display and bind keys
        this._tiles.forEach((tile) => {
            Main.layoutManager.uiGroup.add_child(tile.actor);
            this.bindKey(tile.id, () => this.onActivateTile(tile));
        });

        // Bind keys
        this.bindKey("hide-tiles", () => this.onHideTiles());
        this.bindKey("next-monitor", () => this.onNextMonitor());
        this.bindKey("prev-monitor", () => this.onPrevMonitor());
        this.bindKey("layout-1", () => this.onActivateLayout(1));
        this.bindKey("layout-2", () => this.onActivateLayout(2));
        this.bindKey("layout-3", () => this.onActivateLayout(3));
        this.bindKey("layout-4", () => this.onActivateLayout(4));

        this.debug("Display tiles (finish)");
    }

    discardTiles(): void {
        this.debug("Discard tiles (begin)");

        // Unbind keys
        this.unbindKey("layout-4");
        this.unbindKey("layout-3");
        this.unbindKey("layout-2");
        this.unbindKey("layout-1");
        this.unbindKey("prev-monitor");
        this.unbindKey("next-monitor");
        this.unbindKey("hide-tiles");

        // Discard and unbind keys
        this._tiles!.forEach((tile) => {
            this.unbindKey(tile.id);
            Main.layoutManager.uiGroup.remove_child(tile.actor);
            tile.actor.destroy();
        });

        // Clear tiles and active window
        this._tiles = [];
        this._monitor = undefined;
        this._window = undefined;

        this.debug("Discard tiles (finish)");
    }

    saveMonitorLayout(settings: Gio.Settings, monitor: number, layout: number): void {
        settings.set_int(`monitor-${monitor}-layout`, layout);
    }

    loadMonitorLayout(settings: Gio.Settings, monitor: number): number {
        return settings.get_int(`monitor-${monitor}-layout`);
    }

    createTiles(workarea: Area, layout: Layout): TileDef[] {
        const styles = Styles.fromSettings(this._settings!);
        const tiles: TileDef[] = [];

        layout.cols.forEach((col_weight, col) => {
            layout.rows.forEach((row_weight, row) => {
                if (col_weight < 1 || row_weight < 1) {
                    return;
                }
                const id = `tile-${col}-${row}`;
                const name = this._settings!.get_strv(id)[0] || "";
                const area = workarea.subarea(layout, col, row);
                const tile = { id: id, area: area, actor: new Tile(area, name, styles) };
                tiles.push(tile);
            });
        });

        return tiles;
    }

    moveWindow(window: Meta.Window, area: Area) {
        if (!window) {
            return;
        }

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
            if (this.isEntireWorkAreaWidth(area)) {
                window.maximize(Meta.MaximizeFlags.HORIZONTAL);
            } else {
                window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            }

            if (this.isEntireWorkAreaHeight(area)) {
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

        let attempts = 0;
        const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
            const windowArea = Area.fromRectangle(window.get_frame_rect());
            this.debug(`Window area: ${windowArea.stringify()} (attempt ${attempts})`);

            if (windowArea.isEqual(area)) {
                this.removeSourceFromList(sourceId);
                return GLib.SOURCE_REMOVE;
            }

            if (attempts % 2 === 0) {
                window.move_frame(true, area.x, area.y);
            } else {
                window.move_resize_frame(true, area.x, area.y, area.width, area.height);
            }

            if (attempts++ >= 5) {
                this.removeSourceFromList(sourceId);
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        });
        this.addSourceToList(sourceId);
    }

    isEntireWorkAreaWidth(area: Area): boolean {
        const monitors = this.getNumMonitors();
        for (let i = 0; i < monitors; i++) {
            const workarea = this.getWorkAreaForMonitor(i);
            if (area.isWithin(workarea) && area.isEqualHorizontally(workarea)) {
                return true;
            }
        }
        return false;
    }

    isEntireWorkAreaHeight(area: Area): boolean {
        const monitors = this.getNumMonitors();
        for (let i = 0; i < monitors; i++) {
            const workarea = this.getWorkAreaForMonitor(i);
            if (area.isWithin(workarea) && area.isEqualVertically(workarea)) {
                return true;
            }
        }
        return false;
    }

    getNumMonitors(): number {
        return global.workspace_manager.get_active_workspace().get_display().get_n_monitors();
    }

    getWorkAreaForMonitor(monitor: number): Area {
        const rect = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor);
        return Area.fromRectangle(rect);
    }

    getActiveWindow(): Meta.Window | undefined {
        return global.workspace_manager
            .get_active_workspace()
            .list_windows()
            .find((window) => window.has_focus());
    }

    debug(message: string): void {
        if (this._settings!.get_boolean("debug")) {
            log("Tactile: " + message);
        }
    }
}
