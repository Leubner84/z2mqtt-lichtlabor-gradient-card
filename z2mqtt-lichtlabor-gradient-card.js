/**
 * Lichtlabor-Karte v2.0 (gradient-editor-card) – Szenen fürs Wohnzimmer (Zigbee2MQTT-Gruppe + Festavia)
 *
 * EIN Begriff: die Szene. ZWEI Bildschirme:
 *   Kacheln  – Rezept-Startkacheln (Vom aktuellen Licht, Gemütlich, Bunt, Nacht, Frei), danach alle Szenen als
 *              Farbkacheln (Haken = leuchtet gerade, „Taste n“ = Platz im Fernbedienungs-Zyklus, Schloss = geschützt).
 *              Antippen schaltet die Szene sofort ein und öffnet sie im Editor.
 *   Editor   – Rezept-Chips + Farbanzahl (1–5) + Würfeln, Helligkeit (Gesamtregler, „Helligkeiten wie Szene“), Effekt
 *              (eingeklappt), Lampenkacheln (Festavia als normale Lampe, Blatt direkt unter der Kachel),
 *              Leiste unten: Zurück / Würfeln / Vor / Licht wie vorher / Speichern… (neu als Standard, Überschreiben mit Rückfrage).
 *   Ab 1100 px Kartenbreite stehen Editor und Kacheln nebeneinander, am Handy wechselt der Pfeil oben links.
 *
 * Verläufe und Zuordnungen schreibt die Karte beim Speichern selbst (kein Reiter mehr dafür):
 *   Slots       input_text.<slot_prefix><1..n>   JSON {"n": Szenenname, "s": Stil, "c": [hex]}
 *   Zuordnung   input_text.<map_prefix><Szenen-ID> JSON {"m": v|c|t|a|n, "s": Slot, "b": 1..254, "c": hex, "k": Kelvin,
 *                                                         "p": [hex] Farbvorschau, "fx": Effekt-ID}
 *   Szenen werden per scene.turn_on aufgerufen; der Szenen-Anwender zieht Picker, Festavia und Effekt nach.
 *   Lampen: light.turn_on/off (hs_color bzw. color_temp_kelvin); Festavia per mqtt.publish in ZWEI Nachrichten.
 *   Effekte: Hue-Lampeneffekte per light.turn_on effect (nur Lampen, die ihn können), HA-Skript-Effekte per effect_script.
 *
 * Konfiguration (alles optional, Vorgaben siehe setConfig):
 *   type: custom:gradient-editor-card
 *   gen_lamps: [{entity, name}]           # Lampen der Z2M-Gruppe (Art kommt aus supported_color_modes)
 *   lamp_slots/lamp_map/lamp_labels/lamp_entities   # Gradient-Lampen (Z2M-Name → Helfer-Präfixe)
 *   cozy_off: [light.x]                   # bleibt beim Rezept „Gemütlich“ aus (z. B. Deckenlampe)
 */

const GE_VERSION = "2.0.0";
const GE_HEX = /^#[0-9a-fA-F]{6}$/;
const GE_MAX_FEST = 5;
const GE_STOP_FX = "stop_hue_effect";
const GE_RECIPES = [
  { id: "gemuetlich", n: "Gemütlich", d: "Weißlampen warm und gedimmt, Farblampen Bernstein bis Rot mit wenig Sättigung, Festavia warm, Decke aus.", pv: [15, 25, 35, 45], s: 55 },
  { id: "bunt", n: "Bunt", d: "Alles an, kräftige Farben mit Abstand, Festavia verstreut.", pv: [0, 120, 210, 290], s: 95 },
  { id: "nacht", n: "Nacht", d: "Zwei Lampen tiefes Orange oder Rot bei 5 bis 10 %, alles andere aus.", pv: [5, 15, 25, 10], s: 100 },
  { id: "frei", n: "Frei (Party)", d: "Zufall ohne Regel: jede Lampe eine eigene Farbe, Helligkeit zufällig. Für Experimente.", pv: [40, 300, 160, 220], s: 80 },
];
const GE_ZONE_RECIPES = ["Fernsehen", "Lesen", "Sonnenuntergang"];
const GE_FX = [
  { id: "keine", n: "Kein Effekt", d: "Das Licht steht still." },
  { id: "candle", n: "Kerze", d: "Ruhiges Flackern wie Kerzenlicht, läuft in der Lampe selbst.", lamp: true },
  { id: "fireplace", n: "Kamin", d: "Warmes, unregelmäßiges Feuerflackern in der Lampe (nur Farblampen).", lamp: true },
  { id: "sparkle", n: "Funkeln", d: "Kurze helle Funken auf der Grundfarbe.", lamp: true },
  { id: "glisten", n: "Glitzern", d: "Sanftes Schimmern auf der Grundfarbe.", lamp: true },
  { id: "opal", n: "Opal", d: "Weiche, langsam wechselnde Farbschleier.", lamp: true },
  { id: "underwater", n: "Unterwasser", d: "Blaugrünes Wogen wie unter Wasser.", lamp: true },
  { id: "cosmos", n: "Kosmos", d: "Tiefes Blau und Violett mit langsamen Wellen.", lamp: true },
  { id: "sunbeam", n: "Sonnenstrahl", d: "Warmes, wanderndes Licht wie durch Blätter.", lamp: true },
  { id: "enchant", n: "Zauber", d: "Verspieltes Farbenspiel in der Lampe.", lamp: true },
  { id: "atmen", n: "Atmen", d: "Die Helligkeit aller Lampen schwankt langsam, etwa 20 % in 45 Sekunden.", script: true },
  { id: "farbwanderung", n: "Farbwanderung", d: "Alle Farben wandern gemeinsam langsam weiter, einmal rund in etwa 36 Minuten. Festavia bleibt.", script: true },
  { id: "sonnenaufgang", n: "Sonnenaufgang", d: "In 20 Minuten von dunkel warm zu hell neutralweiß, danach bleibt das Licht so.", script: true },
];
const GE_FEST_STYLES = [
  ["linear", "Verlauf"],
  ["scattered", "Verstreut"],
  ["mirrored", "Gespiegelt"],
];

