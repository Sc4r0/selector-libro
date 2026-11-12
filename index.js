// Goodreads retired shelf RSS feeds (list_rss) in late 2026. Two sources remain:
//  1. The public shelf widget: a <script> that needs no login or CORS, but returns a fixed subset of the
//     profile (10–100 books seen) and ignores ?shelf= and ?num_books=. Best effort only.
//  2. The "Export Library" CSV: the whole library, uploaded by the user and parsed locally.

const WIDGET_URL = "https://www.goodreads.com/review/custom_widget/";
// Don't pass widget_id: Goodreads then suffixes every class name with it AND returns different (fewer) books.
// Without it the widget writes into #gr_custom_widget_.
const WIDGET_TARGET_ID = "gr_custom_widget_";
const WIDGET_MAX_BOOKS = 100;
const WIDGET_TIMEOUT_MS = 15000;
const DEFAULT_SHELF = "to-read";

const STORAGE_KEY = "book_source";
const LEGACY_STORAGE_KEY = "rss_url";

const SHELF_LABELS = {
    "to-read": "Want to Read",
    "currently-reading": "Currently Reading",
    read: "Read",
};

let books = [];
let currentBook = null;
let csvRows = null; // parsed rows of the CSV waiting for a shelf to be chosen
let csvFileName = "";

const $ = (id) => document.getElementById(id);

// ---------- Storage ----------

function readStoredSource() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);

        // Migrate the RSS link saved by older versions to the widget source
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            const parsed = parseShelfLink(legacy);
            if (parsed) return { type: "link", ...parsed };
        }
    } catch {
        // Storage unavailable or corrupt: start fresh
    }
    return null;
}

function writeStoredSource(source) {
    try {
        if (source) localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable (private mode, quota): the app still works for this session
    }
}

// ---------- UI helpers ----------

function toggleVisibility(elementId, hide) {
    $(elementId).classList.toggle("d-none", hide);
}

function showInputView() {
    toggleVisibility("random", true);
    toggleVisibility("enlace", false);
}

function showBooksView() {
    toggleVisibility("enlace", true);
    toggleVisibility("random", false);
    window.scrollTo(0, 0);
}

function selectMethod(method) {
    for (const tab of document.querySelectorAll("[role=tab][data-method]")) {
        const selected = tab.dataset.method === method;
        tab.setAttribute("aria-selected", String(selected));
        toggleVisibility(tab.getAttribute("aria-controls"), !selected);
    }
}

function setImage(id, src) {
    const img = $(id);
    if (src) {
        // Covers may be missing (e.g. Open Library has no cover for that ISBN): hide instead of a broken icon
        img.onerror = () => img.classList.add("d-none");
        img.src = src;
        img.classList.remove("d-none");
    } else {
        img.removeAttribute("src");
        img.classList.add("d-none");
    }
}

function setLoading(isLoading) {
    $("syncButton").disabled = isLoading;
    $("syncSpinner").classList.toggle("d-none", !isLoading);
    $("syncLabel").textContent = isLoading ? "Cargando…" : "Cargar libros";
    $("goodreadsListLink").disabled = isLoading;
}

function showLinkError(message) {
    $("goodreadsListLink").classList.add("is-invalid");
    $("linkFeedback").textContent = message;
}

function showCsvError(message) {
    $("csvDrop").classList.toggle("is-invalid", Boolean(message));
    $("csvFeedback").textContent = message;
}

function clearErrors() {
    $("goodreadsListLink").classList.remove("is-invalid");
    showCsvError("");
}

function clearBookDisplay() {
    books = [];
    currentBook = null;
    $("bookCount").textContent = "0";
    $("sourceInfo").textContent = "";
    $("lastSyncedBook").textContent = "";
    $("randomBook").textContent = "";
    toggleVisibility("limitNotice", true);
    setImage("lastSyncedBookImg", "");
    setImage("bookImg", "");
    $("goodreadsLink").classList.add("d-none");
    $("randomBookButton").disabled = true;
}

function shelfLabel(shelf) {
    return SHELF_LABELS[shelf] ? `${SHELF_LABELS[shelf]} (${shelf})` : shelf;
}

// ---------- Method 1: shelf link → widget ----------

