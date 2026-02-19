/* ================================================================
   script.js — Template Undangan Digital
   ================================================================
   PETUNJUK EDIT:
   Semua data undangan ada di dalam objek UNDANGAN_CONFIG di bawah.
   Anda HANYA perlu mengubah nilai di bagian CONFIG ini.
   Jangan ubah kode di luar CONFIG kecuali Anda mengerti.
   ================================================================ */

const UNDANGAN_CONFIG = {

  /* ----------------------------------------------------------
     DATA MEMPELAI
     ---------------------------------------------------------- */
  mempelaiPria: {
    namaLengkap : "Muhammad Raka Pratama",
    namaPanggil : "Raka",
  },

  mempelaiWanita: {
    namaLengkap : "Adinda Sari Dewi",
    namaPanggil : "Dinda",
  },

  /* ----------------------------------------------------------
     DATA ACARA — isi angka saja, tidak perlu format khusus

     bulan  : 1 = Januari     7 = Juli
               2 = Februari    8 = Agustus
               3 = Maret       9 = September
               4 = April      10 = Oktober
               5 = Mei        11 = November
               6 = Juni       12 = Desember

     jamMulai   : format 24 jam. pukul 08.00 → isi 8
                                  pukul 14.00 → isi 14
     menitMulai : biasanya 0. Jika pukul 08.30 → isi 30
     ---------------------------------------------------------- */
  acara: {
    tahun      : 2026,  // <- UBAH: tahun acara
    bulan      : 8,     // <- UBAH: bulan acara (1-12)
    tanggal    : 15,    // <- UBAH: tanggal acara (1-31)
    jamMulai   : 8,     // <- UBAH: jam dimulainya countdown berhenti (format 24 jam)
    menitMulai : 0,     // <- UBAH: menit dimulai (0-59)

    akad: {
      jamTampil : "08.00 - 10.00 WIB",  // <- teks jam akad yang tampil di halaman
    },
    resepsi: {
      jamTampil : "11.00 - 14.00 WIB",  // <- teks jam resepsi yang tampil di halaman
    },
  },

  /* ----------------------------------------------------------
     LOKASI ACARA
     linkMaps: salin dari Google Maps → klik Share → Copy Link
     ---------------------------------------------------------- */
  lokasi: {
    nama    : "Gedung Serbaguna Bumi Asri",
    alamat  : "Jl. Mawar No. 45, Kota Bandung, Jawa Barat 40123",
    linkMaps: "https://maps.app.goo.gl/contoh",  // <- UBAH INI
  },

  /* ----------------------------------------------------------
     WHATSAPP SHARE
     nomor: nomor HP tujuan dengan kode negara, tanpa + atau spasi
     Contoh Indonesia: 6281234567890
     Kosongkan ("") jika ingin tamu pilih kontak sendiri
     ---------------------------------------------------------- */
  whatsapp: {
    nomor : "6281234567890",  // <- UBAH INI
    pesan : "Assalamu'alaikum\n\nDengan penuh kebahagiaan, kami mengundang Bapak/Ibu/Saudara/i ke acara pernikahan kami.\n\nSilakan buka undangan digital kami di:\n",
  },

  /* ----------------------------------------------------------
     MUSIK LATAR — pilih salah satu opsi:

     OPSI 1 - file lokal (taruh .mp3 di folder yang sama):
       musikUrl: "musik.mp3",

     OPSI 2 - link online (langsung jalan, tidak perlu download):
       musikUrl: "https://cdn.pixabay.com/audio/2022/03/15/audio_7aa3f38e66.mp3",

     OPSI 3 - nonaktifkan musik:
       musikUrl: "",
     ---------------------------------------------------------- */
  musikUrl: "https://cdn.pixabay.com/audio/2022/03/15/audio_7aa3f38e66.mp3",

  /* ----------------------------------------------------------
     LINK UNDANGAN
     Isi setelah website di-upload ke hosting.
     Digunakan oleh tombol "Salin Link" dan "Bagikan ke WhatsApp".
     Contoh: "https://undangan.namadomain.com"
     ---------------------------------------------------------- */
  linkUndangan: "https://undangan.namadomain.com",  // <- UBAH setelah upload

  /* ----------------------------------------------------------
     TAHUN (untuk footer)
     ---------------------------------------------------------- */
  tahun: "2025",

};

/* ================================================================
   JANGAN UBAH KODE DI BAWAH INI KECUALI ANDA MENGERTI
   ================================================================ */

/* ── Nama hari & bulan dalam Bahasa Indonesia ───────────────── */
const NAMA_HARI  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const NAMA_BULAN = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];

