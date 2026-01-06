

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
    layout: [[], [], []], // Array of arrays (Shelf 0, 1, 2) containing book IDs
    selectedBookId: null
};

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
const libraryContainer = document.getElementById('library-container');

// Drag State
let draggedItem = null;
let sourceShelf = null;

function renderLibrary() {
  // Clear shelves
  document.querySelectorAll('.shelf').forEach(s => s.innerHTML = '');

  state.layout.forEach((shelfIds, shelfIndex) => {
    const shelfEl = document.querySelector(
      `.shelf[data-shelf-id="${shelfIndex}"]`
    );

    shelfIds.forEach(bookId => {
      const book = state.books.find(b => b.id === bookId);
      if (!book) return;

      const el = document.createElement('div');
      el.className = 'book';
      el.dataset.id = book.id;
      el.draggable = true;

      // Geometry (always JS)
      el.style.setProperty('--book-h', `${book.renderHeight}px`);
      el.style.setProperty('--book-w', `${book.renderWidth}px`);

      // 🔑 COLOR LOGIC (CORRETTA)
      // Se il libro ha un colore esplicito → lo imposto
      // Altrimenti → lascio decidere al CSS
      if (book.displayColor) {
        el.style.setProperty('--book-c', book.displayColor);
      } else {
        el.style.removeProperty('--book-c');
      }

      el.innerHTML = `<span>${book.title}</span>`;

      // Events
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragend', handleDragEnd);
      el.addEventListener('click', (e) => showDetails(book, e));

      shelfEl.appendChild(el);
    });

    // Apply gradients AFTER all books are placed
    ColorEngine.updateShelfColors(shelfEl);
  });
}


function updateLayoutFromDOM() {
    // Reconstruct state.layout based on current DOM positions
    // This allows manual ordering to persist
    const newLayout = [];
    document.querySelectorAll('.shelf').forEach(shelf => {
        const ids = [];
        shelf.querySelectorAll('.book').forEach(book => {
            ids.push(parseInt(book.dataset.id));
        });
        newLayout.push(ids);
    });
    state.layout = newLayout;
    
    // Re-run color logic on all shelves because order changed
    document.querySelectorAll('.shelf').forEach(s => ColorEngine.updateShelfColors(s));
}

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


/* --- Controls & Logic --- */

function applySorting(mode) {
    // 1. Flatten current books
    const allIds = state.books.map(b => b.id); // Or get current visible? Let's use all.
    
    // 2. Get full object list
    const bookObjects = allIds.map(id => state.books.find(b => b.id === id));
    
    // 3. Sort
    const sorted = Sorter.getSortedBooks(bookObjects, mode);
    
    // 4. Distribute into shelves (simple fill)
    // Clear layout
    state.layout = [[], [], []];
    const shelfCap = Math.ceil(sorted.length / 3);
    
    sorted.forEach((book, i) => {
        const shelfIdx = Math.floor(i / shelfCap);
        if (state.layout[shelfIdx]) {
            state.layout[shelfIdx].push(book.id);
        } else {
            state.layout[state.layout.length - 1].push(book.id); // Overflow
        }
    });

    renderLibrary();
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
  renderLibrary();
});



/* --- UI Buttons --- */

document.getElementById('sort-mode').addEventListener('change', (e) => {
    const mode = e.target.value;
    if (mode !== 'none') applySorting(mode);
});

document.getElementById('btn-save').addEventListener('click', () => {
    updateLayoutFromDOM(); // Ensure state is fresh
    // We save the layout IDs and the book states (to capture manual color changes)
    const savePacket = {
        layout: state.layout,
        bookColors: state.books.map(b => ({id: b.id, color: b.displayColor}))
    };
    localStorage.setItem('library_layout', JSON.stringify(savePacket));
    alert('Layout saved!');
});

document.getElementById('btn-load').addEventListener('click', () => {
    const saved = localStorage.getItem('library_layout');
    if (saved) {
        const parsed = JSON.parse(saved);
        state.layout = parsed.layout;
        
        // Restore manual colors
        parsed.bookColors.forEach(savedBook => {
            const current = state.books.find(b => b.id === savedBook.id);
            if (current) current.displayColor = savedBook.color;
        });
        
        renderLibrary();
        document.getElementById('sort-mode').value = 'none';
    } else {
        alert('No saved layout found.');
    }
});

document.getElementById('btn-reset').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});


/**
 * --- INITIALIZATION ---
 */
document.addEventListener("booksLoaded", () => {
  // 1. inizializza i libri
  state.books = DataManager.init(rawData);

  // 2. CREA UN LAYOUT INIZIALE (QUESTO MANCAVA)
  state.layout = [[], [], []];
  state.books.forEach((book, index) => {
    state.layout[index % 3].push(book.id);
  });

  // 3. RENDER (QUESTO È IL PASSAGGIO CRITICO)
  renderLibrary();

  // 4. ordinamento iniziale
  applySorting("hybrid");
  document.getElementById("sort-mode").value = "hybrid";
});


