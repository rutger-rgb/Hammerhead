/* Hammerhead HQ — app logic */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ===================================================================
   SUPABASE SYNC LAYER
   -----------------------------------------------------------------
   localStorage blijft de synchrone lokale cache. Supabase is de
   source of truth: op startup pullen we remote data in de cache,
   en bij writes pushen we naar beide (local meteen, remote async).
   Als Supabase niet geconfigureerd is, werkt de app gewoon lokaal.
   =================================================================== */
const supa = (() => {
  const cfg = window.HH_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
  if (!window.supabase) return null;
  try {
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase init failed", e);
    return null;
  }
})();

const SYNC_ENABLED = !!supa;

/* Titles of the old curated articles that should no longer appear anywhere */
const DEPRECATED_ARTICLE_TITLES = [
  "BBC Reith Lectures 2025 — Moral Revolution",
  "Why Europe Needs Ukraine — The Atlantic",
  "Abolish the Tobacco Industry",
  "De Davos-moment — 'Taxes, taxes, taxes'",
  "Moral Ambition — de eerste voorpublicatie",
  "Poverty Isn't a Lack of Character, It's a Lack of Cash",
  "Post-Davos Weekend Interview — Bloomberg",
  "From Taxing the Rich to Moral Ambition — CNN",
  "Welkom in Hammerhead HQ",
];

/* Migration: clear seeded "greatest hits" articles from Supabase.
 * Version bumped so it re-runs for users who already have the flag set. */
async function migrateClearSeededArticles() {
  if (!supa) return;
  if (localStorage.getItem("hh_articles_migration_v4")) return;
  try {
    for (const title of DEPRECATED_ARTICLE_TITLES) {
      await supa.from("articles").delete().eq("title", title);
    }
    localStorage.setItem("hh_articles_migration_v4", "1");
    localStorage.setItem("hh_articles_migration_v3", "1");
    localStorage.setItem("hh_articles_seeded_v2", "1");
  } catch (e) {
    console.warn("migrate articles failed", e);
  }
}

async function pullAll() {
  if (!supa) return;
  try {
    const [mig, art, quo] = await Promise.all([
      supa.from("migraines").select("id, ts").order("ts", { ascending: false }),
      supa.from("articles").select("id, title, url, description, created_at").order("created_at", { ascending: false }),
      supa.from("quotes").select("id, text, source, created_at").order("created_at", { ascending: false }),
    ]);
    if (!mig.error && mig.data) {
      const timestamps = mig.data.map((r) => new Date(r.ts).getTime());
      localStorage.setItem(LOG_KEY, JSON.stringify(timestamps));
    }
    if (!art.error && art.data) {
      const arts = art.data.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        desc: r.description || "",
        ts: new Date(r.created_at).getTime(),
      }));
      localStorage.setItem(ART_KEY, JSON.stringify(arts));
    }
    if (!quo.error && quo.data) {
      const quotes = quo.data.map((r) => ({ text: r.text, source: r.source }));
      localStorage.setItem(CUSTOM_QUOTES_KEY, JSON.stringify(quotes));
    }
  } catch (e) {
    console.warn("Supabase pull failed, using local cache", e);
  }
}

async function pushMigraine(ts) {
  if (!supa) return;
  try {
    await supa.from("migraines").insert({ ts: new Date(ts).toISOString() });
  } catch (e) { console.warn("push migraine failed", e); }
}
async function pushDeleteAllMigraines() {
  if (!supa) return;
  try {
    await supa.from("migraines").delete().not("id", "is", null);
  } catch (e) { console.warn("delete migraines failed", e); }
}
async function pushArticle(a) {
  if (!supa) return;
  try {
    await supa.from("articles").insert({
      title: a.title,
      url: a.url,
      description: a.desc || null,
    });
  } catch (e) { console.warn("push article failed", e); }
}
async function pushQuote(q) {
  if (!supa) return;
  try {
    await supa.from("quotes").insert({ text: q.text, source: q.source });
  } catch (e) { console.warn("push quote failed", e); }
}

/* ---------- Tab navigation + mood ---------- */
const MOODS = {
  "view-migraine": "mood-migraine",
  "view-funk": "mood-funk",
  "view-articles": "mood-articles",
  "view-ego": "mood-ego",
};
function setMood(viewId) {
  Object.values(MOODS).forEach((m) => document.body.classList.remove(m));
  if (MOODS[viewId]) document.body.classList.add(MOODS[viewId]);
}
// Split hero headings into chars for letter-by-letter reveal
function splitHeroText(h1) {
  if (h1.dataset.split) return;
  const text = h1.textContent;
  h1.textContent = "";
  [...text].forEach((c, i) => {
    const span = document.createElement("span");
    span.className = "ch" + (c === " " ? " space" : "");
    span.textContent = c;
    span.style.animationDelay = (i * 0.035) + "s";
    h1.appendChild(span);
  });
  h1.dataset.split = "1";
}
document.querySelectorAll(".hero h1").forEach(splitHeroText);

function replayHeroReveal(viewId) {
  const h1 = document.querySelector(`#${viewId} .hero h1`);
  if (!h1) return;
  h1.querySelectorAll(".ch").forEach((ch) => {
    ch.style.animation = "none";
    // eslint-disable-next-line no-unused-expressions
    ch.offsetHeight; // reflow
    ch.style.animation = "";
  });
}

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === view));
    setMood(view);
    replayHeroReveal(view);
    if (navigator.vibrate) navigator.vibrate(6);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
// Wire up Instapaper link from config
const instapaperUrl = (window.HH_CONFIG && window.HH_CONFIG.INSTAPAPER_URL) || "";
const instapaperEl = document.getElementById("instapaperCard");
if (instapaperEl && instapaperUrl) {
  instapaperEl.href = instapaperUrl;
}

/* ===================================================================
   INSTAPAPER AUTO-SYNC via public profile scrape
   -----------------------------------------------------------------
   Fetches the user's Instapaper public profile page through a CORS
   proxy, parses the HTML for article entries, and renders them in
   the Leesvoer tab. Cached 10 minutes in localStorage. No RSS token
   needed — just the public profile URL in config.js.
   =================================================================== */
const INSTAPAPER_CACHE_KEY = "hh_instapaper_cache_v5";
const INSTAPAPER_TTL = 10 * 60 * 1000; // 10 minutes

function loadInstapaperCache() {
  try {
    const raw = localStorage.getItem(INSTAPAPER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || !parsed.items) return null;
    return parsed;
  } catch (e) { return null; }
}

function stripHtml(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.innerHTML = s;
  return (div.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240);
}

async function fetchViaProxies(targetUrl) {
  const proxies = [
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(targetUrl), { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 500) return text;
    } catch (e) { /* try next */ }
  }
  return null;
}

function parseInstapaperProfile(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  const seen = new Set();

  // Strategy 1: Look for known Instapaper article container classes
  const selectors = [
    "article.item",
    ".article_item",
    "article.article",
    ".article.profile_article",
    "li.article",
    "div.article",
    "article",
  ];

  let containers = [];
  for (const sel of selectors) {
    const found = doc.querySelectorAll(sel);
    if (found.length > 0) {
      containers = found;
      break;
    }
  }

  containers.forEach((el) => {
    // Find the first outbound link inside this container
    const links = el.querySelectorAll("a[href]");
    let outbound = null;
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.includes("instapaper.com") && !href.startsWith("/")) {
        outbound = a;
        break;
      }
    }
    if (!outbound) return;
    const url = outbound.href;
    if (seen.has(url)) return;
    seen.add(url);

    // Title: either the link text, or a heading inside the container
    let title = (outbound.textContent || "").trim();
    const heading = el.querySelector("h1, h2, h3, .title");
    if (heading && heading.textContent.trim().length > title.length) {
      title = heading.textContent.trim();
    }
    title = title.replace(/\s+/g, " ").slice(0, 200);

    // Description: first <p> or .description/.summary
    const descEl = el.querySelector(".description, .summary, .excerpt, p");
    const desc = descEl ? stripHtml(descEl.innerHTML) : "";

    if (title.length >= 4) {
      items.push({
        id: "ip-" + url,
        title,
        url,
        desc,
        ts: Date.now() - items.length * 1000, // preserve order
        source: "instapaper",
      });
    }
  });

  // Strategy 2: fallback — scan all outbound links
  if (items.length === 0) {
    const allLinks = doc.querySelectorAll("a[href]");
    allLinks.forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (href.includes("instapaper.com")) return;
      if (href.startsWith("/")) return;
      if (!/^https?:\/\//.test(href)) return;
      const url = a.href;
      if (seen.has(url)) return;
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (title.length < 15) return; // Skip nav links
      seen.add(url);
      items.push({
        id: "ip-" + url,
        title: title.slice(0, 200),
        url,
        desc: "",
        ts: Date.now() - items.length * 1000,
        source: "instapaper",
      });
    });
  }

  return items;
}

