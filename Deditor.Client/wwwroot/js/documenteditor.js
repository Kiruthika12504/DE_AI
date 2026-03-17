var container;

// ── Initialize the Syncfusion Document Editor Container ──────────────────────
window.initializeDocumentEditor = function () {
    container = new ej.documenteditor.DocumentEditorContainer({
        height: "calc(100vh - 108px)",
        width: "100%",
        enableToolbar: true,
        toolbarMode: 'Ribbon',
        serviceUrl: '/api/documenteditor/',
    });
    container.appendTo("#container1");
    container.documentEditor.enableTrackChanges = true;
    container.documentEditor.showRevisions = true;
    window._deContainer = container; // expose for inline scripts
};

// ── Toggle Track Changes (NEW) ───────────────────────────────────────────────
window.toggleTrackChanges = function () {
    if (!container) return false;

    var current = container.documentEditor.enableTrackChanges;
    container.documentEditor.enableTrackChanges = !current;

    return !current;
};

// ── Accept all changes (NEW) ─────────────────────────────────────────────────
window.acceptAllChanges = function () {
    if (!container) return;
    container.documentEditor.revisions.acceptAll();
};

// ── Reject all changes (NEW) ─────────────────────────────────────────────────
window.rejectAllChanges = function () {
    if (!container) return;
    container.documentEditor.revisions.rejectAll();
};

// ── Load a blank document ────────────────────────────────────────────────────
window.loadBlankDocument = function () {
    if (!container) return;
    container.documentEditor.openBlank();
    container.documentEditor.focusIn();
};

// ── Load SFDT into the editor ─────────────────────────────────────────────────
window.loadDocument = function (sfdt) {
    if (!container) return;
    container.documentEditor.open(sfdt);
    container.documentEditor.focusIn();
};

// ── Return current document as SFDT JSON ─────────────────────────────────────
window.getDocumentContent = function () {
    if (!container) return null;
    return container.documentEditor.serialize();
};

// ── Atomically serialize current doc and load new one (for tab switching) ────
// Returns the serialized SFDT of the OLD tab so C# can store it.
window.saveAndSwitch = function (newSfdt, isBlank) {
    if (!container) { console.error('saveAndSwitch: container null'); return null; }
    var oldSfdt = container.documentEditor.serialize();
    console.log('[saveAndSwitch] serialized chars:', oldSfdt ? oldSfdt.length : 0, '| loading isBlank:', isBlank, '| newSfdt chars:', newSfdt ? newSfdt.length : 0);
    if (isBlank) {
        container.documentEditor.openBlank();
    } else {
        container.documentEditor.open(newSfdt);
    }
    container.documentEditor.focusIn();
    return oldSfdt;
};

