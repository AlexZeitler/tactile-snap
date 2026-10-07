import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";

import { AppRule, NUM_LAYOUTS, loadAppRules, saveAppRules } from "../../common/appRules.js";
import { Area } from "../../common/area.js";
import { Layout } from "../../common/layout.js";
import { sumAll } from "../../common/arrays.js";
import { Slot, effectiveSlots } from "../../common/slots.js";

import { createCheckboxInput } from "../inputs/checkbox.js";

type ParseResult = { slots: Slot[] } | { error: string };

/** Layout and slots edited by the inputs, stored either for all applications or in a rule for one. */
interface SlotTarget {
    getLayout(): number;
    setLayout(layout: number): void;
    getSlots(): Slot[];
    setSlots(slots: Slot[]): void;
}

/** Registers a callback for every settings change. */
type Watch = (callback: () => void) => void;

export const AutoSnapPage = GObject.registerClass(
    class AutoSnapPage extends Adw.PreferencesPage {
        constructor(settings: Gio.Settings) {
            super({
                title: "Auto-snap",
                icon_name: "view-grid-symbolic",
                name: "AutoSnapPage",
            });

            const grid = new Gtk.Grid({
                halign: Gtk.Align.CENTER,
                margin_start: 12,
                margin_end: 12,
                margin_top: 12,
                margin_bottom: 12,
                column_spacing: 12,
                row_spacing: 12,
                visible: true,
            });

            const behaviorLabel = new Gtk.Label({
                label: "<b>Behavior</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(behaviorLabel, 0, 0, 1, 1);

            const autoSnapInput = createCheckboxInput(
                settings,
                "auto-snap",
                "Snap new windows to the first free grid slot",
            );
            grid.attach(autoSnapInput, 0, 1, 1, 1);

            const layoutLabel = new Gtk.Label({
                label: "<b>Layout</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(layoutLabel, 0, 2, 1, 1);

            const target = globalTarget(settings);
            const watch: Watch = (callback) => settings.connect("changed", callback);
            grid.attach(createLayoutInput(target, watch), 0, 3, 1, 1);

            const slotsLabel = new Gtk.Label({
                label: "<b>Slots</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(slotsLabel, 0, 4, 1, 1);
            grid.attach(createSlotsSection(settings, target, watch), 0, 5, 1, 1);

            const group = new Adw.PreferencesGroup();
            group.add(grid);
            this.add(group);

            this.add(createAppRulesGroup(settings, this));

            // Adw.PreferencesPage disables horizontal scrolling, but we need it
            // https://gitlab.gnome.org/GNOME/libadwaita/-/blob/main/src/adw-preferences-page.ui
            (this.get_first_child() as Gtk.ScrolledWindow).hscrollbar_policy = Gtk.PolicyType.AUTOMATIC;
        }
    },
);

function globalTarget(settings: Gio.Settings): SlotTarget {
    return {
        getLayout: () => settings.get_int("auto-snap-layout"),
        setLayout: (layout) => settings.set_int("auto-snap-layout", layout),
        getSlots: () => settings.get_value("auto-snap-slots").deepUnpack() as Slot[],
        setSlots: (slots) => settings.set_value("auto-snap-slots", new GLib.Variant("a(iiii)", slots)),
    };
}

function ruleTarget(settings: Gio.Settings, app: string): SlotTarget {
    function rule(): AppRule | undefined {
        return loadAppRules(settings).find((r) => r.app === app);
    }
    function update(change: Partial<AppRule>): void {
        saveAppRules(
            settings,
            loadAppRules(settings).map((r) => (r.app === app ? { ...r, ...change } : r)),
        );
    }
    return {
        getLayout: () => rule()?.layout ?? 1,
        setLayout: (layout) => update({ layout }),
        getSlots: () => rule()?.slots ?? [],
        setSlots: (slots) => update({ slots }),
    };
}

function createLayoutInput(target: SlotTarget, watch: Watch): Gtk.DropDown {
    const names = Array.from({ length: NUM_LAYOUTS }, (_, i) => `Layout ${i + 1}`);
    const dropdown = Gtk.DropDown.new_from_strings(names);
    dropdown.halign = Gtk.Align.CENTER;

    function syncFromSettings(): void {
        dropdown.selected = target.getLayout() - 1;
    }
    syncFromSettings();

    dropdown.connect("notify::selected", () => {
        const n = dropdown.selected + 1;
        if (target.getLayout() !== n) {
            target.setLayout(n);
        }
    });
    watch(syncFromSettings);

    return dropdown;
}

function createSlotsSection(settings: Gio.Settings, target: SlotTarget, watch: Watch): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true,
    });

    const entry = new Gtk.Entry({
        halign: Gtk.Align.CENTER,
        placeholder_text: "e.g. QX EV",
        width_chars: 24,
        visible: true,
    });
    grid.attach(entry, 0, 0, 1, 1);

    const errorLabel = new Gtk.Label({
        css_classes: ["error"],
        visible: false,
    });
    grid.attach(errorLabel, 0, 1, 1, 1);

    const hint = new Gtk.Label({
        label:
            "Type two tiles per slot, separated by spaces, in order of preference. Press Enter to save.\n" +
            "Leave empty to use every tile as a slot. Numbers in the preview show the order.",
        justify: Gtk.Justification.CENTER,
        visible: true,
    });
    grid.attach(hint, 0, 2, 1, 1);

    const preview = createPreviewWidget(settings, target, watch);
    grid.attach(preview, 0, 3, 1, 1);

    function currentLayout(): Layout {
        return Layout.fromSettings(settings, target.getLayout());
    }

    function validate(): ParseResult {
        const result = parseSlots(entry.text, visibleTiles(settings, currentLayout()));
        if ("error" in result) {
            errorLabel.label = result.error;
            errorLabel.visible = true;
            entry.add_css_class("error");
        } else {
            errorLabel.visible = false;
            entry.remove_css_class("error");
        }
        return result;
    }

    let shownSlots = JSON.stringify(target.getSlots());
    entry.text = formatSlots(settings, target.getSlots());

    entry.connect("activate", () => {
        const result = validate();
        if ("slots" in result) {
            target.setSlots(result.slots);
        }
    });

    watch(() => {
        const slots = target.getSlots();
        if (JSON.stringify(slots) !== shownSlots) {
            shownSlots = JSON.stringify(slots);
            entry.text = formatSlots(settings, slots);
        }
        // The layout or the tile keys may have changed, so the text may no longer fit
        validate();
    });

    return grid;
}

function createPreviewWidget(settings: Gio.Settings, target: SlotTarget, watch: Watch): Gtk.Grid {
    const grid = new Gtk.Grid({
        column_homogeneous: true,
        row_homogeneous: true,
        width_request: 480,
        height_request: 240,
        visible: true,
    });

    let tiles: Gtk.Label[] = [];

    function discardTiles(): void {
        tiles.forEach((tile) => grid.remove(tile));
        tiles = [];
    }

    function createTiles(): void {
        const layout = Layout.fromSettings(settings, target.getLayout());
        const slots = effectiveSlots(layout, target.getSlots());
        const tablearea = new Area(0, 0, sumAll(layout.cols), sumAll(layout.rows));

        layout.cols.forEach((colWeight, col) => {
            layout.rows.forEach((rowWeight, row) => {
                if (colWeight < 1 || rowWeight < 1) {
                    return;
                }
                const name = settings.get_strv(`tile-${col}-${row}`)[0] || "";
                const numbers = slots
                    .map((slot, index) => (containsCell(slot, col, row) ? `${index + 1}` : ""))
                    .filter((number) => number !== "")
                    .join(", ");
                const area = tablearea.subareaIgnoreGaps(layout, col, row);

                const tile = new Gtk.Label({
                    halign: Gtk.Align.FILL,
                    label: numbers ? `${name.toUpperCase()}\n${numbers}` : name.toUpperCase(),
                    justify: Gtk.Justification.CENTER,
                    visible: true,
                });
                tile.get_style_context().add_class("tile");

                grid.attach(tile, area.x, area.y, area.width, area.height);
                tiles.push(tile);
            });
        });
    }

    createTiles();

    watch(() => {
        discardTiles();
        createTiles();
    });

    return grid;
}

function containsCell([c, r, w, h]: Slot, col: number, row: number): boolean {
    return col >= c && col < c + w && row >= r && row < r + h;
}

/** The character typed for a tile, upper-cased, or undefined if its key prints nothing. */
function tileChar(settings: Gio.Settings, col: number, row: number): string | undefined {
    const name = settings.get_strv(`tile-${col}-${row}`)[0];
    if (!name) {
        return undefined;
    }
    const [ok, keyval] = Gtk.accelerator_parse(name);
    const code = ok ? Gdk.keyval_to_unicode(keyval) : 0;
    return code > 0 ? String.fromCodePoint(code).toUpperCase() : undefined;
}

/** Tile characters of the visible cells, mapped to [col, row]. */
function visibleTiles(settings: Gio.Settings, layout: Layout): Map<string, [number, number]> {
    const tiles = new Map<string, [number, number]>();
    layout.rows.forEach((rowWeight, row) => {
        layout.cols.forEach((colWeight, col) => {
            if (colWeight < 1 || rowWeight < 1) {
                return;
            }
            const char = tileChar(settings, col, row);
            if (char && !tiles.has(char)) {
                tiles.set(char, [col, row]);
            }
        });
    });
    return tiles;
}

/** Parses "QX EV" into slots. Two tiles span a slot, like typing them after Super+T. */
function parseSlots(text: string, tiles: Map<string, [number, number]>): ParseResult {
    const slots: Slot[] = [];
    for (const token of text
        .trim()
        .split(/\s+/)
        .filter((t) => t !== "")) {
        const chars = [...token.toUpperCase()];
        if (chars.length !== 2) {
            return { error: `"${token}": a slot needs exactly two tiles` };
        }
        const missing = chars.find((char) => !tiles.has(char));
        if (missing !== undefined) {
            return { error: `"${token}": there is no tile "${missing}" in this layout` };
        }
        const [[c1, r1], [c2, r2]] = chars.map((char) => tiles.get(char)!);
        slots.push([Math.min(c1, c2), Math.min(r1, r2), Math.abs(c1 - c2) + 1, Math.abs(r1 - r2) + 1]);
    }
    return { slots };
}

/** Formats slots as tile pairs, e.g. "QX EV". */
function formatSlots(settings: Gio.Settings, slots: Slot[]): string {
    return slots
        .map(([c, r, w, h]) => (tileChar(settings, c, r) ?? "?") + (tileChar(settings, c + w - 1, r + h - 1) ?? "?"))
        .join(" ");
}

function createAppRulesGroup(settings: Gio.Settings, parent: Gtk.Widget): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: "Applications",
        description: "Windows of these applications use their own layout and slots.",
    });

    const addButton = new Gtk.Button({
        icon_name: "list-add-symbolic",
        tooltip_text: "Add application",
        valign: Gtk.Align.CENTER,
        css_classes: ["flat"],
    });
    addButton.connect("clicked", () => {
        const rules = loadAppRules(settings);
        openAppChooser(
            parent,
            rules.map((rule) => rule.app),
            (app) => {
                const id = app.get_id()!;
                saveAppRules(settings, [
                    ...rules,
                    { app: id, layout: settings.get_int("auto-snap-layout"), slots: [] },
                ]);
                openRuleDialog(settings, parent, id, app.get_display_name());
            },
        );
    });
    group.header_suffix = addButton;

    let rows: Gtk.Widget[] = [];

    function discardRows(): void {
        rows.forEach((row) => group.remove(row));
        rows = [];
    }

    function createRows(): void {
        const apps = installedApps();
        loadAppRules(settings).forEach((rule) => {
            const app = apps.find((a) => a.get_id() === rule.app);
            const name = app?.get_display_name() ?? rule.app;
            const slots = rule.slots.length > 0 ? formatSlots(settings, rule.slots) : "every tile";

            const row = new Adw.ActionRow({
                title: name,
                subtitle: `Layout ${rule.layout} · ${slots}`,
                use_markup: false,
                activatable: true,
            });
            row.add_prefix(createAppIcon(app));

            const removeButton = new Gtk.Button({
                icon_name: "user-trash-symbolic",
                tooltip_text: "Remove",
                valign: Gtk.Align.CENTER,
                css_classes: ["flat"],
            });
            removeButton.connect("clicked", () => {
                saveAppRules(
                    settings,
                    loadAppRules(settings).filter((r) => r.app !== rule.app),
                );
            });
            row.add_suffix(removeButton);

            row.connect("activated", () => openRuleDialog(settings, parent, rule.app, name));

            group.add(row);
            rows.push(row);
        });
    }

    createRows();

    settings.connect("changed", () => {
        discardRows();
        createRows();
    });

    return group;
}