async function fetchInstapaperFeed() {
  const profileUrl = window.HH_CONFIG && window.HH_CONFIG.INSTAPAPER_URL;
  if (!profileUrl) return null;

  const cached = loadInstapaperCache();
  const now = Date.now();
  if (cached && now - cached.ts < INSTAPAPER_TTL) return cached.items;

  try {
    const html = await fetchViaProxies(profileUrl);
    if (!html) throw new Error("all proxies failed");
    const items = parseInstapaperProfile(html);
    if (items.length === 0) throw new Error("no articles parsed");
    localStorage.setItem(INSTAPAPER_CACHE_KEY, JSON.stringify({ ts: now, items }));
    return items;
  } catch (e) {
    console.warn("Instapaper scrape failed", e);
    if (cached) return cached.items;
    return null;
  }
}

// Handle manifest shortcut params (?shortcut=log/funk/ego/articles)
const SHORTCUT_MAP = {
  log: "view-migraine",
  funk: "view-funk",
  ego: "view-ego",
  articles: "view-articles",
};
const urlParams = new URLSearchParams(window.location.search);
const shortcut = urlParams.get("shortcut");
const startView = SHORTCUT_MAP[shortcut] || "view-migraine";

// Default mood on load
setMood(startView);
if (startView !== "view-migraine") {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === startView));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === startView));
}
// Auto-trigger funk if shortcut=funk
if (shortcut === "funk") {
  setTimeout(() => $("#funkBtn")?.click(), 800);
}

/* PWA install prompt (Chrome Android) — capture event so we can
 * trigger it later from a custom button if desired */
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show a discreet install hint in the island pill after splash
  setTimeout(() => {
    if (typeof island === "function") island("📱 Tik hieronder op 'Installeer'", 4000);
  }, 6500);
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (typeof toast === "function") toast("Geïnstalleerd op beginscherm 🗿");
});

// Logo intro animation — only first load per session
if (!sessionStorage.getItem("hh_logo_played")) {
  window.addEventListener("DOMContentLoaded", () => {
    const logo = document.querySelector(".logo");
    if (logo) {
      logo.classList.add("intro");
      sessionStorage.setItem("hh_logo_played", "1");
      setTimeout(() => logo.classList.remove("intro"), 1500);
    }
  });
}

/* Subtle 3D tilt on panic button — uses device orientation on Android
 * (no permission needed) and mouse movement on desktop. iOS is skipped
 * because its permission dialog is too invasive for a cosmetic effect. */
function handleTilt(e) {
  const beta = e.beta || 0;
  const gamma = e.gamma || 0;
  const dx = Math.max(-20, Math.min(20, gamma));
  const dy = Math.max(-20, Math.min(20, beta - 20)); // ~20° resting tilt
  const root = document.documentElement;
  root.style.setProperty("--tilt-y", (dx * 0.5) + "deg");
  root.style.setProperty("--tilt-x", (-dy * 0.4) + "deg");
  root.style.setProperty("--light-x", (32 + dx * 0.6) + "%");
  root.style.setProperty("--light-y", (28 + dy * 0.6) + "%");
  root.style.setProperty("--spec-x", (35 + dx * 1.2) + "%");
  root.style.setProperty("--spec-y", (25 + dy * 1.2) + "%");
}
// Android / non-iOS: attach listener directly (no permission needed)
if (typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission !== "function") {
  window.addEventListener("deviceorientation", handleTilt, { passive: true });
}
// Desktop: mouse move simulates tilt
if (!("ontouchstart" in window)) {
  window.addEventListener("mousemove", (e) => {
    const dx = (e.clientX / window.innerWidth - 0.5) * 30;
    const dy = (e.clientY / window.innerHeight - 0.5) * 20;
    const root = document.documentElement;
    root.style.setProperty("--tilt-y", dx + "deg");
    root.style.setProperty("--tilt-x", (-dy) + "deg");
    root.style.setProperty("--light-x", (32 + dx) + "%");
    root.style.setProperty("--light-y", (28 + dy) + "%");
    root.style.setProperty("--spec-x", (35 + dx * 1.2) + "%");
    root.style.setProperty("--spec-y", (25 + dy * 1.2) + "%");
  });
}
const HAPTICS = {
  tabSwitch: [5],
  logAttack: [40, 60, 40, 60, 80],
  undo: [20, 30, 20],
  quoteRefresh: [3],
  swipeDelete: [10, 20, 60],
  easter: [20, 30, 20, 30, 20, 30, 100],
  achievement: [30, 50, 30, 50, 30, 50, 150],
};
function haptic(name) {
  if (navigator.vibrate && HAPTICS[name]) navigator.vibrate(HAPTICS[name]);
}

/* ===================================================================
   SPLASH SCREEN — first load per session
   =================================================================== */
function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.style.transition = "opacity .4s";
  splash.style.opacity = "0";
  splash.style.pointerEvents = "none";
  setTimeout(() => splash.remove(), 400);
}
window.dismissSplash = dismissSplash;

const SPLASH_SUBTAGLINES = [
  "De officiële Jurriën Hamer companion app",
  "Nietzsche zou het leuk vinden",
  "Filosofie voor een bloedserieuze tijd",
  "Hammer time. Letterlijk.",
  "Voor als de gedachten te zwaar worden",
  "Gebeukt door inzicht sinds 2021",
  "Denken is slaan. En omgekeerd.",
  "Speciaal voor Hammerhead · met liefde",
];

function showSplash() {
  if (sessionStorage.getItem("hh_splash_seen")) return;
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.hidden = false;
  sessionStorage.setItem("hh_splash_seen", "1");

  // Pick a random sub-tagline each session
  const sub = document.getElementById("splashSubTagline");
  if (sub) {
    sub.textContent = SPLASH_SUBTAGLINES[Math.floor(Math.random() * SPLASH_SUBTAGLINES.length)];
  }

  // Thunk sound + haptic at exact impact moment (3.2s)
  setTimeout(() => {
    try { thunk(); } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([60, 40, 20]);
  }, 3200);

  // Remove splash at end of 8s animation
  setTimeout(() => {
    if (document.getElementById("splash")) splash.remove();
  }, 8100);
}
showSplash();

// Document-level delegation for splash skip (survives any timing issue)
document.addEventListener("click", (e) => {
  if (e.target.closest("#splashSkip")) {
    e.preventDefault();
    e.stopImmediatePropagation();
    dismissSplash();
  }
}, true);

/* ===================================================================
   ONBOARDING — first visit ever
   =================================================================== */