// Accepts shelf links (/review/list/ID-name?shelf=X, also the old /list_rss/ form),
// profile links (/user/show/ID-name) and a bare user ID. Returns { userId, shelf } or null.
function parseShelfLink(input) {
    const value = input.trim();
    if (/^\d+$/.test(value)) return { userId: value, shelf: DEFAULT_SHELF };

    let url;
    try {
        url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
        return null;
    }
    if (!/(^|\.)goodreads\.com$/i.test(url.hostname)) return null;

    const match = /^\/(?:review\/(?:list|list_rss|custom_widget)|user\/show)\/(\d+)/i.exec(url.pathname);
    if (!match) return null;

    return { userId: match[1], shelf: url.searchParams.get("shelf") || DEFAULT_SHELF };
}

// Loads the widget script and returns its HTML. The script assigns `var widget_code = '…'`
// and puts it into #gr_custom_widget_, which is a <template> so nothing gets rendered.
function fetchWidgetHtml(userId, shelf) {
    return new Promise((resolve, reject) => {
        const target = $(WIDGET_TARGET_ID);
        target.innerHTML = "";
        window.widget_code = undefined;

        const script = document.createElement("script");
        const params = new URLSearchParams({
            shelf,
            num_books: WIDGET_MAX_BOOKS,
            _: Date.now(), // avoid a stale cached copy
        });
        script.src = `${WIDGET_URL}${encodeURIComponent(userId)}?${params}`;

        const finish = (error, html) => {
            clearTimeout(timer);
            script.remove();
            if (error) reject(error);
            else resolve(html);
        };
        const unreachable = () =>
            new Error("No se pudo contactar con Goodreads. Comprueba tu conexión y, si usas un bloqueador de anuncios, desactívalo para esta página.");
        const timer = setTimeout(() => finish(unreachable()), WIDGET_TIMEOUT_MS);

        script.onload = () => finish(null, typeof window.widget_code === "string" ? window.widget_code : target.innerHTML);
        script.onerror = () => finish(unreachable());
        document.head.append(script);
    });
}

function cleanGoodreadsUrl(href) {
    try {
        const url = new URL(href, "https://www.goodreads.com");
        url.searchParams.delete("utm_medium");
        url.searchParams.delete("utm_source");
        return url.toString();
    } catch {
        return "";
    }
}

function parseWidgetBooks(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Match class prefixes: Goodreads appends the widget id (if any) to every class name
    const part = (name) => `[class^="gr_custom_${name}_"]`;
    return [...doc.querySelectorAll(part("each_container"))].map((item) => {
        const titleLink = item.querySelector(`${part("title")} a`);
        const cover = item.querySelector(`${part("book_container")} img`)?.getAttribute("src") || "";
        return {
            title: titleLink?.textContent.trim() || "Sin título",
            author: item.querySelector(`${part("author")} a`)?.textContent.trim() || "Autor desconocido",
            // Strip Goodreads size suffixes like "._SY75_." to get the full-size cover
            cover: cover.replace(/\._S[XY]\d+_\./, "."),
            link: cleanGoodreadsUrl(titleLink?.getAttribute("href") || ""),
        };
    });
}

async function fetchWidgetBooks({ userId, shelf }) {
    const html = await fetchWidgetHtml(userId, shelf);
    if (/widget is not correct/i.test(html)) {
        throw new Error("Goodreads no reconoce ese perfil. Revisa que el enlace sea el de tu estantería y que tu perfil sea público.");
    }
    const result = parseWidgetBooks(html);
    if (result.length === 0) {
        throw new Error(`Goodreads no devolvió ningún libro para este perfil. Comprueba que tu perfil sea público o usa la opción 2 (CSV).`);
    }
    return result;
}

async function loadFromLink(source) {
    setLoading(true);
    clearErrors();
    try {
        const result = await fetchWidgetBooks(source);
        writeStoredSource(source);
        showBooks(result, source);
        return true;
    } catch (error) {
        console.error("Error fetching books:", error);
        showLinkError(`No se pudo cargar la lista: ${error.message}`);
        return false;
    } finally {
        setLoading(false);
    }
}

