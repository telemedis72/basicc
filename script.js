// ═══════════════════════════════════════════════════════════════
//  LeafletMap PRO — app.js
//  Lokasi SAYA  : GPS dari HP/Laptop (navigator.geolocation)
//  Lokasi TUJUAN: Firebase Firestore (real-time onSnapshot)
//                 + kiriman ESP32 GPS u-blox M8N
// ═══════════════════════════════════════════════════════════════

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
// GPS Saya (HP/Laptop)
let myLat = null, myLng = null, myAcc = null;
let watchId = null, isWatch = false;
let markerSaya = null, accCircle = null;
let trailLine = null, trailPts = [], trailDist = 0;

// Firebase
let db = null, fbUnsub = null, colName = "tujuan";
let tujuan = [], mrkTujuan = {};

// Navigasi
let aktifDest = null, routingCtrl = null;

// Shapes manual
let shapes = [], drawnItems = null;
let warna = { m: "#00e5ff", c: "#00e5ff", p: "#39ff88" };

// Overlay layers
let heatLayer = null, clusterGroup = null, geoLayer = null;
let scaleCtr = null, miniCtr = null, gridLayer = null;
let imgOverlay = null, layerCtr = null;
let animInt = null, evPause = false, pickMode = null;

/* ═══════════════════════════════════════════
   INISIALISASI PETA LEAFLET
═══════════════════════════════════════════ */
const map = window.map = L.map("map", {
  center: [-6.2088, 106.8456],
  zoom: 12
});

// ── 1. TILE LAYERS (8 pilihan) ──
const TILES = {
  dark:      ["https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",      "© CARTO | © OSM", { subdomains:"abcd", maxZoom:19 }],
  light:     ["https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",     "© CARTO | © OSM", { subdomains:"abcd", maxZoom:19 }],
  satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "© Esri", { maxZoom:19 }],
  osm:       ["https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                 "© OSM contributors", { subdomains:"abc", maxZoom:19 }],
  topo:      ["https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",                   "© OpenTopoMap", { subdomains:"abc", maxZoom:17 }],
  watercolor:["https://watercolormaps.collection.cooperhewitt.org/tile/watercolor/{z}/{x}/{y}.jpg", "© Cooper Hewitt", { maxZoom:16 }],
  transport: ["https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38", "© Thunderforest", { maxZoom:19 }],
  cycle:     ["https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38",     "© Thunderforest", { maxZoom:19 }],
};
let tileLyr = L.tileLayer(...TILES.dark).addTo(map);

window.setTile = function(n) {
  map.removeLayer(tileLyr);
  tileLyr = L.tileLayer(...TILES[n]).addTo(map);
  toast("Tile: " + n, "info");
};
window.setTileOp = function(v) {
  document.getElementById("opVal").textContent = parseFloat(v).toFixed(2);
  tileLyr.setOpacity(parseFloat(v));
};

// ── 2. SCALE BAR ──
scaleCtr = L.control.scale({ imperial: false }).addTo(map);
window.toggleScale = function(on) {
  if (on) { scaleCtr = L.control.scale({ imperial:false }).addTo(map); }
  else if (scaleCtr) { map.removeControl(scaleCtr); scaleCtr = null; }
};

// ── 3. ATTRIBUTION ──
map.attributionControl.setPrefix("LeafletMap PRO");

// ── 4. DRAW CONTROL ──
drawnItems = new L.FeatureGroup().addTo(map);
const drawCtr = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: {
    polyline:     { shapeOptions: { color:"#00e5ff", weight:3 } },
    polygon:      { shapeOptions: { color:"#39ff88", weight:2, fillOpacity:.2 } },
    circle:       { shapeOptions: { color:"#ff6b35", fillOpacity:.15 } },
    rectangle:    { shapeOptions: { color:"#c084fc", fillOpacity:.15 } },
    marker:       true,
    circlemarker: { color:"#fbbf24", radius:7 },
  }
});
map.addControl(drawCtr);
map.on(L.Draw.Event.CREATED, e => {
  drawnItems.addLayer(e.layer);
  const nm = e.layerType.charAt(0).toUpperCase() + e.layerType.slice(1);
  tambahShape(e.layer, "Draw:" + nm, "✏️");
  toast(nm + " digambar", "ok");
  document.getElementById("hDr").classList.remove("on");
});

// ── 5. GEOCODER (Cari Alamat) ──
L.Control.geocoder({
  defaultMarkGeocode: false,
  placeholder: "🔍 Cari alamat...",
  collapsed: true,
  geocoder: L.Control.Geocoder.nominatim()
}).on("markgeocode", e => {
  const bb = e.geocode.bbox;
  const poly = L.polygon([bb.getSouthEast(), bb.getNorthEast(), bb.getNorthWest(), bb.getSouthWest()]).addTo(map);
  map.fitBounds(poly.getBounds());
  toast("Ditemukan: " + e.geocode.name, "info");
  logEv("geocode", "Cari: " + e.geocode.name);
  setTimeout(() => map.removeLayer(poly), 3000);
}).addTo(map);

// ── 6. MEASURE (Ukur Jarak & Area) ──
new L.Control.Measure({
  position: "topleft",
  primaryLengthUnit: "meters",
  secondaryLengthUnit: "kilometers",
  primaryAreaUnit: "sqmeters",
  activeColor: "#00e5ff",
  completedColor: "#39ff88"
}).addTo(map);

// ── 7. CUSTOM LOCATE BUTTON ──
const locBtn = L.control({ position: "topleft" });
locBtn.onAdd = function() {
  const d = L.DomUtil.create("div", "leaflet-bar leaflet-control");
  d.innerHTML = '<a title="Lokasi Saya" style="font-size:15px;display:flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer" onclick="deteksiGPS()">⊕</a>';
  L.DomEvent.disableClickPropagation(d);
  return d;
};
locBtn.addTo(map);

// ── 8. MAP EVENTS ──
map.on("mousemove", e => {
  document.getElementById("evLL").textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  const pt = map.latLngToContainerPoint(e.latlng);
  document.getElementById("evPx").textContent = `${Math.round(pt.x)}, ${Math.round(pt.y)}`;
});