/* ── Bangun objek Date dari CONFIG (aman di semua browser) ───── */
function buatTanggalAcara() {
  const a = UNDANGAN_CONFIG.acara;
  // new Date(tahun, bulan-1, tanggal, jam, menit, detik)
  // bulan dikurangi 1 karena JavaScript menghitung bulan mulai dari 0
  return new Date(a.tahun, a.bulan - 1, a.tanggal, a.jamMulai, a.menitMulai, 0);
}

/* ── Format tanggal otomatis → contoh: "Sabtu, 12 Juli 2025" ── */
function formatTanggalTampil(dateObj) {
  const hari  = NAMA_HARI[dateObj.getDay()];
  const tgl   = dateObj.getDate();
  const bulan = NAMA_BULAN[dateObj.getMonth()];
  const tahun = dateObj.getFullYear();
  return hari + ", " + tgl + " " + bulan + " " + tahun;
}

/* ── Inisialisasi semua konten dari CONFIG ───────────────────── */
function initKonten() {
  const c      = UNDANGAN_CONFIG;
  const pria   = c.mempelaiPria;
  const wanita = c.mempelaiWanita;
  const acara  = c.acara;
  const lokasi = c.lokasi;

  // Buat teks tanggal otomatis dari angka di CONFIG
  const tglObj    = buatTanggalAcara();
  const tglTampil = formatTanggalTampil(tglObj);

  // Nama mempelai
  const namaGabung = pria.namaPanggil + " & " + wanita.namaPanggil;
  setEl("nama-pria",    pria.namaLengkap);
  setEl("nama-wanita",  wanita.namaLengkap);
  setEl("footer-names", namaGabung);
  setEl("footer-tahun", c.tahun);

  // Judul tab browser
  document.title = "Undangan Pernikahan | " + namaGabung;

  // Detail acara
  setEl("tanggal-akad",    tglTampil);
  setEl("tanggal-resepsi", tglTampil);
  setEl("jam-akad",        acara.akad.jamTampil);
  setEl("jam-resepsi",     acara.resepsi.jamTampil);

  // Lokasi
  setEl("nama-lokasi",   lokasi.nama);
  setEl("alamat-lokasi", lokasi.alamat);
  var btnMaps = document.getElementById("btn-maps");
  if (btnMaps) btnMaps.href = lokasi.linkMaps;

  // Musik — set src hanya jika ada URL
  var audio = document.getElementById("audio-musik");
  if (audio && c.musikUrl) {
    audio.src = c.musikUrl;
    audio.load();
  }
}

/* ── Helper: set teks elemen berdasarkan id ─────────────────── */
function setEl(id, teks) {
  var el = document.getElementById(id);
  if (el) el.textContent = teks;
}

/* ── Buka Undangan ──────────────────────────────────────────── */
function bukaUndangan() {
  var overlay  = document.getElementById("cover-overlay");
  var main     = document.getElementById("main-content");
  var btnMusik = document.getElementById("btn-musik");
  var audio    = document.getElementById("audio-musik");

  // Animasi fade-out cover
  overlay.classList.add("fade-out");
  overlay.addEventListener("animationend", function() {
    overlay.classList.add("hidden");
  }, { once: true });

  // Tampilkan konten utama
  main.classList.remove("hidden");
  btnMusik.classList.remove("hidden");

  // Putar musik (browser mungkin blokir autoplay, tombol musik tetap bisa dipakai)
  if (UNDANGAN_CONFIG.musikUrl) {
    audio.play().catch(function() {});
    document.getElementById("icon-play").classList.add("hidden");
    document.getElementById("icon-pause").classList.remove("hidden");
  }

  // Aktifkan animasi scroll
  initScrollObserver();

  // Mulai countdown SETELAH konten terlihat
  initCountdown();

  // Scroll ke atas
  window.scrollTo({ top: 0 });
}

/* ── Toggle Musik ───────────────────────────────────────────── */
function toggleMusik() {
  var audio     = document.getElementById("audio-musik");
  var iconPlay  = document.getElementById("icon-play");
  var iconPause = document.getElementById("icon-pause");

  if (audio.paused) {
    audio.play();
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
  } else {
    audio.pause();
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
  }
}

/* ── Countdown Timer ────────────────────────────────────────── */
var _countdownTimer = null; // referensi timer, cegah dobel interval