// ── Trigger browser file download from base64 ─────────────────────────────────
window.downloadFile = function (base64, fileName) {
    var bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    var blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ── Get selected text from the editor ────────────────────────────────────────
window.getSelectedText = function () {
    if (!container) return "";
    return container.documentEditor.selection.text;
};

// ── Replace selected text with transformed text ───────────────────────────────
window.replaceSelectedText = function (newText) {
    if (!container || !newText) return;

    var editor = container.documentEditor.editor;
    var selection = container.documentEditor.selection;

    // If nothing selected → just insert (still tracked)
    if (!selection || !selection.text || selection.text.length === 0) {
        editor.insertText(newText);
        return;
    }

    // 🔥 Track Changes behavior:
    // 1. Delete selected text → becomes tracked deletion
    editor.delete();

    // 2. Insert new text → becomes tracked insertion
    editor.insertText(newText);
};

// ── Check if any text is selected ─────────────────────────────────────────────
window.hasSelection = function () {
    if (!container) return false;
    var sel = container.documentEditor.selection.text;
    return sel !== null && sel.length > 0;
};

// ══════════════════════════════════════════════════════════════════════════════
// CASE TRANSFORMATION LOGIC
// ══════════════════════════════════════════════════════════════════════════════

// ── Title Case ────────────────────────────────────────────────────────────────
// APA/Chicago: capitalize major words, keep minor words lowercase
// unless they are the first or last word.
window.applyTitleCase = function () {
    var text = window.getSelectedText();
    if (!text) return "NO_SELECTION";

    var minorWords = new Set([
        "a", "an", "the",
        "and", "but", "or", "nor", "for", "so", "yet",
        "as", "at", "by", "in", "of", "on", "to", "up", "via",
        "per", "vs", "etc"
    ]);

    var tokens = text.split(/(\s+)/);
    var wordIndex = 0;
    var wordCount = tokens.filter(function (t) { return t.trim().length > 0; }).length;

    var result = tokens.map(function (token) {
        if (token.trim().length === 0) return token;
        var lower = token.toLowerCase();
        var isFirst = wordIndex === 0;
        var isLast  = wordIndex === wordCount - 1;
        wordIndex++;
        if (isFirst || isLast || !minorWords.has(lower)) {
            return capitalizeFirst(token);
        }
        return lower;
    });

    window.replaceSelectedText(result.join(""));
    return "OK";
};

// ── Initial Caps ──────────────────────────────────────────────────────────────
// Capitalize the first letter of every word without exception.
window.applyInitialCaps = function () {
    var text = window.getSelectedText();
    if (!text) return "NO_SELECTION";

    var result = text.split(/(\s+)/).map(function (token) {
        if (token.trim().length === 0) return token;
        return capitalizeFirst(token);
    });

    window.replaceSelectedText(result.join(""));
    return "OK";
};

// ── Essential Caps ────────────────────────────────────────────────────────────
// Uses compromise.js NLP (free, runs in browser) to detect nouns,
// proper nouns, acronyms, and technical terms and capitalize only those.
window.applyEssentialCaps = function () {
    var text = window.getSelectedText();
    if (!text) return "NO_SELECTION";

    if (typeof nlp === "undefined") {
        return "NLP_NOT_LOADED";
    }

    // Words that must always stay lowercase regardless of POS tag
    var alwaysLower = new Set([
        "a", "an", "the",
        "and", "but", "or", "nor", "for", "so", "yet",
        "in", "of", "on", "at", "by", "to", "up", "as",
        "via", "per", "vs", "with", "from", "into", "onto",
        "is", "are", "was", "were", "be", "been", "being",
        "has", "have", "had", "do", "does", "did"
    ]);

    // Parse the full text with compromise NLP
    var doc = nlp(text);

    // Build a set of important words using .out('array') — correct API for v14
    var importantWords = new Set();

    // Nouns (includes common nouns like "temperature", "measurements")
    doc.nouns().out('array').forEach(function (phrase) {
        phrase.split(/\s+/).forEach(function (w) {
            if (w) importantWords.add(w.toLowerCase());
        });
    });

    // Proper nouns (names, places, organisations)
    doc.match('#ProperNoun').out('array').forEach(function (phrase) {
        phrase.split(/\s+/).forEach(function (w) {
            if (w) importantWords.add(w.toLowerCase());
        });
    });

    // Acronyms (e.g. "NLP", "AI", "API")
    doc.match('#Acronym').out('array').forEach(function (phrase) {
        phrase.split(/\s+/).forEach(function (w) {
            if (w) importantWords.add(w.toLowerCase());
        });
    });

    // Also capitalize hyphenated technical terms (e.g. "real-time", "open-source")
    // by checking if either part is a noun
    var tokens = text.split(/(\s+)/);
    var result = tokens.map(function (token) {
        if (token.trim().length === 0) return token;

        var lower = token.toLowerCase();

        // Never capitalize function/minor words
        if (alwaysLower.has(lower)) return lower;

        // Capitalize if NLP tagged it as important
        if (importantWords.has(lower)) return capitalizeFirst(token);

        // Capitalize hyphenated terms if any part is a noun
        if (token.indexOf("-") > -1) {
            var parts = token.split("-");
            var anyPartImportant = parts.some(function (p) {
                return importantWords.has(p.toLowerCase());
            });
            if (anyPartImportant) return capitalizeFirst(token);
        }

        // Default: keep lowercase
        return lower;
    });

    window.replaceSelectedText(result.join(""));
    return "OK";
};

// ── Internal helper ───────────────────────────────────────────────────────────
function capitalizeFirst(word) {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// ── Get full document plain text ─────────────────────────────────────────────
window.getDocumentText = function () {
    if (!container) return "";
    // selectAll() selects entire document, then read selection.text
    container.documentEditor.selection.selectAll();
    var text = container.documentEditor.selection.text;
    // Clear selection after reading
    container.documentEditor.selection.clear();
    return text || "";
};

// ── Scroll chat messages to bottom after new message ─────────────────────────
window.scrollChatToBottom = function () {
    var el = document.getElementById("chatMessages");
    if (el) el.scrollTop = el.scrollHeight;
};

// ── Resize editor when sidebar opens/closes ───────────────────────────────────
window.resizeEditor = function () {
    if (container) {
        setTimeout(function () {
            container.resize();
        }, 50);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH & REPLACE
// ══════════════════════════════════════════════════════════════════════════════

// Find all occurrences and highlight them — returns match count
window.searchInDocument = function (query) {
    if (!container || !query) return 0;
    container.documentEditor.search.findAll(query, 'None');
    var count = container.documentEditor.search.searchResults.length;
    // Re-focus search input so next keystroke doesn't go into the document
    refocusSearch();
    return count;
};

// Navigate to next / prev match
window.searchNavigate = function (direction) {
    if (!container) return;
    var results = container.documentEditor.search.searchResults;
    if (!results || results.length === 0) return;
    if (direction === 'next') {
        results.index = (results.index + 1) % results.length;
    } else {
        results.index = (results.index - 1 + results.length) % results.length;
    }
    // Re-focus search input after navigation
    refocusSearch();
};

// Replace all occurrences — returns count replaced
window.replaceAllInDocument = function (searchText, replaceText) {
    if (!container || !searchText) return 0;
    container.documentEditor.search.findAll(searchText, 'None');
    var count = container.documentEditor.search.searchResults.length;
    if (count > 0) {
        container.documentEditor.search.searchResults.replaceAll(replaceText || '');
    }
    refocusSearch();
    return count;
};

// Clear all search highlights
window.clearSearch = function () {
    if (!container) return;
    container.documentEditor.search.searchResults.clear();
};

// ── Keep focus on search input after Syncfusion steals it ────────────────────
function refocusSearch() {
    setTimeout(function () {
        var el = document.getElementById('searchInput');
        if (el) {
            el.focus();
            // Move cursor to end of input
            var len = el.value.length;
            el.setSelectionRange(len, len);
        }
    }, 30);
}