function updateMapInfo() {
  const c = map.getCenter(), b = map.getBounds(), sz = map.getSize();
  document.getElementById("evCtr").textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  document.getElementById("evZm").textContent  = map.getZoom();
  document.getElementById("evSz").textContent  = `${sz.x}×${sz.y}`;
  document.getElementById("evBd").textContent  = `SW:${b.getSouth().toFixed(3)},${b.getWest().toFixed(3)} NE:${b.getNorth().toFixed(3)},${b.getEast().toFixed(3)}`;
}
map.on("moveend zoomend resize", updateMapInfo);
["click","dblclick","contextmenu","movestart","moveend","zoomstart","zoomend","layeradd","layerremove"].forEach(ev => {
  map.on(ev, () => logEv(ev, ev));
});
updateMapInfo();

// ── 9. KLIK PETA (pick mode) ──
map.on("click", e => {
  if (pickMode) {
    const { lat, lng } = e.latlng;
    if (pickMode === "marker")    tambahMarkerLatLng(lat, lng);
    else if (pickMode === "circle") tambahCircleLatLng(lat, lng);
    else if (pickMode === "dest") {
      document.getElementById("aLat").value = lat.toFixed(6);
      document.getElementById("aLng").value = lng.toFixed(6);
      toast(`Koordinat dipilih: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "info");
    }
    pickMode = null;
    map.getContainer().style.cursor = "";
  }
  logEv("click", `Klik: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, "ec");
});
window.modePilih = function(m) {
  pickMode = m;
  map.getContainer().style.cursor = "crosshair";
  toast("Klik di peta untuk " + m, "info");
};

/* ═══════════════════════════════════════════
   ICONS
═══════════════════════════════════════════ */

// Icon saya — pulsing blue dot (GPS HP/Laptop)
const ICON_SAYA = L.divIcon({
  html: `
    <div style="position:relative;width:22px;height:22px">
      <div style="position:absolute;inset:-4px;border-radius:50%;
        background:rgba(0,229,255,.18);animation:rpl 2s ease-out infinite"></div>
      <div style="position:absolute;inset:-10px;border-radius:50%;
        background:rgba(0,229,255,.07);animation:rpl 2s ease-out infinite .5s"></div>
      <div style="position:absolute;inset:3px;border-radius:50%;
        background:#00e5ff;border:2.5px solid #fff;
        box-shadow:0 0 14px #00e5ff,0 2px 8px rgba(0,0,0,.6)"></div>
    </div>
    <style>
      @keyframes rpl{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.5);opacity:0}}
    </style>`,
  iconSize: [22,22], iconAnchor: [11,11], popupAnchor: [0,-13], className: ""
});

// Icon tujuan — pin dari Firebase / ESP32
function iconTujuan(em, aktif = false) {
  const clr = aktif ? "#fbbf24" : "#3b82f6";
  return L.divIcon({
    html: `
      <div style="position:relative;width:30px;height:38px">
        <svg viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg"
          style="filter:drop-shadow(0 3px 10px ${clr}66)">
          <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 26.25 15 26.25S30 26.25 30 15C30 6.72 23.28 0 15 0z" fill="${clr}"/>
          <circle cx="15" cy="15" r="7" fill="#06080f"/>
        </svg>
        <div style="position:absolute;top:7px;left:50%;transform:translateX(-50%);font-size:9px">${em}</div>
      </div>`,
    iconSize: [30,38], iconAnchor: [15,38], popupAnchor: [0,-38], className: ""
  });
}

// Icon shape custom
function mkIcon(em, clr, sz = 34) {
  return L.divIcon({
    html: `<div style="width:${sz}px;height:${sz}px;border-radius:50% 50% 50% 0;
      background:${clr};transform:rotate(-45deg);display:flex;align-items:center;
      justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5);border:2px solid rgba(255,255,255,.25)">
      <span style="transform:rotate(45deg);font-size:${sz*.42}px">${em}</span>
    </div>`,
    iconSize: [sz,sz], iconAnchor: [sz/2,sz], popupAnchor: [0,-sz], className: ""
  });
}

function emojiKat(k) {
  if (!k) return "📍";
  const tbl = {
    rumah:"🏠", kantor:"🏢", restoran:"🍽", makan:"🍽", "rumah sakit":"🏥",
    wisata:"🎭", ibadah:"🕌", masjid:"🕌", sekolah:"🏫", spbu:"⛽",
    belanja:"🛒", mall:"🛒", tracker:"📡", bandara:"✈️", pantai:"🏖"
  };
  const kl = k.toLowerCase();
  for (const [key, em] of Object.entries(tbl)) if (kl.includes(key)) return em;
  return "📍";
}

/* ═══════════════════════════════════════════
   GPS SAYA — navigator.geolocation API
   Sumber: sensor GPS di HP / WiFi positioning di laptop
═══════════════════════════════════════════ */
window.deteksiGPS = function() {
  if (!navigator.geolocation) { toast("Geolocation tidak didukung di browser ini", "err"); return; }
  const btn = document.getElementById("btnGPS");
  btn.innerHTML = `<span class="spin"></span> Mendeteksi...`;
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    pos => {
      terimaGPS(pos);
      btn.innerHTML = "📡 Perbarui Lokasi Saya";
      btn.disabled = false;
      toast(`GPS terdeteksi! Akurasi ±${Math.round(pos.coords.accuracy)}m`, "ok");
    },
    err => {
      const msg = {1:"Izin GPS ditolak", 2:"Sinyal GPS tidak tersedia", 3:"GPS timeout"}[err.code] || "GPS error";
      toast(msg, "err");
      btn.innerHTML = "📡 Deteksi GPS Saya";
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
};

window.toggleWatch = function() {
  if (!navigator.geolocation) { toast("Geolocation tidak didukung", "err"); return; }
  const btn = document.getElementById("btnWatch");
  if (isWatch) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null; isWatch = false;
    btn.innerHTML = "👁 Watch Realtime";
    document.getElementById("hWt").classList.remove("on");
    toast("Watch GPS dihentikan", "info");
  } else {
    watchId = navigator.geolocation.watchPosition(
      pos => terimaGPS(pos),
      err => toast("GPS watch: " + err.message, "warn"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 }
    );
    isWatch = true;
    btn.innerHTML = "⏹ Stop Watch";
    document.getElementById("hWt").classList.add("on");
    toast("Watch GPS aktif — posisi diperbarui otomatis 👁", "ok");
  }
};

// Fungsi utama menerima data GPS dari device
function terimaGPS(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const acc = Math.round(pos.coords.accuracy);
  const spd = pos.coords.speed   != null ? (pos.coords.speed * 3.6).toFixed(1) + " km/h" : "—";
  const hdg = pos.coords.heading != null ? Math.round(pos.coords.heading) + "°" : "—";
  const alt = pos.coords.altitude != null ? Math.round(pos.coords.altitude) + " m" : "—";
  const jam = new Date().toLocaleTimeString("id", { hour:"2-digit", minute:"2-digit", second:"2-digit" });

  // Catat jejak (hanya jika bergerak >3m)
  if (myLat !== null) {
    const d = haversine(myLat, myLng, lat, lng);
    if (d > 3) {
      trailDist += d;
      trailPts.push([lat, lng]);
      if (trailPts.length > 600) trailPts.shift();
      if (trailLine) trailLine.setLatLngs(trailPts);
      else trailLine = L.polyline(trailPts, { color:"#00e5ff", weight:3, opacity:.55, dashArray:"5 8" }).addTo(map);
      document.getElementById("trPt").textContent = trailPts.length;
      document.getElementById("trKm").textContent = fmtJarak(trailDist);
    }
  }
  myLat = lat; myLng = lng; myAcc = acc;

  // Update / buat marker saya
  if (markerSaya) {
    markerSaya.setLatLng([lat, lng]);
  } else {
    markerSaya = L.marker([lat, lng], { icon: ICON_SAYA, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(mkPopup("📍 Posisi Saya",
        `Koordinat: <b>${lat.toFixed(6)}, ${lng.toFixed(6)}</b><br>
         Akurasi: ±${acc}m<br>Kecepatan: ${spd}<br>
         Heading: ${hdg} | Altitude: ${alt}`, "#00e5ff"))
      .bindTooltip("Saya", { permanent:true, direction:"right", offset:[14,-6], className:"" });
    map.flyTo([lat, lng], 15, { duration: 1.5 });
  }

  // Lingkaran akurasi GPS
  if (accCircle) accCircle.setLatLng([lat, lng]).setRadius(acc);
  else accCircle = L.circle([lat, lng], {
    radius: acc, color:"#00e5ff", fillColor:"#00e5ff",
    fillOpacity:.05, weight:1, dashArray:"4", interactive:false
  }).addTo(map);

  // Update UI sidebar
  const ks = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById("gCoord").textContent = ks;
  document.getElementById("gAcc").textContent   = "±" + acc + "m";
  document.getElementById("gSpd").textContent   = spd;
  document.getElementById("gHdg").textContent   = hdg;
  document.getElementById("gAlt").textContent   = alt;
  document.getElementById("gUpd").textContent   = jam;

  // Update overlay peta
  document.getElementById("ovSaya").style.display = "";
  document.getElementById("ovSayaV").textContent  = ks;
  document.getElementById("ovSayaS").textContent  = `±${acc}m | ${spd !== "—" ? spd : "diam"}`;
  document.getElementById("hGPS").classList.add("on");

  // Update jarak ke tujuan aktif jika ada
  if (aktifDest) {
    const d = haversine(lat, lng, aktifDest.lat, aktifDest.lng);
    document.getElementById("ovRuteInfo").textContent = fmtJarak(d) + " dari sini";
  }
  logEv("move", `GPS: ${lat.toFixed(4)},${lng.toFixed(4)} ±${acc}m`, "em");
}

window.kePosSaya = function() {
  if (myLat === null) { toast("Deteksi GPS dulu!", "err"); return; }
  map.flyTo([myLat, myLng], 16, { duration: 1.2 });
};
window.hapusJejak = function() {
  if (trailLine) { map.removeLayer(trailLine); trailLine = null; }
  trailPts = []; trailDist = 0;
  document.getElementById("trPt").textContent = 0;
  document.getElementById("trKm").textContent = "0 m";
  toast("Jejak dihapus", "info");
};
window.fitJejak = function() {
  if (!trailPts.length) { toast("Belum ada jejak", "err"); return; }
  map.fitBounds(L.latLngBounds(trailPts).pad(.1));
};

/* ═══════════════════════════════════════════
   FIREBASE FIRESTORE — TUJUAN (Real-time)
   Termasuk kiriman dari ESP32 GPS M8N
═══════════════════════════════════════════ */
window.hubungFB = async function() {
  const key  = document.getElementById("fbKey").value.trim();
  const pid  = document.getElementById("fbPid").value.trim();
  const auth = document.getElementById("fbAuth").value.trim();
  const appId= document.getElementById("fbApp").value.trim();
  colName    = document.getElementById("fbCol").value.trim() || "tujuan";

  if (!key || !pid) { toast("Isi API Key dan Project ID!", "err"); return; }

  try {
    toast("Menghubungkan Firebase...", "warn");
    const app = initializeApp({ apiKey:key, authDomain:auth, projectId:pid, appId }, "lmp-" + Date.now());
    db = getFirestore(app);
    if (fbUnsub) fbUnsub();

    // onSnapshot = real-time listener, auto update setiap ada perubahan
    // Termasuk update dari ESP32 yang kirim setiap 5 detik
    fbUnsub = onSnapshot(
      collection(db, colName),
      snap => {
        tujuan = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTujuan();
        document.getElementById("fbStat").textContent  = "Terhubung ✓ (real-time)";
        document.getElementById("fbStat").style.color  = "var(--c3)";
        document.getElementById("fbColD").textContent  = colName;
        document.getElementById("fbJml").textContent   = tujuan.length;
        document.getElementById("hFB").classList.add("on");
        toast(`${tujuan.length} tujuan dimuat dari Firebase`, "ok");
        logEv("firebase", `Firestore update: ${tujuan.length} dokumen`);
      },
      err => {
        toast("Firestore error: " + err.message, "err", 6000);
        document.getElementById("fbStat").textContent = "Error: " + err.message;
        document.getElementById("fbStat").style.color = "var(--c6)";
      }
    );
  } catch(e) { toast("Firebase gagal: " + e.message, "err", 6000); }
};

window.loadDemo = function() {
  tujuan = [
    {id:"d1",  nama:"Monas",              kategori:"🎭 Wisata",   lat:-6.1754,  lng:106.8272, deskripsi:"Monumen Nasional Indonesia"},
    {id:"d2",  nama:"Kota Tua",           kategori:"🎭 Wisata",   lat:-6.1352,  lng:106.8133, deskripsi:"Kawasan bersejarah Jakarta"},
    {id:"d3",  nama:"TMII",               kategori:"🎭 Wisata",   lat:-6.3024,  lng:106.8951, deskripsi:"Taman Mini Indonesia Indah"},
    {id:"d4",  nama:"Bandara Soetta",     kategori:"✈️ Bandara",  lat:-6.1256,  lng:106.6559, deskripsi:"Bandara Soekarno-Hatta"},
    {id:"d5",  nama:"Ancol",              kategori:"🎡 Rekreasi", lat:-6.1230,  lng:106.8354, deskripsi:"Taman hiburan tepi laut"},
    {id:"d6",  nama:"Grand Indonesia",    kategori:"🛒 Belanja",  lat:-6.1951,  lng:106.8218, deskripsi:"Pusat perbelanjaan Jakarta"},
    {id:"d7",  nama:"Ragunan Zoo",        kategori:"🎭 Wisata",   lat:-6.3097,  lng:106.8197, deskripsi:"Kebun binatang Ragunan"},
    {id:"d8",  nama:"GBK Stadium",        kategori:"⚽ Olahraga", lat:-6.2183,  lng:106.8023, deskripsi:"Gelora Bung Karno"},
    {id:"d9",  nama:"ESP32 Tracker",      kategori:"📡 Tracker",  lat:-6.2000,  lng:106.8160, deskripsi:"Simulasi kiriman ESP32 GPS M8N"},
    {id:"d10", nama:"Kepulauan Seribu",   kategori:"🏝 Wisata",   lat:-5.6119,  lng:106.5808, deskripsi:"Gugusan pulau di teluk Jakarta"},
  ];
  renderTujuan();
  toast("Demo data dimuat — klik 🧭 untuk navigasi!", "ok");
};

function renderTujuan() {
  // Hapus marker lama
  Object.values(mrkTujuan).forEach(m => { try { map.removeLayer(m); } catch(e) {} });
  mrkTujuan = {};

  const el  = document.getElementById("daftarDest");
  document.getElementById("jmlBdg").textContent = tujuan.length;

  // Update dropdown routing
  const sel = document.getElementById("rtTo");
  sel.innerHTML = '<option value="">-- Pilih tujuan --</option>';
  tujuan.forEach(t => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = `${t.nama || t.name || "—"} (${t.kategori || "—"})`;
    sel.appendChild(o);
  });

  if (!tujuan.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📭</div><p>Collection "${colName}" kosong<br>Tambah di tab 🛠 Tools</p></div>`;
    return;
  }

  // Render daftar sidebar
  el.innerHTML = tujuan.map(t => {
    const lat   = parseFloat(t.lat), lng = parseFloat(t.lng);
    const nm    = t.nama || t.name || "(tanpa nama)";
    const kat   = t.kategori || t.category || "—";
    const em    = emojiKat(kat);
    const isAkt = aktifDest && aktifDest.id === t.id;
    const jarak = (myLat !== null && !isNaN(lat)) ? fmtJarak(haversine(myLat, myLng, lat, lng)) : "";
    // Tandai jika dari ESP32 (ada field 'deviceId')
    const isTracker = t.deviceId ? "🔴 LIVE" : "";
    return `
      <div class="di ${isAkt?"on":""}" id="ddi_${t.id}" onclick="terbangKe('${t.id}')">
        <div class="dc">${em}</div>
        <div class="dk">
          <div class="dn">${nm} <small style="color:var(--c6);font-size:.55rem">${isTracker}</small></div>
          <div class="dm">${kat} · ${isNaN(lat)?"?":lat.toFixed(3)},${isNaN(lng)?"?":lng.toFixed(3)}</div>
        </div>
        ${jarak ? `<div class="dd">${jarak}</div>` : ""}
        <div class="dac" onclick="event.stopPropagation()">
          <button class="dab" title="Navigasi" onclick="mulaiNavigasi('${t.id}')">🧭</button>
          <button class="dab del" title="Hapus" onclick="hapusTujuan('${t.id}')">🗑</button>
        </div>
      </div>`;
  }).join("");

  // Render marker tujuan di peta
  tujuan.forEach(t => {
    const lat = parseFloat(t.lat), lng = parseFloat(t.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    const nm    = t.nama || t.name || "(tanpa nama)";
    const kat   = t.kategori || t.category || "—";
    const em    = emojiKat(kat);
    const isAkt = aktifDest && aktifDest.id === t.id;
    const isTracker = t.deviceId || false;

    const m = L.marker([lat, lng], { icon: iconTujuan(em, isAkt) })
      .addTo(map)
      .bindPopup(mkPopup(em + " " + nm,
        `<b>Kategori:</b> ${kat}<br>
         ${t.deskripsi || t.desc ? `<b>Keterangan:</b> ${t.deskripsi || t.desc}<br>` : ""}
         ${isTracker ? `<b>Device:</b> ${t.deviceId} <span style="color:var(--c6)">● LIVE</span><br>
           ${t.kecepatan !== undefined ? `<b>Kecepatan:</b> ${t.kecepatan} km/h<br>` : ""}
           ${t.satelit   !== undefined ? `<b>Satelit:</b> ${t.satelit}<br>` : ""}
           ${t.heading   !== undefined ? `<b>Heading:</b> ${t.heading}°<br>` : ""}` : ""}
         <b>Koordinat:</b> ${lat.toFixed(5)}, ${lng.toFixed(5)}<br>
         <button onclick="window.mulaiNavigasi('${t.id}')"
           style="margin-top:8px;width:100%;padding:7px;background:#fbbf24;color:#06080f;
           border:none;border-radius:7px;cursor:pointer;font-weight:700;font-size:.78rem;
           font-family:'Nunito',sans-serif">🧭 Navigasi ke Sini</button>`,
        "#fbbf24"))
      .bindTooltip(nm + (isTracker ? " 🔴" : ""), { direction:"top", offset:[0,-38], className:"" });

    mrkTujuan[t.id] = m;
  });

  // Refresh overlay layers yang aktif
  if (heatLayer)    { map.removeLayer(heatLayer);    heatLayer = null;    toggleHeatmap(true); }
  if (clusterGroup) { map.removeLayer(clusterGroup); clusterGroup = null; toggleCluster(true); }
}