function initCountdown() {
  if (_countdownTimer) {
    clearInterval(_countdownTimer);
    _countdownTimer = null;
  }

  var targetWaktu = buatTanggalAcara().getTime();

  // Cek dulu: apakah tanggal acara sudah lewat?
  if (targetWaktu <= Date.now()) {
    console.warn(
      "[UNDANGAN] Tanggal acara sudah lewat!\n" +
      "Buka script.js dan ubah: tahun, bulan, tanggal di bagian CONFIG."
    );
    // Tampilkan tanda tanya agar tahu ada yang perlu diubah
    setEl("cd-hari",  "??");
    setEl("cd-jam",   "??");
    setEl("cd-menit", "??");
    setEl("cd-detik", "??");
    return;
  }

  function hitungMundur() {
    var selisih = targetWaktu - Date.now();

    if (selisih <= 0) {
      setEl("cd-hari",  "00");
      setEl("cd-jam",   "00");
      setEl("cd-menit", "00");
      setEl("cd-detik", "00");
      clearInterval(_countdownTimer);
      return;
    }

    var hari  = Math.floor(selisih / 86400000);
    var jam   = Math.floor((selisih % 86400000) / 3600000);
    var menit = Math.floor((selisih % 3600000)  / 60000);
    var detik = Math.floor((selisih % 60000)    / 1000);

    setEl("cd-hari",  padNol(hari));
    setEl("cd-jam",   padNol(jam));
    setEl("cd-menit", padNol(menit));
    setEl("cd-detik", padNol(detik));
  }

  hitungMundur();
  _countdownTimer = setInterval(hitungMundur, 1000);
}

function padNol(angka) {
  return String(angka).padStart(2, "0");
}

/* ── Animasi Scroll (Intersection Observer) ─────────────────── */
function initScrollObserver() {
  var elemen   = document.querySelectorAll(".fade-in-up");
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  elemen.forEach(function(el) { observer.observe(el); });
}

/* ── Kirim Ucapan ───────────────────────────────────────────── */
function kirimUcapan() {
  var inputNama  = document.getElementById("input-nama");
  var inputPesan = document.getElementById("input-pesan");
  var listUcapan = document.getElementById("ucapan-list");

  var nama  = inputNama.value.trim();
  var pesan = inputPesan.value.trim();

  if (!nama || !pesan) {
    alert("Mohon isi nama dan ucapan Anda terlebih dahulu.");
    return;
  }

  var item = document.createElement("div");
  item.className = "ucapan-item";
  item.innerHTML =
    '<p class="ucapan-pengirim">' + escapeHTML(nama)  + '</p>' +
    '<p class="ucapan-teks">'     + escapeHTML(pesan) + '</p>';

  listUcapan.prepend(item);
  inputNama.value  = "";
  inputPesan.value = "";
  listUcapan.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ── Escape HTML (cegah XSS) ────────────────────────────────── */
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ── Bagikan ke WhatsApp ────────────────────────────────────── */
function bagikanWA() {
  var c     = UNDANGAN_CONFIG;
  var link  = c.linkUndangan || window.location.href;
  var pesan = encodeURIComponent(c.whatsapp.pesan + link);
  var nomor = c.whatsapp.nomor;
  var url   = nomor
    ? "https://wa.me/" + nomor + "?text=" + pesan
    : "https://wa.me/?text=" + pesan;

  window.open(url, "_blank", "noopener,noreferrer");
}

/* ── Salin Link (dengan fallback untuk file://) ─────────────── */
function salinLink() {
  var btnCopy  = document.querySelector(".btn-copy");
  var copyText = document.getElementById("copy-text");
  var link     = UNDANGAN_CONFIG.linkUndangan || window.location.href;

  function feedbackBerhasil() {
    btnCopy.classList.add("copied");
    copyText.textContent = "Tersalin! v";
    setTimeout(function() {
      btnCopy.classList.remove("copied");
      copyText.textContent = "Salin Link";
    }, 2200);
  }

  function fallbackCopy() {
    var textarea = document.createElement("textarea");
    textarea.value = link;
    textarea.style.cssText = "position:fixed;top:-999px;left:-999px;opacity:0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      feedbackBerhasil();
    } catch(e) {
      // Tampilkan link jika semua cara gagal
      prompt("Salin link di bawah ini:", link);
    }
    document.body.removeChild(textarea);
  }

  // Clipboard API modern hanya jalan di HTTPS / localhost
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link).then(feedbackBerhasil).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

/* ── Jalankan saat halaman siap ─────────────────────────────── */
document.addEventListener("DOMContentLoaded", function() {
  initKonten();
  // initCountdown dipanggil di bukaUndangan() setelah konten tampil
});