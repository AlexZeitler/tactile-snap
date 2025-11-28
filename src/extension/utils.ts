import type Meta from "gi://Meta";

import { Area } from "../common/area.js";

export function getNumMonitors(): number {
    return global.workspace_manager.get_active_workspace().get_display().get_n_monitors();
}

export function getWorkAreaForMonitor(monitor: number): Area {
    const rect = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor);
    return Area.fromRectangle(rect);
}

export function isEntireWorkAreaWidth(area: Area): boolean {
    const monitors = getNumMonitors();
    for (let i = 0; i < monitors; i++) {
        const workarea = getWorkAreaForMonitor(i);
        if (area.isWithin(workarea) && area.isEqualHorizontally(workarea)) {
            return true;
        }
    }
    return false;
}

export function isEntireWorkAreaHeight(area: Area): boolean {
    const monitors = getNumMonitors();
    for (let i = 0; i < monitors; i++) {
        const workarea = getWorkAreaForMonitor(i);
        if (area.isWithin(workarea) && area.isEqualVertically(workarea)) {
            return true;
        }
    }
    return false;
}

export function getActiveWindow(): Meta.Window | undefined {
    return global.workspace_manager
        .get_active_workspace()
        .list_windows()
        .find((window) => window.has_focus());
}