let onboardSlide = 0;
function onboardGo(n) {
  const ob = document.getElementById("onboarding");
  if (!ob) return;
  const slides = ob.querySelectorAll(".onboard-slide");
  const dots = ob.querySelectorAll(".onboard-dot");
  const nextBtn = document.getElementById("onboardNext");
  if (n < 0) n = 0;
  if (n > slides.length - 1) n = slides.length - 1;
  onboardSlide = n;
  slides.forEach((s, i) => s.classList.toggle("active", i === n));
  dots.forEach((d, i) => d.classList.toggle("active", i === n));
  if (nextBtn) nextBtn.textContent = n === slides.length - 1 ? "Aan de slag" : "Volgende";
  try { haptic("tabSwitch"); } catch (e) {}
}
function onboardNext() {
  const ob = document.getElementById("onboarding");
  if (!ob) return;
  const slides = ob.querySelectorAll(".onboard-slide");
  if (onboardSlide < slides.length - 1) onboardGo(onboardSlide + 1);
  else onboardFinish();
}
function onboardFinish() {
  const ob = document.getElementById("onboarding");
  if (!ob) return;
  localStorage.setItem("hh_onboarded", "1");
  ob.style.opacity = "0";
  ob.style.transition = "opacity .4s";
  setTimeout(() => ob.remove(), 450);
  try { haptic("achievement"); } catch (e) {}
}
// Expose globally so inline onclick can find them
window.onboardNext = onboardNext;
window.onboardFinish = onboardFinish;

// Event delegation: catch clicks ANYWHERE and route them
document.addEventListener("click", (e) => {
  const next = e.target.closest("#onboardNext");
  const skip = e.target.closest("#onboardSkip");
  if (next) {
    e.preventDefault();
    e.stopImmediatePropagation();
    onboardNext();
  } else if (skip) {
    e.preventDefault();
    e.stopImmediatePropagation();
    onboardFinish();
  }
}, true); // capture phase to beat any other handler

function showOnboarding() {
  if (localStorage.getItem("hh_onboarded")) return;
  const ob = document.getElementById("onboarding");
  if (!ob) return;
  setTimeout(() => {
    ob.hidden = false;
    onboardGo(0);
  }, 300);
}
showOnboarding();

/* ===================================================================
   FAUX DYNAMIC ISLAND STATUS PILL
   =================================================================== */
let islandTimer;
function island(text, duration = 3500) {
  const pill = $("#islandPill");
  if (!pill) return;
  $("#islandText").textContent = text;
  pill.hidden = false;
  requestAnimationFrame(() => pill.classList.add("show"));
  clearTimeout(islandTimer);
  islandTimer = setTimeout(() => {
    pill.classList.remove("show");
    setTimeout(() => (pill.hidden = true), 600);
  }, duration);
}

/* ===================================================================
   EASTER EGGS
   =================================================================== */
// 10x tap on the bust → secret Nietzsche quote
let bustTaps = 0;
let bustTimer;
document.addEventListener("click", (e) => {
  if (!e.target.closest("#logoBtn")) return;
  bustTaps++;
  clearTimeout(bustTimer);
  bustTimer = setTimeout(() => (bustTaps = 0), 3000);
  if (bustTaps === 10) {
    bustTaps = 0;
    haptic("easter");
    toast('"Hij die met monsters strijdt, moet ervoor zorgen dat hij daarbij niet zelf een monster wordt." — Friedrich Nietzsche', { duration: 6500 });
  }
});

// Time-of-day greeting in the brand-sub (runs after sync)
function applyTimeGreeting() {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0 = Sunday
  let greet = null;
  if (day === 0 && hour >= 18) greet = "Maandagmorgen komt eraan";
  else if (day === 5 && hour >= 15) greet = "Vrijdagmiddag. Je weet wel wat te doen.";
  else if (hour < 6) greet = "Kan je niet slapen, Hammerhead?";
  else if (hour < 12) greet = "Goedemorgen, Hammerhead";
  else if (hour < 18) greet = "Goedemiddag, Hammerhead";
  else greet = "Goedenavond, Hammerhead";
  if (greet) {
    const sub = $("#brand-sub");
    if (sub && SYNC_ENABLED) sub.textContent = greet + " · ☁️";
    else if (sub) sub.textContent = greet;
  }
}

// 100th log achievement
function checkAchievements(logCount) {
  const milestones = [1, 10, 50, 100, 250, 500];
  const reached = localStorage.getItem("hh_achievements") || "";
  const reachedSet = new Set(reached.split(",").filter(Boolean).map(Number));
  milestones.forEach((m) => {
    if (logCount >= m && !reachedSet.has(m)) {
      reachedSet.add(m);
      setTimeout(() => {
        haptic("achievement");
        const msg = m === 1 ? "Eerste aanval gelogd" :
                    m === 100 ? "100 aanvallen — een eeuw!" :
                    `${m} aanvallen gelogd`;
        island("🏆 " + msg, 5000);
      }, 800);
    }
  });
  localStorage.setItem("hh_achievements", Array.from(reachedSet).join(","));
}

/* ---------- Toast ---------- */
const toastEl = $("#toast");
let toastTimer;
function toast(msg, opts = {}) {
  toastEl.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = msg;
  toastEl.appendChild(text);
  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      opts.onAction();
      toastEl.classList.remove("show");
    });
    toastEl.appendChild(btn);
  }
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), opts.duration || 2200);
}

/* ---------- Audio: subtle "thunk" sound via Web Audio API ---------- */
let audioCtx = null;
function thunk() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch (e) {}
}

/* ===================================================================
   1. MIGRAINE TRACKER
   =================================================================== */
const LOG_KEY = "hh_migraine_logs_v1";
const loadLogs = () => JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
const saveLogs = (logs) => localStorage.setItem(LOG_KEY, JSON.stringify(logs));

const panicBtn = $("#panicBtn");
panicBtn.addEventListener("click", () => {
  const logs = loadLogs();
  const now = Date.now();
  logs.push(now);
  saveLogs(logs);
  thunk();
  haptic("logAttack");
  checkAchievements(logs.length);
  panicBtn.animate(
    [{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }],
    { duration: 400, easing: "ease-out" }
  );
  renderMigraine();
  pushMigraine(now);
  toast("Aanval gelogd. Sterkte Hammerhead 🗿", {
    actionLabel: "Ongedaan",
    duration: 5000,
    onAction: () => {
      const cur = loadLogs();
      const idx = cur.lastIndexOf(now);
      if (idx >= 0) cur.splice(idx, 1);
      saveLogs(cur);
      renderMigraine();
      if (supa) {
        supa.from("migraines").delete().eq("ts", new Date(now).toISOString()).then(() => {});
      }
      toast("Ongedaan gemaakt");
    },
  });
});

/* Handmatig loggen op eerder tijdstip */
const manualInput = $("#manualTime");
// Prefill with current time (rounded down to nearest minute)
function prefillManualTime() {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  manualInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
prefillManualTime();

$("#manualLogBtn").addEventListener("click", () => {
  const val = manualInput.value;
  if (!val) return toast("Kies een tijdstip");
  const ts = new Date(val).getTime();
  if (isNaN(ts)) return toast("Ongeldig tijdstip");
  if (ts > Date.now() + 60000) return toast("Niet in de toekomst loggen 🙃");
  const logs = loadLogs();
  logs.push(ts);
  saveLogs(logs);
  renderMigraine();
  prefillManualTime();
  if (navigator.vibrate) navigator.vibrate(20);
  toast("Aanval gelogd voor " + new Date(ts).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  pushMigraine(ts);
});

/* Migraine modus — dim alles behalve de rode knop */
function setMigraineMode(on) {
  document.body.classList.toggle("migraine-mode", on);
  if (on) {
    // Make sure we're on the migraine tab
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "view-migraine"));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-migraine"));
  }
}
$("#migraineMode").addEventListener("click", () => {
  setMigraineMode(true);
  if (navigator.vibrate) navigator.vibrate(20);
  toast("Migraine modus — tik op ✕ om terug te keren");
});
$("#exitMigraineMode").addEventListener("click", () => {
  setMigraineMode(false);
  if (navigator.vibrate) navigator.vibrate(10);
});

$("#clearLogs").addEventListener("click", () => {
  if (!confirm("Alle migraine-logs wissen? Dit kan niet ongedaan worden gemaakt.")) return;
  saveLogs([]);
  renderMigraine();
  toast("Logs gewist.");
  pushDeleteAllMigraines();
});

