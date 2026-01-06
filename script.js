

/**
 * --- CONFIGURATION & STATE ---
 */
const CONFIG = {
    pxPerMm: 1.2,        // Scale factor for rendering
    defaultHeight: 210,  // Fallback height (mm)
    defaultWidth: 25,    // Fallback spine width (mm)
    defaultColor: "#555555"
};

// Global State
let state = {
    books: [],           // Enriched book objects
    shelves: [],     
    //layout: [[], [], []],  Array of arrays (Shelf 0, 1, 2) containing book IDs
    selectedBookId: null
};

const libraryContainer = document.getElementById('library-container');

/**
 * --- 1. DATA LOGIC ---
 */
class DataManager {
    static init(data) {
        return data.map(b => ({
            ...b,
            // Normalizing dimensions
            renderHeight: (b.height || CONFIG.defaultHeight) * CONFIG.pxPerMm,
            renderWidth: (b.width || CONFIG.defaultWidth) * CONFIG.pxPerMm,
            // Store original color for reset, current color for display
            baseColor: b.color || null, 
displayColor: b.color || null,
isUserColor: Boolean(b.color)        }));
    }

    static calculateSimilarity(b1, b2) {
        // Heuristic: Jaccard Index of tags + Bonus for Genre
        const tags1 = new Set(b1.tags || []);
        const tags2 = new Set(b2.tags || []);
        
        // Intersection
        const intersection = new Set([...tags1].filter(x => tags2.has(x)));
        // Union
        const union = new Set([...tags1, ...tags2]);
        
        let score = union.size === 0 ? 0 : intersection.size / union.size;
        
        if (b1.genre === b2.genre) score += 0.5; // Heavy weight on genre
        if (b1.author === b2.author) score += 0.3;
        
        return score;
    }
}

/**
 * --- 2. SORTING LOGIC ---
 */
class Sorter {
    static getSortedBooks(books, mode) {
        // Return a copy to avoid mutating original list during sort
        let sorted = [...books];

        if (mode === 'author') {
            sorted.sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
        } 
        else if (mode === 'similarity' || mode === 'hybrid') {
            // Greedy clustering approach
            // 1. Pick first book (alphabetical or random).
            // 2. Find most similar remaining book.
            // 3. Add to chain, repeat.
            
            if (mode === 'hybrid') {
                // First group by author
                sorted.sort((a, b) => a.author.localeCompare(b.author));
                // Inside author groups, we could sort by similarity, but usually 
                // hybrid means "Keep authors together, but order the authors/books by similarity"
                // For simplicity here: Pure Similarity sort ignores Author grouping, 
                // Hybrid does Author Sort first (implemented above).
            } else {
                // Pure similarity sorting logic
                const result = [];
                let pool = [...sorted];
                
                // Start with the first book in the list
                let current = pool.shift();
                result.push(current);

                while (pool.length > 0) {
                    let bestIdx = -1;
                    let bestScore = -1;

                    for (let i = 0; i < pool.length; i++) {
                        const score = DataManager.calculateSimilarity(current, pool[i]);
                        if (score > bestScore) {
                            bestScore = score;
                            bestIdx = i;
                        }
                    }

                    current = pool[bestIdx];
                    result.push(current);
                    pool.splice(bestIdx, 1);
                }
                sorted = result;
            }
        }
        return sorted;
    }
}

/**
 * --- 3. COLOR ENGINE (The Advanced Part) ---
 */
