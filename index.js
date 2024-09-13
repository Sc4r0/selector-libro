const API_URL = "https://api.rss2json.com/v1/api.json?";
const API_KEY = "vn0imlu2ho24ibtwnbs3ty1ehavriko8wsqs5j6t";

let books = [];
let rssUrl = localStorage.getItem("rss_url") || "";

// Utility function for DOM manipulation
function updateElementById(id, value) {
    document.getElementById(id).innerHTML = value;
}

// Async fetch function with error handling
async function fetchBooks(rssUrl) {
    try {
        const response = await fetch(
            `${API_URL}${new URLSearchParams({
                rss_url: rssUrl,
                api_key: API_KEY,
            })}`
        );

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            throw new Error("No books found.");
        }

        localStorage.setItem("rss_url", rssUrl);
        books = data.items;

        displayBookCount();
        displayLastSyncedBook(books[0]);
        enableRandomButton();
    } catch (error) {
        console.error("Error fetching books:", error.message);
    }
}

function displayBookCount() {
    updateElementById("bookCount", books.length);
}

function displayLastSyncedBook(book) {
    const { title } = book;
    const author = getBookAuthor(book);
    const coverImage = getBookCover(book);

    updateElementById("lastSyncedBook", `${title} - ${author}`);
    document.getElementById("lastSyncedBookImg").src = coverImage;
}

function enableRandomButton() {
    document.getElementById("randomBookButton").disabled = false;
}

function showRandomBook() {
    const randomBook = books[Math.floor(Math.random() * books.length)];
    const { title } = randomBook;
    const author = getBookAuthor(randomBook);
    const coverImage = getBookCover(randomBook);
    const goodreadsLink = getGoodreadsLink(randomBook);

    updateElementById("randomBook", `${title} - ${author}`);
    document.getElementById("bookImg").src = coverImage;
    document.getElementById("goodreadsLink").href = goodreadsLink;
}

// Extract book details with better readability
function getBookCover(book) {
    return book.content
        .split('src="')[1]
        .split('"')[0]
        .replace(/(SY75|SX50)/g, "");
}

function getBookAuthor(book) {
    return book.description.split("author: ")[1].split("<br>")[0];
}

function getGoodreadsLink(book) {
    return book.description.split('href="')[1].split('"')[0];
}

// Sync list from user input and handle edge cases
async function syncList() {
    let goodreadsListLink = document.getElementById("goodreadsListLink").value;
    const goodreadsRegex = /^https:\/\/(www\.)?goodreads\.com\/.*$/;

    if (goodreadsListLink === "" || !goodreadsRegex.test(goodreadsListLink)) {
        document.getElementById("goodreadsListLink").classList.add("is-invalid");
        return;
    } else {
        document.getElementById("goodreadsListLink").classList.remove("is-invalid");
    }

    // If the URL includes "/list/", replace it with "/list_rss/" for the API
    if (goodreadsListLink !== "") {
        if (goodreadsListLink.includes("/list/")) {
            goodreadsListLink = goodreadsListLink.replace("/list/", "/list_rss/");
        }
        rssUrl = goodreadsListLink;
    }

    await fetchBooks(rssUrl);
    showRandomBook();

    // Hide the input section and show the book info section
    toggleVisibility("random", false);
    toggleVisibility("enlace", true);
}

// Toggles visibility of elements
function toggleVisibility(elementId, hide) {
    document.getElementById(elementId).classList.toggle("d-none", hide);
}

// IIFE to initialize the app
(async function init() {
    if (!rssUrl) {
        console.log("No hay rss_url");
        toggleVisibility("random", true);
    } else {
        console.log("Sí hay rss_url: " + rssUrl);
        toggleVisibility("enlace", true);
        await fetchBooks(rssUrl);
        showRandomBook();
    }
})();
