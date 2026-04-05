# Hammerhead HQ 🦈

Een hilarische, gelikte iPhone-webapp speciaal voor **Jurriën "Hammerhead" Hamer**.

## Features

1. **🧠 Migraine tracker** — grote rode paniekknop, logt aanvallen, stats per maand/jaar, custom grafiek.
2. **🕺 Funk Emergency Button** — willekeurig funk-nummer + directe Spotify-link, met draaiende vinyl.
3. **📰 Leesvoer van de webmaster** — gecureerde artikelenlijst met push-meldingen (Web Notifications API).
4. **⚡ Ego Oplader** — lovende blurbs en fictieve juryrapporten voor als de twijfel toeslaat.

## Design

- iPhone-first, bottom tab bar, safe-area-aware, blur backdrop, haptic feedback (waar ondersteund).
- Dark mode met rood/paars/cyan accenten.
- Pure HTML/CSS/JS — geen build step, geen dependencies. Open `index.html` en je bent klaar.
- PWA manifest: voeg toe aan beginscherm op iPhone voor fullscreen-ervaring.

## Webmaster modus

Tik 5x snel op het logo bovenin, voer wachtwoord `hammerhead` in → je kunt nu artikelen toevoegen die automatisch een push-melding versturen (mits Jurriën notificaties heeft aangezet).

## Data

Alles wordt lokaal opgeslagen in `localStorage` — geen backend nodig.

## Hosting

Werkt op elke statische host: GitHub Pages, Netlify, Vercel, of open direct vanaf je iPhone via een lokale share.