async function syncList(event) {
    event?.preventDefault();

    const source = parseShelfLink($("goodreadsListLink").value);
    if (!source) {
        showLinkError("Ese enlace no parece de Goodreads. Copia la dirección de tu estantería, p. ej. https://www.goodreads.com/review/list/12345678-tu-nombre?shelf=to-read");
        return;
    }

    if (await loadFromLink({ type: "link", ...source })) {
        showBooksView();
    }
}

// ---------- Method 2: CSV export ----------

// RFC 4180 parser: handles quoted fields with commas, "" escapes and line breaks (reviews often have them)
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }

    const [header = [], ...data] = rows;
    const keys = header.map((name) => name.replace(/^﻿/, "").trim());
    return data
        .filter((cells) => cells.some((cell) => cell.trim()))
        .map((cells) => Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""])));
}

// Goodreads writes ISBNs as ="0123456789" so spreadsheets keep leading zeros
function cleanIsbn(value) {
    return (value || "").replace(/[^0-9X]/gi, "");
}

function shelvesOf(row) {
    const shelves = new Set((row["Bookshelves"] || "").split(",").map((s) => s.trim()).filter(Boolean));
    if (row["Exclusive Shelf"]) shelves.add(row["Exclusive Shelf"].trim());
    return shelves;
}

function csvRowToBook(row) {
    const isbn = cleanIsbn(row["ISBN13"]) || cleanIsbn(row["ISBN"]);
    return {
        title: row["Title"]?.trim() || "Sin título",
        author: row["Author"]?.trim() || "Autor desconocido",
        cover: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : "",
        link: row["Book Id"] ? `https://www.goodreads.com/book/show/${encodeURIComponent(row["Book Id"].trim())}` : "",
        added: row["Date Added"] || "", // yyyy/mm/dd, sorts correctly as text
    };
}

function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function handleCsvFile(file) {
    clearErrors();
    csvRows = null;
    toggleVisibility("csvShelfRow", true);
    if (!file) return;

    csvFileName = file.name;
    $("csvFileName").textContent = file.name;

    let rows;
    try {
        rows = parseCsv(await readFileText(file));
    } catch (error) {
        console.error("Error reading CSV:", error);
        showCsvError("No se pudo leer el archivo. Vuelve a descargarlo de Goodreads e inténtalo de nuevo.");
        return;
    }

    if (!rows.length || !("Title" in rows[0]) || !("Exclusive Shelf" in rows[0])) {
        showCsvError("Este archivo no parece una exportación de Goodreads. Sube goodreads_library_export.csv tal cual lo descargaste, sin abrirlo en Excel antes.");
        return;
    }

    const counts = new Map();
    for (const row of rows) {
        for (const shelf of shelvesOf(row)) counts.set(shelf, (counts.get(shelf) || 0) + 1);
    }

    // Built-in shelves first (Want to Read on top), then custom shelves alphabetically
    const order = Object.keys(SHELF_LABELS);
    const shelves = [...counts.keys()].sort((a, b) => {
        const ia = order.includes(a) ? order.indexOf(a) : order.length;
        const ib = order.includes(b) ? order.indexOf(b) : order.length;
        return ia - ib || a.localeCompare(b);
    });

    const select = $("csvShelf");
    select.replaceChildren(
        ...shelves.map((shelf) => new Option(`${shelfLabel(shelf)} — ${counts.get(shelf)} libros`, shelf)),
        new Option(`Toda la biblioteca — ${rows.length} libros`, "")
    );
    select.value = counts.has(DEFAULT_SHELF) ? DEFAULT_SHELF : shelves[0] ?? "";

    csvRows = rows;
    toggleVisibility("csvShelfRow", false);
    select.focus();
}

function importCsv(event) {
    event.preventDefault();
    if (!csvRows) {
        showCsvError("Primero elige el archivo goodreads_library_export.csv.");
        return;
    }

    const shelf = $("csvShelf").value;
    const result = csvRows
        .filter((row) => !shelf || shelvesOf(row).has(shelf))
        .map(csvRowToBook)
        .sort((a, b) => b.added.localeCompare(a.added));

    if (result.length === 0) {
        showCsvError("Esa estantería no tiene libros.");
        return;
    }

    const source = { type: "csv", shelf, fileName: csvFileName, importedAt: new Date().toISOString(), books: result };
    writeStoredSource(source);
    showBooks(result, source);
    showBooksView();
}

