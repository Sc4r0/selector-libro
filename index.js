const API_URL = "https://api.rss2json.com/v1/api.json?";
const API_KEY = "vn0imlu2ho24ibtwnbs3ty1ehavriko8wsqs5j6t";

let books = [];
let storedRssUrl = localStorage.getItem("rss_url");

async function getBooks(rssUrl) {
    await fetch(
        API_URL +
            new URLSearchParams({
                rss_url: rssUrl,
                api_key: API_KEY,
                count: 250,
            })
    )
        .then((response) => response.json())
        .then((data) => {
            localStorage.setItem("rss_url", rssUrl);
            books = data.items;
            document.getElementById("bookCount").innerHTML = books.length;
            document.getElementById("lastSyncedBook").innerHTML = `${books[0].title} - ${getBookAuthor(books[0])}`;
            document.getElementById("lastSyncedBookImg").src = getBookCover(books[0]);
            document.getElementById("randomBookButton").disabled = false;
        });
}

function showRandomBook() {
    let randomNumber = Math.floor(Math.random() * books.length);
    const randomBook = books[randomNumber];

    document.getElementById("randomBook").innerText = `${randomBook.title} - ${getBookAuthor(randomBook)}`;
    document.getElementById("bookImg").src = getBookCover(randomBook);
    document.getElementById("goodReadsLink").href = getGoodreadsLink(randomBook);
}

function getBookCover(book) {
    return book.content.split("src=")[1].split('"')[1].replace("SY75", "").replace("SX50", "");
}

function getBookAuthor(book) {
    let rawAuthor = book.description.split("author: ")[1];
    let author = rawAuthor.split("<br>")[0];
    return author;
}

function getGoodreadsLink(book) {
    let rawGoodreadsLink = book.description.split("href=")[1];
    let goodreadsLink = rawGoodreadsLink.split('"')[1];
    return goodreadsLink;
}

async function syncList() {
    let rssUrl = document.getElementById("goodReadsListLink").value;
    if (rssUrl.includes("/list/")) {
        rssUrl = rssUrl.replace("/list/", "/list_rss/");
    }
    await getBooks(rssUrl);
    document.getElementById("random").classList.remove("hidden");
    document.getElementById("enlace").classList.add("hidden");
}

(async function () {
    if (storedRssUrl === null || storedRssUrl === "") {
        console.log("No hay rss_url");
        document.getElementById("random").classList.add("hidden");
    } else {
        console.log("Sí hay rss_url: " + storedRssUrl);
        await syncList();
    }
})();
