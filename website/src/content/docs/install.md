---
title: Install
description: Install the extension from Firefox Add-ons, or manually on Chrome.
order: 1
section: Getting started
---

## Firefox (recommended)

WebPokerHud is published on Firefox Add-ons. One click installs it, and
Firefox keeps it updated automatically.

1. Open the WebPokerHud page on Firefox Add-ons and click **Add to Firefox**.
2. Approve the permission prompt — it lists `www.bovada.lv` (where the HUD
   runs) and `api.webpokerhud.com` (our analysis API, used only when you open
   the analysis panel).
3. Pin the extension: puzzle-piece icon in the toolbar → gear next to
   WebPokerHud → *Pin to Toolbar*.

Requires Firefox 128 or newer on desktop.

## Chrome (manual install)

The Chrome Web Store does not list tools that run on poker sites, so on Chrome
the extension is installed manually. It works exactly the same.

1. Download the latest Chrome release zip and unpack it to a folder you'll
   keep (Chrome loads the extension from this folder on every start).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the unpacked folder.
5. Pin the extension: puzzle-piece icon in the toolbar → pin.

Chrome shows a "developer mode extensions" notice on startup for manually
installed extensions; this is normal.

### Updating a manual install

Replace the folder contents with the new release and click the reload icon on
the extension's card in `chrome://extensions`. Your hand data is stored in the
browser profile, not the extension folder — updates never touch it.

## Requirements

- Firefox 128+ on desktop, or Chrome / a Chromium-based browser (Edge, Brave)
  with Manifest V3 support.
- No account needed. The free tier works entirely offline from our servers.
