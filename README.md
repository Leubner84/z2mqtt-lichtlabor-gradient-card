# Z2M Lichtlabor Gradient Card

Lovelace-Karten (Deutsch) für Zigbee2MQTT-Gradient-Lampen (Hue Festavia, Flux, Lightstrip …) und Z2M-Gruppenszenen:

- `custom:gradient-editor-card` – Reiter **Stimmung** (Farbstimmung für eine ganze Lampengruppe würfeln, Szene laden/überschreiben),
  **Festavia-Verlauf** (Verlauf-Editor), **Verläufe** (gespeicherte Verläufe in `input_text`-Slots), **Szenen-Zuordnung**
  (was die Gradient-Lampe bei welcher Z2M-Szene tut).
- `custom:scene-grid-card` – alle Z2M-Szenen einer Gruppe als Tasten, aktive Szene hervorgehoben, optional mit Farbvorschau.

Persönliches Projekt, auf eine bestimmte Home-Assistant-Installation zugeschnitten (Helfer, Skripte und Entity-IDs
werden über die Kartenkonfiguration gesetzt; Details im Kopfkommentar der JS-Datei). Keine Unterstützung.

Installation: HACS → Benutzerdefinierte Repositories → dieses Repo als „Dashboard“ hinzufügen.