/* Sparkline helpers */
function bucketByDay(logs, days) {
  const now = new Date();
  const out = new Array(days).fill(0);
  logs.forEach((t) => {
    const diff = Math.floor((Date.now() - t) / 86400000);
    if (diff >= 0 && diff < days) out[days - 1 - diff]++;
  });
  return out;
}
function bucketByMonth(logs, months) {
  const now = new Date();
  const out = new Array(months).fill(0);
  logs.forEach((t) => {
    const d = new Date(t);
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < months) out[months - 1 - monthsAgo]++;
  });
  return out;
}
function cumulative(logs, points) {
  if (!logs.length) return new Array(points).fill(0);
  const sorted = [...logs].sort((a, b) => a - b);
  const first = sorted[0];
  const last = Date.now();
  const span = Math.max(last - first, 1);
  const step = span / points;
  const out = [];
  for (let i = 1; i <= points; i++) {
    const cutoff = first + step * i;
    out.push(sorted.filter((t) => t <= cutoff).length);
  }
  return out;
}
function drawSparkline(canvas, data) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 80;
  const h = 22;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(1, ...data);
  const stepX = w / Math.max(1, data.length - 1);

  // Read current accent color from CSS var
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#ff2d55";

  // Area fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, accent + "66");
  grad.addColorStop(1, accent + "00");

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = h - 2 - (v / max) * (h - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line on top
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = h - 2 - (v / max) * (h - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/* Odometer-style number animation */
function animateNumber(el, target) {
  const start = parseInt(el.dataset.val || "0", 10);
  if (start === target) { el.textContent = target; return; }
  const duration = 700;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(start + (target - start) * eased);
    el.textContent = val;
    if (p < 1) requestAnimationFrame(step);
    else el.dataset.val = target;
  };
  requestAnimationFrame(step);
}

/* Swipe-to-delete voor migraine-log items */
const SWIPE_THRESHOLD = 80;
let activeSwipe = null; // currently open swipe row

function closeActiveSwipe() {
  if (activeSwipe) {
    const c = activeSwipe.querySelector(".swipe-content");
    if (c) c.style.transform = "translateX(0)";
    activeSwipe = null;
  }
}

function deleteLogEntry(ts) {
  const cur = loadLogs();
  const idx = cur.lastIndexOf(ts);
  if (idx >= 0) cur.splice(idx, 1);
  saveLogs(cur);
  renderMigraine();
  if (supa) {
    supa.from("migraines").delete().eq("ts", new Date(ts).toISOString()).then(() => {});
  }
  if (navigator.vibrate) navigator.vibrate(15);
  toast("Aanval verwijderd", {
    actionLabel: "Terug",
    duration: 4000,
    onAction: () => {
      const c = loadLogs();
      c.push(ts);
      saveLogs(c);
      renderMigraine();
      if (supa) pushMigraine(ts);
    },
  });
}

function attachSwipe(row) {
  const content = row.querySelector(".swipe-content");
  const delBtn = row.querySelector(".swipe-delete");
  let startX = 0, startY = 0, dragging = false, moved = false, axis = null;
  const baseOpen = -SWIPE_THRESHOLD;

  const onStart = (e) => {
    if (activeSwipe && activeSwipe !== row) closeActiveSwipe();
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    dragging = true;
    moved = false;
    axis = null;
    content.style.transition = "none";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const touch = e.touches ? e.touches[0] : e;
    const dxRaw = touch.clientX - startX;
    const dyRaw = touch.clientY - startY;

    // Lock direction on first meaningful movement
    if (!axis) {
      if (Math.abs(dxRaw) < 6 && Math.abs(dyRaw) < 6) return;
      axis = Math.abs(dxRaw) > Math.abs(dyRaw) ? "x" : "y";
    }
    if (axis !== "x") return;

    // We're swiping horizontally — block the list from scrolling
    if (e.cancelable) e.preventDefault();

    const base = activeSwipe === row ? baseOpen : 0;
    let dx = Math.min(0, Math.max(-120, base + dxRaw));
    moved = true;
    content.style.transform = `translateX(${dx}px)`;
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    if (axis !== "x") { axis = null; return; }
    content.style.transition = "transform .2s ease";
    const m = content.style.transform.match(/-?\d+(\.\d+)?/);
    const dx = m ? parseFloat(m[0]) : 0;
    if (dx <= -SWIPE_THRESHOLD / 2) {
      content.style.transform = `translateX(${baseOpen}px)`;
      activeSwipe = row;
    } else {
      content.style.transform = "translateX(0)";
      if (activeSwipe === row) activeSwipe = null;
    }
    axis = null;
  };

  row.addEventListener("touchstart", onStart, { passive: true });
  row.addEventListener("touchmove", onMove, { passive: false });
  row.addEventListener("touchend", onEnd);
  row.addEventListener("touchcancel", onEnd);
  row.addEventListener("mousedown", onStart);
  row.addEventListener("mousemove", (e) => { if (dragging) onMove(e); });
  row.addEventListener("mouseup", onEnd);
  row.addEventListener("mouseleave", () => { if (dragging) onEnd(); });

  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const ts = parseInt(row.dataset.ts, 10);
    deleteLogEntry(ts);
  });

  // Tap content closes the row if it's open, otherwise do nothing
  content.addEventListener("click", (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); return; }
    if (activeSwipe === row) closeActiveSwipe();
  });
}

// Global: tap outside the list closes any open swipe
document.addEventListener("click", (e) => {
  if (activeSwipe && !e.target.closest(".swipe-row")) closeActiveSwipe();
});

function renderMigraine() {
  const logs = loadLogs().sort((a, b) => b - a);
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const monthCount = logs.filter((t) => {
    const d = new Date(t);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const yearCount = logs.filter((t) => new Date(t).getFullYear() === thisYear).length;

  animateNumber($("#statMonth"), monthCount);
  animateNumber($("#statYear"), yearCount);
  animateNumber($("#statTotal"), logs.length);

  // Sparklines: last 14 days, 12 months, all-time cumulative
  drawSparkline($("#sparkMonth"), bucketByDay(logs, 14));
  drawSparkline($("#sparkYear"), bucketByMonth(logs, 12));
  drawSparkline($("#sparkTotal"), cumulative(logs, 30));

  const last = logs[0];
  $("#lastLog").textContent = last
    ? "Laatste aanval: " + formatRelative(last)
    : "Nog geen aanvallen gelogd. Toi toi toi.";

  const list = $("#logList");
  list.innerHTML = "";
  if (!logs.length) {
    list.innerHTML = '<li class="empty"><span>Niks. Lekker rustig daar boven.</span></li>';
  } else {
    logs.slice(0, 20).forEach((t) => {
      const li = document.createElement("li");
      li.className = "swipe-row";
      li.dataset.ts = t;
      const d = new Date(t);
      const dateStr = d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
      const timeStr = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `
        <div class="swipe-content">
          <span>${dateStr}</span>
          <span class="when">${timeStr}</span>
        </div>
        <button class="swipe-delete" aria-label="Verwijder deze aanval">Wissen</button>
      `;
      attachSwipe(li);
      list.appendChild(li);
    });
  }

  renderHeatmap();
  renderActivityRing(logs);
  renderInsights(logs);
  updatePanicHeartbeat(logs);
}

/* Apple Fitness–style activity ring: pain-free days this month */
function renderActivityRing(logs) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysElapsed = Math.floor((now - firstOfMonth) / 86400000) + 1;
  // Days this month with at least one attack
  const attackDays = new Set();
  logs.forEach((t) => {
    const d = new Date(t);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      attackDays.add(d.getDate());
    }
  });
  const painFree = daysElapsed - attackDays.size;
  const pct = daysElapsed > 0 ? painFree / daysElapsed : 0;

  const ring = $("#ringFill");
  if (ring) {
    const circumference = 2 * Math.PI * 82; // r = 82
    const offset = circumference * (1 - Math.max(0, Math.min(1, pct)));
    // Force reflow for initial animation
    ring.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = offset;
    });
  }

  const ringNum = $("#ringNum");
  const ringSub = $("#ringSub");
  const ringCaption = $("#ringCaption");
  if (ringNum) animateNumber(ringNum, painFree);
  if (ringSub) ringSub.textContent = `van ${daysElapsed} ${daysElapsed === 1 ? "dag" : "dagen"}`;
  if (ringCaption) {
    const monthName = now.toLocaleDateString("nl-NL", { month: "long" });
    if (pct === 1 && daysElapsed > 1) {
      ringCaption.textContent = `Een perfecte ${monthName} tot nu toe ✨`;
    } else if (pct >= 0.9) {
      ringCaption.textContent = `Uitstekende ${monthName}`;
    } else if (pct >= 0.7) {
      ringCaption.textContent = `Pijnvrije dagen in ${monthName}`;
    } else if (pct >= 0.5) {
      ringCaption.textContent = `Een gemengde ${monthName}`;
    } else {
      ringCaption.textContent = `Zware ${monthName} — hou vol`;
    }
  }
}

