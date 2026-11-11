# Selector de Libro

Página estática que elige un libro al azar de una estantería de Goodreads (por ejemplo, tu lista *to-read*).

## Uso

1. Abre tu estantería en Goodreads y copia el enlace. Tiene esta forma:
   `https://www.goodreads.com/review/list/12345678-tu-nombre?shelf=to-read`
2. Pégalo en la página y pulsa **Sincronizar libros**.
3. Pulsa **Elegir libro al azar** las veces que quieras.

El enlace se guarda en el navegador, así que la próxima vez la lista se carga sola. Usa el botón de flecha para cambiar de lista.

> La estantería tiene que ser pública para que el feed RSS sea accesible.

## Cómo funciona

- El enlace de la estantería se convierte en su feed RSS (`/review/list/` → `/review/list_rss/`).
- El feed se lee a través de [rss2json](https://rss2json.com), recorriendo las páginas del feed (`&page=N`) hasta obtener todos los libros.
- No hay build ni dependencias: basta con servir `index.html`, `index.js` y `style.css` (por ejemplo, con GitHub Pages).
