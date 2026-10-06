import Gio from "gi://Gio";
import Meta from "gi://Meta";

import { Area } from "../common/area.js";
import { Layout } from "../common/layout.js";
import { Slot, effectiveSlots, isSlotVisible } from "../common/slots.js";
import { getWorkAreaForMonitor } from "./utils.js";

type MoveWindowFn = (window: Meta.Window, area: Area) => void;
type DebugFn = (message: string) => void;

/**
 * Snaps new windows to the first free slot of the grid, and re-snaps windows
 * that are moved to another workspace. If every slot is occupied, the window
 * goes to the first slot.
 *
 * Slots come from the "auto-snap-slots" setting (list of (col, row, cols, rows),
 * in order of preference). If that list is empty, every visible cell is a slot.
 */
export class AutoSnap {
    private _settings: Gio.Settings;
    private _moveWindow: MoveWindowFn;
    private _debug: DebugFn;

    private _windowCreatedId?: number;
    /** Signal ids on tracked windows (workspace-changed, unmanaged). */
    private _windowSignals = new Map<Meta.Window, number[]>();
    /** Pending first-frame handlers on window actors of newly created windows. */
    private _pendingFirstFrame = new Map<Meta.WindowActor, number>();

    constructor(settings: Gio.Settings, moveWindow: MoveWindowFn, debug: DebugFn) {
        this._settings = settings;
        this._moveWindow = moveWindow;
        this._debug = debug;
    }

    enable(): void {
        this._windowCreatedId = global.display.connect(
            "window-created",
            (_display: Meta.Display, window: Meta.Window) => this.onWindowCreated(window),
        );

        // Windows that were already open before the extension was enabled
        global.get_window_actors().forEach((actor) => {
            if (actor.meta_window) this.trackWindow(actor.meta_window);
        });
    }

    disable(): void {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = undefined;
        }

        this._pendingFirstFrame.forEach((id, actor) => actor.disconnect(id));
        this._pendingFirstFrame.clear();

        [...this._windowSignals.keys()].forEach((window) => this.untrackWindow(window));
    }

    private isEnabled(): boolean {
        return this._settings.get_boolean("auto-snap");
    }

    private isSnappable(window: Meta.Window): boolean {
        return (
            window.get_window_type() === Meta.WindowType.NORMAL &&
            !window.get_transient_for() &&
            window.allows_resize() &&
            !window.is_fullscreen()
        );
    }

    private isFullyMaximized(window: Meta.Window): boolean {
        // GNOME 49 replaced maximized_horizontally/vertically with get_maximize_flags()
        const w = window as any;
        if (typeof w.get_maximize_flags === "function") {
            return w.get_maximize_flags() === Meta.MaximizeFlags.BOTH;
        }
        return w.maximized_horizontally && w.maximized_vertically;
    }

    private onWindowCreated(window: Meta.Window): void {
        if (!this.isSnappable(window)) return;

        const actor = window.get_compositor_private() as Meta.WindowActor | null;
        if (!actor) {
            this._debug("AutoSnap: no actor for new window, skipping");
            return;
        }

        // Only after the first frame does the window have its real geometry.
        // Tracking also starts here, so the initial workspace assignment does
        // not trigger a second snap.
        const id = actor.connect("first-frame", () => {
            actor.disconnect(id);
            this._pendingFirstFrame.delete(actor);

            if (this.isEnabled()) {
                this.snapToGrid(window);
            }
            this.trackWindow(window);
        });
        this._pendingFirstFrame.set(actor, id);
    }

    private trackWindow(window: Meta.Window): void {
        if (this._windowSignals.has(window) || !this.isSnappable(window)) return;

        this._windowSignals.set(window, [
            window.connect("workspace-changed", () => this.onWorkspaceChanged(window)),
            window.connect("unmanaged", () => this.untrackWindow(window)),
        ]);
    }

    private untrackWindow(window: Meta.Window): void {
        this._windowSignals.get(window)?.forEach((id) => window.disconnect(id));
        this._windowSignals.delete(window);
    }

    private onWorkspaceChanged(window: Meta.Window): void {
        if (!this.isEnabled()) return;
        if (!window.get_workspace() || window.is_on_all_workspaces()) return;
        if (window.is_fullscreen() || this.isFullyMaximized(window)) return;

        this._debug("AutoSnap: workspace changed for " + window.get_title());
        this.snapToGrid(window);
    }

    private getSlots(layout: Layout): Slot[] {
        const configured = this._settings.get_value("auto-snap-slots").deepUnpack() as Slot[];

        if (configured.some((slot) => !isSlotVisible(layout, slot))) {
            this._debug("AutoSnap: ignored slots outside the grid or in hidden cells");
        }
        return effectiveSlots(layout, configured);
    }

    private slotArea(workArea: Area, layout: Layout, [c, r, w, h]: Slot): Area {
        return workArea.subarea(layout, c, r).combineWith(workArea.subarea(layout, c + w - 1, r + h - 1));
    }

    snapToGrid(window: Meta.Window): void {
        const workspace = window.get_workspace();
        if (!workspace) return;

        const monitor = window.get_monitor();
        const workArea = getWorkAreaForMonitor(monitor);
        const layout = Layout.fromSettings(this._settings, this._settings.get_int("auto-snap-layout"));
        const areas = this.getSlots(layout).map((slot) => this.slotArea(workArea, layout, slot));

        const others = workspace
            .list_windows()
            .filter(
                (w) =>
                    w !== window &&
                    w.get_monitor() === monitor &&
                    !w.minimized &&
                    w.get_window_type() === Meta.WindowType.NORMAL,
            )
            .map((w) => Area.fromRectangle(w.get_frame_rect()));

        // A slot counts as occupied if its center is covered by another window
        const free = areas.find((a) => {
            const cx = a.x + a.width / 2;
            const cy = a.y + a.height / 2;
            return !others.some((o) => cx >= o.x && cx < o.x + o.width && cy >= o.y && cy < o.y + o.height);
        });

        const target = free ?? areas[0];
        this._debug(`AutoSnap: ${window.get_title()} -> ${target.stringify()}${free ? "" : " (fallback)"}`);
        this._moveWindow(window, target);
    }
}