/* Panic button pulses faster when there have been recent attacks */
function updatePanicHeartbeat(logs) {
  const now = Date.now();
  const DAY = 86400000;
  const recent = logs.filter((t) => now - t < 30 * DAY).length;
  // 0 aanvallen → rustige 5s, veel aanvallen → snellere 1.8s
  const duration = Math.max(1.8, 5 - recent * 0.25);
  document.documentElement.style.setProperty("--heartbeat-duration", duration + "s");
}

/* GitHub-style calendar heatmap for the last year */
function renderHeatmap() {
  const container = $("#heatmap");
  if (!container) return;
  container.innerHTML = "";
  const logs = loadLogs();
  const now = new Date();
  $("#heatmapYear").textContent = now.getFullYear();

  // Bucket logs per day
  const byDay = {};
  logs.forEach((t) => {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay[key] = (byDay[key] || 0) + 1;
  });

  // Show ~53 weeks ending this week. Start from Monday 52 weeks ago.
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 52 * 7 - end.getDay());

  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const day = new Date(start);
  const totalDays = 53 * 7;
  for (let i = 0; i < totalDays; i++) {
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const count = byDay[key] || 0;
    const isFuture = day > now;
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4;
    const cell = document.createElement("div");
    cell.className = `hm-cell hm-${level}`;
    if (isFuture) cell.classList.add("future");
    if (key === todayKey) cell.classList.add("today");
    cell.title = `${day.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} — ${count} aanval${count === 1 ? "" : "len"}`;
    container.appendChild(cell);
    day.setDate(day.getDate() + 1);
  }
}

function renderInsights(logs) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;

  // Current streak: days since last attack
  let currentStreak = "—";
  if (logs.length) {
    const last = Math.max(...logs);
    const lastDay = new Date(last);
    const lastDayStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate()).getTime();
    currentStreak = Math.floor((startOfToday - lastDayStart) / DAY);
  }

  // Longest streak ever: biggest gap between attacks (incl. current streak)
  let longest = 0;
  if (logs.length >= 2) {
    const sorted = [...logs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1]);
      const d2 = new Date(sorted[i]);
      const s1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
      const s2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
      const gap = Math.floor((s2 - s1) / DAY);
      if (gap > longest) longest = gap;
    }
  }
  if (typeof currentStreak === "number" && currentStreak > longest) longest = currentStreak;

  // Average per month this year
  const thisYear = now.getFullYear();
  const thisYearLogs = logs.filter((t) => new Date(t).getFullYear() === thisYear);
  const monthsElapsed = now.getMonth() + 1;
  const avgMonth = thisYearLogs.length ? (thisYearLogs.length / monthsElapsed).toFixed(1) : "0";

  // YoY trend
  const lastYear = thisYear - 1;
  const lastYearLogs = logs.filter((t) => new Date(t).getFullYear() === lastYear);
  let trend = "—";
  let trendClass = "";
  if (lastYearLogs.length > 0) {
    // Compare same months-elapsed window
    const lastYearSameWindow = lastYearLogs.filter((t) => {
      const d = new Date(t);
      return d.getMonth() < monthsElapsed || (d.getMonth() === now.getMonth() - 1 && d.getDate() <= now.getDate());
    }).length;
    if (lastYearSameWindow > 0) {
      const diff = Math.round(((thisYearLogs.length - lastYearSameWindow) / lastYearSameWindow) * 100);
      trend = (diff >= 0 ? "+" : "") + diff + "%";
      trendClass = diff <= 0 ? "good" : "bad";
    }
  }

  $("#streakCurrent").textContent = currentStreak;
  $("#streakCurrent").className = "insight-num" + (typeof currentStreak === "number" && currentStreak >= 7 ? " good" : "");
  $("#streakLongest").textContent = longest || "—";
  $("#avgMonth").textContent = avgMonth;
  $("#trendYoY").textContent = trend;
  $("#trendYoY").className = "insight-num " + trendClass;

  // Insight blurb
  const blurb = $("#insightBlurb");
  blurb.className = "insight-blurb";
  blurb.textContent = "";
  if (typeof currentStreak === "number") {
    if (currentStreak >= 30) {
      blurb.textContent = `🎉 ${currentStreak} dagen pijnvrij — dit is een winstreak.`;
      blurb.classList.add("show");
    } else if (currentStreak >= 14) {
      blurb.textContent = `💪 ${currentStreak} dagen pijnvrij. De hamer ligt in de kast.`;
      blurb.classList.add("show");
    } else if (currentStreak === 0 && logs.length) {
      blurb.textContent = `Vandaag een aanval. Zorg goed voor jezelf — wij houden het bij.`;
      blurb.classList.add("show", "bad");
    } else if (trendClass === "good" && trend !== "—") {
      blurb.textContent = `📉 Je hebt ${Math.abs(parseInt(trend))}% minder aanvallen dan vorig jaar rond deze tijd.`;
      blurb.classList.add("show");
    }
  }
}

function formatRelative(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return mins + " min geleden";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + " uur geleden";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + " dagen geleden";
  return new Date(ts).toLocaleDateString("nl-NL");
}