window.terbangKe = function(id) {
  const t = tujuan.find(x => x.id === id);
  if (!t) return;
  const lat = parseFloat(t.lat), lng = parseFloat(t.lng);
  if (isNaN(lat)) return;
  map.flyTo([lat, lng], 16, { duration: 1.2 });
  mrkTujuan[id]?.openPopup();
};

window.fitSemuaTujuan = function() {
  const v = tujuan.filter(t => !isNaN(parseFloat(t.lat)));
  if (!v.length) { toast("Tidak ada tujuan", "err"); return; }
  const pts = v.map(t => [parseFloat(t.lat), parseFloat(t.lng)]);
  if (myLat !== null) pts.push([myLat, myLng]);
  map.fitBounds(L.latLngBounds(pts).pad(.1));
};

/* ═══════════════════════════════════════════
   NAVIGASI — GPS Saya → Tujuan Firebase/ESP32
═══════════════════════════════════════════ */
window.mulaiNavigasi = function(id) {
  const t = tujuan.find(x => x.id === id);
  if (!t)                          { toast("Tujuan tidak ditemukan", "err"); return; }
  if (myLat === null)              { toast("Aktifkan GPS Saya dulu!", "err"); T("gps"); return; }
  const lat = parseFloat(t.lat), lng = parseFloat(t.lng);
  if (isNaN(lat) || isNaN(lng))   { toast("Koordinat tujuan tidak valid!", "err"); return; }

  hapusRute();
  aktifDest = { ...t, lat, lng };
  renderTujuan();

  // Routing dari GPS device saya → koordinat tujuan Firebase
  routingCtrl = L.Routing.control({
    waypoints: [
      L.latLng(myLat, myLng),  // DARI: GPS HP/Laptop
      L.latLng(lat, lng)         // KE:   Tujuan dari Firebase / ESP32
    ],
    routeWhileDragging: false,
    lineOptions: {
      styles: [{ color:"#fbbf24", opacity:.9, weight:5 }],
      addWaypoints: false
    },
    createMarker: () => null,
    show: true, collapsible: true, language: "id",
    fitSelectedRoutes: false, showAlternatives: false,
    router: L.Routing.osrmv1({ profile: document.getElementById("rtProf").value })
  }).addTo(map);

  routingCtrl.on("routesfound", e => {
    const r   = e.routes[0].summary;
    const km  = (r.totalDistance / 1000).toFixed(1) + " km";
    const mnt = Math.round(r.totalTime / 60);
    const eta = mnt > 60 ? `${Math.floor(mnt/60)}j ${mnt%60}m` : `${mnt} mnt`;
    const nm  = t.nama || t.name;
    const tiba = new Date(Date.now() + r.totalTime * 1000)
                   .toLocaleTimeString("id", { hour:"2-digit", minute:"2-digit" });

    document.getElementById("rcard").style.display   = "";
    document.getElementById("rcNm").textContent      = nm;
    document.getElementById("rcKm").textContent      = km;
    document.getElementById("rcEta").textContent     = eta;
    document.getElementById("rcTiba").textContent    = tiba;
    document.getElementById("ovRute").style.display  = "";
    document.getElementById("ovRuteNm").textContent  = nm;
    document.getElementById("ovRuteInfo").textContent= `${km} · ~${eta}`;
    document.getElementById("hRt").classList.add("on");

    toast(`🧭 ${nm}: ${km}, ~${eta}`, "ok", 4000);
    T("dest");
  });

  map.fitBounds(L.latLngBounds([[myLat,myLng],[lat,lng]]).pad(.2), { animate:true, duration:1.5 });
};

