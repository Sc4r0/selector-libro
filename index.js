const API_URL =
    "https://script.google.com/macros/s/AKfycbzsGhkEhxQpnfTVw64YYfWy2V9hrPkst6SDE1A2SMMFge2Uceuy_VwzBpEkEQlj-iyYIw/exec";

let books = [];
function getBooks() {
    fetch(API_URL)
        .then((response) => response.json())
        .then((data) => {
            books = data;
            console.log(books);
            document.getElementById("bookCount").innerHTML = books.length;
        });
}

function getRandomBook() {
    if (books.length === 0) {
        alert("Tienes que recuperar los libros primero!");
        return;
    }
    const randomBook = books[Math.floor(Math.random() * books.length)];
    document.getElementById("randomBook").innerText = `${randomBook.title} - ${randomBook.author}`;
}