/* Legacy bar chart — replaced by heatmap, kept dead for now */
function _renderChart_deprecated() {
  const canvas = $("#chart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = 180;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const logs = loadLogs();
  const now = new Date();

  let buckets = [];
  let labels = [];

  if (chartRange === "year") {
    const year = now.getFullYear();
    const monthNames = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    for (let i = 0; i < 12; i++) {
      buckets.push(0);
      labels.push(monthNames[i]);
    }
    logs.forEach((t) => {
      const d = new Date(t);
      if (d.getFullYear() === year) buckets[d.getMonth()]++;
    });
  } else {
    // last 12 months rolling
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push(0);
      labels.push(d.toLocaleDateString("nl-NL", { month: "short" })[0].toUpperCase());
    }
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime();
    logs.forEach((t) => {
      if (t < start) return;
      const d = new Date(t);
      const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 11;
      if (idx >= 0 && idx < 12) buckets[idx]++;
    });
  }

  const max = Math.max(4, ...buckets);
  const padL = 24, padR = 8, padT = 16, padB = 28;
  const w = cssW - padL - padR;
  const h = cssH - padT - padB;
  const barW = w / buckets.length;

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (h * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
  }

  // bars
  buckets.forEach((v, i) => {
    const barH = (v / max) * h;
    const x = padL + i * barW + barW * 0.15;
    const y = padT + h - barH;
    const bw = barW * 0.7;

    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, "#ff6b9d");
    grad.addColorStop(1, "#ff2d55");
    ctx.fillStyle = v > 0 ? grad : "rgba(255,255,255,0.05)";
    roundRect(ctx, x, y, bw, Math.max(barH, 2), 4);
    ctx.fill();

    ctx.fillStyle = "#8b8b96";
    ctx.font = "10px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x + bw / 2, cssH - 10);

    if (v > 0) {
      ctx.fillStyle = "#f5f5f7";
      ctx.font = "bold 10px -apple-system, system-ui, sans-serif";
      ctx.fillText(v, x + bw / 2, y - 4);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

window.addEventListener("resize", renderHeatmap);

/* ===================================================================
   2. FUNK TAB
   =================================================================== */
const FUNK_TRACKS = [
  { title: "Superstition", artist: "Stevie Wonder", id: "21mhCdZVZnjiTiI8GMXoj2" },
  { title: "Get Lucky", artist: "Daft Punk ft. Pharrell Williams", id: "69kOkLUCkxIZYexIgSG8rq" },
  { title: "September", artist: "Earth, Wind & Fire", id: "7Cuk8jsPPoNYQWXK9XRFvG" },
  { title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", id: "32OlwWuMpZ6b0aN2RZOeMS" },
  { title: "Give Up the Funk", artist: "Parliament", id: "70LrFtZtqUjVmhCySZllO9" },
  { title: "Good Times", artist: "CHIC", id: "0G3fbPbE1vGeABDEZF0jeG" },
  { title: "Le Freak", artist: "CHIC", id: "1I5EQtSoyraCQUbv2oC3Cl" },
  { title: "Brick House", artist: "Commodores", id: "5VJjhHyG8NZ5xdgG6uTb3P" },
  { title: "Play That Funky Music", artist: "Wild Cherry", id: "5uuJruktM9fMdN9Va0DUMl" },
  { title: "Kiss", artist: "Prince", id: "62LJFaYihsdVrrkgUOJC05" },
  { title: "I Want You Back", artist: "The Jackson 5", id: "5LxvwujISqiB8vpRYv887S" },
  { title: "Flash Light", artist: "Parliament", id: "1v1PV2wERHiMPesMWX0qmO" },
  { title: "Jungle Boogie", artist: "Kool & The Gang", id: "3K0SJUQNbOkUprTFcwwAKN" },
  { title: "Funkytown", artist: "Lipps Inc.", id: "0KQh7AuuZvpTKWhcJa8Pbr" },
  { title: "Super Freak", artist: "Rick James", id: "2dCmGcEOQrMQhMMS8Vj7Ca" },
];

const vinyl = $("#vinyl");
$("#funkBtn").addEventListener("click", () => {
  const track = FUNK_TRACKS[Math.floor(Math.random() * FUNK_TRACKS.length)];
  $("#trackTitle").textContent = track.title;
  $("#trackArtist").textContent = track.artist;
  const btn = $("#spotifyBtn");
  btn.href = "https://open.spotify.com/track/" + track.id;
  btn.setAttribute("aria-disabled", "false");
  vinyl.classList.add("playing");
  // Embed the Spotify player directly so playback happens in-app
  const embed = $("#spotifyEmbed");
  embed.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0" height="152" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  embed.classList.add("active");
  if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
  toast("🎶 " + track.title);
  // Fetch Spotify oEmbed for the thumbnail, then extract dominant colors
  fetchAlbumColors(track.id).catch(() => {});
});

/* Extract dominant colors from album art and bleed them across Funk tab */
async function fetchAlbumColors(trackId) {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.thumbnail_url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = data.thumbnail_url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement("canvas");
    const size = 48;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    // Sample dominant + secondary colors by binning hues
    const bins = {};
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = (max + min) / 2;
      if (lum < 30 || lum > 230) continue; // Skip near-black/white
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.15) continue; // Skip grey
      const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
      bins[key] = (bins[key] || { r: 0, g: 0, b: 0, n: 0 });
      bins[key].r += r; bins[key].g += g; bins[key].b += b; bins[key].n++;
    }
    const sorted = Object.values(bins).sort((a, b) => b.n - a.n).slice(0, 2);
    if (sorted.length < 1) return;
    const c1 = sorted[0];
    const c2 = sorted[1] || sorted[0];
    const col1 = `rgb(${Math.round(c1.r / c1.n)}, ${Math.round(c1.g / c1.n)}, ${Math.round(c1.b / c1.n)})`;
    const col2 = `rgb(${Math.round(c2.r / c2.n)}, ${Math.round(c2.g / c2.n)}, ${Math.round(c2.b / c2.n)})`;
    const root = document.documentElement;
    root.style.setProperty("--funk-bleed-1", col1);
    root.style.setProperty("--funk-bleed-2", col2);
    document.body.classList.add("funk-bleed-active");
  } catch (e) {
    console.warn("color extract failed", e);
  }
}

/* ===================================================================
   3. ARTIKELEN TAB
   =================================================================== */
const ART_KEY = "hh_articles_v1";
const SEEN_KEY = "hh_articles_seen_v1";

/*
 * Curated "Greatest Hits" van de webmaster (Rutger Bregman).
 * Volgorde = belangrijkheid (meest prestigieus bovenaan). Bij het seeden
 * in Supabase draaien we de lijst om zodat de belangrijkste het nieuwste
 * created_at krijgt en dus bovenaan in de lijst verschijnt.
 */
const DEFAULT_ARTICLES = [
  {
    id: "seed-reith",
    title: "BBC Reith Lectures 2025 — Moral Revolution",
    url: "https://www.bbc.co.uk/programmes/m002jzks",
    desc: "Vier lezingen in Londen, Liverpool, Edinburgh en Stanford over hoe kleine groepen gedreven mensen (abolitionisten, suffragettes) de wereld hebben veranderd. De BBC censureerde één zin over Trump — dat gaf alleen maar meer publiciteit.",
    ts: Date.now() - 1000,
  },
  {
    id: "seed-atlantic",
    title: "Why Europe Needs Ukraine — The Atlantic",
    url: "https://www.theatlantic.com/ideas/archive/2022/04/europe-needs-ukraine/629356/",
    desc: "Mijn debuut in The Atlantic, geschreven na gesprekken met jonge Oekraïners in Kiev in oktober 2021. Een pleidooi voor EU-lidmaatschap. Kwam net op tijd uit.",
    ts: Date.now() - 2000,
  },
  {
    id: "seed-tobacco",
    title: "Abolish the Tobacco Industry",
    url: "https://www.moralambition.org/stories/abolish-the-tobacco-industry",
    desc: "Het 'deadliest artifact in human history' — nog steeds acht miljoen doden per jaar. Niemand zou anderen op industriële schaal mogen verslaven en vergiftigen. Origineel op The Correspondent.",
    ts: Date.now() - 3000,
  },
  {
    id: "seed-davos",
    title: "De Davos-moment — 'Taxes, taxes, taxes'",
    url: "https://www.washingtonpost.com/business/2019/01/31/an-angry-historian-ripped-ultra-rich-over-tax-avoidance-davos-then-one-was-given-mic/",
    desc: "Ik ging naar Davos en vertelde een zaal miljardairs dat ze belasting moeten betalen. 'It feels like I'm at a firefighters conference and no one's allowed to speak about water.' Het filmpje ging viral. Het veranderde… niet zoveel. Maar het voelde goed.",
    ts: Date.now() - 4000,
  },
  {
    id: "seed-moral",
    title: "Moral Ambition — de eerste voorpublicatie",
    url: "https://www.theguardian.com/books/2025/apr/23/moral-ambition-by-rutger-bregman-review-why-you-quit-your-job-to-make-the-world-a-better-place",
    desc: "'No, you're not fine just the way you are.' Van alle dingen die we in deze wegwerp-wereld verspillen, is verspild talent het grootste verlies. The Guardian recenseert het boek.",
    ts: Date.now() - 5000,
  },
  {
    id: "seed-ted",
    title: "Poverty Isn't a Lack of Character, It's a Lack of Cash",
    url: "https://www.ted.com/talks/rutger_bregman_poverty_isn_t_a_lack_of_character_it_s_a_lack_of_cash",
    desc: "De TED talk die Chris Anderson tot top 10 van 2017 koos. Basisinkomen is geen luxe maar een mensenrecht. De data is glashelder.",
    ts: Date.now() - 6000,
  },
  {
    id: "seed-bloomberg",
    title: "Post-Davos Weekend Interview — Bloomberg",
    url: "https://www.bloomberg.com/features/2026-rutger-bregman-weekend-interview/",
    desc: "Na Davos, na de viral moment, na 'Humankind', na 'Moral Ambition' — waar staan we nu? En wat moeten we écht doen?",
    ts: Date.now() - 7000,
  },
  {
    id: "seed-cnn",
    title: "From Taxing the Rich to Moral Ambition — CNN",
    url: "https://www.cnn.com/2025/06/14/us/rutger-bregman-moral-ambition-cec",
    desc: "Profiel over de evolutie van 'belast de miljardairs' naar 'ga zelf iets doen dat ertoe doet'. Met de School for Moral Ambition als concrete stap.",
    ts: Date.now() - 8000,
  },
];

function loadArticles() {
  const raw = localStorage.getItem(ART_KEY);
  if (!raw) {
    localStorage.setItem(ART_KEY, JSON.stringify(DEFAULT_ARTICLES));
    return DEFAULT_ARTICLES;
  }
  return JSON.parse(raw);
}
const saveArticles = (arr) => localStorage.setItem(ART_KEY, JSON.stringify(arr));
const loadSeen = () => JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
const saveSeen = (arr) => localStorage.setItem(SEEN_KEY, JSON.stringify(arr));

function updateAppBadge() {
  try {
    if (!("setAppBadge" in navigator)) return;
    // Use merged+filtered list so deprecated seed articles don't get counted
    const arts = getMergedArticles();
    const seen = new Set(loadSeen());
    const unread = arts.filter((a) => !seen.has(a.id)).length;
    if (unread > 0) navigator.setAppBadge(unread);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch (e) {}
}

function getMergedArticles() {
  const own = loadArticles().filter((a) => !DEPRECATED_ARTICLE_TITLES.includes(a.title));
  const ipCached = loadInstapaperCache();
  const ip = ipCached && ipCached.items ? ipCached.items : [];
  // Dedupe by URL
  const seen = new Set();
  const merged = [];
  [...own, ...ip].forEach((a) => {
    const key = a.url || a.id;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(a);
  });
  return merged.sort((a, b) => b.ts - a.ts);
}

function renderArticles() {
  const arts = getMergedArticles();
  const seen = loadSeen();
  const list = $("#articleList");
  list.innerHTML = "";
  updateAppBadge();
  arts.forEach((a) => {
    const li = document.createElement("li");
    const isNew = !seen.includes(a.id);
    const sourceBadge = a.source === "instapaper" ? '<span class="source-badge">📖 Instapaper</span>' : "";
    li.innerHTML = `
      <a href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.title)}${isNew ? '<span class="new-badge">NIEUW</span>' : ""}</a>
      <div class="desc">${escapeHtml(a.desc || "")}</div>
      <div class="meta">${new Date(a.ts).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}${sourceBadge}</div>
    `;
    list.appendChild(li);
  });
  // mark all seen after render
  setTimeout(() => { saveSeen(arts.map((a) => a.id)); updateAppBadge(); }, 1500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Notifications — clean iOS-style toggle.
 * Browsers can't revoke OS permission from JS once granted, so we track an
 * app-level mute flag in localStorage and the toggle switches that. */
const NOTIF_MUTED_KEY = "hh_notifications_muted";
const notifBtn = $("#enableNotif");
const notifCard = $("#notifCard");
const notifSub = $("#notifSub");
const isNotifMuted = () => localStorage.getItem(NOTIF_MUTED_KEY) === "1";
const setNotifMuted = (v) => v ? localStorage.setItem(NOTIF_MUTED_KEY, "1") : localStorage.removeItem(NOTIF_MUTED_KEY);
const isNotifOn = () => ("Notification" in window) && Notification.permission === "granted" && !isNotifMuted();

function updateNotifUi() {
  if (!("Notification" in window)) {
    notifBtn.disabled = true;
    notifBtn.setAttribute("aria-checked", "false");
    if (notifSub) notifSub.textContent = "Niet ondersteund op dit apparaat";
    return;
  }
  if (Notification.permission === "denied") {
    notifBtn.disabled = true;
    notifBtn.setAttribute("aria-checked", "false");
    if (notifSub) notifSub.textContent = "Geblokkeerd — zet aan in browser-instellingen";
    return;
  }
  const on = isNotifOn();
  notifBtn.setAttribute("aria-checked", on ? "true" : "false");
  notifCard.classList.toggle("enabled", on);
  if (notifSub) notifSub.textContent = on
    ? "Aan — je krijgt een melding bij nieuwe artikelen"
    : "Krijg een tik wanneer de webmaster iets nieuws deelt.";
}

notifBtn.addEventListener("click", async () => {
  if (!("Notification" in window) || notifBtn.disabled) return;
  if (Notification.permission === "default") {
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setNotifMuted(false);
      try { new Notification("Hammerhead HQ", { body: "Meldingen staan aan 🗿", icon: "icon.svg" }); } catch (e) {}
    }
  } else if (Notification.permission === "granted") {
    setNotifMuted(!isNotifMuted());
  }
  haptic("tabSwitch");
  updateNotifUi();
});
updateNotifUi();

/* Logo = hard refresh button */
$("#logoBtn").addEventListener("click", async () => {
  const logo = $("#logoBtn");
  logo.classList.add("spinning");
  if (navigator.vibrate) navigator.vibrate(15);
  toast("Hard refresh 🦈");
  // Clear caches if any service worker has cached stuff
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {}
  // Force reload bypassing cache via query param
  setTimeout(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("_t", Date.now());
    window.location.replace(url.toString());
  }, 350);
});

/* Admin mode — tap brand title 5x to open */
let brandTaps = 0, brandTimer;
$(".brand-text").addEventListener("click", () => {
  brandTaps++;
  clearTimeout(brandTimer);
  brandTimer = setTimeout(() => (brandTaps = 0), 2000);
  if (brandTaps >= 5) {
    brandTaps = 0;
    const pwd = prompt("Webmaster wachtwoord:");
    if (pwd === "hammerhead") {
      $("#adminPanel").hidden = false;
      // make sure user is on articles tab
      $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "view-articles"));
      $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-articles"));
      toast("Webmaster modus actief 🛠️");
    } else if (pwd) {
      toast("Nope.");
    }
  }
});

