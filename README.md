# Z2M Lichtlabor Gradient Card

Lovelace-Karten (Deutsch) für eine Zigbee2MQTT-Lampengruppe mit Gradient-Lampe (Hue Festavia) und Z2M-Gruppenszenen:

- `custom:gradient-editor-card` – **Lichtlabor 2.0**: Szenen als Farbkacheln (antippen = einschalten und bearbeiten),
  Rezepte (Gemütlich, Bunt, Nacht, Frei) mit Würfeln und Farbanzahl, Lampenkacheln inklusive Festavia, Effekte
  (Hue-Lampeneffekte und langsame Skript-Effekte), Speichern als neue Szene oder Überschreiben, „Licht wie vorher“.
  Verläufe und Zuordnungen schreibt die Karte beim Speichern selbst in `input_text`-Helfer.
- `custom:scene-grid-card` – alle Z2M-Szenen einer Gruppe als Tasten, aktive Szene hervorgehoben, optional mit Farbvorschau.

Persönliches Projekt, auf eine bestimmte Home-Assistant-Installation zugeschnitten (Helfer, Skripte und Entity-IDs
werden über die Kartenkonfiguration gesetzt; Details im Kopfkommentar der JS-Datei). Keine Unterstützung.

Installation: HACS → Benutzerdefinierte Repositories → dieses Repo als „Dashboard“ hinzufügen.
