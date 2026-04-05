/* Hammerhead HQ — app logic */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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
});

$("#clearLogs").addEventListener("click", () => {
  if (!confirm("Alle migraine-logs wissen? Dit kan niet ongedaan worden gemaakt.")) return;
  saveLogs([]);
  renderMigraine();
  toast("Logs gewist.");
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

/* Admin mode — tap brand 5x to open */
let brandTaps = 0, brandTimer;
$(".brand").addEventListener("click", () => {
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
  arts.push({ id: "a" + Date.now(), title, url, desc, ts: Date.now() });
  saveArticles(arts);
  $("#artTitle").value = "";
  $("#artUrl").value = "";
  $("#artDesc").value = "";
  if (Notification.permission === "granted") {
    new Notification("Nieuw artikel voor Hammerhead 📰", { body: title, icon: "icon.svg" });
  }
  renderArticles();
  toast("Artikel gepubliceerd");
});
$("#exitAdmin").addEventListener("click", () => ($("#adminPanel").hidden = true));

/* ===================================================================
   4. EGO TAB
   =================================================================== */
const BLURBS = [
  {
    text: "Jurriën Hamer schrijft met de lichtheid van een veer en de diepgang van een put waar je per ongeluk je sleutels in laat vallen.",
    source: "De Volkskrant (vrij naar)",
  },
  {
    text: "Zelden zo'n goed onderbouwd pleidooi gelezen waarom jij persoonlijk gelijk hebt over zo ongeveer alles.",
    source: "Juryrapport (interne notitie)",
  },
  {
    text: "Als Kant en Seinfeld een kind kregen, en dat kind ging filosoferen over pech en geluk — dat is Hamer.",
    source: "Filosofie Magazine (gedroomde editie)",
  },
  {
    text: "Een denker die erin slaagt om bij elke alinea minstens één lezer hardop 'verdomme ja' te laten zeggen.",
    source: "NRC (of in ieder geval hun hart)",
  },
  {
    text: "De Socrates Wisselbeker is eigenlijk te klein voor wat hier gepresteerd is. Volgend jaar een grotere beker.",
    source: "Socrates Jury, fictief citaat",
  },
  {
    text: "Hammerhead: het enige haaiensoort dat zowel filosofie kan bedrijven als spontaan kan gaan dansen in de keuken.",
    source: "Wikipedia (als het eerlijk was)",
  },
  {
    text: "Er zijn mensen die nadenken. Er zijn mensen die schrijven. En dan is er Jurriën Hamer, die beide tegelijk doet zonder zichtbare inspanning.",
    source: "De Correspondent (spiritueel)",
  },
  {
    text: "Ik las één hoofdstuk en besloot direct al mijn overtuigingen te heroverwegen. En toen een koekje te pakken.",
    source: "Anonieme lezer, waarschijnlijk jij",
  },
  {
    text: "Als migraine een tegenstander is, dan is Jurriën de denker die 'm in een debat intellectueel de hoek in jaagt.",
    source: "Deze app, letterlijk nu",
  },
  {
    text: "Hamer bewijst dat je tegelijk bescheiden én onmiskenbaar briljant kunt zijn. Een combinatie die in het wild zelden voorkomt.",
    source: "Hammerhead HQ Research Division",
  },
  {
    text: "Zijn proza leest als een warme espresso op een koude maandagochtend: wakker, scherp, en net iets te goed om te delen.",
    source: "Koffiekenner & liefhebber",
  },
  {
    text: "Weinig schrijvers slagen erin om zowel Schopenhauer als een gemiddelde WhatsApp-groep toegankelijk te citeren. Hamer wel.",
    source: "Filosofiecafé De Gedachte",
  },
];

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
renderMigraine();
renderArticles();
nextBlurb();

/* PWA: service worker for offline-lite (optional, graceful) */
if ("serviceWorker" in navigator) {
  // skip — keep it simple for static hosting
}