/** Installed applications that appear in the application overview, sorted by name. */
function installedApps(): Gio.AppInfo[] {
    return Gio.AppInfo.get_all()
        .filter((app) => app.should_show() && app.get_id())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
}

function createAppIcon(app: Gio.AppInfo | undefined): Gtk.Image {
    const icon = app?.get_icon();
    return icon
        ? new Gtk.Image({ gicon: icon, pixel_size: 32 })
        : new Gtk.Image({ icon_name: "application-x-executable", pixel_size: 32 });
}

function createDialog(
    parent: Gtk.Widget,
    title: string,
    content: Gtk.Widget,
    width: number,
    height: number,
): Adw.Window {
    const toolbar = new Adw.ToolbarView({ content });
    toolbar.add_top_bar(new Adw.HeaderBar());

    return new Adw.Window({
        title,
        modal: true,
        transient_for: parent.get_root() as Gtk.Window,
        default_width: width,
        default_height: height,
        content: toolbar,
    });
}

/** Lets the user search the installed applications and choose one. */
function openAppChooser(parent: Gtk.Widget, excluded: string[], onChosen: (app: Gio.AppInfo) => void): void {
    const search = new Gtk.SearchEntry({
        placeholder_text: "Search applications",
    });

    const list = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        css_classes: ["boxed-list"],
        valign: Gtk.Align.START,
    });

    const appsByRow = new Map<Gtk.ListBoxRow, Gio.AppInfo>();
    installedApps()
        .filter((app) => !excluded.includes(app.get_id()!))
        .forEach((app) => {
            const row = new Adw.ActionRow({
                title: app.get_display_name(),
                use_markup: false,
                activatable: true,
            });
            row.add_prefix(createAppIcon(app));
            list.append(row);
            appsByRow.set(row, app);
        });

    list.set_filter_func((row) => {
        const app = appsByRow.get(row);
        const text = search.text.trim().toLowerCase();
        return (
            !!app && (app.get_display_name().toLowerCase().includes(text) || app.get_id()!.toLowerCase().includes(text))
        );
    });
    search.connect("search-changed", () => list.invalidate_filter());

    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_start: 12,
        margin_end: 12,
        margin_top: 12,
        margin_bottom: 12,
    });
    box.append(search);
    box.append(
        new Gtk.ScrolledWindow({
            child: list,
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        }),
    );

    const dialog = createDialog(parent, "Add Application", box, 420, 560);
    search.set_key_capture_widget(dialog);

    list.connect("row-activated", (_list: Gtk.ListBox, row: Gtk.ListBoxRow) => {
        const app = appsByRow.get(row);
        dialog.close();
        if (app) onChosen(app);
    });

    dialog.present();
    search.grab_focus();
}

/** Edits layout and slots of the rule for one application. */
function openRuleDialog(settings: Gio.Settings, parent: Gtk.Widget, app: string, name: string): void {
    const target = ruleTarget(settings, app);

    // The settings outlive the dialog, so its handlers are disconnected on close
    const handlerIds: number[] = [];
    const watch: Watch = (callback) => handlerIds.push(settings.connect("changed", callback));

    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        margin_start: 12,
        margin_end: 12,
        margin_top: 12,
        margin_bottom: 12,
        column_spacing: 12,
        row_spacing: 12,
    });

    grid.attach(new Gtk.Label({ label: "<b>Layout</b>", use_markup: true }), 0, 0, 1, 1);
    grid.attach(createLayoutInput(target, watch), 0, 1, 1, 1);
    grid.attach(new Gtk.Label({ label: "<b>Slots</b>", use_markup: true }), 0, 2, 1, 1);
    grid.attach(createSlotsSection(settings, target, watch), 0, 3, 1, 1);

    const dialog = createDialog(parent, name, new Gtk.ScrolledWindow({ child: grid }), 640, 560);
    dialog.connect("close-request", () => {
        handlerIds.forEach((id) => settings.disconnect(id));
        return false;
    });
    dialog.present();
}
