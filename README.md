# Selector de Libro

Página estática que elige un libro al azar de una estantería de Goodreads (por ejemplo, tu lista *Want to Read* / `to-read`).

Publicada en https://sc4r0.github.io/selector-libro/

## Uso

La página ofrece dos formas de cargar la lista, cada una explicada paso a paso en la propia página:

### Opción 1: pegar el enlace de la estantería (rápido, pero parcial)

1. Abre tu estantería en Goodreads desde un navegador y copia el enlace. Tiene esta forma:
   `https://www.goodreads.com/review/list/12345678-tu-nombre?shelf=to-read`
   (también vale el enlace del perfil, `https://www.goodreads.com/user/show/12345678-tu-nombre`, o solo el número).
2. Pégalo en la página y pulsa **Cargar libros**.

La lista se vuelve a cargar cada vez que abres la página. El perfil tiene que ser público, y el widget de Goodreads devuelve **solo una parte fija de los libros del perfil** (de 10 a 100 en las pruebas) e **ignora la estantería pedida**, así que es una vista aproximada.

### Opción 2: subir la exportación CSV (lista completa, recomendada)

1. Ve a [goodreads.com/review/import](https://www.goodreads.com/review/import) (*My Books → Tools → Import and export*) y pulsa **Export Library**.
2. Cuando aparezca el enlace *Your export from …*, descarga `goodreads_library_export.csv`.
3. Súbelo en la página, elige la estantería y pulsa **Cargar libros**.

El archivo se procesa en el navegador; nada se sube a ningún servidor. Hay que volver a subirlo cuando cambie la lista.

En ambos casos la elección se guarda en el navegador; usa el botón de flecha para cambiar de lista.

## Cómo funciona

Goodreads retiró los feeds RSS de estanterías (`/review/list_rss/…`) a finales de octubre de 2026 y las páginas de estanterías ahora exigen iniciar sesión, así que la versión anterior (RSS + rss2json) dejó de funcionar.

- **Enlace:** se carga el widget público de estanterías (`/review/custom_widget/<id>`) como `<script>`, sin CORS ni proxies. No se pasa `widget_id`: con él Goodreads cambia los nombres de clase y devuelve otros libros (menos). El script vuelca su HTML en un `<template>` (inerte, no descarga imágenes) y de ahí se extraen título, autor, portada y enlace.
- **CSV:** se parsea la exportación localmente. Las portadas se buscan por ISBN en [Open Library](https://openlibrary.org/dev/docs/api/covers), porque el CSV no las incluye.
- No hay build ni dependencias: basta con servir `index.html`, `index.js` y `style.css` (GitHub Pages publica la raíz de `master`).
