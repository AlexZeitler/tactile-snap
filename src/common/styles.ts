import Gio from "gi://Gio";
import St from "gi://St";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

export class Styles {
    textColor: string;
    borderColor: string;
    backgroundColor: string;
    textSize: number;
    borderSize: number;

    constructor(textColor: string, borderColor: string, backgroundColor: string, textSize: number, borderSize: number) {
        this.textColor = textColor;
        this.borderColor = borderColor;
        this.backgroundColor = backgroundColor;
        this.textSize = textSize;
        this.borderSize = borderSize;
    }

    static getRGBAString(red: number, green: number, blue: number, alpha: number): string {
        return `rgba(${red},${green},${blue},${alpha})`;
    }

    static fromSettings(settings: Gio.Settings): Styles {
        let textColor = settings.get_string("text-color")!;
        let borderColor = settings.get_string("border-color")!;
        let backgroundColor = settings.get_string("background-color")!;
        const [major] = Config.PACKAGE_VERSION.split(".").map((s) => Number(s));
        if (settings.get_boolean("use-accent-color") && major >= 47) {
            let context = St.ThemeContext.get_for_stage(global.get_stage());
            let [accentColor] = context.get_accent_color();
            console.info("got accent");
            console.info(accentColor);
            if (accentColor != null) {
                let r = accentColor.red;
                let g = accentColor.green;
                let b = accentColor.blue;
                textColor = Styles.getRGBAString(r, g, b, 1.0);
                borderColor = Styles.getRGBAString(r, g, b, 0.5);
                backgroundColor = Styles.getRGBAString(r, g, b, 0.1);
            }
        }

        const textSize = settings.get_int("text-size");
        const borderSize = settings.get_int("border-size");
        return new Styles(textColor, borderColor, backgroundColor, textSize, borderSize);
    }
}