window.mulaiRute = function() {
  const id = document.getElementById("rtTo").value;
  if (!id) { toast("Pilih tujuan dulu!", "err"); return; }
  mulaiNavigasi(id);
};

window.hapusRute = function() {
  if (routingCtrl) { map.removeControl(routingCtrl); routingCtrl = null; }
  aktifDest = null;
  document.getElementById("rcard").style.display = "none";
  document.getElementById("ovRute").style.display = "none";
  document.getElementById("hRt").classList.remove("on");
  renderTujuan();
};

/* ═══════════════════════════════════════════
   TAMBAH TUJUAN KE FIREBASE
═══════════════════════════════════════════ */
window.simpanTujuan = async function() {
  if (!db) { toast("Hubungkan Firebase dulu!", "err"); T("fb"); return; }
  const nm  = document.getElementById("aNm").value.trim();
  const kat = document.getElementById("aKat").value;
  const lat = parseFloat(document.getElementById("aLat").value);
  const lng = parseFloat(document.getElementById("aLng").value);
  if (!nm)                        { toast("Nama wajib diisi!", "err"); return; }
  if (isNaN(lat) || isNaN(lng))   { toast("Koordinat tidak valid!", "err"); return; }
  try {
    await addDoc(collection(db, colName), {
      nama: nm, kategori: kat, lat, lng, createdAt: serverTimestamp()
    });
    toast(`"${nm}" disimpan ke Firebase!`, "ok");
    ["aNm","aLat","aLng"].forEach(id => document.getElementById(id).value = "");
  } catch(e) { toast("Gagal simpan: " + e.message, "err", 5000); }
};

