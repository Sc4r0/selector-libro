const RSS_URL = "https://www.goodreads.com/review/list_rss/148237390?shelf=to-read";
const API_URL = "https://api.rss2json.com/v1/api.json?";
const API_KEY = "vn0imlu2ho24ibtwnbs3ty1ehavriko8wsqs5j6t";

let books = [];
(async function getBooks() {
    await fetch(
        API_URL +
            new URLSearchParams({
                rss_url: RSS_URL,
                api_key: API_KEY,
                count: 250,
            })
    )
        .then((response) => response.json())
        .then((data) => {
            books = data.items;
            document.getElementById("bookCount").innerHTML = books.length;
            document.getElementById("lastSyncedBook").innerHTML = `${
                books[0].title
            } - ${getBookAuthor(books[0])}`;
            document.getElementById("lastSyncedBookImg").src = getBookCover(books[0]);
        });
})();

function showRandomBook() {
    let randomNumber = Math.floor(Math.random() * books.length);
    const randomBook = books[randomNumber];

    document.getElementById("randomBook").innerText = `${randomBook.title} - ${getBookAuthor(
        randomBook
    )}`;
    document.getElementById("bookImg").src = getBookCover(randomBook);
    document.getElementById("goodReadsLink").href = getGoodreadsLink(randomBook);
}

function getBookCover(book) {
    return book.thumbnail.replace("SY75", "").replace("SX50", "");
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
