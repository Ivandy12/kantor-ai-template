/* Kantor AI: tambah menu "Kantor 3D" di sidebar Paperclip. Disuntik oleh proxy port 3100. */
(function () {
  if (window.__kantorInject) return;
  window.__kantorInject = true;
  var HREF = "/kantor3d/office";
  var ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/></svg>';

  function textOf(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findDashboardLinks() {
    var out = [];
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      if (/\/dashboard\/?$/.test(href) && textOf(a) === "Dashboard") out.push(a);
    }
    return out;
  }

  function replaceText(root, from, to) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf(from) >= 0) {
        n.nodeValue = n.nodeValue.replace(from, to);
        return;
      }
    }
  }

  function pickTemplate(dash) {
    // Pakai link yang tidak sedang aktif supaya gaya "terpilih" tidak ikut tersalin.
    var parent = dash.parentElement;
    var cands = parent ? parent.querySelectorAll(":scope > a[href]") : [];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c === dash || c.dataset.kantor) continue;
      if (c.getAttribute("aria-current")) continue;
      if ((c.getAttribute("href") || "") === location.pathname) continue;
      return c;
    }
    return dash;
  }

  function addLinks() {
    var dashes = findDashboardLinks();
    for (var i = 0; i < dashes.length; i++) {
      var dash = dashes[i];
      var next = dash.nextElementSibling;
      if (next && next.dataset && next.dataset.kantor) continue;
      var tpl = pickTemplate(dash);
      var link = tpl.cloneNode(true);
      link.dataset.kantor = "1";
      link.removeAttribute("aria-current");
      link.setAttribute("href", HREF);
      link.setAttribute("title", "Kantor 3D — lihat agent bekerja");
      var label = textOf(tpl);
      // Ganti teks label (bisa ada badge angka, dibuang).
      var badges = link.querySelectorAll("span, div");
      for (var b = 0; b < badges.length; b++) {
        if (/^\d+$/.test(textOf(badges[b]))) badges[b].remove();
      }
      replaceText(link, label.replace(/\s*\d+$/, ""), "Kantor 3D");
      var svg = link.querySelector("svg");
      if (svg) {
        var holder = document.createElement("span");
        holder.innerHTML = ICON;
        var icon = holder.firstChild;
        icon.setAttribute("class", svg.getAttribute("class") || "");
        svg.replaceWith(icon);
      }
      // Hapus titik notifikasi kalau ikut tersalin.
      var dots = link.querySelectorAll("[class*='rounded-full']");
      for (var d = 0; d < dots.length; d++) {
        if (!textOf(dots[d])) dots[d].remove();
      }
      link.addEventListener("click", function (e) {
        e.stopPropagation();
      }, true);
      dash.insertAdjacentElement("afterend", link);
    }
  }

  var scheduled = false;
  var obs = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      try {
        addLinks();
      } catch (e) {}
    });
  });
  function start() {
    try {
      addLinks();
    } catch (e) {}
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
