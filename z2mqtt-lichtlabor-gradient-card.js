/**
 * Gradient-Editor-Karte für Zigbee2MQTT-Gradient-Lampen (Hue Festavia, Flux, Lightstrip ...)
 *
 * Reiter:
 *   Stimmung          – (nur mit gen_lamps, erster Reiter) EINE Stimmung aus 2–5 Farben ist die einzige Farbquelle:
 *                       Farblampen bekommen „Farbe 1..n“, Weißlampen Weiß passend zur Stimmung, Gradient-Lampen die
 *                       Stimmungsfarben als Verlauf. v1.9: Szene als Startpunkt laden (Farben werden aus dem Licht
 *                       gelesen), „Licht zurück“ inkl. Festavia, feste Leiste unten (Zurück/Würfeln/Vor/Speichern),
 *                       Speichern = Szene überschreiben oder neu (inkl. Festavia + Farbvorschau), Sende-Anzeige.
 *   Festavia-Verlauf  – (früher „Editor“) bis zu 8 Farben, Stil, Helligkeit, Live-Vorschau, als Verlauf merken
 *   Verläufe          – (früher „Bibliothek“) gespeicherte Verläufe (Slots), Nutzung in Szenen, Kopieren, Löschen
 *   Szenen-Zuordnung  – Tabelle Szene × Lampe (Verlauf/Farbe/Weiß/Aus/nicht ändern), Farbvorschau je Szene
 *
 * Farbvorschau: Feld "p" (Liste Hex-Farben) in der Zuordnung; Skripte ignorieren es.
 *
 * Schnittstellen (unverändert zu v1.5, werden von Skripten/Automationen gelesen):
 *   Slots       input_text.<slot_prefix><1..8>   JSON {"n": Name, "s": Stil, "c": [hex]}
 *   Zuordnungen input_text.<map_prefix><Szenen-ID> JSON {"m": v|c|t|a|n, "s": Slot, "b": 1..254, "c": hex, "k": Kelvin}
 *   Szenen werden per scene.turn_on aufgerufen (dann zieht der Szenen-Anwender Picker + Gradient nach).
 *   Gesendet wird per mqtt.publish an <base_topic>/<Z2M-Name>/set.
 *
 * Konfiguration (alles optional):
 *   type: custom:gradient-editor-card
 *   title: ""                      # leer = kein Titel
 *   lamp_slots:  {<Z2M-Name>: input_text.gradient_slot_}
 *   lamp_map:    {<Z2M-Name>: input_text.gradient_zuordnung_festavia_}
 *   lamp_labels: {<Z2M-Name>: Festavia}
 *   lamp_entities: {<Z2M-Name>: light.xyz}   # sonst per friendly_name gesucht
 *   scene_prefix / scene_strip / picker / test_script / slots / base_topic / max_colors
 */

const GE_VERSION = "1.9.0";
const GE_STYLES = [
  { id: "scattered", label: "Getrennt" },
  { id: "linear", label: "Weich" },
  { id: "mirrored", label: "Gespiegelt" },
];
const GE_DEFAULT_COLORS = ["#ff7a00", "#00e5a0", "#ff2d9a", "#ff1a1a", "#6a3dff"];
const GE_PRESETS = [
  { name: "Bunt", c: ["#ff7a00", "#00e5a0", "#ff2d9a", "#ff1a1a", "#6a3dff"] },
  { name: "Sonnenuntergang", c: ["#ff3d00", "#ff7a00", "#ffb000", "#ff4f81", "#7b2ff7"] },
  { name: "Ozean", c: ["#0033ff", "#0077ff", "#00c2ff", "#00ffd5", "#0055aa"] },
  { name: "Polarlicht", c: ["#00ff9c", "#00d4ff", "#7a5cff", "#c724ff", "#00ffa8"] },
  { name: "Wald", c: ["#0b6e2f", "#2fbf4a", "#a8e05f", "#ffd166", "#1b9c85"] },
  { name: "Feuer", c: ["#ff0000", "#ff4500", "#ff8c00", "#ffb300", "#ff2200"] },
  { name: "Candy", c: ["#ff2d9a", "#ff7ad9", "#b36bff", "#6ad0ff", "#ffd1f0"] },
  { name: "Warmweiß", c: ["#ffb46b", "#ffc98a", "#ffd9a8", "#ffe7c7", "#ffc07a"] },
];
const GE_MODES = [
  { id: "v", label: "Verlauf", icon: "mdi:gradient-horizontal" },
  { id: "c", label: "Farbe", icon: "mdi:palette" },
  { id: "t", label: "Weiß", icon: "mdi:white-balance-sunny" },
  { id: "a", label: "Aus", icon: "mdi:power-off" },
  { id: "n", label: "–", icon: "mdi:minus", title: "Nicht ändern" },
];
const GE_HEX = /^#[0-9a-fA-F]{6}$/;
const GE_LIVE_MS = 350;
/* Generator (v1.8 „Stimmung“) */
const GE_PALETTES = [
  { id: "pastell", label: "Pastell", sat: [20, 45], d: "Zart und hell, wenig Farbe. Alle Farbtöne möglich." },
  { id: "kraeftig", label: "Kräftig", sat: [85, 100], d: "Satte Farben, die sich klar unterscheiden." },
  { id: "analog", label: "Ähnlich", sat: [55, 85], d: "Nachbarfarben, z. B. Orange, Rot, Pink. Wirkt ruhig." },
  { id: "basis", label: "Eine Farbe", sat: [55, 90], d: "Abstufungen deiner Grundfarbe." },
  { id: "warm", label: "Warm", sat: [60, 95], d: "Rot, Orange, Bernstein. Gemütlich, gut für abends." },
  { id: "kuehl", label: "Kühl", sat: [50, 90], d: "Türkis, Blau, Violett. Ruhig und klar." },
  { id: "komplementaer", label: "Gegensätze", sat: [70, 95], d: "Zwei gegenüberliegende Farben, z. B. Orange + Blau." },
  { id: "dreiklang", label: "Dreiklang", sat: [65, 95], d: "Drei gleichmäßig verteilte Farben, bunt aber ausgewogen." },
  { id: "akzent", label: "Weiß + Akzent", sat: [80, 100], d: "Fast alles warmweiß, eine kräftige Akzentfarbe." },
];
const GE_GEN_MAX = 5; // Stimmungsfarben (Festavia nimmt bis zu 5)
const GE_GEN_ROLES = ["farbe", "weiss", "aus", "gleich"];
const GE_FEST_MODES = [
  { id: "stimmung", label: "Farben der Stimmung" },
  { id: "zufall", label: "Eigener Verlauf" },
  { id: "weiss", label: "Weiß" },
  { id: "aus", label: "Aus" },
  { id: "gleich", label: "Unverändert" },
];
const GE_GEN_STYLES = [
  { id: "linear", label: "Verlauf" },
  { id: "scattered", label: "Verstreut" },
];
const GE_SNAP_SCENE = "lichtlabor_vorher";

const GE_CSS = `
  :host { display: block; --ge-rgb: var(--rgb-primary-color, 3, 169, 244); }
  [hidden] { display: none !important; }
  ha-card { padding: 16px; position: relative; overflow: hidden; }
  button { font: inherit; color: inherit; }
  ha-icon { --mdc-icon-size: 20px; }
  .title { font-size: 1.15em; font-weight: 500; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .label { font-size: 0.75em; color: var(--secondary-text-color); text-transform: uppercase;
           letter-spacing: 0.05em; margin: 16px 0 8px; display: flex; justify-content: space-between; align-items: center; }
  .muted { color: var(--secondary-text-color); }

  /* Lampen */
  .lamps { display: flex; gap: 8px; margin-bottom: 12px; }
  .lamp { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px;
          border-radius: 14px; border: 1px solid var(--divider-color); cursor: pointer;
          transition: border-color .15s, background .15s; user-select: none; }
  .lamp.sel { border-color: var(--primary-color); background: rgba(var(--ge-rgb), .10); }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; background: var(--disabled-color, #9e9e9e); opacity: .5; }
  .dot.on { opacity: 1; }
  .ltext { min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
  .lname { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lstate { font-size: .78em; color: var(--secondary-text-color); }
  .pwr { margin-left: auto; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
         background: var(--secondary-background-color); color: var(--secondary-text-color);
         display: inline-flex; align-items: center; justify-content: center; }
  .pwr.on { background: rgba(var(--ge-rgb), .18); color: var(--primary-color); }

  /* Reiter */
  .tabs { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: var(--secondary-background-color); }
  .tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 4px; border: 0;
         border-radius: 9px; background: transparent; color: var(--secondary-text-color); font-size: .92em; cursor: pointer; }
  .tab.on { background: var(--card-background-color); color: var(--primary-text-color); font-weight: 500;
            box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  .tab ha-icon { --mdc-icon-size: 18px; }
  .tbadge { font-size: .75em; min-width: 18px; padding: 0 5px; border-radius: 9px; background: rgba(127,127,127,.2); }
  .tbadge.warn { background: var(--warning-color, #ff9800); color: #fff; }
  .body { margin-top: 12px; }

  /* Editor */
  .status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 32px; font-size: .92em; }
  .status .sname { font-weight: 500; }
  .pill { padding: 2px 8px; border-radius: 10px; font-size: .8em; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .pill.dirty { background: rgba(255,152,0,.18); color: var(--warning-color, #ff9800); font-weight: 500; }
  .status .ibtn { margin-left: auto; }
  .preview { height: 46px; border-radius: 12px; margin-top: 6px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
  .colors { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .swatch { position: relative; width: 46px; height: 46px; border-radius: 50%; cursor: pointer;
            box-shadow: 0 1px 4px rgba(0,0,0,.35); outline: 2px solid transparent; outline-offset: 3px;
            transition: outline-color .15s, transform .15s; }
  .swatch.sel { outline-color: var(--primary-color); transform: scale(1.06); }
  .swatch .fill { position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(255,255,255,.3); }
  .swatch .idx { position: absolute; left: 0; right: 0; bottom: 3px; text-align: center; font-size: .62em; color: #fff;
                 text-shadow: 0 0 3px #000; pointer-events: none; }
  .swatch input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  .add { width: 46px; height: 46px; border-radius: 50%; border: 2px dashed var(--divider-color); background: transparent;
         color: var(--secondary-text-color); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .add:disabled { opacity: .35; cursor: default; }
  .tools { display: flex; align-items: center; gap: 4px; margin-top: 10px; padding: 4px 4px 4px 10px; border-radius: 12px;
           background: var(--secondary-background-color); }
  .tools .tinfo { display: flex; align-items: center; gap: 8px; font-size: .88em; margin-right: auto; font-variant-numeric: tabular-nums; }
  .tdot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(127,127,127,.4); }
  .ibtn { width: 36px; height: 36px; flex: 0 0 auto; border-radius: 50%; border: 0; background: transparent; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; color: var(--primary-text-color); }
  .ibtn:hover:not(:disabled) { background: rgba(127,127,127,.15); }
  .ibtn:disabled { opacity: .3; cursor: default; }
  .ibtn.danger { color: var(--error-color, #db4437); }
  .quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .qbtn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 16px; cursor: pointer;
          border: 1px solid var(--divider-color); background: transparent; font-size: .88em; }
  .qbtn:hover { border-color: var(--primary-color); }
  .qbtn ha-icon { --mdc-icon-size: 18px; }
  .chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
  .chip { flex: 0 0 auto; width: 88px; display: flex; flex-direction: column; gap: 5px; padding: 6px; border-radius: 10px;
          border: 1px solid var(--divider-color); background: transparent; font-size: .75em; cursor: pointer; text-align: left; }
  .chip:hover { border-color: var(--primary-color); }
  .mini { height: 12px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
  .seg { display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: var(--secondary-background-color); }
  .seg button { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px;
                border: 0; border-radius: 8px; background: transparent; color: var(--secondary-text-color); cursor: pointer; font-size: .9em; }
  .seg button.on { background: var(--card-background-color); color: var(--primary-text-color); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  .seg ha-icon { --mdc-icon-size: 16px; }
  .range { display: flex; align-items: center; gap: 10px; }
  .range input { flex: 1; min-width: 0; accent-color: var(--primary-color); }
  .range .val { min-width: 3.6em; text-align: right; font-variant-numeric: tabular-nums; font-size: .9em; }
  input[type=range].kelvin { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 5px;
    background: linear-gradient(90deg, #ff8a12, #ffbe6e, #ffe4c4, #ffffff, #bcd4ff); }
  input[type=range].kelvin::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; border: 2px solid var(--primary-color); }
  input[type=range].kelvin::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid var(--primary-color); }
  .actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: .92em; }
  .switch input { display: none; }
  .track { width: 38px; height: 22px; border-radius: 11px; background: rgba(127,127,127,.4); position: relative; transition: background .15s; }
  .knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: left .15s; }
  .switch input:checked + .track { background: var(--primary-color); }
  .switch input:checked + .track .knob { left: 19px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 14px; border-radius: 10px;
         border: 0; cursor: pointer; font-size: .95em; background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.secondary { background: transparent; color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  .btn.danger { background: var(--error-color, #db4437); }
  .btn:disabled { opacity: .4; cursor: default; }
  .btn ha-icon { --mdc-icon-size: 18px; }
  .grow { flex: 1; }
  .saverow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .saverow input { flex: 1 1 140px; min-width: 0; box-sizing: border-box; padding: 9px 10px; font-size: 1em; border-radius: 10px;
                   color: var(--primary-text-color); background: var(--card-background-color); border: 1px solid var(--divider-color); }

  /* Bibliothek */
  .libhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: .9em; }
  .lib { display: grid; gap: 8px; }
  .item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; border: 1px solid var(--divider-color);
          cursor: pointer; transition: border-color .15s; }
  .item:hover { border-color: var(--primary-color); }
  .item.editing { border-color: var(--primary-color); background: rgba(var(--ge-rgb), .07); }
  .item .bar { flex: 0 0 34%; height: 34px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
  .item .info { flex: 1; min-width: 0; }
  .item .nm { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item .meta { font-size: .78em; color: var(--secondary-text-color); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .badge { padding: 0 6px; border-radius: 8px; background: rgba(var(--ge-rgb), .15); color: var(--primary-color); }
  .item .acts { display: flex; align-items: center; flex: 0 0 auto; }
  .copy { font-size: .78em; padding: 5px 8px; border-radius: 12px; border: 1px solid var(--divider-color); background: transparent;
          cursor: pointer; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
  .copy ha-icon { --mdc-icon-size: 14px; }
  .empty { text-align: center; padding: 20px 10px; color: var(--secondary-text-color); font-size: .92em; }

  /* Szenen */
  .hint { font-size: .82em; color: var(--secondary-text-color); margin: 0 0 10px; }
  .matrix { display: grid; gap: 6px; align-items: stretch; }
  .mh { font-size: .72em; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; padding: 0 4px; align-self: end; }
  .scn { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px 8px; border-radius: 10px; text-align: left;
         border: 1px solid transparent; background: transparent; cursor: pointer; font-size: .92em; }
  .scn:hover { background: rgba(127,127,127,.08); }
  .scn .sn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scn ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: 0 0 auto; }
  .scn.active { background: rgba(var(--ge-rgb), .12); border-color: rgba(var(--ge-rgb), .45); font-weight: 500; }
  .scn.active ha-icon { color: var(--primary-color); }
  .cell { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; min-height: 40px; padding: 5px 8px;
          border-radius: 10px; border: 1px solid var(--divider-color); background: transparent; cursor: pointer; font-size: .8em; text-align: left; }
  .cell:hover { border-color: var(--primary-color); }
  .cell.sel { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
  .cell .ln { display: flex; align-items: center; gap: 5px; min-width: 0; white-space: nowrap; }
  .cell .ln span { overflow: hidden; text-overflow: ellipsis; }
  .cell .sub { color: var(--secondary-text-color); font-size: .9em; }
  .cell .mini { height: 9px; width: 100%; }
  .cell ha-icon { --mdc-icon-size: 15px; }
  .cell.none { color: var(--secondary-text-color); border-style: dashed; align-items: center; }
  .cell.off { color: var(--secondary-text-color); }
  .cell.warn { border-color: var(--warning-color, #ff9800); color: var(--warning-color, #ff9800); }
  .cdot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0 1px rgba(127,127,127,.4); }
  .panel { grid-column: 1 / -1; display: grid; gap: 12px; padding: 12px; margin: 2px 0 6px; border-radius: 14px;
           border: 1px solid var(--primary-color); background: rgba(var(--ge-rgb), .05); }
  .phead { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .phead .ibtn { margin-left: auto; }
  .opts { display: grid; gap: 6px; }
  .opt { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; border: 1px solid var(--divider-color);
         background: var(--card-background-color); cursor: pointer; text-align: left; font-size: .9em; }
  .opt .mini { flex: 0 0 38%; height: 16px; }
  .opt.on { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
  .opt .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cpick { display: flex; align-items: center; gap: 12px; }
  .cpick label { position: relative; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .cpick input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; padding: 0; }
  .pfoot { display: flex; gap: 8px; flex-wrap: wrap; }
  .take .mini { width: 44px; height: 12px; }
  .gstrip { display: inline-flex; flex: 0 0 64px; height: 12px; border-radius: 6px; overflow: hidden; margin-left: auto;
            box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
  .gstrip span { flex: 1; }

  /* Generator */
  .body { container-type: inline-size; }
  .glayout { display: grid; gap: 0 24px; }
  .gcol { display: grid; align-content: start; min-width: 0; }
  @container (min-width: 820px) { .glayout { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); } }
  .gmood, .ggroup { display: grid; gap: 10px; margin-bottom: 16px; }
  .glbl { font-size: .75em; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em;
          display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .glbl .muted { text-transform: none; letter-spacing: 0; }
  .muted.small { font-size: .8em; }
  .gpals { display: flex; flex-wrap: wrap; gap: 6px; }
  .gpal { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 999px; border: 1px solid var(--divider-color);
          background: transparent; cursor: pointer; font-size: .9em; }
  .gpal.on { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); background: rgba(var(--ge-rgb), .06); font-weight: 500; }
  .gpal .pv { display: flex; }
  .gpal .pv span { width: 14px; height: 14px; border-radius: 50%; margin-left: -4px; box-shadow: 0 0 0 2px var(--card-background-color); }
  .gpal .pv span:first-child { margin-left: 0; }
  .gpal .pn { font-weight: 500; }
  .gpal .pd { font-size: .78em; color: var(--secondary-text-color); line-height: 1.3; }
  .grow2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .gbig { position: relative; width: 64px; height: 64px; border-radius: 50%; flex: 0 0 auto; cursor: pointer; overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .gbig.small { width: 36px; height: 36px; }
  .gbig .fill { position: absolute; inset: 0; }
  .gbig input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  .gswrow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-bottom: 14px; }
  .gsws { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; }
  .gswc { position: relative; width: 54px; height: 54px; border-radius: 50%; border: 3px solid var(--card-background-color); cursor: pointer;
          box-shadow: 0 0 0 1px rgba(127,127,127,.35), 0 3px 10px rgba(0,0,0,.25); padding: 0; touch-action: manipulation;
          user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .gswc.sel { box-shadow: 0 0 0 2px var(--primary-color), 0 3px 10px rgba(0,0,0,.25); }
  .gswc .num { position: absolute; left: 50%; bottom: -19px; transform: translateX(-50%); font-size: .72em; color: var(--secondary-text-color); }
  .glk { position: absolute; right: -4px; top: -4px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center;
         justify-content: center; background: var(--primary-text-color); color: var(--card-background-color); --mdc-icon-size: 13px; }
  .gcount { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border-radius: 999px; background: var(--secondary-background-color); }
  .gcount button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--card-background-color); cursor: pointer; font-size: 1.1em; }
  .gcount button:disabled { opacity: .35; cursor: default; }
  .gcount span { min-width: 62px; text-align: center; font-size: .9em; }
  .gmini { display: flex; align-items: center; gap: 6px; }
  .gminib { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 0; cursor: pointer; }
  .gminib .muted { font-size: .85em; }
  .gbar { display: block; height: 24px; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
  .gbar.thin { flex: 1; height: 10px; border-radius: 5px; }
  .gbar.off { background: repeating-linear-gradient(45deg, rgba(127,127,127,.25) 0 6px, transparent 6px 12px); }
  .gbtns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .btn.big { padding: 11px 18px; font-size: 1em; border-radius: 999px; }
  .ibtn.ring { border: 1px solid var(--divider-color); }
  .gtiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
  .gtile { position: relative; overflow: hidden; display: grid; gap: 5px; min-width: 0; padding: 9px 10px; border-radius: 12px; text-align: left;
           border: 1px solid var(--divider-color); background: transparent; cursor: pointer; }
  .gtile > * { position: relative; }
  .gtile .glow { position: absolute; inset: 0; pointer-events: none; }
  .gtile.wide { grid-column: 1 / -1; }
  .gtile.hl { box-shadow: 0 0 0 2px var(--primary-color); }
  .gtile.sel { border-color: var(--primary-color); background: rgba(var(--ge-rgb), .08); }
  .gtile.off .gnm { color: var(--secondary-text-color); }
  .gtile .glk { position: absolute; right: 6px; top: 6px; width: 18px; height: 18px; background: transparent; color: var(--secondary-text-color); --mdc-icon-size: 15px; }
  .gdot { width: 24px; height: 24px; border-radius: 50%; background: rgba(127,127,127,.35); box-shadow: 0 0 0 1px rgba(127,127,127,.35); }
  .gdot.keep { background: repeating-linear-gradient(45deg, rgba(127,127,127,.45) 0 4px, transparent 4px 8px); }
  .gnm { font-weight: 500; font-size: .92em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gnm .muted { font-weight: 400; }
  .gst { font-size: .78em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .gsheet { grid-column: 1 / -1; display: grid; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--primary-color);
            background: rgba(var(--ge-rgb), .05); }
  .gshead { display: flex; align-items: center; gap: 12px; }
  .gsh { font-weight: 500; font-size: 1.05em; }
  .gopts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .gopts .seg { flex: 0 0 auto; }
  .gopt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 10px; border: 1px solid var(--divider-color);
          background: var(--card-background-color); cursor: pointer; font-size: .9em; }
  .gopt.on { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); }
  .gopt ha-icon { --mdc-icon-size: 17px; }
  .gd { width: 18px; height: 18px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(127,127,127,.4); }
  .gsfoot { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .gsheet .range .lbl, .gfine .range .lbl, .ggroup .range .lbl { font-size: .85em; color: var(--secondary-text-color); min-width: 7.5em; }
  .gprof { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .gprof .lbl { font-size: .9em; }
  .gsel { flex: 1 1 160px; min-width: 0; padding: 8px 10px; border-radius: 10px; font: inherit; color: var(--primary-text-color);
          background: var(--card-background-color); border: 1px solid var(--divider-color); }
  .gfine { border-top: 1px solid var(--divider-color); padding-top: 12px; margin-bottom: 14px; }
  .gfine summary { cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 500; list-style: none; }
  .gfine summary::-webkit-details-marker { display: none; }
  .gfinebody { display: grid; gap: 10px; padding-top: 12px; }
  .gsave { position: sticky; bottom: 0; z-index: 2; margin: 0 -16px -16px; padding: 8px 16px 12px; background: var(--card-background-color);
           border-top: 1px solid var(--divider-color); display: grid; gap: 6px; }
  .gacts { display: flex; align-items: center; gap: 8px; }
  .gacts .groll { flex: 1; }
  .btn.secondary.on { border-color: var(--primary-color); color: var(--primary-color); }
  .btn.secondary.warn { color: var(--warning-color, #ff9800); border-color: var(--warning-color, #ff9800); }
  .gsend { display: flex; align-items: center; gap: 6px; font-size: .78em; color: var(--secondary-text-color); min-height: 16px; }
  .gsend .d { width: 8px; height: 8px; border-radius: 50%; background: var(--success-color, #43a047); }
  .gsend.busy .d { background: var(--warning-color, #ff9800); animation: gepulse .8s infinite alternate; }
  @keyframes gepulse { from { opacity: .3; } to { opacity: 1; } }
  .gsavep { display: grid; gap: 8px; padding-bottom: 6px; }
  .gchoice { display: grid; gap: 3px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--divider-color); background: transparent;
             cursor: pointer; text-align: left; }
  .gchoice.on { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); }
  .gchoice .t { font-weight: 500; }
  .gstart { display: grid; gap: 8px; padding: 12px; margin-bottom: 16px; border-radius: 14px; background: var(--secondary-background-color); }
  .gstartrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .gscn { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; border: 0;
          background: var(--card-background-color); cursor: pointer; text-align: left; }
  .gscn .gstrip, .gsitem .gstrip { margin-left: 0; }
  .gscnn { flex: 1; min-width: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gslist { display: grid; gap: 6px; }
  .gsitem { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--divider-color);
            background: var(--card-background-color); cursor: pointer; text-align: left; }
  .gsitem.on { border-color: var(--primary-color); }
  .gstrip.none { background: repeating-linear-gradient(45deg, rgba(127,127,127,.25) 0 4px, transparent 4px 8px); }
  .ghelp { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid var(--divider-color); background: transparent;
           color: var(--secondary-text-color); cursor: pointer; font-size: .95em; text-transform: none; }

  /* Rückfrage */
  .overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
             padding: 16px; background: rgba(0,0,0,.45); }
  .dialog { max-width: 360px; width: 100%; padding: 18px; border-radius: 16px; background: var(--card-background-color);
            box-shadow: 0 8px 28px rgba(0,0,0,.35); display: grid; gap: 16px; }
  .dtext { line-height: 1.45; white-space: pre-line; }
  .dbtns { display: flex; justify-content: flex-end; gap: 8px; }
`;

