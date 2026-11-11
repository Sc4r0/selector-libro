const API_URL = "https://api.rss2json.com/v1/api.json?";
const API_KEY = "vn0imlu2ho24ibtwnbs3ty1ehavriko8wsqs5j6t";
const PAGE_SIZE = 1000;
// Safety cap: Goodreads paginates RSS feeds, so we walk pages until one adds nothing new
const MAX_PAGES = 20;
const STORAGE_KEY = "rss_url";

// Accepts shelf links such as https://www.goodreads.com/review/list/12345-name?shelf=to-read
// (http, www., m. and the already-converted /list_rss/ form are all allowed)
const SHELF_REGEX = /^https?:\/\/(www\.|m\.)?goodreads\.com\/review\/list(_rss)?\/\d+/i;

let books = [];
let currentBook = null;
let rssUrl = readStoredUrl();

const $ = (id) => document.getElementById(id);

// ---------- Storage ----------

function readStoredUrl() {
    try {
        return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
        return "";
    }
}

function writeStoredUrl(value) {
    try {
        if (value) localStorage.setItem(STORAGE_KEY, value);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable (private mode, blocked cookies): the app still works for this session
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
}

function setImage(id, src) {
    const img = $(id);
    if (src) {
        img.src = src;
        img.classList.remove("d-none");
    } else {
        img.removeAttribute("src");
        img.classList.add("d-none");
    }
}

function setLoading(isLoading) {
    const button = $("syncButton");
    button.disabled = isLoading;
    $("syncSpinner").classList.toggle("d-none", !isLoading);
    $("syncLabel").textContent = isLoading ? "Sincronizando…" : "Sincronizar libros";
    $("goodreadsListLink").disabled = isLoading;
}

function showError(message) {
    $("goodreadsListLink").classList.add("is-invalid");
    $("linkFeedback").textContent = message;
}

function clearError() {
    $("goodreadsListLink").classList.remove("is-invalid");
}

function clearBookDisplay() {
    books = [];
    currentBook = null;
    $("bookCount").textContent = "0";
    $("lastSyncedBook").textContent = "";
    $("randomBook").textContent = "";
    setImage("lastSyncedBookImg", "");
    setImage("bookImg", "");
    $("goodreadsLink").classList.add("d-none");
    $("randomBookButton").disabled = true;
}

// ---------- Book parsing ----------

function parseHtml(html) {
    return new DOMParser().parseFromString(html || "", "text/html");
}

function getBookCover(book) {
    const src = parseHtml(book.content || book.description).querySelector("img")?.getAttribute("src") || book.thumbnail || "";
    // Strip Goodreads size suffixes like "._SY75_." / "._SX50_." to get the full-size cover
    return src.replace(/\._S[XY]\d+_\./, ".");
}

function getBookAuthor(book) {
    const match = /author:\s*([^<]+)/i.exec(book.description || "");
    // Decode HTML entities (e.g. &amp;) via textContent
    return match ? parseHtml(match[1]).body.textContent.trim() : "Autor desconocido";
}

function getGoodreadsLink(book) {
    return parseHtml(book.description).querySelector("a[href]")?.getAttribute("href") || book.link || "";
}

function getBookTitle(book) {
    return parseHtml(book.title).body.textContent.trim() || "Sin título";
}

function describeBook(book) {
    return `${getBookTitle(book)} - ${getBookAuthor(book)}`;
}

// ---------- Fetching ----------

function buildPageUrl(feedUrl, page) {
    const url = new URL(feedUrl);
    if (page > 1) url.searchParams.set("page", page);
    else url.searchParams.delete("page");
    return url.toString();
}

async function fetchPage(feedUrl) {
    const response = await fetch(
        `${API_URL}${new URLSearchParams({
            rss_url: feedUrl,
            api_key: API_KEY,
            count: PAGE_SIZE,
        })}`
    );

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Error del servidor (${response.status}).`);
    }

    if (!response.ok || data.status !== "ok") {
        throw new Error(data?.message || `Error del servidor (${response.status}).`);
    }
    return data.items || [];
}

// Returns all books of the feed, following Goodreads pagination. Throws on failure.
async function fetchAllBooks(feedUrl) {
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= MAX_PAGES; page++) {
        let items;
        try {
            items = await fetchPage(buildPageUrl(feedUrl, page));
        } catch (error) {
            // A failing later page shouldn't throw away what we already have
            if (page > 1) break;
            throw error;
        }

        let added = 0;
        for (const item of items) {
            const key = item.guid || item.link || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                all.push(item);
                added++;
            }
        }
        // Empty page, or the feed ignored ?page= and returned the same items again
        if (added === 0) break;
    }

    if (all.length === 0) {
        throw new Error("No se encontraron libros en esta lista.");
    }
    return all;
}

// Loads the feed into the UI. Returns true on success.
async function loadBooks(feedUrl) {
    setLoading(true);
    clearError();
    try {
        const items = await fetchAllBooks(feedUrl);
        books = items;
        rssUrl = feedUrl;
        writeStoredUrl(feedUrl);

        $("bookCount").textContent = books.length;
        displayLastSyncedBook(books[0]);
        $("randomBookButton").disabled = false;
        showRandomBook();
        return true;
    } catch (error) {
        console.error("Error fetching books:", error);
        showError(`No se pudo cargar la lista: ${error.message}`);
        return false;
    } finally {
        setLoading(false);
    }
}

// ---------- Display ----------

function displayLastSyncedBook(book) {
    $("lastSyncedBook").textContent = describeBook(book);
    setImage("lastSyncedBookImg", getBookCover(book));
}

function showRandomBook() {
    if (books.length === 0) return;

    let randomBook;
    do {
        randomBook = books[Math.floor(Math.random() * books.length)];
    } while (books.length > 1 && randomBook === currentBook);
    currentBook = randomBook;

    $("randomBook").textContent = describeBook(randomBook);
    setImage("bookImg", getBookCover(randomBook));

    const link = getGoodreadsLink(randomBook);
    const linkEl = $("goodreadsLink");
    if (link) {
        linkEl.href = link;
        linkEl.classList.remove("d-none");
    } else {
        linkEl.classList.add("d-none");
    }
}

// ---------- Actions ----------

function toRssUrl(link) {
    const url = new URL(link);
    url.protocol = "https:";
    url.hostname = "www.goodreads.com";
    url.pathname = url.pathname.replace("/review/list/", "/review/list_rss/");
    return url.toString();
}

async function syncList(event) {
    event?.preventDefault();

    const link = $("goodreadsListLink").value.trim();
    if (!SHELF_REGEX.test(link)) {
        showError("Introduce un enlace válido de una estantería de Goodreads (p. ej. https://www.goodreads.com/review/list/12345?shelf=to-read).");
        return;
    }

    if (await loadBooks(toRssUrl(link))) {
        showBooksView();
    }
}

function resetApp() {
    writeStoredUrl("");
    rssUrl = "";
    clearBookDisplay();
    clearError();
    $("goodreadsListLink").value = "";
    showInputView();
    $("goodreadsListLink").focus();
}

// ---------- Init ----------

(async function init() {
    $("syncForm").addEventListener("submit", syncList);
    $("randomBookButton").addEventListener("click", showRandomBook);
    $("backButton").addEventListener("click", resetApp);

    if (!rssUrl) {
        showInputView();
        return;
    }

    // Show the saved link in the input in case loading fails and the user needs to retry
    $("goodreadsListLink").value = rssUrl.replace("/review/list_rss/", "/review/list/");
    showInputView();
    if (await loadBooks(rssUrl)) {
        showBooksView();
    }
})();