const GE_CSS = `
  :host { display: block; --ge-rgb: var(--rgb-primary-color, 3, 169, 244); --ge-card: var(--card-background-color); --ge-fg: var(--primary-text-color);
          --ge-muted: var(--secondary-text-color); --ge-line: var(--divider-color); --ge-chip: var(--secondary-background-color);
          --ge-accent: var(--primary-color); --ge-accent-fg: var(--text-primary-color, #fff); --ge-warn: var(--warning-color, #ff9800);
          --ge-danger: var(--error-color, #db4437); --ge-ok: var(--success-color, #43a047); --ge-off: rgba(127,127,127,.35); }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  ha-card { padding: 16px; position: relative; overflow: hidden; container-type: inline-size; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:disabled { cursor: default; }
  ha-icon { --mdc-icon-size: 20px; }
  .muted { color: var(--ge-muted); font-size: .88em; }
  .small { font-size: .8em; }
  .grow { flex: 1; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .lbl { font-size: .75em; font-weight: 500; letter-spacing: .05em; text-transform: uppercase; color: var(--ge-muted);
         display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .lbl .sub { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 999px;
         border: 0; background: var(--ge-accent); color: var(--ge-accent-fg); font-weight: 500; }
  .btn.ghost { background: transparent; color: var(--ge-fg); border: 1px solid var(--ge-line); padding: 9px 14px; font-weight: 400; }
  .btn.ghost.on { border-color: var(--ge-accent); color: var(--ge-accent); }
  .btn.ghost.warn { color: var(--ge-warn); border-color: var(--ge-warn); }
  .btn.danger { background: var(--ge-danger); color: #fff; }
  .btn:disabled { opacity: .45; }
  .btn ha-icon { --mdc-icon-size: 18px; }
  .ibtn { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--ge-line); background: transparent; display: inline-grid;
          place-items: center; flex: none; padding: 0; color: var(--ge-fg); }
  .ibtn:disabled { opacity: .35; }
  .ibtn.danger { color: var(--ge-danger); border-color: var(--ge-danger); }
  .ibtn.plain { border: 0; width: 36px; height: 36px; }

  /* Kopf */
  .head { display: flex; gap: 10px; align-items: center; min-width: 0; margin-bottom: 14px; }
  .head .t { font-size: 1.15em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pick { border: 1px solid var(--ge-line); background: transparent; border-radius: 999px; padding: 7px 12px 7px 10px; display: inline-flex;
          gap: 8px; align-items: center; max-width: 60%; min-width: 0; margin-left: auto; color: var(--ge-fg); }
  .pick .t { font-size: .95em; }
  .strip { display: inline-flex; height: 12px; width: 44px; border-radius: 6px; overflow: hidden; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.1); }
  .strip span { flex: 1; }
  .strip.none { background: repeating-linear-gradient(45deg, var(--ge-line) 0 4px, transparent 4px 8px); }

  /* Seite */
  .page { display: grid; gap: 16px; min-width: 0; }
  .chooser, .pane { display: grid; gap: 14px; min-width: 0; align-content: start; }
  .chooser.hid, .pane.hid { display: none; }
  @container (min-width: 1100px) {
    .page { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: start; }
    .chooser { order: 2; position: sticky; top: 12px; }
    .chooser.hid, .pane.hid { display: grid; }
    .pick, .back { display: none; }
    .starts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); }
  }

  /* Kacheln: Einstieg */
  .hero { display: grid; gap: 12px; padding: 14px; border-radius: 16px; background: var(--ge-chip); }
  .hero h2 { margin: 0; font-size: 1.1em; font-weight: 500; display: flex; gap: 8px; align-items: center; }
  .hero .lead { font-size: .9em; color: var(--ge-muted); }
  .starts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  @container (min-width: 820px) { .starts { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .start { position: relative; overflow: hidden; border: 0; border-radius: 16px; padding: 14px 12px 12px; min-height: 108px; text-align: left;
           display: grid; align-content: end; gap: 4px; color: #fff; background: var(--ge-off); }
  .start::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.62) 100%); pointer-events: none; }
  .start > * { position: relative; }
  .start .n { font-size: 1.05em; font-weight: 500; }
  .start .d { font-size: .8em; line-height: 1.3; opacity: .95; }
  .start .go { position: absolute; right: 10px; top: 10px; width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.25);
               display: grid; place-items: center; --mdc-icon-size: 16px; }
  .start.cur { background: var(--ge-card); color: var(--ge-fg); border: 1px dashed var(--ge-line); }
  .start.cur::before { display: none; }
  .start.cur .go { background: var(--ge-accent); color: var(--ge-accent-fg); }
  .start.cur .pvs { display: flex; gap: 4px; margin-bottom: 4px; }
  .start.cur .pvs span { width: 18px; height: 18px; border-radius: 50%; box-shadow: 0 0 0 1px var(--ge-line); }
  .later { display: flex; gap: 8px; align-items: center; font-size: .85em; color: var(--ge-muted); padding: 2px; }
  .later ha-icon { --mdc-icon-size: 15px; flex: none; }
  .remote { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: .88em; color: var(--ge-muted); padding: 10px 12px;
            border-radius: 12px; background: var(--ge-chip); }
  .remote b { color: var(--ge-fg); font-weight: 500; }
  .remote ha-icon { --mdc-icon-size: 16px; }

  /* Kacheln: Szenen */
  .sgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  @container (min-width: 600px) { .sgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @container (min-width: 820px) { .sgrid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
  .stile { position: relative; overflow: hidden; border: 1px solid var(--ge-line); border-radius: 16px; padding: 12px; min-height: 96px; text-align: left;
           display: grid; align-content: end; gap: 3px; background: var(--ge-card); min-width: 0; color: var(--ge-fg); }
  .stile .wash { position: absolute; inset: 0; pointer-events: none; }
  .stile > * { position: relative; }
  .stile .n { font-weight: 500; font-size: .95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 5px; align-items: center; }
  .stile .n ha-icon { --mdc-icon-size: 14px; color: var(--ge-muted); flex: none; }
  .stile .m { font-size: .8em; color: var(--ge-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 5px; align-items: center; }
  .stile .m ha-icon { --mdc-icon-size: 13px; color: var(--ge-accent); }
  .stile .pos { position: absolute; top: 8px; right: 8px; font-size: .72em; color: var(--ge-muted); background: var(--ge-card); border-radius: 999px;
                padding: 2px 7px; font-variant-numeric: tabular-nums; opacity: .92; }
  .stile .pos b { color: var(--ge-fg); font-weight: 500; }
  .stile .act { position: absolute; top: 8px; left: 8px; width: 22px; height: 22px; border-radius: 50%; background: var(--ge-accent); color: var(--ge-accent-fg);
                display: grid; place-items: center; --mdc-icon-size: 14px; }
  .stile.active { border-color: var(--ge-accent); }
  .stile.cur { box-shadow: 0 0 0 2px var(--ge-accent); }
  .stile.empty .n { color: var(--ge-muted); }

  /* Editor */
  .edhead { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .edhead .nm { font-size: 1.1em; font-weight: 500; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: .78em; color: var(--ge-muted); background: var(--ge-chip); border-radius: 999px; padding: 3px 9px; display: inline-flex; gap: 4px; align-items: center; }
  .tag ha-icon { --mdc-icon-size: 13px; }
  .tag.ok { color: var(--ge-accent); }
  .tag.warn { color: var(--ge-warn); }
  .cols { display: grid; gap: 16px 24px; }
  .col { display: grid; gap: 16px; align-content: start; min-width: 0; }
  .group { display: grid; gap: 8px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .rc { border: 1px solid var(--ge-line); background: var(--ge-card); color: var(--ge-fg); border-radius: 999px; padding: 7px 12px 7px 8px; display: inline-flex;
        gap: 8px; align-items: center; font-size: .92em; }
  .rc.on { border-color: var(--ge-accent); box-shadow: inset 0 0 0 1px var(--ge-accent); font-weight: 500; }
  .rc ha-icon { --mdc-icon-size: 16px; color: var(--ge-muted); }
  .rc.on ha-icon { color: var(--ge-accent); }
  .pv { display: flex; }
  .pv span { width: 14px; height: 14px; border-radius: 50%; margin-left: -4px; box-shadow: 0 0 0 2px var(--ge-card); }
  .pv span:first-child { margin-left: 0; }
  .desc { font-size: .85em; color: var(--ge-muted); min-height: 18px; }
  .range { display: grid; grid-template-columns: auto 1fr 56px; gap: 10px; align-items: center; }
  .range .l { font-size: .85em; color: var(--ge-muted); min-width: 6em; }
  .range .v { text-align: right; font-variant-numeric: tabular-nums; font-size: .9em; }
  input[type=range] { width: 100%; accent-color: var(--ge-accent); min-width: 0; }
  input[type=range].kelvin { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 5px;
    background: linear-gradient(90deg, #ff8a12, #ffbe6e, #ffe4c4, #ffffff, #bcd4ff); }
  input[type=range].kelvin::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid var(--ge-accent); }
  input[type=range].kelvin::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid var(--ge-accent); }
  .ktxt { display: flex; justify-content: space-between; font-size: .72em; color: var(--ge-muted); grid-column: 2; }
  .txt { font: inherit; color: var(--ge-fg); background: var(--ge-chip); border: 0; border-radius: 10px; padding: 9px 12px; min-width: 0; }
  select.txt { flex: 1 1 160px; }
  .count { display: inline-flex; align-items: center; gap: 4px; background: var(--ge-chip); border-radius: 999px; padding: 3px; }
  .count button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--ge-card); font-size: 1.1em; line-height: 1; padding: 0; }
  .count button:disabled { opacity: .35; }
  .count span { min-width: 76px; text-align: center; font-size: .9em; font-variant-numeric: tabular-nums; }
  .collapsed { display: flex; gap: 10px; align-items: center; border: 1px solid var(--ge-line); background: var(--ge-card); border-radius: 14px;
               padding: 10px 12px; text-align: left; width: 100%; min-width: 0; color: var(--ge-fg); }
  .collapsed .t { flex: 1; min-width: 0; display: grid; }
  .collapsed .t b { font-weight: 500; }
  .collapsed .t span { font-size: .8em; color: var(--ge-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .collapsed .ic { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--ge-chip); color: var(--ge-accent); flex: none; --mdc-icon-size: 16px; }

  .ghead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ghead .acts { display: inline-flex; gap: 4px; margin-left: auto; }
  .mini { border: 1px solid var(--ge-line); background: transparent; border-radius: 999px; padding: 7px 12px; font-size: .82em; color: var(--ge-muted); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
  .tile { border: 1px solid var(--ge-line); border-radius: 14px; background: var(--ge-card); color: var(--ge-fg); padding: 10px; display: grid; gap: 6px;
          text-align: left; position: relative; overflow: hidden; min-width: 0; }
  .tile .glow { position: absolute; inset: 0; pointer-events: none; }
  .tile > * { position: relative; }
  .tile .dot { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--ge-card); box-shadow: 0 0 0 1px var(--ge-line); background: var(--ge-off); }
  .tile .nm { font-weight: 500; font-size: .92em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .st { font-size: .78em; color: var(--ge-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .lkm { position: absolute; right: 8px; top: 8px; color: var(--ge-muted); --mdc-icon-size: 15px; }
  .tile.sel { border-color: var(--ge-accent); background: var(--ge-chip); }
  .tile.off .nm { color: var(--ge-muted); }
  .tile.wide { grid-column: 1 / -1; }
  .bar { display: block; height: 26px; border-radius: 13px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
  .bar.off { background: repeating-linear-gradient(45deg, var(--ge-chip) 0 8px, var(--ge-card) 8px 16px); }
  .fxtag { position: absolute; right: 8px; bottom: 8px; font-size: .72em; color: var(--ge-accent); display: inline-flex; gap: 3px; align-items: center; --mdc-icon-size: 12px; }
  .fxtag.off { color: var(--ge-muted); }

  .sheet { grid-column: 1 / -1; display: grid; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--ge-accent); background: var(--ge-chip); }
  .sheet h3 { margin: 0; font-size: 1em; font-weight: 500; }
  .opts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .opt { border: 1px solid var(--ge-line); background: var(--ge-card); color: var(--ge-fg); border-radius: 12px; padding: 8px 12px; display: inline-flex; gap: 8px;
         align-items: center; font-size: .92em; position: relative; overflow: hidden; }
  .opt.on { border-color: var(--ge-accent); box-shadow: inset 0 0 0 1px var(--ge-accent); }
  .opt .d { width: 18px; height: 18px; border-radius: 50%; box-shadow: 0 0 0 1px var(--ge-line); }
  .opt input[type=color] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .opt ha-icon { --mdc-icon-size: 16px; }
  .sw { width: 44px; height: 44px; border-radius: 50%; border: 3px solid var(--ge-card); box-shadow: 0 0 0 1px var(--ge-line); position: relative; overflow: hidden; padding: 0; display: inline-block; }
  .sw input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .add { width: 44px; height: 44px; border-radius: 50%; border: 2px dashed var(--ge-line); background: transparent; color: var(--ge-muted); display: inline-grid; place-items: center; padding: 0; }
  .add:disabled { opacity: .35; }
  .seg { display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: var(--ge-card); border: 1px solid var(--ge-line); }
  .seg button { flex: 1; border: 0; border-radius: 8px; background: transparent; color: var(--ge-muted); padding: 7px 8px; font-size: .9em; white-space: nowrap; }
  .seg button.on { background: var(--ge-chip); color: var(--ge-fg); font-weight: 500; }
  .sfoot { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: space-between; }

  /* Leiste unten (klebt am unteren Rand der Karte) */
  .foot { position: sticky; bottom: 0; z-index: 2; margin: 14px -16px -16px; padding: 8px 16px 12px; background: var(--ge-card);
          border-top: 1px solid var(--ge-line); display: grid; gap: 6px; }
  .foot.hid { display: none; }
  @container (min-width: 1100px) { .foot.hid { display: grid; } }
  .foot .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .foot .roll { flex: 1 1 140px; padding: 12px 16px; font-size: 1em; }
  .sendst { font-size: .78em; color: var(--ge-muted); display: flex; gap: 6px; align-items: center; min-height: 16px; }
  .sendst .d { width: 8px; height: 8px; border-radius: 50%; background: var(--ge-ok); }
  .sendst.busy .d { background: var(--ge-warn); animation: gepulse .8s infinite alternate; }
  @keyframes gepulse { from { opacity: .3; } to { opacity: 1; } }
  .savep { display: grid; gap: 8px; padding-bottom: 6px; }
  .choice { display: grid; gap: 3px; border: 1px solid var(--ge-line); border-radius: 12px; padding: 10px 12px; text-align: left; background: transparent; color: var(--ge-fg); }
  .choice.on { border-color: var(--ge-accent); box-shadow: inset 0 0 0 1px var(--ge-accent); }
  .choice .t { font-weight: 500; }
  .savep input.txt { width: 100%; }

  /* Rückfrage */
  .overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.45); }
  .dialog { max-width: 360px; width: 100%; padding: 18px; border-radius: 16px; background: var(--ge-card); box-shadow: 0 8px 28px rgba(0,0,0,.35); display: grid; gap: 16px; }
  .dtext { line-height: 1.45; white-space: pre-line; }
  .dbtns { display: flex; justify-content: flex-end; gap: 8px; }
  @media (prefers-reduced-motion: no-preference) { .tile .glow, .bar, .tile .dot { transition: background .5s; } }
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
    return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(", ")})`;
  }
  if (style === "mirrored") return `linear-gradient(90deg, ${colors.concat(colors.slice(0, -1).reverse()).join(", ")})`;
  return colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.join(", ")})`;
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

function geHexHs(hex) {
  if (!GE_HEX.test(hex || "")) return { h: 0, s: 0 };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  let hue = 0;
  if (d) {
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  return { h: Math.round((hue * 60 + 360) % 360), s: mx ? Math.round((d / mx) * 100) : 0 };
}

const geHueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const geClamp = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};
const gePct = (b) => Math.max(1, Math.round((Number(b) || 0) / 2.54));
const geBri = (pct) => Math.max(1, Math.min(254, Math.round(Number(pct) * 2.54)));
const geRnd = (a, b) => a + Math.random() * (b - a);
const geRndI = (a, b) => Math.round(geRnd(a, b));
const gePick = (a) => a[Math.floor(Math.random() * a.length)];
function geShuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const geStrip = (cols) => (cols && cols.length ? h("span", { class: "strip" }, cols.map((c) => h("span", { style: { background: c } }))) : h("span", { class: "strip none" }));
const geClone = (o) => JSON.parse(JSON.stringify(o));
const geFx = (id) => GE_FX.find((f) => f.id === id) || GE_FX[0];
const geWait = (ms) => new Promise((r) => setTimeout(r, ms));

class GradientEditorCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = Object.assign(
      {
        title: "Lichtlabor Wohnzimmer",
        slot_prefix: "input_text.gradient_slot_",
        slots: 20,
        lamp_slots: {},
        lamp_map: {},
        lamp_labels: {},
        lamp_entities: {},
        scene_prefix: "scene.wohnzimmer_oben_alle_",
        scene_strip: "wohnzimmer_oben_alle ",
        picker: "input_select.wohnzimmer_szene",
        last_entity: "input_text.wohnzimmer_szenen_speicher",
        cycle_sensor: "sensor.wohnzimmer_szenen_zyklus_aktiv",
        protected_entity: "input_text.wohnzimmer_szenen_geschutzt",
        test_script: "script.gradient_szene_anwenden",
        base_topic: "zigbee2mqtt",
        storage_key: "default",
        gen_lamps: [],
        gen_save_script: "script.wohnzimmer_szene_speichern",
        gen_name_entity: "input_text.lichtlabor_neue_szene_name",
        gen_learn_ms: 3500,
        delete_script: "script.wohnzimmer_szene_loeschen",
        delete_select: "input_select.lichtlabor_szene_loschen",
        effect_script: "script.wohnzimmer_effekt",
        effect_group: "wohnzimmer_oben_alle",
        cozy_off: [],
        transition: 1,
      },
      config || {}
    );
    this._storeKey = "gradient-editor-card:v2:" + this._config.storage_key;
    if (!this._stateLoaded) {
      this._loadStore();
      this._stateLoaded = true;
    }
    this._entityCache = {};
    this._build();
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._el) return;
    const picker = this._st(this._config.picker);
    if (picker !== this._pickerSeen) {
      // Fernbedienung oder Dashboard hat umgeschaltet → das leuchtet jetzt
      if (this._pickerSeen !== undefined) this._lit = picker;
      this._pickerSeen = picker;
    }
    if (!this._ed) {
      this._lit = picker;
      this._open(null, null, true);
    }
    const sig = this._sig();
    if (sig !== this._lastSig) {
      this._lastSig = sig;
      this._render();
    }
  }

  /* ---------- Zustand pro Browser ---------- */
  _loadStore() {
    let s = {};
    try {
      s = JSON.parse(window.localStorage.getItem(this._storeKey) || "{}") || {};
    } catch (e) {
      s = {};
    }
    this._profiles = {};
    for (const [name, prof] of Object.entries((s.profiles && typeof s.profiles === "object" && s.profiles) || {}).slice(0, 40)) {
      if (!prof || typeof prof !== "object") continue;
      const m = {};
      for (const [k, v] of Object.entries(prof)) m[k] = geClamp(v, 0, 254, 0);
      this._profiles[String(name).slice(0, 60)] = m;
    }
    this._view = s.view === "edit" ? "edit" : "list";
  }

  _saveStore() {
    clearTimeout(this._storeTimer);
    this._storeTimer = setTimeout(() => {
      try {
        window.localStorage.setItem(this._storeKey, JSON.stringify({ profiles: this._profiles, view: this._view }));
      } catch (e) {
        /* privater Modus o. ä. */
      }
    }, 400);
  }

  /* ---------- HA-Daten ---------- */
  _st(eid) {
    const s = this._hass && this._hass.states[eid];
    return s ? s.state : null;
  }

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

  _findEntity(name) {
    if (this._entityCache[name]) return this._entityCache[name];
    if (!this._hass) return null;
    const eid = Object.keys(this._hass.states).find((e) => e.startsWith("light.") && this._hass.states[e].attributes.friendly_name === name) || null;
    if (eid) this._entityCache[name] = eid;
    return eid;
  }

  /* Alle Lampen: erst Gradient-Lampen (Festavia), dann die Lampen der Gruppe. Art aus supported_color_modes. */
  _lamps() {
    const c = this._config;
    const out = [];
    for (const name of Object.keys(c.lamp_slots || {})) {
      const eid = (c.lamp_entities || {})[name] || this._findEntity(name);
      const st = eid && this._hass ? this._hass.states[eid] : null;
      out.push({
        key: name, name, eid, grad: true, st,
        label: (c.lamp_labels || {})[name] || name,
        kind: st ? "grad" : "missing",
        slotPrefix: (c.lamp_slots || {})[name] || c.slot_prefix,
        mapPrefix: (c.lamp_map || {})[name] || "",
        fxList: (st && st.attributes.effect_list) || [],
        minK: Math.max(2000, (st && st.attributes.min_color_temp_kelvin) || 2000),
        maxK: Math.min(6500, (st && st.attributes.max_color_temp_kelvin) || 6500),
      });
    }
    for (const x of c.gen_lamps || []) {
      const eid = typeof x === "string" ? x : x.entity;
      const st = this._hass ? this._hass.states[eid] : null;
      const modes = (st && st.attributes.supported_color_modes) || [];
      let kind = "missing";
      if (st) kind = modes.some((m) => ["xy", "hs", "rgb", "rgbw", "rgbww"].includes(m)) ? "color" : modes.includes("color_temp") ? "white" : "dim";
      out.push({
        key: eid, eid, st, kind,
        label: (typeof x === "object" && x.name) || (st && st.attributes.friendly_name) || eid,
        fxList: (st && st.attributes.effect_list) || [],
        minK: Math.max(2000, (st && st.attributes.min_color_temp_kelvin) || 2200),
        maxK: Math.min(6500, (st && st.attributes.max_color_temp_kelvin) || 6500),
      });
    }
    return out;
  }

  _lamp(key) {
    return this._lamps().find((l) => l.key === key) || null;
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

  _sceneById(id) {
    return this._scenes().find((s) => s.id === id) || null;
  }

  _pickerScene() {
    const name = this._st(this._config.picker);
    return this._scenes().find((s) => s.name === name) || null;
  }

  _cycle() {
    const raw = this._st(this._config.cycle_sensor) || "";
    return raw.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
  }

  _protected() {
    const raw = this._st(this._config.protected_entity) || "";
    return new Set(raw.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0));
  }

  /* Szene, auf der die Fernbedienung gerade steht (zuletzt aufgerufen) */
  _lastScene() {
    const eid = this._st(this._config.last_entity) || "";
    return this._scenes().find((s) => s.eid === eid) || this._pickerScene();
  }

  _nextInCycle() {
    const cyc = this._cycle();
    if (!cyc.length) return null;
    const last = this._lastScene();
    const i = last ? cyc.indexOf(last.id) : -1;
    return this._sceneById(cyc[(i + 1) % cyc.length]);
  }

  _parseSlot(raw) {
    if (!raw || raw[0] !== "{") return null;
    try {
      const d = JSON.parse(raw);
      const colors = Array.isArray(d.c) ? d.c.filter((x) => GE_HEX.test(x)) : [];
      const style = GE_FEST_STYLES.some((s) => s[0] === d.s) ? d.s : "scattered";
      if (colors.length) return { n: String(d.n || ""), s: style, c: colors };
    } catch (e) {
      /* ungültig */
    }
    return null;
  }

  _slots(lamp) {
    const out = [];
    if (!lamp || !lamp.slotPrefix) return out;
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
    const def = { m: "n", v: "", s: 0, c: "#ffffff", b: 200, k: 2700, p: [], fx: "keine" };
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
        fx: GE_FX.some((f) => f.id === d.fx) ? d.fx : "keine",
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

  _mapOf(lamp, id) {
    const raw = this._mapRaw(lamp, id);
    return raw === null ? null : this._parseMap(raw);
  }

  _mapSlot(lamp, p, slots) {
    if (p.s) return p.s;
    if (!p.v) return 0;
    const i = (slots || this._slots(lamp)).findIndex((x) => x.d && x.d.n.toLowerCase() === p.v.toLowerCase());
    return i >= 0 ? i + 1 : 0;
  }

  _slotData(lamp, p) {
    const slots = this._slots(lamp);
    const n = this._mapSlot(lamp, p, slots);
    return n && slots[n - 1] ? slots[n - 1].d : null;
  }

  _usage(lamp, n) {
    if (!lamp || !lamp.mapPrefix) return [];
    const slots = this._slots(lamp);
    return this._scenes()
      .filter((sc) => {
        const p = this._mapOf(lamp, sc.id);
        return p && p.m === "v" && this._mapSlot(lamp, p, slots) === n;
      })
      .map((sc) => sc.name);
  }

  _grads() {
    return this._lamps().filter((l) => l.grad);
  }

  /* Vorschau + Effekt einer Szene (erste Gradient-Lampe mit Zuordnung) */
  _sceneInfo(id) {
    for (const l of this._grads()) {
      const p = this._mapOf(l, id);
      if (p) return { p: p.p, fx: p.fx };
    }
    return { p: [], fx: "keine" };
  }

  _sig() {
    const parts = [this._st(this._config.picker), this._st(this._config.last_entity), this._st(this._config.cycle_sensor), this._st(this._config.protected_entity)];
    const scenes = this._scenes();
    parts.push(scenes.map((s) => s.id + ":" + s.name).join(","));
    for (const l of this._lamps()) {
      parts.push(l.st ? `${l.key}:${l.st.state}` : l.key); // nur an/aus: Farbwechsel (auch durch Effekte) sollen nicht ständig neu zeichnen
      if (l.grad) {
        parts.push(this._slots(l).map((s) => s.raw).join("\u0001"));
        parts.push(scenes.map((s) => this._mapRaw(l, s.id)).join("\u0001"));
      }
    }
    return parts.join("\u0002");
  }

  /* ---------- Editor-Zustand ---------- */
  _defState(l) {
    return l.grad ? { on: false, c: ["#ff7a00", "#ff2d9a"], style: "linear", b: 100, white: false, k: 2700 } : { on: false, h: 30, s: 60, k: 2700, b: 150, ct: l.kind !== "color" };
  }

  _clampK(l, k) {
    return Math.max(l.minK, Math.min(l.maxK, Math.round(k)));
  }

  /* Aktuelles Licht aus HA lesen (Festavia aus der Zuordnung der aktiven Szene, sonst aus dem Lampenzustand) */
  _readLight(prev, scene) {
    const st = {};
    const sc = scene || this._pickerScene();
    for (const l of this._lamps()) {
      const p = Object.assign(this._defState(l), prev && prev[l.key] ? geClone(prev[l.key]) : null);
      const s = l.st;
      if (!s || l.kind === "missing") {
        st[l.key] = p;
        continue;
      }
      p.on = s.state === "on";
      if (p.on) {
        p.b = s.attributes.brightness || 254;
        const hs = s.attributes.color_mode !== "color_temp" ? s.attributes.hs_color : null;
        if (l.grad) {
          const m = sc ? this._mapOf(l, sc.id) : null;
          let done = false;
          if (m && m.m === "v") {
            const d = this._slotData(l, m);
            if (d) Object.assign(p, { c: d.c.slice(0, GE_MAX_FEST), style: d.s, white: false }), (done = true);
          } else if (m && m.m === "c") Object.assign(p, { c: [m.c], style: "linear", white: false }), (done = true);
          else if (m && m.m === "t") Object.assign(p, { white: true, k: m.k }), (done = true);
          if (!done) {
            if (hs) Object.assign(p, { c: [geHsvHex(hs[0], hs[1])], style: "linear", white: false });
            else Object.assign(p, { white: true, k: s.attributes.color_temp_kelvin || p.k });
          }
        } else if (l.kind === "color" && hs) Object.assign(p, { ct: false, h: Math.round(hs[0]), s: Math.round(hs[1]) });
        else Object.assign(p, { ct: true, k: s.attributes.color_temp_kelvin || p.k });
      }
      st[l.key] = p;
    }
    return st;
  }

  _readLevels() {
    const prof = {};
    for (const l of this._lamps()) {
      if (!l.st || l.kind === "missing") continue;
      prof[l.key] = l.st.state === "on" ? l.st.attributes.brightness || 254 : 0;
    }
    return prof;
  }

  /* Farbe einer Lampe für die Anzeige (null = aus) */
  _hex(l, p) {
    if (!p || !p.on || l.kind === "missing") return null;
    if (l.grad) return p.white ? geKelvinColor(this._clampK(l, p.k)) : geBar(p.c, p.style);
    if (l.kind === "color" && !p.ct) return geHsvHex(p.h, p.s);
    return l.kind === "dim" ? "#fff6e0" : geKelvinColor(this._clampK(l, p.k));
  }

  /* Farbstreifen der Szene: bis zu 5 unterschiedliche Farben der eingeschalteten Lampen */
  _stripOf(st) {
    const cols = [];
    const seen = new Set();
    for (const l of this._lamps()) {
      const p = st[l.key];
      if (!p || !p.on || l.kind === "missing") continue;
      let hx;
      if (l.grad) hx = p.white ? null : p.c[0];
      else if (l.kind === "color" && !p.ct) hx = geHsvHex(p.h, p.s);
      else hx = null;
      if (!hx) {
        const k = this._clampK(l, p.k);
        hx = "#" + geKelvinColor(k).match(/\d+/g).map((x) => Number(x).toString(16).padStart(2, "0")).join("");
      }
      const key = [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16) >> 6).join("-");
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(hx);
      }
    }
    return cols.slice(0, 5);
  }

  /* Editor öffnen: scene = Szene laden (schaltet um), recipe = Rezept würfeln, beides leer = vom aktuellen Licht */
  async _open(scene, recipe, silent) {
    this._sheet = null;
    this._saveOpen = false;
    this._effOpen = false;
    this._master = 100;
    const prev = this._ed ? this._ed.st : null;
    if (!silent) this._markBefore();
    const base = { recipe: recipe || null, ncol: 3, keep: new Set(), dirty: false, briFrom: "" };
    if (scene) {
      this._ed = Object.assign(base, { id: scene.id, name: scene.name, st: this._readLight(prev, scene), fx: this._sceneInfo(scene.id).fx });
      this._undo = [];
      this._redo = [];
      if (!silent) {
        this._seq = (this._seq || 0) + 1;
        this._view = "edit";
        this._busy(`„${scene.name}“ wird geladen …`);
        this._render();
        if (!(await this._call("scene", "turn_on", { entity_id: scene.eid }))) return this._busy("");
        await geWait(this._config.gen_learn_ms);
        this._ed.st = this._readLight(prev, scene);
        this._ed.fx = this._sceneInfo(scene.id).fx;
        this._profiles[scene.name] = this._readLevels();
        this._lit = scene.name;
        this._fxSent = this._ed.fx;
        this._saveStore();
        this._busy("");
        this._writePreview(scene.id, this._stripOf(this._ed.st));
        this._render();
        this._toast(`„${scene.name}“ leuchtet jetzt – Rezept wählen und würfeln oder Lampen einzeln anpassen`);
      }
      return;
    }
    const pk = silent ? this._pickerScene() : null;
    this._ed = Object.assign(base, { id: pk ? pk.id : null, name: pk ? pk.name : "", st: this._readLight(prev), fx: pk ? this._sceneInfo(pk.id).fx : "keine" });
    this._undo = [];
    this._redo = [];
    if (silent) return;
    this._view = "edit";
    if (recipe) {
      this._remember();
      this._applyRecipe(recipe);
      this._lit = null;
      this._render();
      await this._sendAll();
      const r = GE_RECIPES.find((x) => x.id === recipe);
      this._toast(`„${r.n}“ leuchtet jetzt – würfeln, anpassen, dann speichern`);
    } else {
      this._fxSent = this._ed.fx;
      this._render();
      this._toast("Neue Szene vom aktuellen Licht – nichts wurde geschaltet");
    }
  }

  async _pick(scene, recipe) {
    if (this._ed && this._ed.dirty && !(await this._confirm("Ungespeicherte Änderungen verwerfen? Das Licht wechselt dann.", "Weiter"))) return;
    this._open(scene, recipe, false);
  }

  _snap() {
    const ed = this._ed;
    return { st: geClone(ed.st), fx: ed.fx };
  }

  /* Vor der ersten Lichtänderung: das echte Licht (aus HA) für „Licht wie vorher“ merken */
  _markBefore() {
    if (this._before) return;
    const sc = this._pickerScene();
    this._before = { st: this._readLight(null), fx: sc ? this._sceneInfo(sc.id).fx : "keine" };
  }

  _remember() {
    this._markBefore();
    this._undo = this._undo || [];
    this._undo.push(this._snap());
    if (this._undo.length > 30) this._undo.shift();
    this._redo = [];
    this._ed.dirty = true;
    this._lit = null;
  }

  async _step(back) {
    const from = back ? this._undo : this._redo;
    const to = back ? this._redo : this._undo;
    const s = (from || []).pop();
    if (!s) return;
    to.push(this._snap());
    this._ed.st = s.st;
    this._ed.fx = s.fx;
    this._ed.dirty = true;
    this._lit = null;
    this._render();
    await this._sendAll();
  }

  /* Änderung anwenden: merken, zeichnen, senden (true = alle Lampen, Schlüssel = nur diese) */
  async _do(fn, send) {
    this._remember();
    fn();
    this._render();
    if (send === true) await this._sendAll();
    else if (send) await this._sendAll([send]);
  }

  /* ---------- Rezepte ---------- */
  _applyRecipe(id) {
    const ed = this._ed;
    const st = ed.st;
    const n = Math.max(1, Math.min(5, ed.ncol || 3));
    const lamps = this._lamps().filter((l) => l.kind !== "missing");
    const color = lamps.filter((l) => l.kind === "color");
    const white = lamps.filter((l) => l.kind === "white" || l.kind === "dim");
    const grads = lamps.filter((l) => l.grad);
    const set = (l, v) => {
      if (!ed.keep.has(l.key)) Object.assign(st[l.key], v);
    };
    const spread = (pal, sat, bri) => geShuffle(color).forEach((l, i) => set(l, { on: true, ct: false, h: Math.round(pal[i % pal.length]), s: sat(), b: bri() }));
    const whites = (on, kLo, kHi, bLo, bHi) => white.forEach((l) => set(l, { on: on(l), ct: true, k: this._clampK(l, Math.round(geRnd(kLo, kHi) / 50) * 50), b: geRndI(bLo, bHi) }));
    const fest = (cols, style, b) => grads.forEach((l) => set(l, { on: true, white: false, c: cols.slice(0, GE_MAX_FEST), style, b }));
    const cozyOff = this._config.cozy_off || [];
    if (id === "gemuetlich") {
      const base = geRnd(10, 40);
      const pal = Array.from({ length: n }, (_, i) => (base + (i - (n - 1) / 2) * 14 + 360) % 360);
      spread(pal, () => geRndI(45, 75), () => geRndI(90, 160));
      whites((l) => !cozyOff.includes(l.eid), 2000, 2400, 60, 120);
      fest(pal.map((x) => geHsvHex(x, 75)), "linear", 90);
    } else if (id === "bunt") {
      const pal = [];
      for (let i = 0; i < n; i++) {
        let best = 0;
        let bd = -1;
        for (let t = 0; t < 40; t++) {
          const hue = Math.random() * 360;
          const d = pal.length ? Math.min(...pal.map((x) => geHueDist(x, hue))) : 999;
          if (d > bd) {
            bd = d;
            best = hue;
          }
          if (d >= 50) break;
        }
        pal.push(best);
      }
      spread(pal, () => geRndI(85, 100), () => 254);
      whites(() => true, 2700, 4000, 200, 200);
      fest(pal.map((x) => geHsvHex(x, 95)), "scattered", 160);
    } else if (id === "nacht") {
      const two = geShuffle(color).slice(0, 2).map((l) => l.key);
      const pal = Array.from({ length: n }, () => geRnd(0, 30));
      color.forEach((l, i) => set(l, { on: two.includes(l.key), ct: false, h: Math.round(pal[i % n]), s: 100, b: geRndI(13, 25) }));
      white.forEach((l) => set(l, { on: false }));
      grads.forEach((l) => set(l, { on: false }));
    } else if (id === "frei") {
      const pal = Array.from({ length: n }, () => geRnd(0, 360));
      geShuffle(color).forEach((l, i) => set(l, { on: Math.random() < 0.85, ct: false, h: Math.round(pal[i % n]), s: geRndI(30, 100), b: geRndI(60, 254) }));
      whites(() => Math.random() < 0.5, 2000, 6500, 60, 254);
      fest(pal.map((x) => geHsvHex(x, geRndI(60, 100))), gePick(["linear", "scattered", "mirrored"]), geRndI(60, 200));
    }
  }

  async _roll() {
    const ed = this._ed;
    if (!ed.recipe) return this._toast("Erst ein Rezept wählen, dann würfelt es darin");
    await this._do(() => this._applyRecipe(ed.recipe), true);
  }

  /* Helligkeiten (und an/aus) einer Szene übernehmen, Farben bleiben */
  async _briFrom(sc) {
    const ed = this._ed;
    if (!this._profiles[sc.name]) {
      if (!(await this._confirm(`Die Helligkeiten von „${sc.name}“ sind noch nicht bekannt. Die Szene wird dafür kurz eingeschaltet und ausgelesen, danach kommt dein Licht zurück.`, "Kurz umschalten"))) return;
      this._busy(`„${sc.name}“ wird ausgelesen …`);
      if (!(await this._call("scene", "turn_on", { entity_id: sc.eid }))) return this._busy("");
      await geWait(this._config.gen_learn_ms);
      this._profiles[sc.name] = this._readLevels();
      this._saveStore();
      this._busy("");
    }
    const prof = this._profiles[sc.name];
    await this._do(() => {
      for (const l of this._lamps()) {
        if (ed.keep.has(l.key) || !(l.key in prof)) continue;
        const p = ed.st[l.key];
        p.on = prof[l.key] > 0;
        if (p.on) p.b = prof[l.key];
      }
      ed.briFrom = sc.name;
    }, true);
    this._toast(`Helligkeiten wie „${sc.name}“ übernommen, Farben unverändert`);
  }

  /* ---------- Senden ---------- */
  async _sendLamp(l, p, withFx) {
    if (l.kind === "missing" || !l.eid) return;
    const tr = { transition: this._config.transition };
    if (!p.on) return this._call("light", "turn_off", Object.assign({ entity_id: l.eid }, tr));
    const fx = this._ed.fx;
    const fxOn = withFx && geFx(fx).lamp && l.fxList.includes(fx);
    if (l.grad) {
      if (p.white) await this._call("light", "turn_on", Object.assign({ entity_id: l.eid, color_temp_kelvin: this._clampK(l, p.k), brightness: p.b }, tr));
      else {
        const topic = `${this._config.base_topic}/${l.name}/set`;
        if (p.c.length === 1) await this._call("mqtt", "publish", { topic, payload: JSON.stringify({ state: "ON", brightness: p.b, color: { hex: p.c[0] } }) });
        else {
          // zwei Nachrichten, sonst meldet Z2M die Lampe weiter als „aus“
          const ok = await this._call("mqtt", "publish", { topic, payload: JSON.stringify({ state: "ON", brightness: p.b }) });
          if (ok) await this._call("mqtt", "publish", { topic, payload: JSON.stringify({ gradient_style: p.style, gradient: p.c.slice(0, GE_MAX_FEST) }) });
        }
      }
    } else if (l.kind === "dim") await this._call("light", "turn_on", Object.assign({ entity_id: l.eid, brightness: p.b }, tr));
    else if (p.ct || l.kind !== "color") await this._call("light", "turn_on", Object.assign({ entity_id: l.eid, color_temp_kelvin: this._clampK(l, p.k), brightness: p.b }, tr));
    else await this._call("light", "turn_on", Object.assign({ entity_id: l.eid, hs_color: [p.h, p.s], brightness: p.b }, tr));
    if (fxOn) await this._call("light", "turn_on", { entity_id: l.eid, effect: fx });
  }

  /* Effektwechsel: alten stoppen, neuen starten (Lampeneffekte pro Lampe, Skript-Effekte per Skript) */
  async _sendFx(list) {
    const fx = this._ed.fx;
    const prev = this._fxSent;
    const c = this._config;
    const [sd, ss] = c.effect_script.split(".");
    if (prev !== fx) {
      if (geFx(prev).lamp && !geFx(fx).lamp) {
        await this._call("mqtt", "publish", { topic: `${c.base_topic}/${c.effect_group}/set`, payload: JSON.stringify({ effect: GE_STOP_FX }) });
        for (const l of this._grads()) if (l.eid && l.fxList.includes(GE_STOP_FX)) await this._call("light", "turn_on", { entity_id: l.eid, effect: GE_STOP_FX });
      }
      if (geFx(prev).script && !geFx(fx).script) await this._call(sd, ss, { effekt: "stop" });
      this._fxSent = fx;
    }
    if (geFx(fx).script) return this._call(sd, ss, { effekt: fx });
    if (!geFx(fx).lamp) return;
    for (const l of list) {
      const p = this._ed.st[l.key];
      if (p && p.on && l.eid && l.fxList.includes(fx)) await this._call("light", "turn_on", { entity_id: l.eid, effect: fx });
    }
  }

  /* an alle (oder einige) Lampen senden; ein neuer Auftrag bricht einen laufenden ab */
  async _sendAll(keys, noFx) {
    const lamps = this._lamps().filter((l) => l.kind !== "missing" && (!keys || keys.includes(l.key)));
    const seq = (this._seq = (this._seq || 0) + 1);
    this._busy(lamps.length > 1 ? `sendet an ${lamps.length} Lampen …` : "sendet …");
    for (const l of lamps) {
      if (seq !== this._seq) return;
      await this._sendLamp(l, this._ed.st[l.key], !noFx && !!keys);
    }
    if (!noFx && !keys && seq === this._seq) await this._sendFx(lamps);
    if (seq === this._seq) this._busy("");
  }

  _busy(text) {
    this._busyText = text;
    const el = this._sendEl;
    if (!el || !el.isConnected) return;
    el.classList.toggle("busy", !!text);
    el.lastChild.textContent = text || "Licht ist aktuell";
  }

  /* „Licht wie vorher“: Stand beim Öffnen des Lichtlabors, inklusive Festavia und Effekt (widerrufbar) */
  async _lightBefore() {
    if (!this._before) return;
    await this._do(() => {
      const ed = this._ed;
      const b = geClone(this._before.st);
      for (const l of this._lamps()) if (b[l.key]) ed.st[l.key] = b[l.key];
      ed.fx = this._before.fx;
      this._master = 100;
    }, true);
    this._toast("Licht wie vor dem Lichtlabor – mit Zurück holst du den letzten Stand wieder");
  }

  /* ---------- Speichern / Löschen ---------- */
  async _save() {
    const ed = this._ed;
    const mode = this._saveMode || "neu";
    const scenes = this._scenes();
    const c = this._config;
    const [domain, service] = c.gen_save_script.split(".");
    let id;
    let name;
    const prot = this._protected();
    if (mode === "over") {
      const sc = scenes.find((s) => s.id === ed.id);
      if (!sc) return this._toast("Die Szene gibt es nicht mehr – bitte als neue Szene speichern");
      const act = this._st(c.picker);
      if (act !== sc.name) return this._toast(`Aktiv ist gerade „${act}“ – bitte „${sc.name}“ in den Kacheln antippen (lädt sie neu), dann überschreiben`);
      if (!(await this._confirm(`„${sc.name}“ wirklich überschreiben? Der alte Stand ist dann weg.${prot.has(sc.id) ? "\n\nDie Szene hängt fest an Fernbedienungen oder Skripten." : ""}`, "Überschreiben", true))) return;
      ({ id, name } = sc);
    } else {
      name = (this._saveName || "").trim();
      if (!name) return this._toast("Bitte einen Namen für die neue Szene eingeben");
      if (scenes.some((s) => s.name === name)) return this._toast(`„${name}“ gibt es schon – bitte anderen Namen wählen`);
      id = Math.max(0, ...scenes.map((s) => s.id)) + 1; // so vergibt auch das Speicher-Skript die ID
    }
    const fxLamp = geFx(ed.fx).lamp;
    this._seq = (this._seq || 0) + 1;
    this._busy("speichert …");
    if (fxLamp) {
      // Lampeneffekt kurz anhalten, damit die Lampen ihre Grundfarbe speichern
      await this._call("mqtt", "publish", { topic: `${c.base_topic}/${c.effect_group}/set`, payload: JSON.stringify({ effect: GE_STOP_FX }) });
      await this._sendAll(null, true);
      await geWait(1500);
    }
    if (mode === "neu" && !(await this._call("input_text", "set_value", { entity_id: c.gen_name_entity, value: name }))) return this._busy("");
    if (!(await this._call(domain, service, { modus: mode === "over" ? "ueberschreiben" : "neu" }))) return this._busy("");
    const preview = this._stripOf(ed.st);
    const notes = [];
    for (const l of this._grads()) {
      if (l.kind === "missing") continue;
      const msg = await this._saveGrad(l, id, name, mode === "over", preview);
      if (msg) notes.push(msg);
    }
    if (fxLamp) await this._sendFx(this._lamps());
    Object.assign(ed, { id, name, dirty: false });
    this._lit = name;
    this._saveName = "";
    this._saveOpen = false;
    this._undo = [];
    this._redo = [];
    this._busy("");
    this._render();
    this._toast(`„${name}“ ${mode === "over" ? "überschrieben" : `als Szene ${id} gespeichert, letzte Taste im Zyklus`}` + (notes.length ? " – " + notes.join("; ") : ""));
  }

  /* Gradient-Lampe für Szene <id> eintragen: Verlauf → Slot (gleicher, beim Überschreiben der bisherige, sonst freier), Zuordnung mit Vorschau + Effekt */
  async _saveGrad(l, id, name, over, preview) {
    if (!l.mapPrefix) return "";
    const p = this._ed.st[l.key];
    let obj;
    if (!p.on) obj = { m: "a" };
    else if (p.white) obj = { m: "t", k: this._clampK(l, p.k), b: p.b };
    else if (p.c.length === 1) obj = { m: "c", c: p.c[0], b: p.b };
    else {
      const cols = p.c.slice(0, GE_MAX_FEST);
      const slots = this._slots(l);
      const same = slots.find((s) => s.d && s.d.s === p.style && s.d.c.join() === cols.join());
      let n = same ? same.n : 0;
      const old = over ? this._mapOf(l, id) : null;
      if (!n && old && old.m === "v") {
        const on = this._mapSlot(l, old, slots);
        if (on && this._usage(l, on).length <= 1) n = on;
      }
      if (!n) n = this._freeSlot(l);
      if (!n) return `${l.label}: alle ${this._config.slots} Verlaufsplätze belegt, Verlauf nicht gespeichert`;
      if (!same) {
        const value = JSON.stringify({ n: name.slice(0, 30), s: p.style, c: cols });
        if (!(await this._call("input_text", "set_value", { entity_id: l.slotPrefix + n, value }))) return `${l.label}: Verlauf nicht gespeichert`;
      }
      obj = { m: "v", s: n, b: p.b };
    }
    if (preview && preview.length) obj.p = preview;
    if (this._ed.fx !== "keine") obj.fx = this._ed.fx;
    const eid = l.mapPrefix + id;
    if (!this._hass.states[eid]) {
      const base = l.mapPrefix.replace(/^input_text\./, "").replace(/_$/, "");
      const hname = base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " " + id;
      try {
        await this._hass.callWS({ type: "input_text/create", name: hname, max: 255, icon: "mdi:link-variant" });
      } catch (e) {
        return `${l.label}: Zuordnungs-Helfer konnte nicht angelegt werden`;
      }
      for (let t = 0; t < 25 && !this._hass.states[eid]; t++) await geWait(200);
      if (!this._hass.states[eid]) return `${l.label}: Helfer ${eid} nicht gefunden`;
    }
    return (await this._call("input_text", "set_value", { entity_id: eid, value: JSON.stringify(obj) })) ? "" : `${l.label}: Zuordnung fehlgeschlagen`;
  }

  /* Farbvorschau in vorhandene Zuordnungen der Szene schreiben (übrige Felder bleiben) */
  async _writePreview(id, cols) {
    for (const l of this._grads()) {
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

  async _delete(sc) {
    const c = this._config;
    if (!(await this._confirm(`Szene „${sc.name}“ endgültig aus allen Wohnzimmer-Lampen löschen? Das lässt sich nicht rückgängig machen.`, "Löschen", true))) return;
    if (!(await this._call("input_select", "select_option", { entity_id: c.delete_select, option: sc.name }))) return;
    const [d, s] = c.delete_script.split(".");
    if (!(await this._call(d, s, {}))) return;
    if (this._ed && this._ed.id === sc.id) Object.assign(this._ed, { id: null, name: "", dirty: false });
    if (this._lit === sc.name) this._lit = null;
    this._view = "list";
    this._render();
    this._toast(`„${sc.name}“ gelöscht, Zyklus angepasst`);
  }

  /* ---------- Aufbau ---------- */
  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.replaceChildren();
    this._el = { card: h("ha-card"), overlay: h("div", { class: "overlay", hidden: true }) };
    root.append(h("style", null, GE_CSS), this._el.card);
    this._el.card.append(this._el.overlay);
    this._lastSig = null;
    if (this._hass) this.hass = this._hass;
  }

  _render() {
    if (!this._hass || !this._ed) return;
    const card = this._el.card;
    const ov = this._el.overlay;
    card.replaceChildren(this._head(), h("div", { class: "page" }, this._chooser(), this._pane()), this._foot(), ov);
  }

  _head() {
    const ed = this._ed;
    const list = this._view === "list";
    const name = ed.name || "Neue Szene";
    return h(
      "div",
      { class: "head" },
      list ? ic("mdi:flask-outline") : h("button", { class: "ibtn plain back", title: "Zurück zu Szenen und Rezepten", onclick: () => this._setView("list") }, ic("mdi:arrow-left")),
      h("span", { class: "t" }, list ? this._config.title : name),
      list ? h("button", { class: "pick", title: "Zum Editor", onclick: () => this._setView("edit") }, geStrip(this._stripOf(ed.st)), h("span", { class: "t" }, name), ic("mdi:pencil")) : null
    );
  }

  _setView(v) {
    this._view = v;
    this._saveStore();
    this._render();
  }

  /* ----- Kacheln: Rezepte + Szenen ----- */
  _chooser() {
    const ed = this._ed;
    const scenes = this._scenes();
    const cyc = this._cycle();
    const prot = this._protected();
    const order = [...cyc.map((id) => scenes.find((s) => s.id === id)).filter(Boolean), ...scenes.filter((s) => !cyc.includes(s.id))];
    const cur = this._stripOf(this._readLight(null));
    const startTile = (r) => {
      const cols = r.pv.map((x) => geHsvHex(x, r.s));
      const bg = r.id === "nacht" ? `linear-gradient(135deg, #2a0f05, ${cols[0]}aa 60%, #140804)` : `linear-gradient(135deg, ${cols.map((x, i) => x + (i % 2 ? "cc" : "ee")).join(", ")})`;
      return h(
        "button",
        { class: "start", style: { background: bg }, title: `Rezept „${r.n}“ sofort ausprobieren`, onclick: () => this._pick(null, r.id) },
        h("span", { class: "go" }, ic("mdi:dice-5-outline")),
        h("span", { class: "n" }, r.n),
        h("span", { class: "d" }, r.d.split(".")[0] + ".")
      );
    };
    const next = this._nextInCycle();
    const tiles = order.map((s) => {
      const pos = cyc.indexOf(s.id);
      const info = this._sceneInfo(s.id);
      const fx = geFx(info.fx);
      const cols = info.p;
      const wash = !cols.length ? "" : cols.length === 1 ? `linear-gradient(160deg, ${cols[0]}99, ${cols[0]}22)` : `linear-gradient(160deg, ${cols.map((x) => x + "99").join(", ")})`;
      const lit = s.name === this._lit;
      return h(
        "button",
        {
          class: "stile" + (lit ? " active" : "") + (ed.id === s.id ? " cur" : "") + (cols.length ? "" : " empty"),
          title: `„${s.name}“ einschalten und bearbeiten`,
          "aria-pressed": String(ed.id === s.id),
          onclick: () => this._pick(s, null),
        },
        h("span", { class: "wash", style: wash ? { background: wash } : null }),
        lit ? h("span", { class: "act", title: "leuchtet gerade" }, ic("mdi:check")) : null,
        h("span", { class: "pos" }, pos >= 0 ? ["Taste ", h("b", null, pos + 1)] : "nicht im Zyklus"),
        h("span", { class: "n" }, s.name, prot.has(s.id) ? h("ha-icon", { icon: "mdi:lock", title: "fest in Fernbedienungen/Skripten" }) : null),
        h("span", { class: "m" }, fx.id !== "keine" ? [ic("mdi:motion-play-outline"), fx.n] : cols.length ? `${cols.length} Farben` : "noch keine Vorschau")
      );
    });
    return h(
      "div",
      { class: "chooser" + (this._view === "list" ? "" : " hid") },
      h(
        "div",
        { class: "hero" },
        h("h2", null, ic("mdi:dice-5-outline"), "Neues Licht ausprobieren"),
        h("div", { class: "lead" }, "Rezept antippen, und der Raum leuchtet sofort so. Dann würfeln, Lampen anfassen, Effekt dazunehmen. Gefällt es, speichern."),
        h(
          "div",
          { class: "starts" },
          h(
            "button",
            { class: "start cur", title: "So weitermachen, wie es gerade leuchtet", onclick: () => this._pick(null, null) },
            h("span", { class: "go" }, ic("mdi:pencil")),
            h("span", { class: "pvs" }, cur.map((x) => h("span", { style: { background: x } }))),
            h("span", { class: "n" }, "Vom aktuellen Licht"),
            h("span", { class: "d" }, "So weitermachen, wie es gerade leuchtet. Nichts wird geschaltet.")
          ),
          GE_RECIPES.map(startTile)
        ),
        h("div", { class: "later" }, ic("mdi:lock"), h("span", null, `${GE_ZONE_RECIPES.join(", ")}: kommen, sobald die Lampen nach dem Raum benannt sind.`))
      ),
      h(
        "div",
        { class: "remote" },
        ic("mdi:play"),
        h("span", null, "Gerade an: ", h("b", null, this._lit || "eigenes Licht"), this._lit ? "" : ", noch nicht gespeichert"),
        h("span", { class: "grow" }),
        h("span", null, "Nächster Druck auf der Fernbedienung: ", h("b", null, next ? next.name : "–"))
      ),
      h("div", { class: "lbl" }, h("span", null, "Deine Szenen"), h("span", { class: "sub" }, "antippen = Licht umschalten und bearbeiten · Taste = Platz im Zyklus")),
      tiles.length ? h("div", { class: "sgrid" }, tiles) : h("div", { class: "muted" }, "Keine Szenen gefunden.")
    );
  }

  /* ----- Editor ----- */
  _pane() {
    const ed = this._ed;
    const st = ed.st;
    const saved = ed.id ? this._sceneById(ed.id) : null;
    const prot = this._protected();
    const rec = GE_RECIPES.find((r) => r.id === ed.recipe);
    const fx = geFx(ed.fx);
    const lamps = this._lamps();
    const grads = lamps.filter((l) => l.grad);
    const color = lamps.filter((l) => l.kind === "color");
    const white = lamps.filter((l) => l.kind === "white" || l.kind === "dim");
    const missing = lamps.filter((l) => l.kind === "missing");
    const scenes = this._scenes();
    const gacts = (list) =>
      h(
        "span",
        { class: "acts" },
        h("button", { class: "mini", onclick: () => this._do(() => list.forEach((l) => (st[l.key].on = true)), true) }, "alle an"),
        h("button", { class: "mini", onclick: () => this._do(() => list.forEach((l) => (st[l.key].on = false)), true) }, "alle aus")
      );
    const group = (label, list, acts) => {
      if (!list.length) return null;
      const kids = [];
      for (const l of list) {
        kids.push(this._tile(l));
        if (this._sheet === l.key) kids.push(this._sheetEl(l));
      }
      return h("div", { class: "group" }, h("div", { class: "ghead" }, h("span", { class: "lbl" }, label), acts ? gacts(list) : null), h("div", { class: "tiles" }, kids));
    };
    const masterVal = h("span", { class: "v" }, this._master + " %");
    const master = h("input", {
      type: "range", min: 10, max: 150, step: 5, value: this._master, "aria-label": "Helligkeit aller Lampen",
      oninput: () => (masterVal.textContent = master.value + " %"),
      onchange: () => {
        const f = Number(master.value) / this._master;
        this._do(() => {
          for (const l of lamps) if (st[l.key]) st[l.key].b = Math.max(1, Math.min(254, Math.round(st[l.key].b * f)));
          this._master = Number(master.value);
        }, true);
      },
    });
    const briSel = h(
      "select",
      { class: "txt", "aria-label": "Helligkeiten einer Szene übernehmen", onchange: () => { const sc = scenes.find((x) => String(x.id) === briSel.value); if (sc) this._briFrom(sc); } },
      h("option", { value: "" }, "– wählen –"),
      scenes.map((x) => h("option", { value: String(x.id), selected: x.name === ed.briFrom }, x.name + (this._profiles[x.name] ? "" : " (schaltet kurz um)")))
    );
    const fxChip = (m) =>
      h(
        "button",
        { class: "rc" + (ed.fx === m.id ? " on" : ""), "aria-pressed": String(ed.fx === m.id), title: m.d, onclick: () => this._do(() => (ed.fx = m.id), true).then(() => this._toast(m.id === "keine" ? "Effekt aus" : `„${m.n}“ läuft jetzt am Licht`)) },
        m.id === "keine" ? null : ic("mdi:motion-play-outline"),
        m.n
      );
    const left = h(
      "div",
      { class: "col" },
      h(
        "div",
        { class: "group" },
        h("div", { class: "lbl" }, h("span", null, "Rezept"), h("span", { class: "sub" }, "wählen, dann unten würfeln")),
        h(
          "div",
          { class: "chips" },
          GE_RECIPES.map((r) =>
            h(
              "button",
              {
                class: "rc" + (ed.recipe === r.id ? " on" : ""), "aria-pressed": String(ed.recipe === r.id), title: r.d,
                onclick: () => {
                  ed.recipe = ed.recipe === r.id ? null : r.id;
                  if (ed.recipe) this._roll();
                  else this._render();
                },
              },
              h("span", { class: "pv" }, r.pv.map((x) => h("span", { style: { background: geHsvHex(x, r.s) } }))),
              r.n
            )
          )
        ),
        h("div", { class: "desc" }, rec ? rec.d : "Kein Rezept gewählt: Rezept antippen würfelt sofort darin. Oder gleich Lampen einzeln anpassen."),
        h(
          "div",
          { class: "row" },
          h("span", { class: "muted" }, "Farben im Rezept"),
          h(
            "div",
            { class: "count" },
            h("button", { disabled: ed.ncol <= 1, "aria-label": "weniger Farben", onclick: () => this._ncol(-1) }, "−"),
            h("span", null, `${ed.ncol} ${ed.ncol === 1 ? "Farbe" : "Farben"}`),
            h("button", { disabled: ed.ncol >= 5, "aria-label": "mehr Farben", onclick: () => this._ncol(1) }, "+")
          ),
          h("span", { class: "muted small" }, "Festavia bekommt dieselben.")
        )
      ),
      h(
        "div",
        { class: "group" },
        h("div", { class: "lbl" }, "Helligkeit"),
        h("div", { class: "range" }, h("span", { class: "l" }, "Alle Lampen"), master, masterVal),
        h("div", { class: "row" }, h("span", { class: "muted" }, "Helligkeiten wie Szene"), briSel),
        h("div", { class: "muted small" }, "Übernimmt pro Lampe Helligkeit und an/aus aus der Szene, die Farben bleiben.")
      ),
      h(
        "div",
        { class: "group" },
        h("div", { class: "lbl" }, h("span", null, "Effekt"), h("span", { class: "sub" }, "pro Szene gespeichert")),
        this._effOpen
          ? [h("div", { class: "chips" }, GE_FX.map(fxChip)), h("div", { class: "desc" }, fx.d)]
          : h(
              "button",
              { class: "collapsed", "aria-expanded": "false", onclick: () => { this._effOpen = true; this._render(); } },
              h("span", { class: "ic" }, ic("mdi:motion-play-outline")),
              h("span", { class: "t" }, h("b", null, fx.n), h("span", null, fx.d)),
              ic("mdi:chevron-down")
            )
      )
    );
    const right = h("div", { class: "col" }, group("Festavia Lichterkette", grads, false), group("Farblampen", color, true), group("Weißlampen", white, true), group("Nicht gefunden", missing, false));
    return h(
      "div",
      { class: "pane" + (this._view === "edit" ? "" : " hid") },
      h(
        "div",
        { class: "edhead" },
        h("span", { class: "nm" }, ed.name || "Neue Szene"),
        saved ? null : h("span", { class: "tag" }, "noch nicht gespeichert"),
        this._lit && saved && this._lit === saved.name && !ed.dirty ? h("span", { class: "tag ok" }, ic("mdi:check"), "leuchtet gerade") : ed.dirty ? h("span", { class: "tag warn" }, "verändert, ungespeichert") : null,
        saved && prot.has(saved.id) ? h("span", { class: "tag", title: "fest in Fernbedienungen/Skripten" }, ic("mdi:lock"), "geschützt") : null,
        h("span", { class: "grow" }),
        saved && !prot.has(saved.id) ? h("button", { class: "ibtn danger", title: "Szene löschen", "aria-label": "Szene löschen", onclick: () => this._delete(saved) }, ic("mdi:delete-outline")) : null
      ),
      h("div", { class: "cols" }, left, right)
    );
  }

  _ncol(d) {
    const ed = this._ed;
    ed.ncol = Math.max(1, Math.min(5, ed.ncol + d));
    if (ed.recipe) this._roll();
    else this._render();
  }

  _tile(l) {
    const ed = this._ed;
    const p = ed.st[l.key];
    if (l.kind === "missing") return h("div", { class: "tile off", title: l.eid || l.key }, h("span", { class: "nm" }, l.label), h("span", { class: "st" }, "nicht gefunden"));
    const c = this._hex(l, p);
    const lit = p.on && c;
    const sel = this._sheet === l.key;
    const keep = ed.keep.has(l.key);
    const fx = geFx(ed.fx);
    let stTxt = "aus";
    if (p.on) {
      if (l.grad) stTxt = p.white ? `Weiß ${this._clampK(l, p.k)} K · ${gePct(p.b)} %` : `${p.c.length} ${p.c.length === 1 ? "Farbe" : "Farben"} · ${GE_FEST_STYLES.find((x) => x[0] === p.style)[1]} · ${gePct(p.b)} %`;
      else if (l.kind === "color" && !p.ct) stTxt = `${gePct(p.b)} %`;
      else stTxt = l.kind === "dim" ? `${gePct(p.b)} %` : `Weiß ${this._clampK(l, p.k)} K · ${gePct(p.b)} %`;
    }
    const a = lit ? Math.min(0.5, 0.12 + (gePct(p.b) / 100) * 0.38) : 0;
    const fxTag = fx.lamp && p.on ? (l.fxList.includes(fx.id) ? h("span", { class: "fxtag" }, ic("mdi:motion-play-outline"), fx.n) : h("span", { class: "fxtag off" }, "statisch")) : null;
    const kids = [
      l.grad ? null : h("span", { class: "glow", style: lit ? `background:radial-gradient(120% 90% at 0% 0%, ${c}, transparent 70%);opacity:${a}` : "" }),
      keep ? h("span", { class: "lkm", title: "beim Würfeln gesperrt" }, ic("mdi:pin")) : null,
      l.grad ? null : h("span", { class: "dot", style: lit ? { background: c } : "" }),
      h("span", { class: "nm" }, l.label),
      l.grad ? h("span", { class: "bar" + (lit ? "" : " off"), style: lit ? { background: c } : "" }) : null,
      h("span", { class: "st" }, stTxt),
      fxTag,
    ];
    return h(
      "button",
      {
        class: "tile" + (l.grad ? " wide" : "") + (lit ? "" : " off") + (sel ? " sel" : ""),
        title: l.eid, "aria-expanded": String(sel),
        onclick: () => {
          this._sheet = sel ? null : l.key;
          this._render();
        },
      },
      kids
    );
  }

  _range(label, lo, hi, step, value, fmt, onset, cls) {
    const val = h("span", { class: "v" }, fmt(value));
    const r = h("input", {
      type: "range", min: lo, max: hi, step, value, class: cls || null, "aria-label": label,
      oninput: () => (val.textContent = fmt(Number(r.value))),
      onchange: () => onset(Number(r.value)),
    });
    return h("div", { class: "range" }, h("span", { class: "l" }, label), r, val);
  }

  _opt(on, label, onclick, dot, extra) {
    return h("button", { class: "opt" + (on ? " on" : ""), onclick }, dot ? h("span", { class: "d", style: { background: dot } }) : null, label, extra);
  }

  /* Blatt unter der Lampenkachel */
  _sheetEl(l) {
    const ed = this._ed;
    const p = ed.st[l.key];
    const keep = ed.keep.has(l.key);
    const set = (fn) => this._do(fn, l.key);
    const bri = this._range("Helligkeit", 1, 100, 1, gePct(p.b), (v) => v + " %", (v) => set(() => (p.b = geBri(v))));
    const offOpt = this._opt(!p.on, "Aus", () => set(() => (p.on = false)), "var(--ge-off)");
    let body;
    if (l.grad) {
      const lit = p.on && !p.white;
      body = [
        h("span", { class: "bar" + (lit ? "" : " off"), style: lit ? { background: geBar(p.c, p.style) } : "" }),
        h(
          "div",
          { class: "opts" },
          this._opt(p.on && !p.white, "Farben", () => set(() => Object.assign(p, { on: true, white: false })), geBar(p.c, p.style)),
          this._opt(p.on && p.white, "Weiß", () => set(() => Object.assign(p, { on: true, white: true })), geKelvinColor(this._clampK(l, p.k))),
          offOpt
        ),
        p.on && !p.white
          ? [
              h("div", { class: "lbl" }, h("span", null, "Farben"), h("span", { class: "sub" }, "antippen = Farbrad")),
              h(
                "div",
                { class: "row" },
                p.c.map((col, i) => {
                  const input = h("input", { type: "color", value: col, title: `Farbe ${i + 1} ändern`, onchange: () => set(() => (p.c[i] = input.value)) });
                  return h("label", { class: "sw", style: { background: col } }, input);
                }),
                h("button", { class: "add", title: "Farbe hinzufügen", disabled: p.c.length >= GE_MAX_FEST, onclick: () => set(() => p.c.push(geHsvHex(Math.random() * 360, 90))) }, ic("mdi:plus")),
                p.c.length > 1 ? h("button", { class: "btn ghost", onclick: () => set(() => p.c.pop()) }, "letzte Farbe weg") : null
              ),
              h(
                "div",
                { class: "row" },
                h("div", { class: "seg" }, GE_FEST_STYLES.map(([id, n]) => h("button", { class: p.style === id ? "on" : "", onclick: () => set(() => (p.style = id)) }, n))),
                h("button", { class: "btn ghost", title: "Gleiche Farben, andere Reihenfolge", onclick: () => set(() => (p.c = geShuffle(p.c))) }, ic("mdi:shuffle-variant"), "Mischen"),
                h(
                  "button",
                  {
                    class: "btn ghost", title: "Die Farben der eingeschalteten Farblampen übernehmen",
                    onclick: () =>
                      set(() => {
                        const cols = [];
                        const seen = new Set();
                        for (const x of this._lamps().filter((y) => y.kind === "color")) {
                          const z = ed.st[x.key];
                          if (!z.on || z.ct) continue;
                          const key = Math.round(z.h / 25);
                          if (!seen.has(key)) {
                            seen.add(key);
                            cols.push(geHsvHex(z.h, z.s));
                          }
                        }
                        p.c = cols.slice(0, GE_MAX_FEST);
                        if (!p.c.length) p.c = ["#ff7a00"];
                      }).then(() => this._toast("Festavia zeigt jetzt die Farben der Lampen")),
                  },
                  "Farben der Lampen übernehmen"
                )
              ),
              bri,
              h("div", { class: "muted" }, "Bis zu 5 Farben. Wie sie sich auf die einzelnen Lichter verteilen, entscheidet die Lampe selbst."),
            ]
          : p.on
          ? [this._kelvin(l, p, set), bri]
          : null,
      ];
    } else if (l.kind === "color") {
      const colInput = h("input", { type: "color", value: geHsvHex(p.h, p.s), onclick: (e) => e.stopPropagation(), onchange: () => set(() => Object.assign(p, geHexHs(colInput.value), { on: true, ct: false })) });
      body = [
        l.maxK <= 4000 ? h("div", { class: "muted" }, "Grün und Blau wirken bei dieser Lampe blasser.") : null,
        h(
          "div",
          { class: "opts" },
          h("button", { class: "opt" + (p.on && !p.ct ? " on" : ""), style: "padding-left:8px" }, h("span", { class: "d", style: { background: geHsvHex(p.h, p.s) } }), "Farbe", colInput),
          this._opt(p.on && p.ct, "Weiß", () => set(() => Object.assign(p, { on: true, ct: true })), geKelvinColor(this._clampK(l, p.k))),
          offOpt
        ),
        p.on && !p.ct ? [this._range("Sättigung", 0, 100, 1, p.s, (v) => v + " %", (v) => set(() => (p.s = v))), bri] : p.on ? [this._kelvin(l, p, set), bri] : null,
      ];
    } else {
      body = [
        h("div", { class: "opts" }, this._opt(p.on, "An", () => set(() => (p.on = true)), l.kind === "dim" ? "#fff6e0" : geKelvinColor(this._clampK(l, p.k))), offOpt),
        p.on ? [l.kind === "dim" ? null : this._kelvin(l, p, set), bri] : null,
      ];
    }
    return h(
      "div",
      { class: "sheet", role: "group" },
      h("h3", null, l.label),
      body,
      h(
        "div",
        { class: "sfoot" },
        h(
          "button",
          { class: "opt" + (keep ? " on" : ""), "aria-pressed": String(keep), onclick: () => { keep ? ed.keep.delete(l.key) : ed.keep.add(l.key); this._render(); } },
          ic("mdi:pin"),
          keep ? "Beim Würfeln gesperrt" : "Beim Würfeln sperren"
        ),
        h("button", { class: "btn", onclick: () => { this._sheet = null; this._render(); } }, "Fertig")
      )
    );
  }

  _kelvin(l, p, set) {
    const k = this._clampK(l, p.k);
    return [
      this._range("Farbtemperatur", l.minK, l.maxK, 50, k, (v) => v + " K", (v) => set(() => (p.k = v)), "kelvin"),
      h("div", { class: "ktxt" }, h("span", null, "sehr warm"), h("span", null, "neutral"), h("span", null, "Tageslicht")),
    ];
  }

  /* ----- Leiste unten ----- */
  _foot() {
    const ed = this._ed;
    const saved = ed.id ? this._sceneById(ed.id) : null;
    const prot = this._protected();
    this._sendEl = h("div", { class: "sendst" + (this._busyText ? " busy" : "") }, h("span", { class: "d" }), h("span", null, this._busyText || "Licht ist aktuell"));
    let panel = null;
    if (this._saveOpen) {
      if (!saved && this._saveMode === "over") this._saveMode = "neu";
      const mode = this._saveMode || "neu";
      this._saveMode = mode;
      const choice = (id, title, text) =>
        h("button", { class: "choice" + (mode === id ? " on" : ""), "aria-pressed": String(mode === id), onclick: () => { this._saveMode = id; this._render(); } }, h("span", { class: "t" }, title), h("span", { class: "muted small" }, text));
      const nameIn =
        mode === "neu"
          ? h("input", {
              class: "txt", type: "text", maxLength: 40, placeholder: "Name der neuen Szene", value: this._saveName || "",
              oninput: () => (this._saveName = nameIn.value),
              onkeydown: (e) => e.key === "Enter" && this._save(),
            })
          : null;
      panel = h(
        "div",
        { class: "savep" },
        choice("neu", "Als neue Szene", "Kommt ans Ende des Fernbedienungs-Zyklus. Festavia und Effekt inklusive."),
        saved ? choice("over", [`„${saved.name}“ überschreiben`, prot.has(saved.id) ? h("span", { style: "color:var(--ge-warn)" }, " · geschützte Szene") : null], "Gleiche Szene, neuer Stand. Fernbedienungen und Zyklus bleiben. Es gibt eine Rückfrage.") : null,
        nameIn,
        h(
          "div",
          { class: "row" },
          h("span", { class: "grow" }),
          h("button", { class: "btn ghost", onclick: () => { this._saveOpen = false; this._render(); } }, "Abbrechen"),
          h("button", { class: "btn", onclick: () => this._save() }, ic("mdi:content-save-outline"), "Speichern")
        )
      );
      if (nameIn) setTimeout(() => nameIn.focus(), 0);
    }
    const rec = GE_RECIPES.find((r) => r.id === ed.recipe);
    return h(
      "div",
      { class: "foot" + (this._view === "edit" ? "" : " hid") },
      panel,
      this._sendEl,
      h(
        "div",
        { class: "acts" },
        h("button", { class: "ibtn", title: "Zurück", "aria-label": "Zurück", disabled: !(this._undo || []).length, onclick: () => this._step(true) }, ic("mdi:undo")),
        h("button", { class: "btn roll", disabled: !rec, title: rec ? `Neu würfeln im Rezept „${rec.n}“` : "Erst oben ein Rezept wählen", onclick: () => this._roll() }, ic("mdi:dice-5-outline"), "Würfeln"),
        h("button", { class: "ibtn", title: "Vor", "aria-label": "Vor", disabled: !(this._redo || []).length, onclick: () => this._step(false) }, ic("mdi:redo")),
        h("button", { class: "btn ghost warn", disabled: !this._before, title: "Licht wie vor dem Lichtlabor, inklusive Effekt", onclick: () => this._lightBefore() }, ic("mdi:backup-restore"), "Licht wie vorher"),
        h("button", { class: "btn ghost" + (this._saveOpen ? " on" : ""), onclick: () => { this._saveOpen = !this._saveOpen; this._saveMode = null; this._render(); } }, ic("mdi:content-save-outline"), "Speichern…")
      )
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
          { class: "dialog", role: "dialog", "aria-modal": "true" },
          h("div", { class: "dtext" }, text),
          h("div", { class: "dbtns" }, h("button", { class: "btn ghost", onclick: () => done(false) }, "Abbrechen"), h("button", { class: "btn" + (danger ? " danger" : ""), onclick: () => done(true) }, okLabel || "OK"))
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
    const hs = this._hass;
    const re = new RegExp("^" + c.scene_prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)_");
    const list = [];
    Object.keys(hs.states).forEach((eid) => {
      const m = re.exec(eid);
      if (!m) return;
      let name = (hs.states[eid].attributes && hs.states[eid].attributes.friendly_name) || eid;
      if (name.startsWith(c.scene_strip)) name = name.slice(c.scene_strip.length);
      list.push({ id: Number(m[1]), eid, name });
    });
    list.sort((a, b) => a.id - b.id);
    const active = hs.states[c.picker] ? hs.states[c.picker].state : "";
    for (const s of list) {
      const raw = c.preview_map && hs.states[c.preview_map + s.id] ? hs.states[c.preview_map + s.id].state : "";
      try {
        const p = raw && raw[0] === "{" ? JSON.parse(raw).p : null;
        s.p = Array.isArray(p) ? p.filter((x) => GE_HEX.test(x)) : [];
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
      b.addEventListener("click", () => hs.callService("scene", "turn_on", { entity_id: s.eid }));
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
  name: "Lichtlabor",
  description: "Szenen fürs Wohnzimmer: Kacheln, Rezepte, Lampen inkl. Festavia, Effekte (Deutsch)",
  preview: false,
});
window.customCards.push({
  type: "scene-grid-card",
  name: "Szenen-Kacheln",
  description: "Alle Z2M-Szenen einer Gruppe als Tasten, aktive Szene hervorgehoben (Deutsch)",
  preview: false,
});
console.info(`%c LICHTLABOR %c v${GE_VERSION} `, "color:white;background:#6a3dff;font-weight:700;padding:2px 6px;", "");
