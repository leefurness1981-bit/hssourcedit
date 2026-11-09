/* Tiny, safe text formatter for pages edited in admin (Terms etc.).
   Supports: blank line = new paragraph, ## Heading, ### Smaller heading,
   - bullet lists, **bold**, *italic*, [link text](https://…), and plain email addresses. */
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  function inline(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|[a-z0-9-]+\.html)\)/gi, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, '$1<a href="mailto:$2">$2</a>');
  }
  window.renderMarkdown = function (src) {
    const blocks = String(src || "").replace(/\r/g, "").split(/\n{2,}/);
    return blocks.map(b => {
      const lines = b.split("\n").filter(l => l.trim() !== "");
      if (!lines.length) return "";
      if (lines.every(l => /^\s*[-*] /.test(l))) return "<ul>" + lines.map(l => "<li>" + inline(l.replace(/^\s*[-*] /, "")) + "</li>").join("") + "</ul>";
      if (/^### /.test(lines[0])) return "<h3>" + inline(lines[0].slice(4)) + "</h3>" + (lines.length > 1 ? "<p>" + lines.slice(1).map(inline).join("<br>") + "</p>" : "");
      if (/^## /.test(lines[0])) return "<h2>" + inline(lines[0].slice(3)) + "</h2>" + (lines.length > 1 ? "<p>" + lines.slice(1).map(inline).join("<br>") + "</p>" : "");
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("\n");
  };
})();
