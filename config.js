/*
 * Hammerhead HQ — Supabase configuratie
 * -------------------------------------
 * Vul hier de URL en anon (public) key van je Supabase project in.
 * Te vinden in Supabase dashboard → Project Settings → API.
 *
 * Als je deze leeg laat, valt de app automatisch terug op localStorage
 * (per-device opslag, geen sync tussen telefoons).
 */
window.HH_CONFIG = {
  SUPABASE_URL: "https://ryknakhvromgjpkmeccr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CWVHYWFXNwRQWnIfSgCBNg_0xDfHNbd",

  // Public profile URL (voor de "Open Instapaper" knop + scraper)
  INSTAPAPER_URL: "https://www.instapaper.com/p/brrrtttssss",

  // Persoonlijke RSS feed URL voor auto-sync.
  // Hoe te vinden: log in op instapaper.com op desktop → kies folder (Liked /
  // Unread / Archive of een eigen folder) → klik rechtsboven op je
  // emailadres → Downloads → RSS feed → kopieer de URL. Die ziet er zo uit:
  //   https://www.instapaper.com/starred/rss/123456/abcdefghijklmnop
  // Plak 'm hieronder en commit. Articles verschijnen dan automatisch.
  INSTAPAPER_RSS_URL: "",
};
