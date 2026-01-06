/**
 * BOOK DATABASE
 * Units: millimeters
 */

/* ===============================
   1. LIBRI FISSI (MANUALI)
================================= */

const rawDataLocal = [
  {
    id: 1,
    title: "1984",
    author: "George Orwell",
    genre: "Dystopia",
    tags: ["Politics", "Surveillance"],
    height: 190,
    width: 18,
    color: "#333333"
  },
  {
    id: 2,
    title: "Animal Farm",
    author: "George Orwell",
    genre: "Satire",
    tags: ["Politics"],
    height: null,
    width: null,
    color: null
  }
];

/* ===============================
   2. DEFAULTS
================================= */

const DEFAULTS = {
  height: 210,
  width: 25,
  color: null
};

/* ===============================
   3. GOOGLE SHEET
================================= */

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGVuT_cchSHn8Gh_81CXE7msHuVSPR0n54faJLt2SZKcDCip_3qqpiiMcNNo1AlpK_HiMVZ7HPIPcA/pub?gid=1195727609&single=true&output=tsv";

let rawData = [...rawDataLocal]; // base iniziale

/* ===============================
   4. UTILS
================================= */

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
const headers = lines.shift().split("\t");

  return lines.map(line => {
    const values = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]?.trim() || "");
    return obj;
  });
}


function normalizeBook(row, index) {
  // raccoglie TUTTE le colonne che iniziano con "tags"
  const tagValues = Object.keys(row)
    .filter(k => k.toLowerCase().startsWith("tags"))
    .map(k => row[k])
    .filter(v => v && v !== "-" && v !== "");

  return {
    id: Number(row.id) || rawData.length + index + 1,
    title: row.title || "Senza titolo",
    author: row.author || "Autore sconosciuto",
    genre: row.genre || "Unknown",
    tags: tagValues
      .flatMap(t => t.split(","))
      .map(t => t.trim())
      .filter(Boolean),

    // conversione cm → mm
    height: Number(row["Fronte (cm)"]) 
      ? Number(row["Fronte (cm)"]) * 10
      : DEFAULTS.height,

    width: Number(row["Dorso (cm)"]) 
      ? Number(row["Dorso (cm)"]) * 10
      : DEFAULTS.width,

    color: row.color || DEFAULTS.color
  };
}


/* ===============================
   5. FETCH + MERGE
================================= */

async function loadBooksFromSheet() {
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();

    // 1. parse CSV
    const parsed = parseCSV(csv);
    

console.log(parsed.slice(0, 3));

    // 2. FILTRA RIGHE VUOTE (QUESTO È IL PUNTO GIUSTO)
const rows = parsed.filter(r =>
  Object.keys(r).some(k => k.trim().toLowerCase() === "title" && r[k].trim() !== "")
);

    // 3. normalizza
    const remoteBooks = rows.map(normalizeBook);

    // 4. merge con libri locali
    rawData = [...rawDataLocal, ...remoteBooks];

    // 5. espone globalmente
    window.rawData = rawData;

    // 6. notifica script.js
    document.dispatchEvent(new Event("booksLoaded"));

  } catch (e) {
    console.error("Errore Google Sheet", e);

    window.rawData = rawDataLocal;
    document.dispatchEvent(new Event("booksLoaded"));
  }
}


loadBooksFromSheet();