class ColorEngine {
    // Helper: Convert Hex to HSL object {h, s, l}
    static hexToHsl(hex) {
        hex = hex.replace(/^#/, '');
        let bigint = parseInt(hex, 16);
        let r = (bigint >> 16) & 255;
        let g = (bigint >> 8) & 255;
        let b = bigint & 255;

        r /= 255, g /= 255, b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; 
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    // Helper: Linear Interpolation
    static lerp(start, end, t) {
        return start + (end - start) * t;
    }

    // This updates the shelf colors based on "Anchors"
static updateShelfColors(shelfElement) {
  const booksDom = Array.from(shelfElement.querySelectorAll('.book'));
  if (booksDom.length === 0) return;

  // 1️⃣ Mappa DOM → dati
const shelfItems = booksDom.map((el, index) => {
  const id = parseInt(el.dataset.id);
  const bookData = state.books.find(b => b.id === id);

  return {
    index,
    el,
    isAnchor: bookData && bookData.displayColor !== null,
    color: bookData?.isUserColor ? bookData.displayColor : null

  };
});
const anchors = shelfItems.filter(item => item.color !== null);


console.log(
  "ANCHORS COUNT:",
  anchors.length,
  anchors.map(a => a.color)
);



  // 3️⃣ Nessun anchor → lascia decidere al CSS
  if (anchors.length === 0) {
    shelfItems.forEach(item =>
      item.el.style.removeProperty('--book-c')
    );
    return;
  }

  // 4️⃣ Un solo anchor → solo lui ha colore
  if (anchors.length === 1) {
    shelfItems.forEach(item => {
      if (item === anchors[0]) {
        item.el.style.setProperty('--book-c', anchors[0].color);
      } else {
        item.el.style.removeProperty('--book-c');
      }
    });
    return;
  }

  // 5️⃣ Più anchor → gradiente tra anchor vicini
  for (let i = 0; i < shelfItems.length; i++) {
    const item = shelfItems[i];

    // Se è anchor, mantiene il suo colore
    if (item.color) {
      item.el.style.setProperty('--book-c', item.color);
      continue;
    }

    // Anchor sinistra e destra più vicine
    const leftAnchor = anchors.filter(a => a.index < i).pop();
    const rightAnchor = anchors.find(a => a.index > i);

    let finalColor;

    if (!leftAnchor) {
      finalColor = rightAnchor.color;
    } else if (!rightAnchor) {
      finalColor = leftAnchor.color;
    } else {
      const distance = rightAnchor.index - leftAnchor.index;
      const position = i - leftAnchor.index;
      const t = position / distance;

      const start = this.hexToHsl(leftAnchor.color);
      const end = this.hexToHsl(rightAnchor.color);

      const h = this.lerp(start.h, end.h, t);
      const s = this.lerp(start.s, end.s, t);
      const l = this.lerp(start.l, end.l, t);

      finalColor = `hsl(${h}, ${s}%, ${l}%)`;
    }

    item.el.style.setProperty('--book-c', finalColor);
  }
}

}



/**
 * --- 4. RENDERER & INTERACTION ---
 */

function renderShelves() {
  libraryContainer.innerHTML = "";

  state.shelves.forEach(shelf => {
    // wrapper scaffale
    const wrapper = document.createElement("div");
    wrapper.className = "shelf-wrapper";
    wrapper.dataset.shelfId = shelf.id;
    wrapper.draggable = true;
    wrapper.classList.add("shelf-draggable");


    // titolo scaffale
    const title = document.createElement("h3");
    title.textContent = shelf.name;
    title.className = "shelf-title";

// 🔑 TUTTI gli scaffali sono rinominabili
title.contentEditable = true;

title.addEventListener("blur", () => {
  const newName = title.textContent.trim();
  if (newName !== "") {
    shelf.name = newName;
  } else {
    title.textContent = shelf.name; // evita nome vuoto
  }

  wrapper.addEventListener("dragstart", e => {
  draggedShelfId = shelf.id;
  wrapper.classList.add("dragging-shelf");
  e.dataTransfer.effectAllowed = "move";
});
wrapper.addEventListener("dragend", () => {
  draggedShelfId = null;
  wrapper.classList.remove("dragging-shelf");
  updateShelvesOrderFromDOM();
});


});

libraryContainer.addEventListener("dragover", e => {
  e.preventDefault();

  const dragging = document.querySelector(".dragging-shelf");
  if (!dragging) return;

  const after = getShelfAfterElement(libraryContainer, e.clientY);
  if (after == null) {
    libraryContainer.appendChild(dragging);
  } else {
    libraryContainer.insertBefore(dragging, after);
  }
});

    // scaffale vero e proprio
    const shelfEl = document.createElement("div");
    shelfEl.className = "shelf";

    shelf.bookIds.forEach(bookId => {
      const book = state.books.find(b => b.id === bookId);
      if (!book) return;

      const el = document.createElement("div");
      el.className = "book";
      el.dataset.id = book.id;
      el.draggable = true;

      // dimensioni
      el.style.setProperty("--book-h", `${book.renderHeight}px`);
      el.style.setProperty("--book-w", `${book.renderWidth}px`);

      // colore solo se scelto dall’utente
      if (book.isUserColor && book.displayColor) {
        el.style.setProperty("--book-c", book.displayColor);
      } else {
        el.style.removeProperty("--book-c");
      }

      el.innerHTML = `<span>${book.title}</span>`;

      // eventi
      el.addEventListener("dragstart", handleDragStart);
      el.addEventListener("dragend", handleDragEnd);
      el.addEventListener("click", e => showDetails(book, e));

      shelfEl.appendChild(el);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(shelfEl);
    libraryContainer.appendChild(wrapper);

    // 🔑 gradiente cromatico PER SCAFFALE
    ColorEngine.updateShelfColors(shelfEl);
  });
}

// Drag State
let draggedItem = null;
let sourceShelf = null;

let draggedShelfId = null;



/* --- Drag and Drop Handlers --- */

function handleDragStart(e) {
    draggedItem = this;
    sourceShelf = this.parentNode;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.shelf').forEach(s => s.classList.remove('drag-over'));
    draggedItem = null;
    sourceShelf = null;
    
    // Sync logic
    updateLayoutFromDOM();
}

// Container Events
libraryContainer.addEventListener('dragover', e => {
    e.preventDefault(); // Allow drop
    const shelf = e.target.closest('.shelf');
    if (!shelf) return;
    
    shelf.classList.add('drag-over');
    
    // Find closest book to cursor for insertion
    const afterElement = getDragAfterElement(shelf, e.clientX);
    
    if (afterElement == null) {
        shelf.appendChild(draggedItem);
    } else {
        shelf.insertBefore(draggedItem, afterElement);
    }
    
    // Live color update calculation (Optimization: throttle this in production)
    ColorEngine.updateShelfColors(shelf);
    if (sourceShelf && sourceShelf !== shelf) ColorEngine.updateShelfColors(sourceShelf);
});

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.book:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2; // Distance from center
        
        // We want the element immediately AFTER the cursor, so offset must be negative but close to 0
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getShelfAfterElement(container, y) {
  const shelves = [...container.querySelectorAll(".shelf-wrapper:not(.dragging-shelf)")];

  return shelves.reduce((closest, el) => {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset, element: el };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* --- Detail & Color Picker --- */
const modal = document.getElementById('details-modal');
const colorInput = document.getElementById('color-override');

function showDetails(book, e) {
    e.stopPropagation();
    state.selectedBookId = book.id;
    
    document.getElementById('modal-title').innerText = book.title;
    document.getElementById('modal-author').innerText = book.author;
    
    const tagContainer = document.getElementById('modal-tags');
    tagContainer.innerHTML = '';
    [book.genre, ...(book.tags || [])].forEach(tag => {
        const span = document.createElement('span');
        span.className = 'meta-tag';
        span.innerText = tag;
        tagContainer.appendChild(span);
    });

    // Color Setup
    // Use the explicit display color, or convert the computed RGB to Hex for the input
    // For input[type=color], we need hex. 
    // If displayColor is null (computed), we don't show a value on the picker, or show black.
    colorInput.value = book.displayColor || "#000000"; 
    
    modal.classList.add('visible');
}

// Close modal on click outside
document.addEventListener('click', (e) => {
    if (!modal.contains(e.target) && !e.target.closest('.book')) {
        modal.classList.remove('visible');
    }
});

// Manual Color Override
colorInput.addEventListener('input', (e) => {
  if (!state.selectedBookId) return;
  const book = state.books.find(b => b.id === state.selectedBookId);

  book.displayColor = e.target.value;
  book.isUserColor = true; // 🔑 QUESTO MANCAVA

  const el = document.querySelector(`.book[data-id="${book.id}"]`);
  if (el) {
    el.style.setProperty('--book-c', book.displayColor);
    ColorEngine.updateShelfColors(el.parentNode);
  }
});



document.getElementById('btn-reset-color').addEventListener('click', () => {
  if (!state.selectedBookId) return;
  const book = state.books.find(b => b.id === state.selectedBookId);

  book.displayColor = null;
  book.isUserColor = false; // 🔑
  state.shelves = buildGenreShelves(state.books);
renderShelves();

});



/* --- UI Buttons --- */

document.getElementById("btn-add-shelf").addEventListener("click", () => {
  createManualShelf();
});


document.getElementById('btn-reset').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

function buildGenreShelves(books) {
  const map = new Map();

  books.forEach(book => {
    const genre = book.genre || "Altro";
    if (!map.has(genre)) {
      map.set(genre, {
        id: `genre-${genre}`,
        name: genre,
        type: "genre",
        bookIds: []
      });
    }
    map.get(genre).bookIds.push(book.id);
  });

  return Array.from(map.values());
}

function createManualShelf(name = "Nuovo scaffale") {
  state.shelves.push({
    id: `manual-${crypto.randomUUID()}`,
    name,
    type: "manual",
    bookIds: []
  });

  renderShelves();
}

function updateShelvesOrderFromDOM() {
  const newOrder = [];

  document.querySelectorAll(".shelf-wrapper").forEach(wrapper => {
    const id = wrapper.dataset.shelfId;
    const shelf = state.shelves.find(s => s.id === id);
    if (shelf) newOrder.push(shelf);
  });

  state.shelves = newOrder;
}



/**
 * --- INITIALIZATION ---
 */
document.addEventListener("booksLoaded", () => {
  // 1️⃣ inizializza i libri
  state.books = DataManager.init(rawData);

  // 2️⃣ crea scaffali automatici per genere
  state.shelves = buildGenreShelves(state.books);

  // 3️⃣ render UNICO
  renderShelves();
});