window.hapusTujuan = async function(id) {
  if (!db) return;
  if (!confirm("Hapus tujuan ini dari Firebase?")) return;
  try {
    await deleteDoc(doc(db, colName, id));
    if (aktifDest?.id === id) hapusRute();
    toast("Tujuan dihapus", "info");
  } catch(e) { toast("Gagal hapus: " + e.message, "err"); }
};

window.isiDariGPS = function() {
  if (myLat === null) { toast("Deteksi GPS dulu!", "err"); return; }
  document.getElementById("aLat").value = myLat.toFixed(6);
  document.getElementById("aLng").value = myLng.toFixed(6);
  toast("Koordinat GPS diisi!", "ok");
};

/* ═══════════════════════════════════════════
   SHAPES — Marker, Circle, Polyline, Polygon, Rectangle
═══════════════════════════════════════════ */
function tambahShape(lyr, nm, ico = "📐") {
  const id = "sh" + Date.now();
  lyr._sid = id;
  shapes.push({ id, nm, lyr, ico });
  renderShapeList();
  return id;
}

function tambahMarkerLatLng(lat, lng) {
  const em  = document.getElementById("mIkon").value;
  const lbl = document.getElementById("mLbl").value || "Marker";
  const clr = warna.m;
  const m = L.marker([lat, lng], { icon: mkIcon(em, clr) })
    .addTo(map)
    .bindPopup(mkPopup(em + " " + lbl, `${lat.toFixed(5)}, ${lng.toFixed(5)}`, clr))
    .bindTooltip(lbl, { direction:"top", offset:[0,-34], className:"" });
  m.on("click", () => logEv("click", "Marker: " + lbl, "ec"));
  tambahShape(m, lbl, em);
  toast(`Marker "${lbl}" ditambahkan`, "ok");
}

