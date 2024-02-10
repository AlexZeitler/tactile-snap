import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

type Shortcut = { id: string, desc: string };

const COLUMN_KEY = 0;
const COLUMN_MODS = 1;

const GENERAL_SHORTCUTS: Shortcut[] = [
    {id: 'show-tiles', desc: 'Show tiles'},
    {id: 'hide-tiles', desc: 'Hide tiles'},
    {id: 'next-monitor', desc: 'Move tiles to next monitor'},
    {id: 'prev-monitor', desc: 'Move tiles to previous monitor'},
    {id: 'show-settings', desc: 'Open extension settings'},
];

const LAYOUT_SHORTCUTS: Shortcut[] = [
    {id: 'layout-1', desc: 'Layout 1'},
    {id: 'layout-2', desc: 'Layout 2'},
    {id: 'layout-3', desc: 'Layout 3'},
    {id: 'layout-4', desc: 'Layout 4'},
];

export const KeyboardShortcutsPage = GObject.registerClass(
class KeyboardShortcutsPage extends Adw.PreferencesPage {
    constructor(settings: Gio.Settings) {
        super({
            title: "Keyboard Shortcuts",
            icon_name: 'input-keyboard-symbolic',
            name: "KeyboardShortcuts",
        });

        const grid = new Gtk.Grid({
            halign: Gtk.Align.CENTER,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
            column_spacing: 12,
            row_spacing: 12,
            visible: true
        });

        const allTreeViews: Gtk.TreeView[] = [];

        const tileLabel = new Gtk.Label({
            label: '<b>Tile activation keys</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(tileLabel, 0, 0, 2, 1);
        grid.attach(buildTileKeyboardShortcutsWidget(settings, allTreeViews), 0, 1, 2, 1);

        // Recreate TileKeyboardShortcutsWidget when grid size changes
        function recreateTileKeyboardShortcutsWidget() {
            grid.remove(grid.get_child_at(0, 1)!);
            grid.attach(buildTileKeyboardShortcutsWidget(settings, allTreeViews), 0, 1, 2, 1);
        }
        settings.connect('changed::grid-cols', recreateTileKeyboardShortcutsWidget);
        settings.connect('changed::grid-rows', recreateTileKeyboardShortcutsWidget);

        const layoutLabel = new Gtk.Label({
            label: '<b>Layout activation keys</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(layoutLabel, 0, 2, 1, 1);
        grid.attach(buildKeyboardShortcutsWidget(settings, LAYOUT_SHORTCUTS, allTreeViews), 0, 3, 1, 1);

        const generalLabel = new Gtk.Label({
            label: '<b>General shortcuts</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(generalLabel, 1, 2, 1, 1);
        grid.attach(buildKeyboardShortcutsWidget(settings, GENERAL_SHORTCUTS, allTreeViews), 1, 3, 1, 1);

        const group = new Adw.PreferencesGroup();
        group.add(grid);
        this.add(group);
    }
});


function buildTileKeyboardShortcutsWidget(settings: Gio.Settings, allTreeViews: Gtk.TreeView[]): Gtk.Grid {
    const num_cols = settings.get_int('grid-cols');
    const num_rows = settings.get_int('grid-rows');

    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    // Columns
    for (let col = 0; col < num_cols; col++) {
        const widget = new Gtk.Label({
            halign: Gtk.Align.START,
            label: `Column ${col + 1}`,
            visible: true
        });
        grid.attach(widget, col + 1, 0, 1, 1);
    }

    // Rows
    for (let row = 0; row < num_rows; row++) {
        const widget = new Gtk.Label({
            halign: Gtk.Align.START,
            label: `Row ${row + 1}`,
            visible: true
        });
        grid.attach(widget, 0, row + 1, 1, 1);
    }

    // Tile hotkeys
    for (let col = 0; col < num_cols; col++) {
        for (let row = 0; row < num_rows; row++) {
            const widget = buildAcceleratorWidget(settings, `tile-${col}-${row}`, allTreeViews);
            grid.attach(widget, col + 1, row + 1, 1, 1);
        }
    }

    return grid;
}

function buildKeyboardShortcutsWidget(settings: Gio.Settings, shortcuts: Shortcut[], allTreeViews: Gtk.TreeView[]): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    shortcuts.forEach((shortcut, index) => {
        const label = new Gtk.Label({
            halign: Gtk.Align.END,
            label: shortcut.desc,
            visible: true
        });
        grid.attach(label, 0, index, 1, 1);

        const accelerator = buildAcceleratorWidget(settings, shortcut.id, allTreeViews);
        grid.attach(accelerator, 1, index, 1, 1);
    });

    return grid;
}

// The only widget for capturing accelerators is CellRendererAccel
// It must be embedded in a TreeView, which adds a lot of complexity
function buildAcceleratorWidget(settings: Gio.Settings, id: string, allTreeViews: Gtk.TreeView[]): Gtk.TreeView {
    // Model
    const model = new Gtk.ListStore();
    model.set_column_types([GObject.TYPE_INT, GObject.TYPE_INT]);
    model.set(model.append(), [COLUMN_KEY, COLUMN_MODS], parseAccelerator(settings, id));

    // Renderer
    const renderer = new Gtk.CellRendererAccel({
        accel_mode: Gtk.CellRendererAccelMode.GTK,
        editable: true
    });
    renderer.connect('accel-edited', function (_, path, key, mods) {
        const [ok, iter] = model.get_iter_from_string(path!);
        if (!ok) {
            return;
        }
        model.set(iter, [COLUMN_KEY, COLUMN_MODS], [key, mods]);
        settings.set_strv(id, [Gtk.accelerator_name(key, mods)!]);
    });
    renderer.connect('accel-cleared', function (_, path) {
        const [ok, iter] = model.get_iter_from_string(path!);
        if (!ok) {
            return;
        }
        model.set(iter, [COLUMN_KEY, COLUMN_MODS], [0, 0]);
        settings.set_strv(id, []);
    });

    // Column
    const column = new Gtk.TreeViewColumn();
    column.pack_start(renderer, true);
    column.add_attribute(renderer, 'accel-key', COLUMN_KEY);
    column.add_attribute(renderer, 'accel-mods', COLUMN_MODS);

    // TreeView
    const treeView = new Gtk.TreeView({
        model: model,
        headers_visible: false,
        visible: true
    });
    treeView.append_column(column);
    treeView.get_style_context().add_class("accelerator");

    // TreeViews keep their selection when they loose focus
    // This prevents more than one from being selected
    treeView.get_selection().connect('changed', function (selection) {
        if (selection.count_selected_rows() > 0) {
            allTreeViews
                .filter(it => it !== treeView)
                .forEach(it => it.get_selection().unselect_all());
        }
    });
    allTreeViews.push(treeView);

    return treeView;
}

function parseAccelerator(settings: Gio.Settings, id: string): [number, Gdk.ModifierType] {
    const accelerator = settings.get_strv(id)[0] || '';
    const [_, key, mods] = Gtk.accelerator_parse(accelerator);
    return [key, mods];
}