$("#addArticle").addEventListener("click", () => {
  const title = $("#artTitle").value.trim();
  const url = $("#artUrl").value.trim();
  const desc = $("#artDesc").value.trim();
  if (!title || !url) return toast("Titel en URL zijn verplicht");
  const arts = loadArticles();
  const newArt = { id: "a" + Date.now(), title, url, desc, ts: Date.now() };
  arts.push(newArt);
  saveArticles(arts);
  $("#artTitle").value = "";
  $("#artUrl").value = "";
  $("#artDesc").value = "";
  if (Notification.permission === "granted") {
    new Notification("Nieuw artikel voor Hammerhead 📰", { body: title, icon: "icon.svg" });
  }
  renderArticles();
  toast("Artikel gepubliceerd");
  pushArticle(newArt);
});
$("#exitAdmin").addEventListener("click", () => ($("#adminPanel").hidden = true));
$("#exitAdmin2").addEventListener("click", () => ($("#adminPanel").hidden = true));

/* Admin section tabs */
$$(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".admin-tab").forEach((b) => b.classList.toggle("active", b === btn));
    const which = btn.dataset.admin;
    $("#adminArt").hidden = which !== "art";
    $("#adminQuote").hidden = which !== "quote";
  });
});

/* Add a real quote from admin mode */
$("#addQuote").addEventListener("click", () => {
  const text = $("#quoteText").value.trim();
  const source = $("#quoteSource").value.trim();
  if (!text || !source) return toast("Tekst en bron zijn verplicht");
  const quotes = loadCustomQuotes();
  const newQ = { text, source };
  quotes.push(newQ);
  saveCustomQuotes(quotes);
  BLURBS = buildBlurbs();
  $("#quoteText").value = "";
  $("#quoteSource").value = "";
  toast("Quote toegevoegd ✨");
  pushQuote(newQ);
});

/* ===================================================================
   4. EGO TAB
   =================================================================== */
/*
 * BLURBS
 * ------
 * Regel: alleen echte, verifieerbare citaten — of anders op naam van
 * Rutger Bregman (de webmaster). Geen verzonnen juryrapporten of
 * fictieve krantenrecensies meer. Voeg echte citaten toe aan de
 * REAL_QUOTES array (met bron + link indien mogelijk).
 */