window.tambahMarkerCenter = function() {
  const c = map.getCenter();
  tambahMarkerLatLng(c.lat, c.lng);
};

function tambahCircleLatLng(lat, lng) {
  const r   = parseInt(document.getElementById("circR").value) || 500;
  const clr = warna.c;
  const ci  = L.circle([lat, lng], { radius:r, color:clr, fillColor:clr, fillOpacity:.15, weight:2 })
    .addTo(map)
    .bindPopup(mkPopup("⭕ Circle", `R=${r}m | ${lat.toFixed(4)},${lng.toFixed(4)}`, clr));
  tambahShape(ci, `Circle R=${r}m`, "⭕");
  toast(`Circle ${r}m ditambahkan`, "ok");
}

window.tambahCircle       = function() { const c = map.getCenter(); tambahCircleLatLng(c.lat, c.lng); };
window.tambahCircleMarker = function() {
  const c   = map.getCenter();
  const clr = warna.c;
  const cm  = L.circleMarker([c.lat, c.lng], { radius:10, color:clr, fillColor:clr, fillOpacity:.6, weight:2 })
    .addTo(map).bindPopup(mkPopup("• CircleMarker", `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`, clr));
  tambahShape(cm, "CircleMarker", "•");
  toast("CircleMarker ditambahkan", "ok");
};
window.tambahPolyline = function() {
  const c   = map.getCenter(), clr = warna.p;
  const pts = [[c.lat+.02,c.lng-.03],[c.lat+.01,c.lng],[c.lat-.01,c.lng+.02],[c.lat-.02,c.lng+.04]];
  const pl  = L.polyline(pts, { color:clr, weight:3, dashArray:"8 4" }).addTo(map)
    .bindPopup(mkPopup("〰 Polyline", `${pts.length} titik`, clr));
  tambahShape(pl, "Polyline", "〰");
  toast("Polyline ditambahkan", "ok");
};
window.tambahPolygon = function() {
  const c   = map.getCenter(), clr = warna.p;
  const pts = [[c.lat+.03,c.lng],[c.lat+.01,c.lng+.04],[c.lat-.02,c.lng+.03],[c.lat-.02,c.lng-.03],[c.lat+.01,c.lng-.04]];
  const pg  = L.polygon(pts, { color:clr, fillColor:clr, fillOpacity:.18, weight:2 }).addTo(map)
    .bindPopup(mkPopup("⬡ Polygon", `${pts.length} sisi`, clr));
  tambahShape(pg, "Polygon", "⬡");
  toast("Polygon ditambahkan", "ok");
};
window.tambahRect = function() {
  const c = map.getCenter(), clr = warna.p;
  const b = [[c.lat-.02,c.lng-.03],[c.lat+.02,c.lng+.03]];
  const r = L.rectangle(b, { color:clr, fillColor:clr, fillOpacity:.15, weight:2 }).addTo(map)
    .bindPopup(mkPopup("▭ Rectangle", "", clr));
  tambahShape(r, "Rectangle", "▭");
  toast("Rectangle ditambahkan", "ok");
};

window.hapusSemuaShape = function() {
  shapes.forEach(s => { try { map.removeLayer(s.lyr); } catch(e) {} });
  shapes = []; renderShapeList();
  toast("Semua shape dihapus", "info");
};
window.fitSemuaShape = function() {
  if (!shapes.length) { toast("Belum ada shape", "err"); return; }
  const grp = L.featureGroup(shapes.map(s => s.lyr));
  map.fitBounds(grp.getBounds().pad(.1));
};

function renderShapeList() {
  const el = document.getElementById("shapeList");
  if (!shapes.length) {
    el.innerHTML = `<div style="color:var(--mt);font-size:.7rem;text-align:center;padding:8px">Belum ada shape</div>`;
    return;
  }
  el.innerHTML = shapes.map(s => `
    <div class="shitem" onclick="flyShape('${s.id}')">
      <div class="si">${s.ico}</div>
      <div style="flex:1;min-width:0">
        <div class="sn">${s.nm}</div>
        <div class="sm">${s.lyr.constructor.name}</div>
      </div>
      <button class="sdel" onclick="event.stopPropagation();delShape('${s.id}')">🗑</button>
    </div>`).join("");
}
window.flyShape = function(id) {
  const s = shapes.find(x => x.id === id);
  if (!s) return;
  try {
    if (s.lyr.getLatLng) map.flyTo(s.lyr.getLatLng(), 15, { duration:1 });
    else if (s.lyr.getBounds) map.flyToBounds(s.lyr.getBounds().pad(.2), { duration:1 });
  } catch(e) {}
};
window.delShape = function(id) {
  const i = shapes.findIndex(x => x.id === id);
  if (i < 0) return;
  try { map.removeLayer(shapes[i].lyr); } catch(e) {}
  shapes.splice(i, 1); renderShapeList();
};
window.pilihWarna = function(el, type) {
  el.parentElement.querySelectorAll(".sw").forEach(s => s.classList.remove("on"));
  el.classList.add("on");
  warna[type] = el.dataset.c;
};

/* ═══════════════════════════════════════════
   OVERLAY LAYERS
═══════════════════════════════════════════ */
// Heatmap
window.toggleHeatmap = function(on) {
  if (on) {
    const pts = tujuan.length > 0 ? tujuan.filter(t => !isNaN(parseFloat(t.lat)))
      .map(t => [parseFloat(t.lat), parseFloat(t.lng), 1]) : [];
    if (pts.length < 2) { toast("Perlu minimal 2 tujuan untuk heatmap","warn"); document.getElementById("tHeat").checked=false; return; }
    heatLayer = L.heatLayer(pts, { radius:40, blur:25, maxZoom:17, gradient:{"0.4":"#00e5ff","0.65":"#c084fc","0.9":"#ff6b35","1":"#f43f5e"} }).addTo(map);
    document.getElementById("hHt").classList.add("on");
    toast("Heatmap aktif 🔥","ok");
  } else {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    document.getElementById("hHt").classList.remove("on");
  }
};

