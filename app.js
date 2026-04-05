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

/* ---------- Tab navigation ---------- */
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === view));
    if (navigator.vibrate) navigator.vibrate(8);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

/* ---------- Toast ---------- */
const toastEl = $("#toast");
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
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
  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  panicBtn.animate(
    [{ transform: "scale(1)" }, { transform: "scale(0.88)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }],
    { duration: 360, easing: "ease-out" }
  );
  toast("Aanval gelogd. Sterkte Hammerhead 🦈");
  renderMigraine();
  pushMigraine(now);
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

let chartRange = "year";
$$(".seg-btn").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    chartRange = b.dataset.range;
    renderChart();
  })
);

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

  $("#statMonth").textContent = monthCount;
  $("#statYear").textContent = yearCount;
  $("#statTotal").textContent = logs.length;

  const last = logs[0];
  $("#lastLog").textContent = last
    ? "Laatste aanval: " + formatRelative(last)
    : "Nog geen aanvallen gelogd. Toi toi toi.";

  const list = $("#logList");
  list.innerHTML = "";
  if (!logs.length) {
    list.innerHTML = '<li style="justify-content:center;color:var(--muted)">Niks. Lekker rustig daar boven.</li>';
  } else {
    logs.slice(0, 20).forEach((t) => {
      const li = document.createElement("li");
      const d = new Date(t);
      li.innerHTML = `<span>${d.toLocaleDateString("nl-NL", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })}</span><span class="when">${d.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      })}</span>`;
      list.appendChild(li);
    });
  }

  renderChart();
  renderInsights(logs);
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

/* Custom lightweight bar chart (no dependency) */
function renderChart() {
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

window.addEventListener("resize", renderChart);

/* ===================================================================
   2. FUNK TAB
   =================================================================== */
const FUNK_TRACKS = [
  { title: "Superstition", artist: "Stevie Wonder", id: "1h2xVEoJORqrg71HocgqXd" },
  { title: "Get Lucky", artist: "Daft Punk", id: "2Foc5Q5nqNiosCNqttzHof" },
  { title: "September", artist: "Earth, Wind & Fire", id: "2grjqo0Frpf2okIBiifQKs" },
  { title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", id: "32OlwWuMpZ6b0aN2RZOeMS" },
  { title: "Give Up the Funk", artist: "Parliament", id: "4wHYjYpsYDjEWqvYb4Hl0Q" },
  { title: "Good Times", artist: "Chic", id: "2tpWsVSb9UEmDRxAl1zhX1" },
  { title: "Le Freak", artist: "Chic", id: "5eRZS7dc1vjWwqvdvno7zM" },
  { title: "Brick House", artist: "Commodores", id: "1K35Fsd5ZMYHuUu7AzOlnD" },
  { title: "Play That Funky Music", artist: "Wild Cherry", id: "4YnzcVzQl37ZIhDCMRBtwG" },
  { title: "Kiss", artist: "Prince", id: "2TjdnqlpwOjhijHCwHCP2d" },
  { title: "I Want You Back", artist: "The Jackson 5", id: "2i0ftu8wxBu3Po74Q65yZC" },
  { title: "Flash Light", artist: "Parliament", id: "2gMXnyrvIjhVBUZwvLZDMP" },
  { title: "Jungle Boogie", artist: "Kool & The Gang", id: "6XoRuHJvNUmkPqZI0NEUxu" },
  { title: "Funky Town", artist: "Lipps Inc.", id: "7EqpEBPOohgk7NnKvBGFWo" },
  { title: "Blurred Lines", artist: "Robin Thicke", id: "0n4bITAu0Y0nigrz3MFJMb" },
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
  if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
  toast("🎶 " + track.title);
});

/* ===================================================================
   3. ARTIKELEN TAB
   =================================================================== */
const ART_KEY = "hh_articles_v1";
const SEEN_KEY = "hh_articles_seen_v1";

const DEFAULT_ARTICLES = [
  {
    id: "welcome",
    title: "Welkom in Hammerhead HQ",
    url: "https://example.com",
    desc: "De webmaster heeft nog niks gedeeld, maar de verwachtingen zijn torenhoog.",
    ts: Date.now(),
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

function renderArticles() {
  const arts = loadArticles().sort((a, b) => b.ts - a.ts);
  const seen = loadSeen();
  const list = $("#articleList");
  list.innerHTML = "";
  arts.forEach((a) => {
    const li = document.createElement("li");
    const isNew = !seen.includes(a.id);
    li.innerHTML = `
      <a href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.title)}${isNew ? '<span class="new-badge">NIEUW</span>' : ""}</a>
      <div class="desc">${escapeHtml(a.desc || "")}</div>
      <div class="meta">${new Date(a.ts).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</div>
    `;
    list.appendChild(li);
  });
  // mark all seen after render
  setTimeout(() => saveSeen(arts.map((a) => a.id)), 1500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Notifications */
const notifBtn = $("#enableNotif");
const notifCard = $("#notifCard");
function updateNotifUi() {
  if (!("Notification" in window)) {
    notifBtn.textContent = "Niet ondersteund";
    notifBtn.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    notifBtn.textContent = "Aan ✓";
    notifCard.classList.add("enabled");
  } else if (Notification.permission === "denied") {
    notifBtn.textContent = "Geblokkeerd";
  }
}
notifBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  const p = await Notification.requestPermission();
  if (p === "granted") {
    new Notification("Hammerhead HQ", { body: "Je krijgt nu meldingen bij nieuwe artikelen 🦈", icon: "icon.svg" });
  }
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
   Init
   =================================================================== */
async function init() {
  // Render immediately from local cache for instant feel
  renderMigraine();
  renderArticles();
  nextBlurb();

  // Show sync status in subtitle
  if (SYNC_ENABLED) {
    $("#brand-sub").textContent = "Filosoferen met de hamer · ⏳ syncen…";
    await pullAll();
    BLURBS = buildBlurbs();
    renderMigraine();
    renderArticles();
    nextBlurb();
    $("#brand-sub").textContent = "Filosoferen met de hamer · ☁️ gesynct";
  } else {
    $("#brand-sub").textContent = "Filosoferen met de hamer — lokaal (geen sync)";
  }
}
init();

/* PWA: service worker for offline-lite (optional, graceful) */
if ("serviceWorker" in navigator) {
  // skip — keep it simple for static hosting
}