const REAL_QUOTES = [
  {
    text: "Aangezien dit laatste op uiterst elegante en heldere wijze wordt beschreven in Waarom schurken pech hebben en helden geluk heeft de jury voor Jurriën Hamer gekozen als winnaar van de Socratesbeker 2021.",
    source: "Jury Socrates Wisselbeker 2022",
  },
  {
    text: "Een onderbouwd en oprecht pleidooi voor een menselijker strafrecht en grotere maatschappelijke gelijkheid.",
    source: "Jury Socrates Wisselbeker 2022",
  },
  {
    text: "Zijn bespiegelingen over rechtvaardigheid en waardigheid zijn aantrekkelijk en overtuigend.",
    source: "Het Financieele Dagblad",
  },
  {
    text: "Een prachtig boek dat de vloer aanveegt met vanzelfsprekendheden.",
    source: "iFilosofie",
  },
  {
    text: "Hamer is de horzel die onze samenleving hard nodig heeft.",
    source: "iFilosofie",
  },
  // Blurbs voor Wat vrijheid van je vraagt (2026) — bron: jurrienhamer.nl
  {
    text: "In alle eerlijkheid: ik was klaar om het liberalisme achter me te laten. Maar Jurriën Hamer laat zien dat het ook anders kan, en haalt het beste in de liberaal naar boven.",
    source: "Tim Hofman · over Wat vrijheid van je vraagt",
  },
  {
    text: "Van vrijheid heb je nooit genoeg, of toch wel? Jurriën Hamer kruipt onder je huid en sleept je mee in een historisch en filosofisch betoog dat net zo lichtvoetig als beklemmend is. Een must-read voor dappere burgers!",
    source: "Beatrice de Graaf · over Wat vrijheid van je vraagt",
  },
  {
    text: "Hamer slaat de spijker op zijn kop. Er is niets vrijblijvends aan het liberalisme.",
    source: "Tim Fransen · over Wat vrijheid van je vraagt",
  },
  {
    text: "Een van de belangrijkste boeken van dit jaar. Hamer brengt de grote thema's van onze tijd samen, rekent af met de vrijblijvendheid van het verleden, en legt glashelder bloot welke opgave voor ons ligt.",
    source: "Rutger Bregman · over Wat vrijheid van je vraagt",
  },
];

const BREGMAN_BLURBS = [
  "Jurriën is een van de weinige denkers die ik ken die tegelijk bescheiden én onmiskenbaar briljant is. Een zeldzame combinatie.",
  "Als ik wil weten wat ik écht ergens van vind, lees ik eerst wat Jurriën erover heeft geschreven. Scheelt mij denkwerk.",
  "Hammerhead schrijft zoals goede vrienden praten: eerlijk, scherp, en altijd net iets slimmer dan je verwachtte.",
  "Er zijn filosofen die ingewikkeld doen om slim te lijken. En dan is er Jurriën, die slim is en daarom juist helder schrijft.",
  "Ik heb zelden iemand ontmoet die zo goed kan nadenken én zo goed kan lachen om zichzelf. Meestal is het één van de twee.",
  "Hamer doet iets zeldzaams: hij maakt je een beter mens zonder dat het preken wordt.",
  "Als pech en geluk ooit een officiële woordvoerder krijgen, stem ik op Jurriën.",
  "Lees één alinea van Jurriën en je merkt het: hier zit iemand die écht heeft nagedacht voordat hij begon te typen.",
  "De wereld heeft meer mensen nodig zoals Hammerhead. Helaas zijn ze op na deze ene.",
  "Ik ken weinig mensen bij wie migraine en meesterwerken zo hand in hand gaan. Respect.",
  "Jurriën bewijst dat filosofie geen ivoren toren hoeft te zijn. Soms is het gewoon een keukentafel met koffie.",
  "Als ik één boek zou mogen aanraden aan iemand die nog nooit over ethiek heeft nagedacht: dat van Hamer. Geen twijfel.",
];

const CUSTOM_QUOTES_KEY = "hh_custom_quotes_v1";
const loadCustomQuotes = () => JSON.parse(localStorage.getItem(CUSTOM_QUOTES_KEY) || "[]");
const saveCustomQuotes = (arr) => localStorage.setItem(CUSTOM_QUOTES_KEY, JSON.stringify(arr));

function buildBlurbs() {
  return [
    ...REAL_QUOTES,
    ...loadCustomQuotes(),
    ...BREGMAN_BLURBS.map((text) => ({ text, source: "Rutger Bregman" })),
  ];
}
let BLURBS = buildBlurbs();

let blurbIdx = -1;
function nextBlurb() {
  let i;
  do {
    i = Math.floor(Math.random() * BLURBS.length);
  } while (i === blurbIdx && BLURBS.length > 1);
  blurbIdx = i;
  const card = $("#blurbCard");
  card.style.opacity = "0";
  card.style.transform = "translateY(8px)";
  setTimeout(() => {
    $("#blurbText").textContent = BLURBS[i].text;
    $("#blurbSource").textContent = "— " + BLURBS[i].source;
    card.style.transition = "opacity .35s ease, transform .35s ease";
    card.style.opacity = "1";
    card.style.transform = "none";
  }, 150);
}
$("#nextBlurb").addEventListener("click", nextBlurb);

/* ===================================================================
   Service worker + realtime article notifications
   =================================================================== */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "open-articles") {
        $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "view-articles"));
        $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-articles"));
      }
    });
    return reg;
  } catch (e) {
    console.warn("SW register failed", e);
    return null;
  }
}

async function showArticleNotification(article, swReg) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (isNotifMuted()) return;
  const opts = {
    body: article.title + (article.description ? " — " + article.description : ""),
    icon: "icon.svg",
    badge: "icon.svg",
    tag: "article-" + article.id,
    data: { url: "./#articles", id: article.id },
  };
  try {
    if (swReg && swReg.showNotification) {
      await swReg.showNotification("Nieuw artikel voor Hammerhead 📰", opts);
    } else {
      new Notification("Nieuw artikel voor Hammerhead 📰", opts);
    }
  } catch (e) { console.warn("notify failed", e); }
}

function subscribeArticleInserts(swReg) {
  if (!supa) return;
  // Track article IDs we've already seen so we don't notify for our own inserts
  supa
    .channel("public:articles")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "articles" }, (payload) => {
      const a = payload.new;
      // Merge into local cache
      const arts = loadArticles();
      if (!arts.find((x) => x.id === a.id)) {
        arts.push({
          id: a.id,
          title: a.title,
          url: a.url,
          desc: a.description || "",
          ts: new Date(a.created_at).getTime(),
        });
        saveArticles(arts);
        renderArticles();
        showArticleNotification(a, swReg);
        toast("📰 Nieuw artikel: " + a.title, { duration: 4000 });
      }
    })
    .subscribe();
}

/* ===================================================================
   Init
   =================================================================== */
async function init() {
  // Render immediately from local cache for instant feel
  renderMigraine();
  renderArticles();
  nextBlurb();

  const swReg = await registerSW();

  // Show sync status in subtitle
  if (SYNC_ENABLED) {
    $("#brand-sub").textContent = "Filosoferen met de hamer · ⏳ syncen…";
    await migrateClearSeededArticles();
    await pullAll();
    BLURBS = buildBlurbs();
    renderMigraine();
    renderArticles();
    nextBlurb();
    applyTimeGreeting();
    subscribeArticleInserts(swReg);
    // Dynamic island style confirmation
    setTimeout(() => island("☁️ Gesynct met Supabase", 3000), 300);
  } else {
    applyTimeGreeting();
  }

  // Kick off Instapaper feed sync (non-blocking)
  fetchInstapaperFeed().then((items) => {
    if (items && items.length) {
      renderArticles();
      island(`📖 ${items.length} Instapaper artikelen`, 3500);
    }
  });
}
init();

/* PWA: service worker for offline-lite (optional, graceful) */
if ("serviceWorker" in navigator) {
  // skip — keep it simple for static hosting
}