// Marker Cluster
window.toggleCluster = function(on) {
  if (on) {
    clusterGroup = L.markerClusterGroup({ maxClusterRadius:65, spiderfyOnMaxZoom:true });
    tujuan.filter(t => !isNaN(parseFloat(t.lat))).forEach(t => {
      L.marker([parseFloat(t.lat), parseFloat(t.lng)], { icon: mkIcon(emojiKat(t.kategori), warna.m, 28) })
        .bindPopup(mkPopup(t.nama || "—", t.kategori || "","#00e5ff")).addTo(clusterGroup);
    });
    map.addLayer(clusterGroup);
    document.getElementById("hCl").classList.add("on");
    toast("Marker Cluster aktif","ok");
  } else {
    if (clusterGroup) { map.removeLayer(clusterGroup); clusterGroup = null; }
    document.getElementById("hCl").classList.remove("on");
  }
};

// GeoJSON Wilayah Jakarta
window.toggleGeoJSON = function(on) {
  if (on) {
    const data = {
      type:"FeatureCollection", features:[
        {type:"Feature",properties:{nama:"Jakarta Pusat"},  geometry:{type:"Polygon",coordinates:[[[106.81,-6.16],[106.86,-6.16],[106.86,-6.21],[106.81,-6.21],[106.81,-6.16]]]}},
        {type:"Feature",properties:{nama:"Jakarta Barat"},  geometry:{type:"Polygon",coordinates:[[[106.73,-6.13],[106.82,-6.13],[106.82,-6.22],[106.73,-6.22],[106.73,-6.13]]]}},
        {type:"Feature",properties:{nama:"Jakarta Timur"},  geometry:{type:"Polygon",coordinates:[[[106.86,-6.13],[106.97,-6.13],[106.97,-6.32],[106.86,-6.32],[106.86,-6.13]]]}},
        {type:"Feature",properties:{nama:"Jakarta Selatan"},geometry:{type:"Polygon",coordinates:[[[106.76,-6.22],[106.9,-6.22],[106.9,-6.37],[106.76,-6.37],[106.76,-6.22]]]}},
        {type:"Feature",properties:{nama:"Jakarta Utara"},  geometry:{type:"Polygon",coordinates:[[[106.72,-6.08],[106.97,-6.08],[106.97,-6.16],[106.72,-6.16],[106.72,-6.08]]]}},
      ]
    };
    const clrs = ["#00e5ff","#ff6b35","#39ff88","#c084fc","#fbbf24"]; let ci = 0;
    geoLayer = L.geoJSON(data, {
      style: () => ({ color:clrs[ci%clrs.length], fillColor:clrs[ci++%clrs.length], fillOpacity:.18, weight:2 }),
      onEachFeature: (f, l) => {
        l.bindPopup(mkPopup("🏙 " + f.properties.nama, "GeoJSON Layer", "#00e5ff"));
        l.bindTooltip(f.properties.nama, { permanent:true, direction:"center", className:"" });
        l.on("mouseover", function() { this.setStyle({ fillOpacity:.45 }); });
        l.on("mouseout",  function() { geoLayer.resetStyle(this); });
      }
    }).addTo(map);
    document.getElementById("hGj").classList.add("on");
    toast("GeoJSON Jakarta dimuat","ok");
  } else {
    if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
    document.getElementById("hGj").classList.remove("on");
  }
};

// Minimap
window.toggleMinimap = function(on) {
  if (on) {
    const ml = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains:"abcd" });
    miniCtr = new L.Control.MiniMap(ml, { toggleDisplay:true, width:130, height:95 }).addTo(map);
  } else if (miniCtr) { map.removeControl(miniCtr); miniCtr = null; }
};

// Grid Koordinat
window.toggleGrid = function(on) {
  if (on) {
    gridLayer = L.layerGroup();
    function drawGrid() {
      gridLayer.clearLayers();
      const b = map.getBounds(), step = .05;
      for (let la = Math.floor(b.getSouth()/step)*step; la <= b.getNorth(); la += step)
        L.polyline([[la,b.getWest()],[la,b.getEast()]], { color:"#1e2e47", weight:1, opacity:.55, interactive:false }).addTo(gridLayer);
      for (let ln = Math.floor(b.getWest()/step)*step; ln <= b.getEast(); ln += step)
        L.polyline([[b.getSouth(),ln],[b.getNorth(),ln]], { color:"#1e2e47", weight:1, opacity:.55, interactive:false }).addTo(gridLayer);
    }
    drawGrid(); map.on("moveend", drawGrid); gridLayer.addTo(map);
  } else {
    if (gridLayer) { map.removeLayer(gridLayer); gridLayer = null; }
    map.off("moveend");
  }
};

// Image Overlay
window.toggleImageOverlay = function(on) {
  if (on) {
    const b = [[-6.3,106.7],[-6.1,106.9]];
    imgOverlay = L.imageOverlay(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Jakartamap.jpg/320px-Jakartamap.jpg",
      b, { opacity:.55, interactive:true }
    ).addTo(map).bindPopup(mkPopup("🖼 Image Overlay","Peta Administratif Jakarta","#ff6b35"));
    map.fitBounds(b);
    toast("Image overlay ditambahkan","ok");
  } else {
    if (imgOverlay) { map.removeLayer(imgOverlay); imgOverlay = null; }
  }
};

// Layer Control Panel
window.addLayerControl = function() {
  if (layerCtr) map.removeControl(layerCtr);
  const base = {
    "🌑 Dark":     L.tileLayer(TILES.dark[0],      { attribution:TILES.dark[1],      ...TILES.dark[2] }),
    "🛰 Satellite": L.tileLayer(TILES.satellite[0], { attribution:TILES.satellite[1], ...TILES.satellite[2] }),
    "🗺 OSM":       L.tileLayer(TILES.osm[0],       { attribution:TILES.osm[1],       ...TILES.osm[2] }),
  };
  const ovs = {};
  if (geoLayer)  ovs["🌐 GeoJSON"]  = geoLayer;
  if (heatLayer) ovs["🔥 Heatmap"] = heatLayer;
  layerCtr = L.control.layers(base, ovs, { position:"topright", collapsed:false }).addTo(map);
  toast("Layer Control Panel ditambahkan","ok");
};
window.removeLayerControl = function() {
  if (layerCtr) { map.removeControl(layerCtr); layerCtr = null; }
};