function setupDropZone() {
    const zone = $("csvDrop");
    zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-dragging");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
    zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragging");
        handleCsvFile(event.dataTransfer.files[0]);
    });
}

// ---------- Display ----------

function describeBook(book) {
    return `${book.title} - ${book.author}`;
}

function describeSource(source) {
    if (source.type === "csv") {
        const shelf = source.shelf ? `Estantería «${shelfLabel(source.shelf)}»` : "Toda la biblioteca";
        const date = new Date(source.importedAt).toLocaleDateString("es-ES");
        return `${shelf}, importada de ${source.fileName || "un CSV"} el ${date}. Para actualizarla, exporta de nuevo y vuelve a subirla.`;
    }
    return `Libros del perfil de Goodreads ${source.userId}, cargados desde el enlace. Se actualiza cada vez que abres la página.`;
}

function showBooks(list, source) {
    books = list;
    currentBook = null;
    $("bookCount").textContent = books.length;
    $("sourceInfo").textContent = describeSource(source);
    toggleVisibility("limitNotice", source.type !== "link");
    displayLastSyncedBook(books[0]);
    $("randomBookButton").disabled = false;
    showRandomBook();
}

function displayLastSyncedBook(book) {
    $("lastSyncedBook").textContent = describeBook(book);
    setImage("lastSyncedBookImg", book.cover);
}

function showRandomBook() {
    if (books.length === 0) return;

    let randomBook;
    do {
        randomBook = books[Math.floor(Math.random() * books.length)];
    } while (books.length > 1 && randomBook === currentBook);
    currentBook = randomBook;

    $("randomBook").textContent = describeBook(randomBook);
    setImage("bookImg", randomBook.cover);

    const linkEl = $("goodreadsLink");
    if (randomBook.link) {
        linkEl.href = randomBook.link;
        linkEl.classList.remove("d-none");
    } else {
        linkEl.classList.add("d-none");
    }
}

// ---------- Actions ----------

function resetApp(method = "csv") {
    writeStoredSource(null);
    clearBookDisplay();
    clearErrors();
    csvRows = null;
    $("goodreadsListLink").value = "";
    $("csvFile").value = "";
    $("csvFileName").textContent = "Ningún archivo seleccionado";
    toggleVisibility("csvShelfRow", true);
    selectMethod(method);
    showInputView();
    (method === "csv" ? $("csvDrop") : $("goodreadsListLink")).scrollIntoView({ block: "center" });
    if (method === "link") $("goodreadsListLink").focus();
}

// ---------- Init ----------

(async function init() {
    $("syncForm").addEventListener("submit", syncList);
    $("csvForm").addEventListener("submit", importCsv);
    $("csvFile").addEventListener("change", (event) => handleCsvFile(event.target.files[0]));
    $("randomBookButton").addEventListener("click", showRandomBook);
    $("backButton").addEventListener("click", () => resetApp());
    for (const tab of document.querySelectorAll("[role=tab][data-method]")) {
        tab.addEventListener("click", () => selectMethod(tab.dataset.method));
    }
    for (const button of document.querySelectorAll("[data-goto]")) {
        button.addEventListener("click", () => {
            const method = button.dataset.goto;
            // From the books view, leave the current list; from the input view, just switch tabs
            if (!$("random").classList.contains("d-none")) return resetApp(method);
            selectMethod(method);
            $(`tab-${method}`).scrollIntoView({ block: "start", behavior: "smooth" });
        });
    }
    setupDropZone();

    const source = readStoredSource();
    if (source?.type === "csv" && Array.isArray(source.books) && source.books.length) {
        showBooks(source.books, source);
        showBooksView();
        return;
    }

    selectMethod(source?.type === "link" ? "link" : "csv");
    showInputView();
    if (source?.type === "link") {
        // Show the saved shelf in the input in case loading fails and the user needs to retry
        $("goodreadsListLink").value = `https://www.goodreads.com/review/list/${source.userId}?shelf=${encodeURIComponent(source.shelf)}`;
        if (await loadFromLink(source)) {
            showBooksView();
        }
    }
})();