/* ---------- Hilfsfunktionen ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") {
        if (typeof v === "string") el.style.cssText = v;
        else Object.assign(el.style, v);
      } else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const ic = (icon) => h("ha-icon", { icon });

function geBar(colors, style) {
  if (!colors || colors.length === 0) return "transparent";
  if (style === "scattered") {
    const n = colors.length;
    const stops = colors.map((c, i) => `${c} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }
  if (style === "mirrored") {
    const all = colors.concat(colors.slice(0, -1).reverse());
    return `linear-gradient(90deg, ${all.join(", ")})`;
  }
  return colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.join(", ")})`;
}

function geHsl(hue, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function geKelvinColor(k) {
  const stops = [[1500, [255, 138, 18]], [2700, [255, 190, 110]], [4000, [255, 228, 196]], [5000, [255, 255, 255]], [6500, [188, 212, 255]]];
  if (k <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) {
      const [k0, c0] = stops[i - 1];
      const [k1, c1] = stops[i];
      const t = (k - k0) / (k1 - k0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * t)).join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1]})`;
}

/* Farbton (0–360) + Sättigung (0–100) bei voller Helligkeit → #rrggbb */
function geHsvHex(hue, s) {
  s /= 100;
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function geHexHue(hex) {
  if (!GE_HEX.test(hex || "")) return 0;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  let hue;
  if (mx === r) hue = ((g - b) / d) % 6;
  else if (mx === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return (hue * 60 + 360) % 360;
}

const geHueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function geHueMean(hues) {
  let x = 0;
  let y = 0;
  for (const hue of hues) {
    x += Math.cos((hue * Math.PI) / 180);
    y += Math.sin((hue * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function geHexSat(hex) {
  if (!GE_HEX.test(hex || "")) return 0;
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mx = Math.max(...v);
  return mx ? Math.round(((mx - Math.min(...v)) / mx) * 100) : 0;
}

/* Gemischte Kopie (möglichst nicht dieselbe Reihenfolge) */
function gePerm(a) {
  const b = a.slice();
  for (let t = 0; t < 10; t++) {
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    if (b.length < 2 || b.some((x, i) => x !== a[i])) break;
  }
  return b;
}

const geClamp = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};

const gePct = (b) => Math.max(1, Math.round((Number(b) || 0) / 2.54));
const geBri = (pct) => Math.max(1, Math.min(254, Math.round(Number(pct) * 2.54)));
const geShortName = (name) => (name || "").replace(/^(Hue|Philips|Ikea)\s+/i, "").split(/\s+/)[0] || name;
const geStyleLabel = (id) => (GE_STYLES.find((s) => s.id === id) || GE_STYLES[0]).label;
/* Farbstreifen (Szenen-Vorschau) */
const geStrip = (cols) => h("span", { class: "gstrip" }, cols.map((c) => h("span", { style: { background: c } })));

/* Lampenfarben [{h, s}] zu höchstens max Farbfamilien zusammenfassen (häufigste zuerst) */
function geCluster(pts, max) {
  const cl = [];
  const upd = (c) => {
    c.h = geHueMean(c.hs);
    c.s = c.ss.reduce((a, b) => a + b, 0) / c.ss.length;
  };
  for (const p of pts) {
    const c = cl.find((x) => geHueDist(x.h, p.h) <= 25 && Math.abs(x.s - p.s) <= 35);
    if (c) {
      c.hs.push(p.h);
      c.ss.push(p.s);
      upd(c);
    } else cl.push({ h: p.h, s: p.s, hs: [p.h], ss: [p.s] });
  }
  while (cl.length > max) {
    let bi = 0;
    let bj = 1;
    let bd = Infinity;
    for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        const d = geHueDist(cl[i].h, cl[j].h);
        if (d < bd) [bd, bi, bj] = [d, i, j];
      }
    }
    cl[bi].hs.push(...cl[bj].hs);
    cl[bi].ss.push(...cl[bj].ss);
    upd(cl[bi]);
    cl.splice(bj, 1);
  }
  return cl.sort((a, b) => b.hs.length - a.hs.length).map((c) => ({ h: c.h, s: c.s }));
}

class GradientEditorCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = Object.assign(
      {
        title: "Gradient-Lichter",
        lamp_select: "input_select.gradient_lampe",
        slot_prefix: "input_text.gradient_slot_",
        lamp_slots: {},
        lamp_map: {},
        lamp_labels: {},
        lamp_entities: {},
        scene_prefix: "scene.wohnzimmer_oben_alle_",
        scene_strip: "wohnzimmer_oben_alle ",
        picker: "input_select.wohnzimmer_szene",
        test_script: "script.gradient_szene_anwenden",
        slots: 8,
        base_topic: "zigbee2mqtt",
        max_colors: 8,
        storage_key: "default",
        gen_lamps: [], // [{entity, name}] – Lampen der Z2M-Gruppe für den Generator
        gen_skip: [], // Gradient-Lampen (Z2M-Name), die der Generator nicht zeigt
        gen_save_script: "script.wohnzimmer_szene_speichern",
        gen_name_entity: "input_text.lichtlabor_neue_szene_name",
        gen_learn_ms: 3500, // Wartezeit nach Szenenaufruf, bevor Helligkeiten gelesen werden
      },
      config || {}
    );
    this._storeKey = "gradient-editor-card:v1:" + this._config.storage_key;
    if (!this._stateLoaded) {
      this._loadStore();
      this._stateLoaded = true;
    }
    this._entityCache = {};
    this._build();
  }

  getCardSize() {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._el) return;
    const lamps = this._lamps();
    if (lamps.length && !lamps.some((l) => l.name === this._lamp)) {
      const sel = hass.states[this._config.lamp_select];
      this._lamp = sel && lamps.some((l) => l.name === sel.state) ? sel.state : lamps[0].name;
      this._hSig = this._dSig = null; // erzwingt vollständiges Neuzeichnen unten
    }
    const hs = this._headerSig();
    if (hs !== this._hSig) {
      this._hSig = hs;
      this._renderLamps();
    }
    const ds = this._dataSig();
    if (ds !== this._dSig) {
      const first = this._dSig == null;
      this._dSig = ds;
      this._onData(first);
    }
  }

  /* ---------- Zustand (pro Browser) ---------- */
  _loadStore() {
    let s = {};
    try {
      s = JSON.parse(window.localStorage.getItem(this._storeKey) || "{}") || {};
    } catch (e) {
      s = {};
    }
    this._lamp = typeof s.lamp === "string" ? s.lamp : "";
    const hasGen = (this._config.gen_lamps || []).length > 0;
    this._tab = ["editor", "lib", "scenes", "gen"].includes(s.tab) && (s.tab !== "gen" || hasGen) ? s.tab : hasGen ? "gen" : "editor";
    this._live = s.live !== false;
    this._gen = this._genSanitize(s.gen);
    this._drafts = {};
    if (s.drafts && typeof s.drafts === "object") {
      for (const [lamp, d] of Object.entries(s.drafts)) {
        const colors = Array.isArray(d.colors) ? d.colors.filter((x) => GE_HEX.test(x)) : [];
        if (colors.length < 2) continue;
        this._drafts[lamp] = {
          colors: colors.slice(0, 8),
          style: GE_STYLES.some((x) => x.id === d.style) ? d.style : "scattered",
          bright: Math.max(1, Math.min(254, Number(d.bright) || 200)),
          name: typeof d.name === "string" ? d.name.slice(0, 30) : "",
          edit: d.edit && Number(d.edit.slot) > 0 && typeof d.edit.sig === "string" ? { slot: Number(d.edit.slot), sig: d.edit.sig } : null,
        };
      }
    }
  }

  _saveStore() {
    clearTimeout(this._storeTimer);
    this._storeTimer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          this._storeKey,
          JSON.stringify({ lamp: this._lamp, tab: this._tab, live: this._live, drafts: this._drafts, gen: this._gen })
        );
      } catch (e) {
        /* privater Modus o. ä. – dann eben ohne Merken */
      }
    }, 400);
  }

  _draft(lamp) {
    const key = lamp || this._lamp;
    if (!this._drafts[key]) {
      this._drafts[key] = { colors: GE_DEFAULT_COLORS.slice(), style: "scattered", bright: 200, name: "", edit: null };
    }
    return this._drafts[key];
  }

  _sigOf(d) {
    return JSON.stringify({ n: (d.name || "").trim(), s: d.style, c: d.colors });
  }

  _dirty(d) {
    return !!d.edit && this._sigOf(d) !== d.edit.sig;
  }

  /* ---------- HA-Daten ---------- */
  _st(eid) {
    const s = this._hass && this._hass.states[eid];
    return s ? s.state : null;
  }

  _lampEntity(name) {
    const c = this._config;
    if ((c.lamp_entities || {})[name]) return c.lamp_entities[name];
    if (this._entityCache[name]) return this._entityCache[name];
    if (!this._hass) return null;
    const eid =
      Object.keys(this._hass.states).find(
        (e) => e.startsWith("light.") && this._hass.states[e].attributes.friendly_name === name
      ) || null;
    if (eid) this._entityCache[name] = eid;
    return eid;
  }

  _lamps() {
    const c = this._config;
    let names = Object.keys(c.lamp_slots || {});
    if (!names.length && this._hass && this._hass.states[c.lamp_select]) {
      names = this._hass.states[c.lamp_select].attributes.options || [];
    }
    return names.map((name) => ({
      name,
      label: (c.lamp_labels || {})[name] || geShortName(name),
      entity: this._lampEntity(name),
      slotPrefix: (c.lamp_slots || {})[name] || c.slot_prefix,
      mapPrefix: (c.lamp_map || {})[name] || "",
    }));
  }

  _lampObj(name) {
    const n = name || this._lamp;
    return this._lamps().find((l) => l.name === n) || null;
  }

  _parseSlot(raw) {
    if (!raw || raw[0] !== "{") return null;
    try {
      const d = JSON.parse(raw);
      // nur gültige Hex-Farben zulassen (Slot-Inhalt ist nicht vertrauenswürdig)
      const colors = Array.isArray(d.c) ? d.c.filter((x) => GE_HEX.test(x)) : [];
      const style = GE_STYLES.some((s) => s.id === d.s) ? d.s : "scattered";
      if (colors.length) return { n: String(d.n || ""), s: style, c: colors };
    } catch (e) {
      /* ungültiger Inhalt */
    }
    return null;
  }

  _slots(lamp) {
    const out = [];
    if (!lamp) return out;
    for (let i = 1; i <= this._config.slots; i++) {
      const raw = this._st(lamp.slotPrefix + i);
      out.push({ n: i, raw: raw || "", d: this._parseSlot(raw) });
    }
    return out;
  }

  _freeSlot(lamp) {
    const s = this._slots(lamp).find((x) => !x.d);
    return s ? s.n : 0;
  }

  _parseMap(raw) {
    const def = { m: "n", v: "", s: 0, c: "#ffffff", b: 200, k: 2700, p: [] };
    if (!raw || raw[0] !== "{") return def;
    try {
      const d = JSON.parse(raw);
      return {
        m: ["n", "a", "v", "c", "t"].includes(d.m) ? d.m : "n",
        v: String(d.v || ""),
        s: Math.max(0, Math.min(99, Math.floor(Number(d.s) || 0))),
        c: GE_HEX.test(d.c || "") ? d.c : "#ffffff",
        b: Math.max(1, Math.min(254, Number(d.b) || 200)),
        k: Math.max(1500, Math.min(6500, Number(d.k) || 2700)),
        p: Array.isArray(d.p) ? d.p.filter((x) => GE_HEX.test(x)).slice(0, 6) : [],
      };
    } catch (e) {
      return def;
    }
  }

  /* null = Zuordnungs-Helfer existiert nicht */
  _mapRaw(lamp, id) {
    if (!lamp || !lamp.mapPrefix) return null;
    const s = this._hass && this._hass.states[lamp.mapPrefix + id];
    return s ? s.state : null;
  }

  /* Slot, auf den eine Zuordnung zeigt (auch alte Einträge mit Namen) */
  _mapSlot(lamp, p, slots) {
    if (p.s) return p.s;
    if (!p.v) return 0;
    const i = (slots || this._slots(lamp)).findIndex((x) => x.d && x.d.n.toLowerCase() === p.v.toLowerCase());
    return i >= 0 ? i + 1 : 0;
  }

  _scenes() {
    const c = this._config;
    if (!this._hass) return [];
    const re = new RegExp("^" + c.scene_prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)_");
    const list = [];
    for (const eid of Object.keys(this._hass.states)) {
      const m = re.exec(eid);
      if (!m) continue;
      let name = this._hass.states[eid].attributes.friendly_name || eid;
      if (name.startsWith(c.scene_strip)) name = name.slice(c.scene_strip.length);
      list.push({ id: Number(m[1]), eid, name });
    }
    return list.sort((a, b) => a.id - b.id);
  }

  /* Farbvorschau einer Szene (Feld p der ersten Zuordnung, die eine hat) */
  _scenePreview(id) {
    for (const l of this._lamps()) {
      const raw = this._mapRaw(l, id);
      if (raw === null) continue;
      const p = this._parseMap(raw).p;
      if (p.length) return p;
    }
    return [];
  }

  /* Szenen, deren Zuordnung (dieser Lampe) den Slot n verwendet */
  _usage(lamp, n, scenes) {
    if (!lamp || !lamp.mapPrefix) return [];
    const slots = this._slots(lamp);
    return (scenes || this._scenes())
      .filter((sc) => {
        const raw = this._mapRaw(lamp, sc.id);
        if (raw === null) return false;
        const p = this._parseMap(raw);
        return p.m === "v" && this._mapSlot(lamp, p, slots) === n;
      })
      .map((sc) => sc.name);
  }

  _headerSig() {
    return this._lamps()
      .map((l) => {
        const s = l.entity && this._hass.states[l.entity];
        return s ? `${l.name}:${s.state}:${s.attributes.brightness}:${s.attributes.rgb_color}` : l.name;
      })
      .join("|") + "|" + this._lamp;
  }

  _dataSig() {
    const scenes = this._scenes();
    const parts = [scenes.map((s) => s.id + ":" + s.name).join(","), this._st(this._config.picker)];
    for (const l of this._lamps()) {
      parts.push(this._slots(l).map((s) => s.raw).join("\u0001"));
      parts.push(scenes.map((s) => this._mapRaw(l, s.id)).join("\u0001"));
    }
    return parts.join("\u0002");
  }

  _onData(first) {
    // Bearbeitete Slots, die inzwischen geleert wurden, lösen
    for (const l of this._lamps()) {
      const d = this._drafts[l.name];
      if (d && d.edit && !this._parseSlot(this._st(l.slotPrefix + d.edit.slot))) d.edit = null;
    }
    this._renderTabs();
    if (first || this._tab !== "editor") this._renderBody(first);
    else this._renderStatus();
  }

  /* ---------- Aufbau ---------- */
  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.replaceChildren();
    const c = this._config;
    this._el = {
      lamps: h("div", { class: "lamps" }),
      tabs: h("div", { class: "tabs" }),
      body: h("div", { class: "body" }),
      overlay: h("div", { class: "overlay", hidden: true }),
    };
    root.append(
      h("style", null, GE_CSS),
      h(
        "ha-card",
        null,
        c.title ? h("div", { class: "title" }, ic("mdi:string-lights"), h("span", null, c.title)) : null,
        this._el.lamps,
        this._el.tabs,
        this._el.body,
        this._el.overlay
      )
    );
    this._hSig = this._dSig = null;
    if (this._hass) this.hass = this._hass;
  }

  _renderLamps() {
    const box = this._el.lamps;
    box.replaceChildren();
    box.hidden = this._tab === "gen"; // Lampenwahl betrifft nur Verlauf/Verläufe/Zuordnung
    for (const l of this._lamps()) {
      const st = l.entity && this._hass.states[l.entity];
      const on = !!st && st.state === "on";
      const rgb = on && st.attributes.rgb_color ? `rgb(${st.attributes.rgb_color.join(",")})` : null;
      let stateText = "nicht gefunden";
      if (st) {
        if (on) stateText = st.attributes.brightness ? `an · ${gePct(st.attributes.brightness)} %` : "an";
        else stateText = st.state === "off" ? "aus" : "nicht erreichbar";
      }
      box.append(
        h(
          "div",
          { class: "lamp" + (l.name === this._lamp ? " sel" : ""), title: l.name, onclick: () => this._selectLamp(l.name) },
          h("span", { class: "dot" + (on ? " on" : ""), style: rgb ? { background: rgb, boxShadow: `0 0 8px ${rgb}` } : null }),
          h("span", { class: "ltext" }, h("span", { class: "lname" }, l.label), h("span", { class: "lstate" }, stateText)),
          st
            ? h(
                "button",
                {
                  class: "pwr" + (on ? " on" : ""),
                  title: on ? `${l.label} ausschalten` : `${l.label} einschalten`,
                  onclick: (e) => {
                    e.stopPropagation();
                    this._call("light", on ? "turn_off" : "turn_on", { entity_id: l.entity });
                  },
                },
                ic("mdi:power")
              )
            : null
        )
      );
    }
  }

  _selectLamp(name) {
    if (name === this._lamp) return;
    this._lamp = name;
    this._sel = null;
    this._saveStore();
    this._hSig = null;
    this._renderLamps();
    this._renderTabs();
    this._renderBody(true);
  }

  _renderTabs() {
    const lamp = this._lampObj();
    const used = this._slots(lamp).filter((s) => s.d).length;
    const warn = this._brokenMaps();
    const tabs = [
      ["editor", "mdi:palette", "Festavia-Verlauf", null],
      ["lib", "mdi:bookshelf", "Verläufe", used ? h("span", { class: "tbadge" }, used) : null],
      ["scenes", "mdi:table-large", "Szenen-Zuordnung", warn ? h("span", { class: "tbadge warn", title: `${warn} Zuordnung(en) zeigen auf einen leeren Slot` }, "!") : null],
    ];
    if ((this._config.gen_lamps || []).length) tabs.unshift(["gen", "mdi:palette-swatch-variant", "Stimmung", null]);
    this._el.tabs.replaceChildren(
      ...tabs.map(([id, icon, label, badge]) =>
        h("button", { class: "tab" + (this._tab === id ? " on" : ""), onclick: () => this._setTab(id) }, ic(icon), h("span", null, label), badge)
      )
    );
  }

  _brokenMaps() {
    let n = 0;
    const scenes = this._scenes();
    for (const l of this._lamps()) {
      const slots = this._slots(l);
      for (const sc of scenes) {
        const raw = this._mapRaw(l, sc.id);
        if (raw === null) continue;
        const p = this._parseMap(raw);
        if (p.m !== "v") continue;
        const s = this._mapSlot(l, p, slots);
        if (!s || !slots[s - 1] || !slots[s - 1].d) n++;
      }
    }
    return n;
  }

  _setTab(id) {
    this._tab = id;
    this._saveStore();
    this._el.lamps.hidden = id === "gen";
    this._renderTabs();
    this._renderBody(true);
  }

  _renderBody() {
    if (!this._hass) return;
    if (this._tab === "lib") this._renderLib();
    else if (this._tab === "scenes") this._renderScenes();
    else if (this._tab === "gen" && (this._config.gen_lamps || []).length) this._renderGen();
    else this._renderEditor();
  }

  /* ---------- Editor ---------- */
  _renderEditor() {
    const d = this._draft();
    const max = this._config.max_colors;
    const body = this._el.body;
    this._ed = {
      status: h("div", { class: "status" }),
      preview: h("div", { class: "preview" }),
      colors: h("div", { class: "colors" }),
      tools: h("div", { class: "tools", hidden: true }),
      style: h("div", { class: "seg" }),
    };
    const briVal = h("span", { class: "val" }, gePct(d.bright) + " %");
    const bri = h("input", {
      type: "range", min: 1, max: 100, value: gePct(d.bright),
      oninput: () => {
        d.bright = geBri(bri.value);
        briVal.textContent = bri.value + " %";
        this._saveStore();
        this._liveApply();
      },
    });
    const live = h("input", {
      type: "checkbox", checked: this._live,
      onchange: () => {
        this._live = live.checked;
        this._saveStore();
        if (this._live) this._apply(true);
      },
    });
    const nameIn = h("input", {
      type: "text", maxLength: 30, placeholder: "Name des Verlaufs", value: d.name || "",
      oninput: () => {
        d.name = nameIn.value;
        this._saveStore();
        this._renderStatus();
      },
    });
    this._ed.name = nameIn;
    this._ed.saveBtn = h("button", { class: "btn", onclick: () => this._saveSlot(false) }, ic("mdi:content-save"), "Änderung merken");
    this._ed.newBtn = h("button", { class: "btn secondary", onclick: () => this._saveSlot(true) }, ic("mdi:content-save-plus"), "Als neu");

    body.replaceChildren(
      this._ed.status,
      this._ed.preview,
      h("div", { class: "label" }, h("span", null, "Farben"), h("span", { class: "muted" }, "antippen zum Ändern")),
      this._ed.colors,
      this._ed.tools,
      h(
        "div",
        { class: "quick" },
        h("button", { class: "qbtn", title: "Reihenfolge umdrehen", onclick: () => this._mutate((c) => c.reverse()) }, ic("mdi:swap-horizontal"), "Umdrehen"),
        h("button", { class: "qbtn", title: "Alle Farben eine Position weiterschieben", onclick: () => this._mutate((c) => c.unshift(c.pop())) }, ic("mdi:rotate-right"), "Rotieren"),
        h("button", { class: "qbtn", title: "Zufällige, harmonische Farben", onclick: () => this._random() }, ic("mdi:dice-5-outline"), "Zufall")
      ),
      h("div", { class: "label" }, "Vorlagen"),
      h(
        "div",
        { class: "chips" },
        GE_PRESETS.map((p) =>
          h(
            "button",
            { class: "chip", title: `Vorlage „${p.name}“ übernehmen`, onclick: () => this._mutate((c) => c.splice(0, c.length, ...p.c.slice(0, max))) },
            h("span", { class: "mini", style: { background: geBar(p.c, d.style) } }),
            p.name
          )
        )
      ),
      h("div", { class: "label" }, "Stil"),
      this._ed.style,
      h("div", { class: "label" }, "Helligkeit"),
      h("div", { class: "range" }, bri, briVal),
      h(
        "div",
        { class: "actions" },
        h("label", { class: "switch", title: "Jede Änderung sofort an die Lampe senden" }, live, h("span", { class: "track" }, h("span", { class: "knob" })), "Live"),
        h("span", { class: "grow" }),
        h("button", { class: "btn secondary", onclick: () => this._apply(false) }, ic("mdi:send"), "Senden")
      ),
      h("div", { class: "label" }, "Als Verlauf merken (für Szenen-Zuordnung)"),
      h("div", { class: "saverow" }, nameIn, this._ed.saveBtn, this._ed.newBtn)
    );
    this._renderColors();
    this._renderStyle();
    this._renderPreview();
    this._renderStatus();
  }

  _renderStatus() {
    if (!this._ed || this._tab !== "editor") return;
    const d = this._draft();
    const lamp = this._lampObj();
    const box = this._ed.status;
    box.replaceChildren();
    if (d.edit) {
      const slot = this._slots(lamp)[d.edit.slot - 1];
      const uses = this._usage(lamp, d.edit.slot);
      box.append(
        ...[
          h("span", { class: "pill" }, `Slot ${d.edit.slot}`),
          h("span", { class: "sname" }, (slot && slot.d && slot.d.n) || `Verlauf ${d.edit.slot}`),
          this._dirty(d) ? h("span", { class: "pill dirty" }, "● geändert") : null,
          uses.length ? h("span", { class: "pill", title: uses.join(", ") }, `in ${uses.length} Szene${uses.length > 1 ? "n" : ""}`) : null,
          h("button", { class: "ibtn", title: "Neuen Verlauf beginnen (Farben bleiben)", onclick: () => this._detach() }, ic("mdi:file-plus-outline")),
        ].filter(Boolean)
      );
    } else {
      box.append(h("span", { class: "pill" }, "Neu"), h("span", { class: "muted" }, "Noch nicht gespeichert"));
    }
    this._ed.saveBtn.hidden = !d.edit;
    this._ed.saveBtn.disabled = !this._dirty(d);
    this._ed.newBtn.replaceChildren(ic("mdi:content-save-plus"), d.edit ? "Als neuer Verlauf" : "Verlauf merken");
    this._ed.newBtn.className = d.edit ? "btn secondary" : "btn";
  }

  _detach() {
    const d = this._draft();
    d.edit = null;
    d.name = "";
    if (this._ed && this._ed.name) this._ed.name.value = "";
    this._saveStore();
    this._renderStatus();
  }

  _renderColors() {
    const d = this._draft();
    const box = this._ed.colors;
    box.replaceChildren();
    this._swatches = d.colors.map((col, i) => {
      const fill = h("span", { class: "fill", style: { background: col } });
      const input = h("input", {
        type: "color", value: col, title: `Farbe ${i + 1} ändern`,
        onpointerdown: () => this._select(i),
        onfocus: () => this._select(i),
        oninput: () => {
          d.colors[i] = input.value;
          fill.style.background = input.value;
          this._changed(true);
        },
      });
      const sw = h("label", { class: "swatch" + (i === this._sel ? " sel" : "") }, fill, h("span", { class: "idx" }, i + 1), input);
      box.append(sw);
      return sw;
    });
    box.append(
      h(
        "button",
        {
          class: "add", title: "Farbe hinzufügen", disabled: d.colors.length >= this._config.max_colors,
          onclick: () => {
            d.colors.push(d.colors[d.colors.length - 1] || "#ffffff");
            this._sel = d.colors.length - 1;
            this._renderColors();
            this._changed();
          },
        },
        ic("mdi:plus")
      )
    );
    this._renderTools();
  }

  _select(i) {
    if (this._sel === i) return;
    this._sel = i;
    (this._swatches || []).forEach((sw, j) => sw.classList.toggle("sel", j === i));
    this._renderTools();
  }

  _renderTools() {
    const d = this._draft();
    const i = this._sel;
    const box = this._ed.tools;
    if (i == null || i >= d.colors.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const ib = (icon, title, disabled, fn) => h("button", { class: "ibtn", title, disabled, onclick: fn }, ic(icon));
    const n = d.colors.length;
    box.replaceChildren(
      h("span", { class: "tinfo" }, h("span", { class: "tdot", style: { background: d.colors[i] } }), `Farbe ${i + 1} · ${d.colors[i].toUpperCase()}`),
      ib("mdi:chevron-left", "Nach links schieben", i === 0, () => this._move(i, -1)),
      ib("mdi:chevron-right", "Nach rechts schieben", i === n - 1, () => this._move(i, 1)),
      ib("mdi:content-duplicate", "Verdoppeln", n >= this._config.max_colors, () => {
        d.colors.splice(i + 1, 0, d.colors[i]);
        this._sel = i + 1;
        this._renderColors();
        this._changed();
      }),
      ib("mdi:delete-outline", n <= 2 ? "Mindestens 2 Farben" : "Entfernen", n <= 2, () => {
        d.colors.splice(i, 1);
        this._sel = null;
        this._renderColors();
        this._changed();
      }),
      ib("mdi:close", "Auswahl aufheben", false, () => {
        this._sel = null;
        (this._swatches || []).forEach((sw) => sw.classList.remove("sel"));
        this._renderTools();
      })
    );
  }

  _move(i, dir) {
    const c = this._draft().colors;
    const j = i + dir;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    this._sel = j;
    this._renderColors();
    this._changed();
  }

  _mutate(fn) {
    fn(this._draft().colors);
    this._sel = null;
    this._renderColors();
    this._changed();
  }

  _random() {
    const n = this._draft().colors.length;
    const base = Math.random() * 360;
    const spread = Math.random() < 0.5 ? 360 / n : 150 / n; // Farbkreis oder benachbarte Töne
    this._mutate((c) => {
      for (let i = 0; i < n; i++) {
        c[i] = geHsl((base + i * spread + (Math.random() - 0.5) * 14 + 360) % 360, 85 + Math.random() * 15, 48 + Math.random() * 8);
      }
    });
  }

  _renderStyle() {
    const d = this._draft();
    this._ed.style.replaceChildren(
      ...GE_STYLES.map((s) =>
        h(
          "button",
          {
            class: d.style === s.id ? "on" : "",
            onclick: () => {
              d.style = s.id;
              this._renderStyle();
              this._changed();
            },
          },
          s.label
        )
      )
    );
  }

  _renderPreview() {
    const d = this._draft();
    this._ed.preview.style.background = geBar(d.colors, d.style);
  }

  _changed(fromPicker) {
    this._renderPreview();
    if (fromPicker) {
      const d = this._draft();
      if (this._sel != null && this._ed.tools && !this._ed.tools.hidden) {
        const info = this._ed.tools.querySelector(".tinfo");
        if (info) info.replaceChildren(h("span", { class: "tdot", style: { background: d.colors[this._sel] } }), `Farbe ${this._sel + 1} · ${d.colors[this._sel].toUpperCase()}`);
      }
    }
    this._renderStatus();
    this._saveStore();
    this._liveApply();
  }

  /* ---------- Senden ---------- */
  _call(domain, service, data) {
    if (!this._hass) return Promise.resolve(false);
    return this._hass.callService(domain, service, data).then(
      () => true,
      (e) => {
        this._toast("Fehler: " + (e && e.message ? e.message : e));
        return false;
      }
    );
  }

  _apply(silent) {
    const d = this._draft();
    const lamp = this._lampObj();
    if (!lamp) return this._toast("Keine Lampe gewählt");
    this._lastSend = Date.now();
    const topic = `${this._config.base_topic}/${lamp.name}/set`;
    // Zwei Nachrichten: Steht "gradient" mit "state" in einer Nachricht, übernimmt
    // Z2M den Zustand nicht und meldet die Lampe weiter als "aus".
    return this._call("mqtt", "publish", { topic, payload: JSON.stringify({ state: "ON", brightness: d.bright }) })
      .then((ok) => ok && this._call("mqtt", "publish", { topic, payload: JSON.stringify({ gradient_style: d.style, gradient: d.colors }) }))
      .then((ok) => {
        if (ok && !silent) this._toast(`Verlauf an ${lamp.label} gesendet`);
      });
  }

  /* Live: höchstens alle 350 ms senden, letzter Stand kommt immer an */
  _liveApply() {
    if (!this._live) return;
    clearTimeout(this._liveTimer);
    const wait = GE_LIVE_MS - (Date.now() - (this._lastSend || 0));
    if (wait <= 0) this._apply(true);
    else this._liveTimer = setTimeout(() => this._apply(true), wait);
  }

  /* ---------- Speichern ---------- */
  async _saveSlot(asNew) {
    const d = this._draft();
    const lamp = this._lampObj();
    if (!lamp) return;
    let n = !asNew && d.edit ? d.edit.slot : this._freeSlot(lamp);
    if (!n) return this._toast(`Alle ${this._config.slots} Slots von ${lamp.label} sind belegt – lösche zuerst einen in der Bibliothek.`);
    const name = (d.name || "").trim() || `Verlauf ${n}`;
    const value = JSON.stringify({ n: name, s: d.style, c: d.colors });
    if (value.length > 255) return this._toast("Zu lang für einen Slot (max. 255 Zeichen) – weniger Farben oder kürzerer Name.");
    const eid = lamp.slotPrefix + n;
    const old = this._st(eid);
    if (!(await this._call("input_text", "set_value", { entity_id: eid, value }))) return;
    d.name = name;
    d.edit = { slot: n, sig: this._sigOf(d) };
    if (this._ed && this._ed.name) this._ed.name.value = name;
    this._saveStore();
    this._renderStatus();
    const uses = this._usage(lamp, n);
    const undo =
      !asNew && old && old[0] === "{"
        ? { text: "Rückgängig", action: () => this._call("input_text", "set_value", { entity_id: eid, value: old }) }
        : null;
    this._toast(
      asNew || !old ? `„${name}“ in Slot ${n} gespeichert` : `„${name}“ gespeichert` + (uses.length ? ` – gilt für ${uses.join(", ")}` : ""),
      undo
    );
  }

  /* ---------- Bibliothek ---------- */
  _renderLib() {
    const lamp = this._lampObj();
    const body = this._el.body;
    if (!lamp) return body.replaceChildren(h("div", { class: "empty" }, "Keine Lampe konfiguriert."));
    const slots = this._slots(lamp);
    const used = slots.filter((s) => s.d);
    const d = this._draft();
    const scenes = this._scenes();
    const others = this._lamps().filter((l) => l.name !== lamp.name);
    const list = h("div", { class: "lib" });
    for (const s of used) {
      const uses = this._usage(lamp, s.n, scenes);
      list.append(
        h(
          "div",
          { class: "item" + (d.edit && d.edit.slot === s.n ? " editing" : ""), title: "Im Editor öffnen", onclick: () => this._loadSlot(s) },
          h("span", { class: "bar", style: { background: geBar(s.d.c, s.d.s) } }),
          h(
            "div",
            { class: "info" },
            h("div", { class: "nm" }, s.d.n || `Verlauf ${s.n}`),
            h(
              "div",
              { class: "meta" },
              `Slot ${s.n} · ${s.d.c.length} Farben · ${geStyleLabel(s.d.s)}`,
              uses.length ? h("span", { class: "badge", title: uses.join(", ") }, `${uses.length} Szene${uses.length > 1 ? "n" : ""}`) : null
            )
          ),
          h(
            "div",
            { class: "acts" },
            others.map((o) =>
              h("button", { class: "copy", title: `Auf ${o.label} kopieren`, onclick: (e) => { e.stopPropagation(); this._copySlot(s, o); } }, ic("mdi:content-copy"), o.label)
            ),
            h("button", { class: "ibtn danger", title: "Löschen", onclick: (e) => { e.stopPropagation(); this._deleteSlot(lamp, s, uses); } }, ic("mdi:delete-outline"))
          )
        )
      );
    }
    body.replaceChildren(
      h(
        "div",
        { class: "libhead" },
        h("span", { class: "muted" }, `${lamp.label}: ${used.length} von ${slots.length} Slots belegt`),
        h("button", { class: "btn secondary", onclick: () => { this._detach(); this._setTab("editor"); } }, ic("mdi:plus"), "Neuer Verlauf")
      ),
      used.length ? list : h("div", { class: "empty" }, "Noch keine Verläufe gespeichert.", h("br"), "Im Reiter „Festavia-Verlauf“ Farben einstellen und „Verlauf merken“ tippen.")
    );
  }

  _loadSlot(s) {
    const d = this._draft();
    d.colors = s.d.c.slice(0, this._config.max_colors);
    if (d.colors.length < 2) d.colors.push(d.colors[0]);
    d.style = s.d.s;
    d.name = s.d.n;
    d.edit = { slot: s.n, sig: this._sigOf(d) };
    this._sel = null;
    this._saveStore();
    this._setTab("editor");
    if (this._live) this._apply(true);
  }

  async _copySlot(s, target) {
    const tslots = this._slots(target);
    const same = tslots.find((x) => x.d && x.d.s === s.d.s && x.d.c.join() === s.d.c.join());
    if (same) return this._toast(`${target.label} hat diesen Verlauf schon (Slot ${same.n})`);
    const n = this._freeSlot(target);
    if (!n) return this._toast(`Alle Slots von ${target.label} sind belegt`);
    const value = JSON.stringify({ n: s.d.n, s: s.d.s, c: s.d.c });
    if (await this._call("input_text", "set_value", { entity_id: target.slotPrefix + n, value })) {
      this._toast(`„${s.d.n}“ nach ${target.label} kopiert (Slot ${n})`);
    }
  }

  async _deleteSlot(lamp, s, uses) {
    const name = s.d.n || `Verlauf ${s.n}`;
    const text =
      `„${name}“ (Slot ${s.n}) löschen?` +
      (uses.length
        ? `\n\nEr wird in ${uses.join(", ")} verwendet. Diese Szenen melden dann „Verlauf nicht gefunden“, bis du dort etwas anderes einstellst.`
        : "");
    if (!(await this._confirm(text, "Löschen", true))) return;
    const eid = lamp.slotPrefix + s.n;
    if (await this._call("input_text", "set_value", { entity_id: eid, value: "" })) {
      this._toast(`„${name}“ gelöscht`, { text: "Rückgängig", action: () => this._call("input_text", "set_value", { entity_id: eid, value: s.raw }) });
    }
  }

  /* ---------- Szenen-Tabelle ---------- */
  _renderScenes() {
    const body = this._el.body;
    const lamps = this._lamps().filter((l) => l.mapPrefix);
    const scenes = this._scenes();
    if (!lamps.length || !scenes.length) {
      return body.replaceChildren(h("div", { class: "empty" }, !scenes.length ? "Keine Szenen gefunden." : "Keine Szenen-Zuordnung konfiguriert (lamp_map)."));
    }
    const active = this._st(this._config.picker);
    const slotsBy = {};
    lamps.forEach((l) => (slotsBy[l.name] = this._slots(l)));
    const grid = h("div", { class: "matrix", style: { gridTemplateColumns: `minmax(0, 1fr) repeat(${lamps.length}, minmax(88px, 1.1fr))` } });
    grid.append(h("span", { class: "mh" }, "Szene"), ...lamps.map((l) => h("span", { class: "mh" }, l.label)));
    for (const sc of scenes) {
      const isActive = active === sc.name;
      const pv = this._scenePreview(sc.id);
      grid.append(
        h(
          "button",
          {
            class: "scn" + (isActive ? " active" : ""), title: `„${sc.name}“ aktivieren (wie mit der Fernbedienung)`,
            onclick: async () => (isActive || (await this._confirm(`Licht auf „${sc.name}“ umschalten?`, "Umschalten")) ? this._activate(sc) : null),
          },
          ic(isActive ? "mdi:check-circle" : "mdi:play-circle-outline"),
          h("span", { class: "sn" }, sc.name),
          pv.length ? geStrip(pv) : null
        )
      );
      for (const l of lamps) {
        const open = this._cell && this._cell.id === sc.id && this._cell.lamp === l.name;
        grid.append(this._cellButton(sc, l, slotsBy[l.name], open));
      }
      if (this._cell && this._cell.id === sc.id) {
        const l = lamps.find((x) => x.name === this._cell.lamp);
        if (l) grid.append(this._cellPanel(sc, l, slotsBy[l.name]));
      }
    }
    body.replaceChildren(
      h("p", { class: "hint" }, "Feld antippen: festlegen, was die Lampe bei dieser Szene tut. Szenenname antippen: Szene aktivieren (mit Rückfrage). Farbstreifen = Vorschau, entsteht beim Laden oder Speichern im Reiter Stimmung."),
      grid
    );
  }

  _cellButton(sc, l, slots, open) {
    const raw = this._mapRaw(l, sc.id);
    const toggle = () => {
      this._cell = open ? null : { id: sc.id, lamp: l.name };
      this._cellDraft = null;
      this._renderScenes();
    };
    let cls = "cell";
    let kids;
    if (raw === null) {
      cls += " none";
      kids = [h("span", { class: "ln" }, ic("mdi:plus"), h("span", null, "anlegen"))];
    } else {
      const p = this._parseMap(raw);
      if (p.m === "n") {
        cls += " none";
        kids = [h("span", { class: "ln", title: "Nicht ändern" }, "–")];
      } else if (p.m === "a") {
        cls += " off";
        kids = [h("span", { class: "ln" }, ic("mdi:power-off"), h("span", null, "Aus"))];
      } else if (p.m === "c") {
        kids = [h("span", { class: "ln" }, h("span", { class: "cdot", style: { background: p.c } }), h("span", null, "Farbe")), h("span", { class: "sub" }, gePct(p.b) + " %")];
      } else if (p.m === "t") {
        kids = [h("span", { class: "ln" }, h("span", { class: "cdot", style: { background: geKelvinColor(p.k) } }), h("span", null, p.k + " K")), h("span", { class: "sub" }, gePct(p.b) + " %")];
      } else {
        const n = this._mapSlot(l, p, slots);
        const s = n ? slots[n - 1] : null;
        if (s && s.d) {
          kids = [h("span", { class: "mini", style: { background: geBar(s.d.c, s.d.s) } }), h("span", { class: "ln" }, h("span", null, s.d.n || `Slot ${n}`), h("span", { class: "sub" }, "· " + gePct(p.b) + " %"))];
        } else {
          cls += " warn";
          kids = [h("span", { class: "ln", title: "Der zugeordnete Verlauf existiert nicht mehr" }, ic("mdi:alert-outline"), h("span", null, n ? `Slot ${n} leer` : `„${p.v}“ fehlt`))];
        }
      }
    }
    return h("button", { class: cls + (open ? " sel" : ""), onclick: toggle }, kids);
  }

  _cellPanel(sc, l, slots) {
    const raw = this._mapRaw(l, sc.id);
    const close = () => {
      this._cell = null;
      this._cellDraft = null;
      this._renderScenes();
    };
    const head = h("div", { class: "phead" }, ic("mdi:link-variant"), h("span", null, `${sc.name} · ${l.label}`), h("button", { class: "ibtn", title: "Schließen", onclick: close }, ic("mdi:close")));
    if (raw === null) {
      return h(
        "div",
        { class: "panel" },
        head,
        h("div", { class: "muted" }, "Für diese Szene gibt es noch keinen Zuordnungs-Helfer."),
        h("div", { class: "pfoot" }, h("button", { class: "btn", onclick: () => this._createMapHelper(l, sc.id) }, ic("mdi:plus"), "Zuordnung anlegen"))
      );
    }
    const key = sc.id + "|" + l.name;
    let dft = this._cellDraft;
    if (!dft || dft.key !== key || (raw !== dft.raw && raw !== dft.written)) {
      dft = this._cellDraft = { key, raw, written: null, p: this._parseMap(raw) };
    }
    dft.raw = raw;
    const p = dft.p;
    const set = (changes) => {
      Object.assign(p, changes);
      this._writeCell(l, sc.id, p);
      this._renderScenes();
    };

    const modeSeg = h(
      "div",
      { class: "seg" },
      GE_MODES.map((m) =>
        h(
          "button",
          {
            class: p.m === m.id ? "on" : "",
            title: m.title || m.label,
            onclick: () => {
              const ch = { m: m.id };
              if (m.id === "v" && !this._mapSlot(l, p, slots)) {
                const d = this._drafts[l.name];
                const pick = (d && d.edit && slots[d.edit.slot - 1] && slots[d.edit.slot - 1].d) ? d.edit.slot : (slots.find((s) => s.d) || {}).n || 0;
                ch.s = pick;
              }
              set(ch);
            },
          },
          ic(m.icon),
          m.id === "n" ? null : h("span", null, m.label)
        )
      )
    );

    const bri = () => {
      const val = h("span", { class: "val" }, gePct(p.b) + " %");
      const r = h("input", {
        type: "range", min: 1, max: 100, value: gePct(p.b),
        oninput: () => (val.textContent = r.value + " %"),
        onchange: () => set({ b: geBri(r.value) }),
      });
      return [h("div", { class: "label" }, "Helligkeit"), h("div", { class: "range" }, ic("mdi:brightness-6"), r, val)];
    };

    let mode;
    if (p.m === "v") {
      const cur = this._mapSlot(l, p, slots);
      const filled = slots.filter((s) => s.d);
      mode = [
        filled.length
          ? h(
              "div",
              { class: "opts" },
              filled.map((s) =>
                h(
                  "button",
                  { class: "opt" + (cur === s.n ? " on" : ""), onclick: () => set({ s: s.n, v: "" }) },
                  h("span", { class: "mini", style: { background: geBar(s.d.c, s.d.s) } }),
                  h("span", { class: "nm" }, s.d.n || `Verlauf ${s.n}`),
                  h("span", { class: "muted", style: "margin-left:auto;font-size:.8em" }, `Slot ${s.n}`)
                )
              )
            )
          : h("div", { class: "muted" }, `${l.label} hat noch keine gespeicherten Verläufe – „Editor-Stand übernehmen“ legt einen an.`),
        !cur && p.v ? h("div", { class: "muted" }, `Alter Eintrag „${p.v}“ wurde nicht gefunden.`) : null,
        bri(),
      ];
    } else if (p.m === "c") {
      const fill = h("span", { class: "fill", style: `position:absolute;inset:0;border-radius:50%;background:${p.c}` });
      const hex = h("span", null, p.c.toUpperCase());
      const input = h("input", {
        type: "color", value: p.c,
        oninput: () => {
          fill.style.background = input.value;
          hex.textContent = input.value.toUpperCase();
        },
        onchange: () => set({ c: input.value }),
      });
      mode = [h("div", { class: "cpick" }, h("label", { title: "Farbe wählen" }, fill, input), hex), bri()];
    } else if (p.m === "t") {
      const val = h("span", { class: "val" }, p.k + " K");
      const r = h("input", {
        type: "range", class: "kelvin", min: 1500, max: 6500, step: 100, value: p.k,
        oninput: () => (val.textContent = r.value + " K"),
        onchange: () => set({ k: Number(r.value) }),
      });
      mode = [h("div", { class: "range" }, r, val), bri()];
    } else if (p.m === "a") {
      mode = [h("div", { class: "muted" }, `${l.label} wird bei „${sc.name}“ ausgeschaltet.`)];
    } else {
      mode = [h("div", { class: "muted" }, `${l.label} bleibt bei „${sc.name}“ so, wie sie gerade ist.`)];
    }

    const ed = this._draft();
    return h(
      "div",
      { class: "panel" },
      head,
      modeSeg,
      mode,
      h(
        "div",
        { class: "pfoot" },
        h(
          "button",
          { class: "btn secondary take", title: "Den Verlauf aus dem Editor für diese Szene verwenden (legt bei Bedarf einen Slot an)", onclick: () => this._takeEditor(sc, l) },
          h("span", { class: "mini", style: { background: geBar(ed.colors, ed.style) } }),
          "Editor-Stand übernehmen"
        ),
        h("span", { class: "grow" }),
        h("button", { class: "btn secondary", title: `Nur ${l.label} so einstellen wie bei „${sc.name}“`, onclick: () => this._testCell(sc, l) }, ic("mdi:play"), "Testen")
      )
    );
  }

  _mapObj(p) {
    let o = null;
    if (p.m === "n") o = { m: "n" };
    else if (p.m === "a") o = { m: "a" };
    else if (p.m === "c") o = { m: "c", c: p.c, b: p.b };
    else if (p.m === "t") o = { m: "t", k: p.k, b: p.b };
    else if (p.s) o = { m: "v", s: p.s, b: p.b };
    else if (p.v) o = { m: "v", v: p.v, b: p.b };
    if (o && p.p && p.p.length) o.p = p.p; // Farbvorschau der Szene mitnehmen
    return o; // null = Verlauf ohne Slot: (noch) nicht speichern
  }

  _writeCell(l, id, p) {
    const obj = this._mapObj(p);
    if (!obj) return Promise.resolve(false);
    const value = JSON.stringify(obj);
    if (this._cellDraft) this._cellDraft.written = value;
    return this._call("input_text", "set_value", { entity_id: l.mapPrefix + id, value });
  }

  async _takeEditor(sc, l) {
    const d = this._draft();
    const slots = this._slots(l);
    let n = 0;
    let name = "";
    if (l.name === this._lamp && d.edit && !this._dirty(d) && slots[d.edit.slot - 1] && slots[d.edit.slot - 1].d) {
      n = d.edit.slot;
    } else {
      const same = slots.find((s) => s.d && s.d.s === d.style && s.d.c.join() === d.colors.join());
      if (same) n = same.n;
    }
    if (n) {
      name = slots[n - 1].d.n;
    } else {
      n = this._freeSlot(l);
      if (!n) return this._toast(`Alle Slots von ${l.label} sind belegt – erst in der Bibliothek einen löschen.`);
      name = ((l.name === this._lamp && (d.name || "").trim()) || sc.name).slice(0, 30);
      const value = JSON.stringify({ n: name, s: d.style, c: d.colors });
      if (value.length > 255) return this._toast("Zu lang für einen Slot (max. 255 Zeichen)");
      if (!(await this._call("input_text", "set_value", { entity_id: l.slotPrefix + n, value }))) return;
      if (l.name === this._lamp) {
        d.name = name;
        d.edit = { slot: n, sig: this._sigOf(d) };
        this._saveStore();
      }
    }
    const p = this._cellDraft && this._cellDraft.key === sc.id + "|" + l.name ? this._cellDraft.p : this._parseMap(this._mapRaw(l, sc.id));
    Object.assign(p, { m: "v", s: n, v: "", b: d.bright });
    if (await this._writeCell(l, sc.id, p)) this._toast(`${sc.name} · ${l.label}: „${name}“ (Slot ${n})`);
    this._renderScenes();
  }

  _testCell(sc, l) {
    const [domain, service] = this._config.test_script.split(".");
    this._call(domain, service, { lampe: l.name, szene: String(sc.id) }).then((ok) => ok && this._toast(`${l.label}: Einstellung von „${sc.name}“ angewendet`));
  }

  _activate(sc) {
    this._call("scene", "turn_on", { entity_id: sc.eid }).then((ok) => ok && this._toast(`„${sc.name}“ aktiviert`));
  }

  /* Fehlenden Zuordnungs-Helfer anlegen (nur als Admin möglich) */
  _createMapHelper(l, id) {
    const base = l.mapPrefix.replace(/^input_text\./, "").replace(/_$/, "");
    const name = base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " " + id;
    this._hass
      .callWS({ type: "input_text/create", name, max: 255, icon: "mdi:link-variant" })
      .then(() => this._toast(`Helfer „${name}“ angelegt`))
      .catch((e) => this._toast("Helfer anlegen fehlgeschlagen: " + (e && e.message ? e.message : e)));
  }

  /* ---------- Generator (v1.8 „Stimmung“): Zustand ---------- */
  _genSanitize(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const sat = {};
    for (const p of GE_PALETTES) {
      const v = r.sat && Array.isArray(r.sat[p.id]) ? r.sat[p.id] : p.sat;
      const lo = geClamp(v[0], 0, 100, p.sat[0]);
      sat[p.id] = [lo, Math.max(lo, geClamp(v[1], 0, 100, p.sat[1]))];
    }
    const ctLo = geClamp(r.ct && r.ct[0], 2000, 6500, 2200);
    const colors = (Array.isArray(r.colors) ? r.colors : [])
      .filter((x) => x && Number.isFinite(Number(x.h)))
      .slice(0, GE_GEN_MAX)
      .map((x) => ({ h: geClamp(x.h, 0, 360, 0), s: geClamp(x.s, 0, 100, 60), lock: !!x.lock }));
    // v1.7-Rollen (A/G/O/K, V/C/T) werden übernommen
    const oldRole = { A: "farbe", G: "weiss", O: "aus", K: "gleich" };
    const lamps = {};
    for (const [eid, p] of Object.entries((r.lamps && typeof r.lamps === "object" && r.lamps) || {})) {
      if (!p || typeof p !== "object") continue;
      lamps[eid] = {
        role: GE_GEN_ROLES.includes(p.role) ? p.role : oldRole[p.role] || "farbe",
        idx: Math.round(geClamp(p.idx, 0, GE_GEN_MAX - 1, 0)),
        bri: geClamp(p.bri, 1, 254, 254),
        lock: !!p.lock,
      };
    }
    const oldMode = { V: "stimmung", C: "stimmung", T: "weiss", O: "aus", K: "gleich" };
    const grad = {};
    for (const [name, p] of Object.entries((r.grad && typeof r.grad === "object" && r.grad) || {})) {
      if (!p || typeof p !== "object") continue;
      grad[name] = {
        mode: GE_FEST_MODES.some((m) => m.id === p.mode) ? p.mode : oldMode[p.role] || "stimmung",
        bri: geClamp(p.bri, 1, 254, 102),
        lock: !!p.lock,
        rnd: Array.isArray(p.rnd) ? p.rnd.filter((x) => GE_HEX.test(x)).slice(0, GE_GEN_MAX) : [],
        order: Array.isArray(p.order) ? p.order.map(Number).filter((x) => Number.isInteger(x) && x >= 0) : [],
        src: !!p.src, // Verlauf stammt aus der geladenen Szene → „Neue Stimmung“ schaltet auf Stimmungsfarben
      };
    }
    // Helligkeits-Profile: {Szenenname: {Lampen-Schlüssel: 0 (aus) | 1..254}}
    const profiles = {};
    for (const [name, prof] of Object.entries((r.profiles && typeof r.profiles === "object" && r.profiles) || {}).slice(0, 40)) {
      if (!prof || typeof prof !== "object") continue;
      const m = {};
      for (const [k, v] of Object.entries(prof)) m[k] = geClamp(v, 0, 254, 0);
      profiles[String(name).slice(0, 60)] = m;
    }
    return {
      pal: GE_PALETTES.some((p) => p.id === r.pal) ? r.pal : "pastell",
      sat,
      dist: geClamp(r.dist, 0, 90, 25),
      spread: geClamp(r.spread, 5, 120, 30),
      base: GE_HEX.test(r.base || "") ? r.base : "#ff7a00",
      ct: [ctLo, Math.max(ctLo, geClamp(r.ct && r.ct[1], 2000, 6500, 3500))],
      trans: r.trans !== false,
      gstyle: GE_GEN_STYLES.some((x) => x.id === r.gstyle) ? r.gstyle : "linear",
      colors,
      lamps,
      grad,
      master: geClamp(r.master, 10, 150, 100),
      profiles,
      prof: typeof r.prof === "string" && profiles[r.prof] ? r.prof : "",
      from: typeof r.from === "string" ? r.from.slice(0, 60) : "", // Startpunkt-Szene
    };
  }

  /* Lampen der Gruppe: Art aus supported_color_modes */
  _genLamps() {
    return (this._config.gen_lamps || []).map((x) => {
      const eid = typeof x === "string" ? x : x.entity;
      const st = this._hass && this._hass.states[eid];
      const modes = (st && st.attributes.supported_color_modes) || [];
      let kind = "missing";
      if (st) {
        if (modes.some((m) => ["xy", "hs", "rgb", "rgbw", "rgbww"].includes(m))) kind = "color";
        else if (modes.includes("color_temp")) kind = "white";
        else kind = "dim";
      }
      const label = (typeof x === "object" && x.name) || (st && st.attributes.friendly_name) || eid;
      return {
        key: eid, eid, label, kind, st,
        minK: (st && st.attributes.min_color_temp_kelvin) || 2200,
        maxK: (st && st.attributes.max_color_temp_kelvin) || 6500,
      };
    });
  }

  _genGrads() {
    const skip = this._config.gen_skip || [];
    return this._lamps()
      .filter((l) => !skip.includes(l.name))
      .map((l) => {
        const st = l.entity && this._hass.states[l.entity];
        return {
          key: l.name, name: l.name, eid: l.entity, label: l.label, kind: st ? "grad" : "missing", grad: true, st,
          minK: (st && st.attributes.min_color_temp_kelvin) || 2000,
          maxK: (st && st.attributes.max_color_temp_kelvin) || 6500,
        };
      });
  }

  /* Einstellungen einer Lampe (legt Vorgaben an) */
  _gp(l) {
    const g = this._gen;
    if (l.grad) {
      if (!g.grad[l.key]) g.grad[l.key] = { mode: "stimmung", bri: 102, lock: false, rnd: [], order: [], src: false };
      return g.grad[l.key];
    }
    if (!g.lamps[l.key]) {
      // neue Farblampe: nächste Stimmungsfarbe reihum
      const used = Object.values(g.lamps).filter((x) => x.role === "farbe").length;
      g.lamps[l.key] = { role: l.kind === "color" ? "farbe" : "weiss", idx: used % Math.max(1, g.colors.length), bri: l.kind === "color" ? 254 : 200, lock: false };
    }
    const p = g.lamps[l.key];
    if (p.role === "farbe" && (l.kind === "white" || l.kind === "dim")) p.role = "weiss";
    if (p.idx >= g.colors.length) p.idx = p.idx % Math.max(1, g.colors.length);
    return p;
  }

  /* Beim ersten Öffnen (oder nach v1.7): Stimmung aus 4 Farben, Farblampen reihum verteilen */
  _genEnsure() {
    const g = this._gen;
    if (g.colors.length >= 2) return;
    g.colors = this._genColors(4, []).map((c) => Object.assign(c, { lock: false }));
    for (const l of this._genLamps()) {
      const p = this._gp(l);
      if (l.kind === "color" && p.role === "weiss") p.role = "farbe";
    }
    this._genDistribute(false);
    this._saveStore();
  }

  /* ---------- Generator: Farben ---------- */
  _genColors(n, fixedHues) {
    const g = this._gen;
    const [smin, smax] = g.sat[g.pal];
    const fixed = (fixedHues || []).filter((x) => Number.isFinite(x));
    const pal = g.pal;
    const jit = () => Math.random() * 2 - 1;
    const sat = () => Math.round(smin + Math.random() * (smax - smin));
    // Muster-Arten: die Position k (nach den gesperrten Farben) bestimmt die Farbfamilie
    if (pal === "komplementaer" || pal === "dreiklang" || pal === "akzent") {
      const base = fixed.length ? fixed[0] : Math.random() * 360;
      const out = [];
      for (let i = 0; i < n; i++) {
        const k = fixed.length + i;
        let hue;
        let s = sat();
        if (pal === "komplementaer") hue = base + (k % 2) * 180 + jit() * Math.min(g.spread, 25);
        else if (pal === "dreiklang") hue = base + (k % 3) * 120 + jit() * Math.min(g.spread, 20);
        else if (k === 0) hue = base;
        else {
          hue = 30 + jit() * 10; // warmweiß
          s = Math.round(8 + Math.random() * 17);
        }
        out.push({ h: Math.round((hue + 360) % 360), s });
      }
      return out;
    }
    let base = null;
    let spread = 180;
    if (pal === "analog" || pal === "basis") {
      spread = g.spread;
      base = pal === "basis" ? geHexHue(g.base) : fixed.length ? geHueMean(fixed) : Math.random() * 360;
    } else if (pal === "warm") {
      base = 20;
      spread = 35;
    } else if (pal === "kuehl") {
      base = 220;
      spread = 45;
    }
    // Mindestabstand: bei engem Farbbereich automatisch kleiner, damit er erreichbar bleibt
    const dist = base === null ? g.dist : Math.min(g.dist, (2 * spread) / Math.max(1, n + fixed.length));
    const taken = fixed.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = -1;
      for (let t = 0; t < 40; t++) {
        const hue = base === null ? Math.random() * 360 : (base + (Math.random() * 2 - 1) * spread + 360) % 360;
        const d = taken.length ? Math.min(...taken.map((x) => geHueDist(x, hue))) : Infinity;
        if (d >= dist) {
          best = hue;
          bestD = d;
          break;
        }
        if (d > bestD) {
          bestD = d;
          best = hue;
        }
      }
      taken.push(best);
      out.push({ h: Math.round(best), s: Math.round(smin + Math.random() * (smax - smin)) });
    }
    return out;
  }

  /* Weiß passend zur Stimmung: warme Farben → warmes Weiß, kühle → kühleres (innerhalb des Weiß-Bereichs) */
  _genWhiteK() {
    const g = this._gen;
    const [lo, hi] = g.ct;
    if (!g.colors.length) return lo;
    let w = 0;
    let sum = 0;
    for (const c of g.colors) {
      const wt = 0.3 + c.s / 100;
      w += (wt * (Math.cos(((c.h - 30) * Math.PI) / 180) + 1)) / 2;
      sum += wt;
    }
    return Math.round((hi - (w / sum) * (hi - lo)) / 50) * 50;
  }

  _genK(l) {
    return Math.max(l.minK, Math.min(l.maxK, this._genWhiteK()));
  }

  _genBri(p) {
    return Math.max(1, Math.min(254, Math.round((p.bri * this._gen.master) / 100)));
  }

  _genHex(i) {
    const c = this._gen.colors[i] || this._gen.colors[0];
    return c ? geHsvHex(c.h, c.s) : "#ffffff";
  }

  /* Farbe einer Lampe für die Anzeige: null = aus, "gleich" = unverändert */
  _genLampColor(l, p) {
    if (l.kind === "missing") return null;
    if (l.grad) {
      if (p.mode === "aus") return null;
      if (p.mode === "gleich") return "gleich";
      if (p.mode === "weiss") return geKelvinColor(this._genK(l));
      return geBar(this._genFestColors(p), this._gen.gstyle);
    }
    if (p.role === "aus") return null;
    if (p.role === "gleich") return "gleich";
    if (p.role === "farbe" && l.kind === "color") return this._genHex(p.idx);
    return l.kind === "dim" ? "#fff6e0" : geKelvinColor(this._genK(l));
  }

  _genFestOrder(p) {
    const n = this._gen.colors.length;
    const o = p.order;
    return o.length === n && new Set(o).size === n && o.every((i) => i < n) ? o : [...Array(n).keys()];
  }

  _genFestColors(p) {
    if (p.mode === "zufall") {
      if (p.rnd.length < 2) p.rnd = this._genColors(5, []).map((x) => geHsvHex(x.h, x.s));
      return p.rnd;
    }
    return this._genFestOrder(p).map((i) => this._genHex(i));
  }

  /* Farblampen auf die Stimmungsfarben verteilen (gesperrte bleiben) */
  _genDistribute(random) {
    const n = Math.max(1, this._gen.colors.length);
    const free = this._genLamps().filter((l) => l.kind === "color" && this._gp(l).role === "farbe" && !this._gp(l).lock);
    let idx = free.map((_, i) => i % n);
    if (random) idx = gePerm(idx);
    free.forEach((l, i) => (this._gp(l).idx = idx[i]));
  }

  _genShuffleFest(p) {
    if (p.mode === "zufall") p.rnd = gePerm(this._genFestColors(p));
    else p.order = gePerm(this._genFestOrder(p));
  }

  /* ---------- Generator: Senden ---------- */
  async _genSend(l) {
    if (l.kind === "missing" || !l.eid) return;
    const g = this._gen;
    const p = this._gp(l);
    const tr = g.trans ? { transition: 1 } : {};
    const off = () => this._call("light", "turn_off", Object.assign({ entity_id: l.eid }, tr));
    const bri = this._genBri(p);
    if (l.grad) {
      if (p.mode === "gleich") return;
      if (p.mode === "aus") return off();
      if (p.mode === "weiss") return this._call("light", "turn_on", Object.assign({ entity_id: l.eid, color_temp_kelvin: this._genK(l), brightness: bri }, tr));
      const cols = this._genFestColors(p);
      const topic = `${this._config.base_topic}/${l.name}/set`;
      // zwei Nachrichten, sonst meldet Z2M die Lampe weiter als „aus“
      const ok = await this._call("mqtt", "publish", { topic, payload: JSON.stringify({ state: "ON", brightness: bri }) });
      if (ok) await this._call("mqtt", "publish", { topic, payload: JSON.stringify({ gradient_style: g.gstyle, gradient: cols }) });
      // Editor-Entwurf der Lampe = aktueller Verlauf (Reiter Editor/Szenen können ihn weiterverwenden)
      const d = this._draft(l.name);
      Object.assign(d, { colors: cols.slice(), style: g.gstyle, bright: bri, edit: null, name: "" });
      this._saveStore();
      return;
    }
    if (p.role === "gleich") return;
    if (p.role === "aus") return off();
    if (p.role === "farbe" && l.kind === "color") {
      const c = g.colors[p.idx] || g.colors[0];
      return this._call("light", "turn_on", Object.assign({ entity_id: l.eid, hs_color: [c.h, c.s], brightness: bri }, tr));
    }
    if (l.kind === "dim") return this._call("light", "turn_on", Object.assign({ entity_id: l.eid, brightness: bri }, tr));
    return this._call("light", "turn_on", Object.assign({ entity_id: l.eid, color_temp_kelvin: this._genK(l), brightness: bri }, tr));
  }

  /* Sendet an alle (oder eine) Lampe; ein neuer Auftrag bricht einen laufenden ab */
  async _genSendAll(onlyGrads, one) {
    const list = one ? [one] : onlyGrads ? this._genGrads() : [...this._genLamps(), ...this._genGrads()].filter((l) => l.kind !== "missing");
    const seq = (this._genSeq = (this._genSeq || 0) + 1);
    this._genBusy(list.length > 1 ? `sendet an ${list.length} Lampen …` : "sendet …");
    for (const l of list) {
      if (seq !== this._genSeq) return;
      await this._genSend(l);
    }
    if (seq === this._genSeq) this._genBusy("");
  }

  /* Sende-Anzeige in der Leiste unten ("" = fertig) */
  _genBusy(text) {
    this._genBusyText = text;
    const el = this._genStatusEl;
    if (!el || !el.isConnected) return;
    el.classList.toggle("busy", !!text);
    el.lastChild.textContent = text || "Licht ist aktuell";
  }

  /* Vor der ersten Änderung: Schnappschuss als HA-Szene + Szene, deren Festavia-Verlauf zurückkommt */
  async _genSnapshot() {
    if (this._genSnap) return;
    const ids = [...this._genLamps(), ...this._genGrads()].filter((l) => l.kind !== "missing" && l.eid).map((l) => l.eid);
    const scenes = this._scenes();
    this._genStart = {
      state: JSON.stringify({ c: this._gen.colors, l: this._gen.lamps, g: this._gen.grad, s: this._gen.gstyle }),
      scene: scenes.find((x) => x.name === this._gen.from) || scenes.find((x) => x.name === this._st(this._config.picker)) || null,
    };
    if (await this._call("scene", "create", { scene_id: GE_SNAP_SCENE, snapshot_entities: ids })) this._genSnap = true;
  }

  /* Zurück/Vor: Farben, Rollen, Schlösser – Helligkeiten bleiben wie eingestellt */
  _genState() {
    const g = this._gen;
    return JSON.stringify({ c: g.colors, l: g.lamps, g: g.grad });
  }

  _genPush() {
    this._genUndo = this._genUndo || [];
    this._genUndo.push(this._genState());
    if (this._genUndo.length > 30) this._genUndo.shift();
    this._genRedo = [];
  }

  async _genStep(back) {
    const from = back ? this._genUndo : this._genRedo;
    const to = back ? (this._genRedo = this._genRedo || []) : (this._genUndo = this._genUndo || []);
    const s = (from || []).pop();
    if (!s) return;
    to.push(this._genState());
    const o = JSON.parse(s);
    const g = this._gen;
    const keep = (now, old) => {
      for (const [k, p] of Object.entries(old)) if (now[k]) p.bri = now[k].bri;
      return old;
    };
    g.colors = o.c;
    g.lamps = keep(g.lamps, o.l);
    g.grad = keep(g.grad, o.g);
    await this._genCommit(true);
  }

  /* Änderung merken, neu zeichnen, senden (true = alle, Lampe = nur diese, false = nichts) */
  async _genCommit(send) {
    this._saveStore();
    this._renderGen();
    if (send === true) await this._genSendAll();
    else if (send) await this._genSendAll(false, send);
  }

  async _genDo(fn, send, undoable = true) {
    await this._genSnapshot();
    if (undoable) this._genPush();
    fn();
    await this._genCommit(send);
  }

  _genRoll() {
    return this._genDo(() => {
      const g = this._gen;
      const fixed = g.colors.filter((c) => c.lock).map((c) => c.h);
      const fresh = this._genColors(g.colors.filter((c) => !c.lock).length, fixed);
      g.colors = g.colors.map((c) => (c.lock ? c : Object.assign(fresh.shift(), { lock: false })));
      for (const l of this._genGrads()) {
        const p = this._gp(l);
        if (p.lock || p.mode !== "zufall") continue;
        if (p.src) Object.assign(p, { mode: "stimmung", src: false, order: [] }); // Szenen-Verlauf → folgt jetzt der Stimmung
        else p.rnd = this._genColors(5, []).map((x) => geHsvHex(x.h, x.s));
      }
    }, true);
  }

  _genCount(d) {
    const g = this._gen;
    const n = Math.max(2, Math.min(GE_GEN_MAX, g.colors.length + d));
    if (n === g.colors.length) return;
    return this._genDo(() => {
      if (n > g.colors.length) g.colors.push(...this._genColors(n - g.colors.length, g.colors.map((c) => c.h)).map((c) => Object.assign(c, { lock: false })));
      else g.colors = g.colors.slice(0, n);
      for (const p of Object.values(g.grad)) p.order = [];
      for (const p of Object.values(g.lamps)) if (p.idx >= n) p.idx %= n;
      this._genDistribute(false);
    }, true);
  }

  _genShuffle() {
    let fest = false;
    return this._genDo(() => {
      this._genDistribute(true);
      for (const l of this._genGrads()) {
        const p = this._gp(l);
        if (!p.lock && (p.mode === "stimmung" || p.mode === "zufall")) {
          this._genShuffleFest(p);
          fest = true;
        }
      }
    }, true).then(() => this._toast(fest ? "Gleiche Farben, neu auf Lampen und Festavia verteilt" : "Gleiche Farben, neu auf die Lampen verteilt"));
  }

  /* „Licht zurück“: Lampen per Schnappschuss, Festavia per Zuordnung der Start-/aktiven Szene, Regler wie vorher */
  async _genRestore() {
    if (!this._genSnap) return this._toast("Seit dem Laden wurde nichts verändert");
    this._genSeq = (this._genSeq || 0) + 1; // laufendes Senden abbrechen
    const ok = await this._call("scene", "turn_on", Object.assign({ entity_id: "scene." + GE_SNAP_SCENE }, this._gen.trans ? { transition: 1 } : {}));
    if (!ok) return;
    const st = this._genStart || {};
    let fest = false;
    if (st.scene) {
      const [domain, service] = this._config.test_script.split(".");
      for (const l of this._genGrads()) {
        if (l.kind !== "missing" && (await this._call(domain, service, { lampe: l.name, szene: String(st.scene.id) }))) fest = true;
      }
    }
    if (st.state) {
      const o = JSON.parse(st.state);
      Object.assign(this._gen, { colors: o.c, lamps: o.l, grad: o.g, gstyle: o.s || this._gen.gstyle });
    }
    this._genSnap = false;
    this._genUndo = [];
    this._genRedo = [];
    this._genBusy("");
    this._saveStore();
    this._renderGen();
    this._toast("Licht wie vorher" + (fest ? ` – Festavia wie in „${st.scene.name}“` : ""));
  }

  /* Szene als Startpunkt: aufrufen, Farben/Helligkeiten aus dem Licht lesen, Festavia aus der Zuordnung */
  async _genLoadScene(sc) {
    this._genSheet = null;
    this._genSeq = (this._genSeq || 0) + 1;
    this._renderGen();
    this._genBusy(`„${sc.name}“ wird geladen …`);
    if (!(await this._call("scene", "turn_on", { entity_id: sc.eid }))) return this._genBusy("");
    await new Promise((r) => setTimeout(r, this._config.gen_learn_ms));
    const g = this._gen;
    const lamps = this._genLamps().filter((l) => l.kind !== "missing");
    const pts = [];
    for (const l of lamps) {
      const st = this._hass.states[l.eid];
      const hs = st && st.state === "on" && st.attributes.color_mode !== "color_temp" ? st.attributes.hs_color : null;
      if (l.kind === "color" && hs && hs[1] >= 15) pts.push({ key: l.key, h: hs[0], s: hs[1] });
    }
    const maps = {};
    for (const l of this._genGrads()) {
      if (l.kind === "missing") continue;
      const lamp = this._lampObj(l.name);
      const raw = this._mapRaw(lamp, sc.id);
      const m = raw === null ? { m: "n" } : this._parseMap(raw);
      let d = null;
      if (m.m === "v") {
        const slots = this._slots(lamp);
        const n = this._mapSlot(lamp, m, slots);
        d = n && slots[n - 1] ? slots[n - 1].d : null;
      }
      maps[l.key] = { m, d };
    }
    let cols = geCluster(pts, GE_GEN_MAX);
    if (cols.length < 2) {
      // wenig Farbe im Licht: Festavia-Verlauf als Quelle, sonst warme Grundtöne
      const src = Object.values(maps).find((x) => x.d);
      const more = src ? src.d.c.map((x) => ({ h: geHexHue(x), s: geHexSat(x) })) : [{ h: 30, s: 35 }, { h: 15, s: 45 }];
      for (const c of more) if (cols.length < 2 && !cols.some((x) => geHueDist(x.h, c.h) < 10)) cols.push(c);
      if (cols.length < 2) cols.push({ h: (cols[0].h + 20) % 360, s: cols[0].s });
    }
    g.colors = cols.map((c) => ({ h: Math.round(c.h), s: Math.round(c.s), lock: false }));
    const prof = this._genReadLevels();
    for (const l of lamps) {
      const p = this._gp(l);
      p.lock = false;
      if (!prof[l.key]) {
        p.role = "aus";
        continue;
      }
      p.bri = prof[l.key];
      const pt = pts.find((x) => x.key === l.key);
      if (!pt) {
        p.role = "weiss";
        continue;
      }
      let best = 0;
      g.colors.forEach((c, i) => {
        const b = g.colors[best];
        if (geHueDist(c.h, pt.h) + Math.abs(c.s - pt.s) / 3 < geHueDist(b.h, pt.h) + Math.abs(b.s - pt.s) / 3) best = i;
      });
      Object.assign(p, { role: "farbe", idx: best });
    }
    for (const l of this._genGrads()) {
      if (l.kind === "missing") continue;
      const p = this._gp(l);
      const { m, d } = maps[l.key];
      Object.assign(p, { lock: false, order: [], src: false });
      if (m.m === "a") p.mode = "aus";
      else if (m.m === "n") p.mode = "gleich";
      else if (m.m === "t") Object.assign(p, { mode: "weiss", bri: m.b });
      else if (m.m === "c") Object.assign(p, { mode: "zufall", rnd: [m.c, m.c], bri: m.b, src: true });
      else if (d) {
        const rnd = d.c.slice(0, GE_GEN_MAX);
        if (rnd.length < 2) rnd.push(rnd[0]);
        Object.assign(p, { mode: "zufall", rnd, bri: m.b, src: true });
        g.gstyle = d.s === "scattered" ? "scattered" : "linear";
      } else p.mode = "stimmung";
    }
    g.profiles[sc.name] = prof;
    Object.assign(g, { prof: sc.name, master: 100, from: sc.name });
    this._genSnap = false;
    this._genUndo = [];
    this._genRedo = [];
    await this._genWritePreview(sc.id, g.colors.map((c) => geHsvHex(c.h, c.s)));
    this._saveStore();
    this._genBusy("");
    this._renderGen();
    this._toast(`„${sc.name}“ geladen – jetzt verändern, dann überschreiben oder als neue Szene speichern`);
  }

  /* Farbvorschau in die vorhandenen Zuordnungen der Szene schreiben (übrige Felder bleiben) */
  async _genWritePreview(id, cols) {
    for (const l of this._lamps()) {
      const raw = this._mapRaw(l, id);
      if (!raw || raw[0] !== "{") continue;
      let o;
      try {
        o = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      if (JSON.stringify(o.p) === JSON.stringify(cols)) continue;
      o.p = cols;
      const value = JSON.stringify(o);
      if (value.length <= 255) await this._call("input_text", "set_value", { entity_id: l.mapPrefix + id, value });
    }
  }

  /* Helligkeiten jetzt aus HA lesen → Profil {Schlüssel: 0 | 1..254} */
  _genReadLevels() {
    const prof = {};
    for (const l of [...this._genLamps(), ...this._genGrads()]) {
      const st = this._hass.states[l.eid];
      if (!st || l.kind === "missing") continue;
      prof[l.key] = st.state === "on" ? st.attributes.brightness || 254 : 0;
    }
    return prof;
  }

  /* Profil auf die Regler legen (schaltet kein Licht) */
  _genApplyProfile(name) {
    const prof = this._gen.profiles[name];
    if (!prof) return;
    for (const l of [...this._genLamps(), ...this._genGrads()]) {
      if (l.kind === "missing" || !(l.key in prof)) continue;
      const p = this._gp(l);
      if (p.lock) continue;
      if (l.grad) {
        if (prof[l.key] > 0) {
          p.bri = prof[l.key];
          if (p.mode === "aus") p.mode = "stimmung";
        } else p.mode = "aus";
        continue;
      }
      if (prof[l.key] > 0) {
        p.bri = prof[l.key];
        if (p.role === "aus") p.role = l.kind === "color" ? "farbe" : "weiss";
      } else p.role = "aus";
    }
    this._gen.prof = name;
    this._gen.master = 100;
    this._saveStore();
    this._renderGen();
  }

  /* Szene einmal aufrufen, Helligkeiten lesen und als Profil merken */
  async _genLearn(sc) {
    await this._genSnapshot();
    if (!(await this._call("scene", "turn_on", { entity_id: sc.eid }))) return;
    this._toast(`„${sc.name}“ aufgerufen – Helligkeiten werden gelesen …`);
    await new Promise((r) => setTimeout(r, this._config.gen_learn_ms));
    this._gen.profiles[sc.name] = this._genReadLevels();
    this._genApplyProfile(sc.name);
    this._toast(`Helligkeiten von „${sc.name}“ gemerkt und übernommen`);
  }

  _genTakeProfile() {
    this._gen.profiles["Aktuelles Licht"] = this._genReadLevels();
    this._genApplyProfile("Aktuelles Licht");
    this._toast("Helligkeiten aus dem aktuellen Licht übernommen (ausgeschaltete Lampen stehen auf „Aus“)");
  }

  /* ---------- Generator: Speichern (Z2M-Szene überschreiben oder neu + Festavia-Zuordnung + Vorschau) ---------- */
  async _genSave() {
    const over = this._genSaveMode === "over";
    const scenes = this._scenes();
    const c = this._config;
    const [domain, service] = c.gen_save_script.split(".");
    let id;
    let name;
    if (over) {
      const sc = scenes.find((s) => s.name === this._gen.from);
      if (!sc) return this._toast(`„${this._gen.from}“ gibt es nicht mehr – bitte als neue Szene speichern`);
      const act = this._st(c.picker);
      // das Skript überschreibt die im Picker aktive Szene
      if (act !== sc.name) return this._toast(`Aktiv ist gerade „${act}“ – bitte „${sc.name}“ oben neu laden, dann überschreiben`);
      ({ id, name } = sc);
      if (!(await this._call(domain, service, { modus: "ueberschreiben" }))) return;
    } else {
      name = (this._genName || "").trim();
      if (!name) return this._toast("Bitte erst einen Namen für die Szene eingeben");
      if (scenes.some((s) => s.name === name)) return this._toast(`„${name}“ gibt es schon – bitte anderen Namen wählen`);
      id = Math.max(0, ...scenes.map((s) => s.id)) + 1; // so vergibt auch das Speicher-Skript die ID
      if (!(await this._call("input_text", "set_value", { entity_id: c.gen_name_entity, value: name }))) return;
      if (!(await this._call(domain, service, { modus: "neu" }))) return;
    }
    const preview = this._gen.colors.map((x) => geHsvHex(x.h, x.s));
    const notes = [];
    for (const l of this._genGrads()) {
      if (l.kind === "missing") continue;
      const msg = await this._genSaveGrad(l, id, name, over, preview);
      if (msg) notes.push(msg);
    }
    this._gen.from = name;
    this._genName = "";
    this._genSaveOpen = false;
    this._genSnap = false;
    this._genUndo = [];
    this._genRedo = [];
    this._saveStore();
    this._renderGen();
    this._toast(`„${name}“ ${over ? "überschrieben" : "als neue Szene gespeichert"}` + (notes.length ? " – " + notes.join("; ") : ", Festavia inklusive"));
  }

  /* Gradient-Lampe für Szene <id> eintragen: Verlauf → Slot (gleicher, beim Überschreiben der bisherige, sonst freier),
     dann Zuordnung mit Farbvorschau; "" = ok */
  async _genSaveGrad(l, id, name, over, preview) {
    const lamp = this._lampObj(l.name);
    if (!lamp || !lamp.mapPrefix) return "";
    const g = this._gen;
    const p = this._gp(l);
    let obj;
    if (p.mode === "gleich") obj = { m: "n" };
    else if (p.mode === "aus") obj = { m: "a" };
    else if (p.mode === "weiss") obj = { m: "t", k: this._genK(l), b: this._genBri(p) };
    else {
      const cols = this._genFestColors(p);
      const slots = this._slots(lamp);
      const same = slots.find((s) => s.d && s.d.s === g.gstyle && s.d.c.join() === cols.join());
      let n = same ? same.n : 0;
      const old = over ? this._mapRaw(lamp, id) : null;
      if (!n && old) {
        // bisherigen Slot der Szene wiederverwenden, wenn keine andere Szene ihn nutzt
        const op = this._parseMap(old);
        const on = op.m === "v" ? this._mapSlot(lamp, op, slots) : 0;
        if (on && this._usage(lamp, on).length <= 1) n = on;
      }
      if (!n) n = this._freeSlot(lamp);
      if (!n) return `${l.label}: alle Slots belegt, Verlauf nicht gespeichert (Bibliothek aufräumen)`;
      if (!same) {
        const value = JSON.stringify({ n: name.slice(0, 30), s: g.gstyle, c: cols });
        if (!(await this._call("input_text", "set_value", { entity_id: lamp.slotPrefix + n, value }))) return `${l.label}: Slot nicht gespeichert`;
      }
      obj = { m: "v", s: n, b: this._genBri(p) };
    }
    if (preview && preview.length) obj.p = preview;
    const eid = lamp.mapPrefix + id;
    if (!this._hass.states[eid]) {
      const base = lamp.mapPrefix.replace(/^input_text\./, "").replace(/_$/, "");
      const hname = base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " " + id;
      try {
        await this._hass.callWS({ type: "input_text/create", name: hname, max: 255, icon: "mdi:link-variant" });
      } catch (e) {
        return `${l.label}: Zuordnungs-Helfer konnte nicht angelegt werden`;
      }
      for (let t = 0; t < 25 && !this._hass.states[eid]; t++) await new Promise((r) => setTimeout(r, 200));
      if (!this._hass.states[eid]) return `${l.label}: Helfer ${eid} nicht gefunden`;
    }
    return (await this._call("input_text", "set_value", { entity_id: eid, value: JSON.stringify(obj) })) ? "" : `${l.label}: Zuordnung fehlgeschlagen`;
  }

  /* ---------- Generator: Oberfläche ---------- */
  _genPalPreview(p) {
    const g = this._gen;
    const s = (g.sat[p.id][0] + g.sat[p.id][1]) / 2;
    let hues;
    if (p.id === "pastell") hues = [350, 60, 170, 260];
    else if (p.id === "kraeftig") hues = [0, 120, 210, 290];
    else if (p.id === "warm") hues = [355, 15, 32, 48];
    else if (p.id === "kuehl") hues = [180, 205, 232, 262];
    else if (p.id === "komplementaer") hues = [25, 205, 40, 190];
    else if (p.id === "dreiklang") hues = [10, 130, 250, 30];
    else if (p.id === "akzent") return [geHsvHex(330, s), geHsvHex(30, 14), geHsvHex(32, 20), geHsvHex(28, 10)];
    else {
      const b = p.id === "basis" ? geHexHue(g.base) : 15;
      hues = [b - g.spread, b - g.spread / 3, b + g.spread / 3, b + g.spread].map((x) => (x + 360) % 360);
    }
    return hues.map((x, i) => geHsvHex(x, Math.max(0, Math.min(100, s + (i % 2 ? 6 : -6)))));
  }

  _genSheetOpen(sh) {
    const cur = this._genSheet;
    this._genSheet = cur && sh && cur.type === sh.type && cur.key === sh.key ? null : sh;
    this._renderGen();
    const el = this._genSheet && this._el.body.querySelector(".gsheet");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  _genStatus(l, p) {
    if (l.kind === "missing") return "nicht gefunden";
    if (l.grad) {
      const lbl = (GE_FEST_MODES.find((m) => m.id === p.mode) || GE_FEST_MODES[0]).label;
      if (p.mode === "aus" || p.mode === "gleich") return lbl;
      if (p.mode === "weiss") return `Weiß ${this._genK(l)} K · ${gePct(this._genBri(p))} %`;
      return `${lbl} · ${(GE_GEN_STYLES.find((s) => s.id === this._gen.gstyle) || GE_GEN_STYLES[0]).label} · ${gePct(this._genBri(p))} %`;
    }
    if (p.role === "aus") return "aus";
    if (p.role === "gleich") return "unverändert";
    if (p.role === "farbe" && l.kind === "color") return `Farbe ${p.idx + 1} · ${gePct(this._genBri(p))} %`;
    return (l.kind === "dim" ? "Weiß" : `Weiß ${this._genK(l)} K`) + ` · ${gePct(this._genBri(p))} %`;
  }

  _genTile(l) {
    if (l.kind === "missing") {
      return h("div", { class: "gtile off" + (l.grad ? " wide" : ""), title: l.eid || l.key }, h("span", { class: "gnm" }, l.label), h("span", { class: "gst" }, "nicht gefunden"));
    }
    const p = this._gp(l);
    const sh = this._genSheet;
    const c = this._genLampColor(l, p);
    const lit = c && c !== "gleich";
    const hl = sh && sh.type === "swatch" && (l.grad ? p.mode === "stimmung" : p.role === "farbe" && l.kind === "color" && p.idx === sh.key);
    const sel = sh && sh.type === "lamp" && sh.key === l.key;
    const glowA = lit ? Math.min(0.5, 0.12 + (gePct(this._genBri(p)) / 100) * 0.38) : 0;
    const kids = [
      l.grad ? null : h("span", { class: "glow", style: lit ? `background:radial-gradient(120% 90% at 0% 0%, ${c}, transparent 70%);opacity:${glowA}` : "" }),
      p.lock ? h("span", { class: "glk", title: "wird behalten" }, ic("mdi:lock")) : null,
      l.grad ? null : h("span", { class: "gdot" + (c === "gleich" ? " keep" : ""), style: lit ? { background: c } : "" }),
      h("span", { class: "gnm" }, l.label, l.grad ? h("span", { class: "muted" }, " · Gradient") : null),
      l.grad ? h("span", { class: "gbar" + (lit ? "" : " off"), style: lit ? { background: c } : "" }) : null,
      h("span", { class: "gst" }, this._genStatus(l, p)),
    ];
    return h(
      "button",
      {
        class: "gtile" + (l.grad ? " wide" : "") + (lit || c === "gleich" ? "" : " off") + (hl ? " hl" : "") + (sel ? " sel" : ""),
        title: l.eid,
        onclick: () => this._genSheetOpen({ type: "lamp", key: l.key }),
      },
      kids
    );
  }

  _genOpt(on, label, onclick, dot, title) {
    return h("button", { class: "gopt" + (on ? " on" : ""), onclick, title: title || null }, dot ? h("span", { class: "gd", style: { background: dot } }) : null, label);
  }

  _genBriRange(p, onset) {
    const val = h("span", { class: "val" }, gePct(p.bri) + " %");
    const r = h("input", {
      type: "range", min: 1, max: 100, value: gePct(p.bri),
      oninput: () => (val.textContent = r.value + " %"),
      onchange: () => onset(geBri(r.value)),
    });
    return h("div", { class: "range" }, h("span", { class: "lbl" }, "Helligkeit"), r, val);
  }

  /* Blatt unter dem angetippten Element: Stimmungsfarbe oder Lampe */
  _genSheetEl(all) {
    const sh = this._genSheet;
    if (!sh) return null;
    const g = this._gen;
    const close = h("button", { class: "btn", onclick: () => this._genSheetOpen(null) }, "Fertig");
    if (sh.type === "swatch") {
      const i = sh.key;
      const c = g.colors[i];
      if (!c) return (this._genSheet = null);
      const users = all.filter((l) => l.kind !== "missing" && !l.grad && l.kind === "color" && this._gp(l).role === "farbe" && this._gp(l).idx === i).map((l) => l.label);
      for (const l of this._genGrads()) if (l.kind !== "missing" && this._gp(l).mode === "stimmung") users.push(l.label);
      const fill = h("span", { class: "fill", style: { background: geHsvHex(c.h, c.s) } });
      const input = h("input", {
        type: "color", value: geHsvHex(c.h, c.s), title: "Farbe wählen",
        oninput: () => (fill.style.background = input.value),
        onchange: () => this._genDo(() => (g.colors[i] = { h: Math.round(geHexHue(input.value)), s: geHexSat(input.value), lock: c.lock }), true),
      });
      return h(
        "div",
        { class: "gsheet" },
        h("div", { class: "gshead" }, h("label", { class: "gbig" }, fill, input), h("div", null, h("div", { class: "gsh" }, `Farbe ${i + 1}`), h("div", { class: "muted" }, "Leuchtet auf: " + (users.length ? users.join(", ") : "keiner Lampe")))),
        h(
          "div",
          { class: "gopts" },
          this._genOpt(false, [ic("mdi:dice-5-outline"), "Nur diese neu würfeln"], () =>
            this._genDo(() => {
              const others = g.colors.filter((_, j) => j !== i).map((x) => x.h);
              g.colors[i] = Object.assign(this._genColors(1, others)[0], { lock: c.lock });
            }, true)
          ),
          this._genOpt(c.lock, [ic(c.lock ? "mdi:lock" : "mdi:lock-open-variant-outline"), c.lock ? "Gesperrt" : "Sperren"], () => this._genDo(() => (c.lock = !c.lock), false, false))
        ),
        h("div", { class: "muted" }, "Kreis antippen öffnet das Farbrad. Alle Lampen mit dieser Farbe und die Festavia ändern sich mit."),
        h("div", { class: "gsfoot" }, close)
      );
    }
    const l = all.find((x) => x.key === sh.key);
    if (!l || l.kind === "missing") return (this._genSheet = null);
    const p = this._gp(l);
    const lock = this._genOpt(p.lock, [ic(p.lock ? "mdi:lock" : "mdi:lock-open-variant-outline"), p.lock ? "Wird behalten" : "Behalten (beim Würfeln nicht ändern)"], () => this._genDo(() => (p.lock = !p.lock), false, false));
    const bri = this._genBriRange(p, (v) => this._genDo(() => (p.bri = v), l, false));
    if (l.grad) {
      const lit = p.mode !== "aus" && p.mode !== "gleich";
      return h(
        "div",
        { class: "gsheet" },
        h("div", { class: "gsh" }, l.label),
        h("span", { class: "gbar" + (lit ? "" : " off"), style: lit ? { background: this._genLampColor(l, p) } : "" }),
        h("div", { class: "gopts" }, GE_FEST_MODES.map((m) => this._genOpt(p.mode === m.id, m.label, () => this._genDo(() => (p.mode = m.id), l)))),
        p.mode === "stimmung" || p.mode === "zufall"
          ? h(
              "div",
              { class: "gopts" },
              h("div", { class: "seg" }, GE_GEN_STYLES.map((s) => h("button", { class: g.gstyle === s.id ? "on" : "", onclick: () => this._genDo(() => (g.gstyle = s.id), l, false) }, s.label))),
              this._genOpt(false, [ic("mdi:shuffle-variant"), "Neu verteilen"], () => this._genDo(() => this._genShuffleFest(p), l), null, "Gleiche Farben, andere Reihenfolge")
            )
          : null,
        p.mode === "gleich" ? null : bri,
        h("div", { class: "muted" }, "Die Festavia bekommt bis zu 5 Farben, wie sie sich auf die einzelnen Lichter verteilen, entscheidet die Lampe. „Neu verteilen“ ändert die Reihenfolge."),
        h("div", { class: "gsfoot" }, lock, close)
      );
    }
    const opts = [];
    if (l.kind === "color") g.colors.forEach((c, i) => opts.push(this._genOpt(p.role === "farbe" && p.idx === i, `Farbe ${i + 1}`, () => this._genDo(() => Object.assign(p, { role: "farbe", idx: i }), l), geHsvHex(c.h, c.s))));
    opts.push(
      this._genOpt(p.role === "weiss", "Weiß", () => this._genDo(() => (p.role = "weiss"), l), l.kind === "dim" ? "#fff6e0" : geKelvinColor(this._genK(l))),
      this._genOpt(p.role === "aus", "Aus", () => this._genDo(() => (p.role = "aus"), l), "rgba(127,127,127,.35)"),
      this._genOpt(p.role === "gleich", "Unverändert", () => this._genDo(() => (p.role = "gleich"), l))
    );
    return h(
      "div",
      { class: "gsheet" },
      h("div", { class: "gsh" }, l.label),
      l.kind === "color" && l.maxK <= 4000 ? h("div", { class: "muted" }, "Grün und Blau wirken bei dieser Lampe blasser.") : null,
      h("div", { class: "gopts" }, opts),
      p.role === "gleich" ? null : bri,
      h("div", { class: "gsfoot" }, lock, close)
    );
  }

  _genRange(label, lo, hi, step, value, fmt, onset, cls) {
    const val = h("span", { class: "val" }, fmt(value));
    const r = h("input", {
      type: "range", min: lo, max: hi, step, value, class: cls || null,
      oninput: () => (val.textContent = fmt(Number(r.value))),
      onchange: () => onset(Number(r.value)),
    });
    return h("div", { class: "range" }, h("span", { class: "lbl" }, label), r, val);
  }

  _renderGen() {
    if (!this._hass || this._tab !== "gen") return;
    this._genEnsure();
    const g = this._gen;
    const set = (fn) => {
      fn();
      this._saveStore();
      this._renderGen();
    };
    const lamps = this._genLamps();
    const grads = this._genGrads();
    const all = [...lamps, ...grads];
    const sh = this._genSheet;
    const sheet = sh && sh.type !== "pick" ? this._genSheetEl(all) : null;
    const sat = g.sat[g.pal];
    const pct = (v) => v + " %";
    const scenes = this._scenes();
    const from = scenes.find((s) => s.name === g.from);

    // Startpunkt: Szene laden + Licht zurück
    const start = h(
      "div",
      { class: "gstart" },
      h("div", { class: "glbl" }, h("span", null, "Startpunkt"), this._genSnap ? h("span", { class: "muted" }, "verändert") : null),
      h(
        "div",
        { class: "gstartrow" },
        h(
          "button",
          { class: "gscn", title: "Szene laden: Farben, Helligkeiten und Festavia werden übernommen", onclick: () => this._genSheetOpen({ type: "pick", key: 0 }) },
          from && this._scenePreview(from.id).length ? geStrip(this._scenePreview(from.id)) : null,
          h("span", { class: "gscnn" }, from ? from.name : g.from || "Eigene Stimmung – Szene laden …"),
          ic(sh && sh.type === "pick" ? "mdi:chevron-up" : "mdi:chevron-down")
        ),
        h("button", { class: "btn secondary warn", disabled: !this._genSnap, title: "Alles verwerfen: Licht wie vorher, inklusive Festavia", onclick: () => this._genRestore() }, ic("mdi:backup-restore"), "Licht zurück")
      ),
      sh && sh.type === "pick"
        ? h(
            "div",
            { class: "gslist" },
            h("div", { class: "muted small" }, "Die Szene wird aufgerufen und ausgelesen. Danach verändern und überschreiben oder als neue Szene speichern."),
            scenes.map((s) => {
              const pv = this._scenePreview(s.id);
              return h(
                "button",
                { class: "gsitem" + (s.name === g.from ? " on" : ""), onclick: () => this._genLoadScene(s) },
                pv.length ? geStrip(pv) : h("span", { class: "gstrip none" }),
                h("span", { class: "gscnn" }, s.name)
              );
            })
          )
        : null
    );

    // Stimmung: Art (kompakt), Farben
    const pal = GE_PALETTES.find((p) => p.id === g.pal) || GE_PALETTES[0];
    const pals = h(
      "div",
      { class: "gpals" },
      GE_PALETTES.map((p) =>
        h(
          "button",
          { class: "gpal" + (g.pal === p.id ? " on" : ""), title: p.d, onclick: () => set(() => (g.pal = p.id)) },
          h("span", { class: "pv" }, this._genPalPreview(p).map((c) => h("span", { style: { background: c } }))),
          p.label
        )
      )
    );
    let baseRow = null;
    if (g.pal === "basis") {
      const fill = h("span", { class: "fill", style: { background: g.base } });
      const input = h("input", { type: "color", value: g.base, onchange: () => set(() => (g.base = input.value)) });
      baseRow = h("div", { class: "grow2" }, h("span", { class: "muted" }, "Grundfarbe"), h("label", { class: "gbig small", title: "Grundfarbe wählen" }, fill, input));
    }
    const swatches = g.colors.map((c, i) => {
      let timer = null;
      let long = false;
      return h(
        "button",
        {
          class: "gswc" + (sh && sh.type === "swatch" && sh.key === i ? " sel" : ""),
          style: { background: geHsvHex(c.h, c.s) },
          title: `Farbe ${i + 1} – antippen: ändern, gedrückt halten: sperren`,
          onpointerdown: () => {
            long = false;
            timer = setTimeout(() => {
              long = true;
              c.lock = !c.lock;
              this._saveStore();
              this._renderGen();
              this._toast(`Farbe ${i + 1} ${c.lock ? "gesperrt" : "entsperrt"}`);
            }, 500);
          },
          onpointerup: () => clearTimeout(timer),
          onpointerleave: () => clearTimeout(timer),
          oncontextmenu: (e) => e.preventDefault(),
          onclick: () => (long ? (long = false) : this._genSheetOpen({ type: "swatch", key: i })),
        },
        c.lock ? h("span", { class: "glk" }, ic("mdi:lock")) : null,
        h("span", { class: "num" }, i + 1)
      );
    });
    const count = h(
      "div",
      { class: "gcount" },
      h("button", { title: "weniger Farben", disabled: g.colors.length <= 2, onclick: () => this._genCount(-1) }, "−"),
      h("span", null, g.colors.length + " Farben"),
      h("button", { title: "mehr Farben", disabled: g.colors.length >= GE_GEN_MAX, onclick: () => this._genCount(1) }, "+")
    );
    const mood = h(
      "div",
      { class: "gmood" },
      h(
        "div",
        { class: "glbl" },
        h("span", null, "Art der Stimmung"),
        h("button", { class: "ghelp", title: "Erklärung", onclick: () => set(() => (this._genHelp = !this._genHelp)) }, "?")
      ),
      pals,
      this._genHelp
        ? h(
            "div",
            { class: "muted small" },
            `${pal.label}: ${pal.d} „Neue Stimmung“ (unten) würfelt Farben in dieser Art. Farbe antippen = ändern, gedrückt halten = sperren (bleibt beim Würfeln). „Neu verteilen“ = gleiche Farben auf andere Lampen und neue Festavia-Reihenfolge.`
          )
        : null,
      baseRow,
      h("div", { class: "gswrow" }, h("div", { class: "gsws" }, swatches), count),
      sh && sh.type === "swatch" ? sheet : null,
      h(
        "div",
        { class: "gbtns" },
        h("span", { class: "grow" }),
        h("button", { class: "btn secondary", title: "Gleiche Farben, andere Lampen (und andere Festavia-Reihenfolge)", onclick: () => this._genShuffle() }, ic("mdi:shuffle-variant"), "Neu verteilen")
      )
    );

    const color = lamps.filter((l) => l.kind === "color");
    const white = lamps.filter((l) => l.kind === "white" || l.kind === "dim");
    const missing = lamps.filter((l) => l.kind === "missing");
    const inGroup = (list) => sh && sh.type === "lamp" && list.some((l) => l.key === sh.key);
    const right = [
      h(
        "div",
        { class: "ggroup" },
        h("div", { class: "glbl" }, "Farblampen"),
        h("div", { class: "gtiles" }, grads.map((l) => this._genTile(l)), color.map((l) => this._genTile(l)), inGroup([...grads, ...color]) ? sheet : null)
      ),
      white.length
        ? h(
            "div",
            { class: "ggroup" },
            h("div", { class: "glbl" }, h("span", null, "Weißlampen"), h("span", { class: "muted" }, `${this._genWhiteK()} K passend zur Stimmung`)),
            h("div", { class: "gtiles" }, white.map((l) => this._genTile(l)), inGroup(white) ? sheet : null)
          )
        : null,
      missing.length ? h("div", { class: "gtiles" }, missing.map((l) => this._genTile(l))) : null,
    ];

    // Helligkeit: ein Dropdown, übernimmt sofort
    const CUR = "\u0001aktuell";
    const profSel = h(
      "select",
      {
        class: "gsel",
        onchange: () => {
          const v = profSel.value;
          if (v === CUR) return this._genTakeProfile();
          const sc = scenes.find((s) => s.name === v);
          if (!sc) return;
          if (g.profiles[sc.name]) this._genApplyProfile(sc.name);
          else this._genLearn(sc);
        },
      },
      h("option", { value: CUR, selected: g.prof === "Aktuelles Licht" }, "Aktuelles Licht"),
      scenes.map((s) => h("option", { value: s.name, selected: s.name === g.prof }, s.name + (g.profiles[s.name] ? "" : " (schaltet kurz um)")))
    );
    const bright = h(
      "div",
      { class: "ggroup" },
      h("div", { class: "glbl" }, "Helligkeit"),
      h("div", { class: "gprof" }, h("span", { class: "lbl" }, "wie"), profSel),
      this._genRange("Gesamt", 10, 150, 5, g.master, pct, (v) => this._genDo(() => (g.master = v), true, false))
    );

    // Feineinstellungen
    const spreadRange =
      g.pal === "pastell" || g.pal === "kraeftig"
        ? this._genRange("Mindestabstand", 0, 90, 1, g.dist, (v) => v + "°", (v) => set(() => (g.dist = v)))
        : ["analog", "basis", "komplementaer", "dreiklang"].includes(g.pal)
        ? this._genRange("Spreizung ±", 5, 120, 1, g.spread, (v) => v + "°", (v) => set(() => (g.spread = v)))
        : null;
    const trans = h("input", { type: "checkbox", checked: g.trans, onchange: () => set(() => (g.trans = trans.checked)) });
    const details = h(
      "details",
      { class: "gfine", open: !!this._genFineOpen, ontoggle: () => (this._genFineOpen = details.open) },
      h("summary", null, ic("mdi:tune-variant"), "Feineinstellungen"),
      h(
        "div",
        { class: "gfinebody" },
        this._genRange("Sättigung von", 0, 100, 1, sat[0], pct, (v) => set(() => (g.sat[g.pal] = [v, Math.max(v, sat[1])]))),
        this._genRange("Sättigung bis", 0, 100, 1, sat[1], pct, (v) => set(() => (g.sat[g.pal] = [Math.min(v, sat[0]), v]))),
        spreadRange,
        this._genRange("Weiß wärmstes", 2000, 6500, 50, g.ct[0], (v) => v + " K", (v) => this._genDo(() => (g.ct = [v, Math.max(v, g.ct[1])]), true, false), "kelvin"),
        this._genRange("Weiß kühlstes", 2000, 6500, 50, g.ct[1], (v) => v + " K", (v) => this._genDo(() => (g.ct = [Math.min(v, g.ct[0]), v]), true, false), "kelvin"),
        h("label", { class: "switch", title: "Farbwechsel in 1 s überblenden" }, trans, h("span", { class: "track" }, h("span", { class: "knob" })), "Farbwechsel in 1 s überblenden")
      )
    );

    // Leiste unten: Status, Zurück / Neue Stimmung / Vor / Speichern (+ Speichern-Feld)
    const undoN = (this._genUndo || []).length;
    const redoN = (this._genRedo || []).length;
    this._genStatusEl = h("div", { class: "gsend" + (this._genBusyText ? " busy" : "") }, h("span", { class: "d" }), h("span", null, this._genBusyText || "Licht ist aktuell"));
    let savePanel = null;
    if (this._genSaveOpen) {
      if (!from && this._genSaveMode === "over") this._genSaveMode = "neu";
      const mode = this._genSaveMode || (from ? "over" : "neu");
      this._genSaveMode = mode;
      const choice = (id, title, text) =>
        h("button", { class: "gchoice" + (mode === id ? " on" : ""), onclick: () => set(() => (this._genSaveMode = id)) }, h("span", { class: "t" }, title), h("span", { class: "muted small" }, text));
      const nameIn =
        mode === "neu"
          ? h("input", {
              type: "text", maxLength: 40, placeholder: "Name der neuen Szene", value: this._genName || "",
              oninput: () => (this._genName = nameIn.value),
              onkeydown: (e) => e.key === "Enter" && this._genSave(),
            })
          : null;
      savePanel = h(
        "div",
        { class: "gsavep" },
        from ? choice("over", `„${from.name}“ überschreiben`, "Gleiche Szene, neue Farben. Fernbedienungen und Zyklus bleiben, Festavia wird mitgespeichert.") : null,
        choice("neu", "Als neue Szene", "Kommt ans Ende des Fernbedienungs-Zyklus. Festavia inklusive."),
        nameIn ? h("div", { class: "saverow" }, nameIn) : null,
        h(
          "div",
          { class: "gbtns" },
          h("span", { class: "grow" }),
          h("button", { class: "btn secondary", onclick: () => set(() => (this._genSaveOpen = false)) }, "Abbrechen"),
          h("button", { class: "btn", onclick: () => this._genSave() }, ic("mdi:content-save"), "Speichern")
        )
      );
      if (nameIn) setTimeout(() => nameIn.focus(), 0);
    }
    const foot = h(
      "div",
      { class: "gsave" },
      savePanel,
      this._genStatusEl,
      h(
        "div",
        { class: "gacts" },
        h("button", { class: "ibtn ring", title: "Zurück", disabled: !undoN, onclick: () => this._genStep(true) }, ic("mdi:undo")),
        h("button", { class: "btn big groll", onclick: () => this._genRoll() }, ic("mdi:dice-5-outline"), "Neue Stimmung"),
        h("button", { class: "ibtn ring", title: "Vor", disabled: !redoN, onclick: () => this._genStep(false) }, ic("mdi:redo")),
        h("button", { class: "btn secondary" + (this._genSaveOpen ? " on" : ""), onclick: () => set(() => ((this._genSaveOpen = !this._genSaveOpen), (this._genSaveMode = null))) }, ic("mdi:content-save-outline"), "Speichern…")
      )
    );

    this._el.body.replaceChildren(
      h("div", { class: "glayout" }, h("div", { class: "gcol" }, start, mood, bright, details), h("div", { class: "gcol" }, right)),
      foot
    );
  }

  /* ---------- Rückmeldungen ---------- */
  _toast(message, action) {
    const detail = action ? { message, action, duration: 7000 } : { message };
    this.dispatchEvent(new CustomEvent("hass-notification", { detail, bubbles: true, composed: true }));
  }

  _confirm(text, okLabel, danger) {
    return new Promise((resolve) => {
      const ov = this._el.overlay;
      const done = (v) => {
        ov.hidden = true;
        ov.replaceChildren();
        resolve(v);
      };
      ov.replaceChildren(
        h(
          "div",
          { class: "dialog", role: "dialog" },
          h("div", { class: "dtext" }, text),
          h(
            "div",
            { class: "dbtns" },
            h("button", { class: "btn secondary", onclick: () => done(false) }, "Abbrechen"),
            h("button", { class: "btn" + (danger ? " danger" : ""), onclick: () => done(true) }, okLabel || "OK")
          )
        )
      );
      ov.onclick = (e) => {
        if (e.target === ov) done(false);
      };
      ov.hidden = false;
    });
  }
}

/* ---------- Szenen-Kacheln: alle Z2M-Szenen einer Gruppe, aktive hervorgehoben ---------- */
class SceneGridCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = Object.assign(
      {
        title: "Szenen",
        scene_prefix: "scene.wohnzimmer_oben_alle_",
        scene_strip: "wohnzimmer_oben_alle ",
        picker: "input_select.wohnzimmer_szene",
        preview_map: "", // z. B. input_text.gradient_zuordnung_festavia_ → Farbstreifen aus Feld "p"
      },
      config || {}
    );
    if (!this._root) {
      this.attachShadow({ mode: "open" });
      this._root = this.shadowRoot;
    }
    this._sig = "";
    this._root.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px; }
        .title { font-size: 1.1em; font-weight: 500; margin-bottom: 10px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
        button { padding: 12px 8px; border-radius: 10px; border: 1px solid var(--divider-color);
                 background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 0.95em; }
        button:hover { border-color: var(--primary-color); }
        button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
        .strip { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 7px; }
        .strip span { flex: 1; }
      </style>
      <ha-card><div class="title" id="t"></div><div class="grid" id="g"></div></ha-card>`;
    this._root.getElementById("t").textContent = this._config.title;
  }

  getCardSize() {
    return 4;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._root && this._config) this._render();
  }

  _render() {
    const c = this._config;
    const h = this._hass;
    const re = new RegExp("^" + c.scene_prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)_");
    const list = [];
    Object.keys(h.states).forEach((eid) => {
      const m = re.exec(eid);
      if (!m) return;
      let name = (h.states[eid].attributes && h.states[eid].attributes.friendly_name) || eid;
      if (name.startsWith(c.scene_strip)) name = name.slice(c.scene_strip.length);
      list.push({ id: Number(m[1]), eid, name });
    });
    list.sort((a, b) => a.id - b.id);
    const active = h.states[c.picker] ? h.states[c.picker].state : "";
    // Farbvorschau (Feld p der Zuordnung, gepflegt vom Reiter Stimmung)
    for (const s of list) {
      const raw = c.preview_map && h.states[c.preview_map + s.id] ? h.states[c.preview_map + s.id].state : "";
      try {
        const p = raw && raw[0] === "{" ? JSON.parse(raw).p : null;
        s.p = Array.isArray(p) ? p.filter((x) => /^#[0-9a-fA-F]{6}$/.test(x)) : [];
      } catch (e) {
        s.p = [];
      }
    }
    const sig = active + "\u0001" + list.map((s) => s.eid + ":" + s.name + ":" + s.p.join()).join("\u0001");
    if (sig === this._sig) return;
    this._sig = sig;
    const grid = this._root.getElementById("g");
    grid.innerHTML = "";
    list.forEach((s) => {
      const b = document.createElement("button");
      b.textContent = s.name;
      if (s.p.length) {
        const strip = document.createElement("span");
        strip.className = "strip";
        for (const col of s.p) {
          const seg = document.createElement("span");
          seg.style.background = col;
          strip.appendChild(seg);
        }
        b.appendChild(strip);
      }
      if (s.name === active) b.className = "on";
      b.addEventListener("click", () => h.callService("scene", "turn_on", { entity_id: s.eid }));
      grid.appendChild(b);
    });
    if (!list.length) grid.textContent = "Keine Szenen gefunden";
  }
}

if (!customElements.get("gradient-editor-card")) {
  customElements.define("gradient-editor-card", GradientEditorCard);
}
if (!customElements.get("scene-grid-card")) {
  customElements.define("scene-grid-card", SceneGridCard);
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "gradient-editor-card",
  name: "Gradient-Editor",
  description: "Farbverläufe für Z2M-Gradient-Lampen: Editor, Bibliothek, Szenen-Zuordnung (Deutsch)",
  preview: false,
});
window.customCards.push({
  type: "scene-grid-card",
  name: "Szenen-Kacheln",
  description: "Alle Z2M-Szenen einer Gruppe als Tasten, aktive Szene hervorgehoben (Deutsch)",
  preview: false,
});
console.info(`%c GRADIENT-EDITOR %c v${GE_VERSION} `, "color:white;background:#6a3dff;font-weight:700;padding:2px 6px;", "");