/* ═══════════════════════════════════════════
   DRAW TOOLS
═══════════════════════════════════════════ */
window.draw = function(type) {
  if (type === "delete") { new L.EditToolbar.Delete(map, { featureGroup:drawnItems }).enable(); return; }
  let h;
  if (type==="polyline")  h = new L.Draw.Polyline(map,   { shapeOptions:{ color:warna.p, weight:3 } });
  if (type==="polygon")   h = new L.Draw.Polygon(map,    { shapeOptions:{ color:warna.p, fillOpacity:.2 } });
  if (type==="rectangle") h = new L.Draw.Rectangle(map,  { shapeOptions:{ color:warna.p } });
  if (type==="circle")    h = new L.Draw.Circle(map,     { shapeOptions:{ color:warna.c } });
  if (type==="marker")    h = new L.Draw.Marker(map);
  if (h) { h.enable(); document.getElementById("hDr").classList.add("on"); toast("Draw mode: " + type,"info"); }
};

/* ═══════════════════════════════════════════
   ANIMASI & FLY
═══════════════════════════════════════════ */
window.doFlyTo = function() {
  const v = document.getElementById("flyInp").value.split(",").map(Number);
  if (v.length < 2 || isNaN(v[0])) { toast("Format: lat,lng,zoom","err"); return; }
  map.flyTo([v[0],v[1]], v[2]||13, { duration:2, easeLinearity:.3 });
};
window.doPanTo = function() {
  const v = document.getElementById("flyInp").value.split(",").map(Number);
  if (isNaN(v[0])) { toast("Format: lat,lng","err"); return; }
  map.panTo([v[0],v[1]], { animate:true, duration:1 });
};
window.resetView = function() { map.flyTo([-6.2088,106.8456], 12, { duration:1.5 }); };
window.doBounce = function() {
  if (!markerSaya) { toast("Deteksi GPS dulu!","err"); return; }
  let up = true, n = 0;
  const base = markerSaya.getLatLng();
  if (animInt) clearInterval(animInt);
  animInt = setInterval(() => {
    markerSaya.setLatLng([base.lat + (up ? .001 : 0), base.lng]);
    up = !up; n++;
    if (n > 12) { clearInterval(animInt); markerSaya.setLatLng(base); }
  }, 100);
};
window.doSpin = function() {
  const c = map.getCenter(); let a = 0;
  if (animInt) clearInterval(animInt);
  animInt = setInterval(() => {
    a += 8;
    map.panTo([c.lat + .04*Math.sin(a*Math.PI/180), c.lng + .04*Math.cos(a*Math.PI/180)], { animate:false });
    if (a >= 360) { clearInterval(animInt); map.panTo([c.lat,c.lng]); }
  }, 25);
};
window.doPathAnim = function() {
  const c = map.getCenter();
  const pts = Array.from({length:36}, (_,i) => { const a = i*10*Math.PI/180; return [c.lat+.05*Math.sin(a), c.lng+.05*Math.cos(a)]; });
  const m = L.marker(pts[0], { icon:mkIcon("🚗","#ff6b35",28) }).addTo(map);
  let i = 0;
  if (animInt) clearInterval(animInt);
  animInt = setInterval(() => {
    i = (i+1) % pts.length;
    m.setLatLng(pts[i]);
    if (i === pts.length-1) { clearInterval(animInt); setTimeout(() => map.removeLayer(m), 200); }
  }, 55);
};

/* ═══════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════ */
window.exportGeoJSON = function() {
  const feats = [];
  shapes.forEach(s => { try { const gj = s.lyr.toGeoJSON?.(); if(gj) feats.push({...gj,properties:{name:s.nm}}); } catch(e){} });
  tujuan.forEach(t => feats.push({ type:"Feature", properties:{ nama:t.nama, kategori:t.kategori }, geometry:{ type:"Point", coordinates:[t.lng,t.lat] } }));
  const blob = new Blob([JSON.stringify({type:"FeatureCollection",features:feats},null,2)], { type:"application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leafletmap.geojson"; a.click();
  toast("GeoJSON diexport!","ok");
};
window.salinKoord = function() {
  if (myLat === null) { toast("Deteksi GPS dulu!","err"); return; }
  navigator.clipboard?.writeText(`${myLat.toFixed(6)}, ${myLng.toFixed(6)}`);
  toast("Koordinat disalin!","ok");
};

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function haversine(la1, ln1, la2, ln2) {
  const R = 6371000, f1 = la1*Math.PI/180, f2 = la2*Math.PI/180;
  const df = (la2-la1)*Math.PI/180, dl = (ln2-ln1)*Math.PI/180;
  const a  = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function fmtJarak(m) { return m >= 1000 ? (m/1000).toFixed(1) + " km" : Math.round(m) + " m"; }
function mkPopup(title, body, clr = "#00e5ff") {
  return `<div style="min-width:170px;font-family:'Nunito',sans-serif">
    <div style="font-family:'Oxanium',sans-serif;font-size:.95rem;font-weight:700;color:${clr};margin-bottom:4px">${title}</div>
    <div style="font-size:.75rem;color:#6b80a0;line-height:1.65">${body}</div>
  </div>`;
}
function logEv(type, msg, cls = "") {
  if (evPause) return;
  const log = document.getElementById("evlog");
  const t = new Date().toLocaleTimeString("id",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const d = document.createElement("div");
  d.className = `evl ${cls}`;
  d.innerHTML = `<span>[${t}]</span> ${msg}`;
  log.insertBefore(d, log.firstChild);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

/* ═══════════════════════════════════════════
   TABS & EVENT LOG
═══════════════════════════════════════════ */
const tabMap = { gps:0, fb:1, dest:2, layers:3, shapes:4, tools:5, events:6 };
window.T = function(nm) {
  document.querySelectorAll(".pnl").forEach(p => p.classList.remove("on"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("on"));
  document.getElementById("pnl-" + nm)?.classList.add("on");
  document.querySelectorAll(".tab")[tabMap[nm]]?.classList.add("on");
};
window.toggleEvPause = function() {
  evPause = !evPause;
  document.getElementById("btnEvPause").textContent = evPause ? "▶ Resume" : "⏸ Pause";
  toast(evPause ? "Event log dijeda" : "Event log dilanjutkan","info");
};

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
window.toast = function(msg, type = "info", dur = 3000) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.className = "show " + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = "", dur);
};

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.getElementById("hGPS").classList.add("warn");
toast("Buka tab 🔥 Firebase → hubungkan, lalu 📡 GPS → deteksi posisi Anda!", "info", 5000);
