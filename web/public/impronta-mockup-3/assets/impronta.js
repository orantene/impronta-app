/* ============================================================
   IMPRONTA MODELS — interactions (vanilla, no deps)
   ============================================================ */
(function () {
  "use strict";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- nav scroll state ---------- */
  var nav = document.querySelector(".nav:not(.nav--solid)");
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 40) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- mobile menu ---------- */
  var burger = document.querySelector(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      document.body.classList.toggle("menu-open");
    });
    document.querySelectorAll(".mobile-menu a").forEach(function (a) {
      a.addEventListener("click", function () { document.body.classList.remove("menu-open"); });
    });
  }

  /* ---------- hero carousel ---------- */
  var slides = document.querySelectorAll(".hero__slide");
  if (slides.length > 1) {
    var dots = document.querySelectorAll(".hero__dots button");
    var countEl = document.querySelector(".hero__count");
    var i = 0, timer;
    var go = function (n) {
      slides[i].classList.remove("active");
      if (dots[i]) dots[i].classList.remove("on");
      i = (n + slides.length) % slides.length;
      slides[i].classList.add("active");
      if (dots[i]) dots[i].classList.add("on");
      if (countEl) countEl.textContent = String(i + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    };
    var start = function () { if (!prefersReduced) timer = setInterval(function () { go(i + 1); }, 5200); };
    var stop = function () { clearInterval(timer); };
    dots.forEach(function (d, idx) { d.addEventListener("click", function () { stop(); go(idx); start(); }); });
    go(0); start();
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- EN / ES language toggle ---------- */
  var LANG_KEY = "imp-lang";
  var applyLang = function (lang) {
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll("[data-en]").forEach(function (el) {
      var v = el.getAttribute("data-" + lang);
      if (v !== null) {
        if (el.hasAttribute("data-attr")) el.setAttribute(el.getAttribute("data-attr"), v);
        else el.textContent = v;
      }
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang") === lang);
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  };
  var saved = "en";
  try { saved = localStorage.getItem(LANG_KEY) || "en"; } catch (e) {}
  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { applyLang(b.getAttribute("data-lang")); });
  });
  applyLang(saved);

  /* ============================================================
     ROSTER DATA + RENDER + FILTER
     ============================================================ */
  var MODELS = [
    { n: "Chiara Moretti",  city: "Milan",            div: "women", h: 178, a: "w01", b: "loc-ed1" },
    { n: "Valentina Ruiz",  city: "Mexico City",      div: "women", h: 176, a: "w02", b: "ed02" },
    { n: "Lucía Navarro",   city: "Cancún",           div: "women", h: 174, a: "w03", b: "ls05" },
    { n: "Isabella Flores", city: "Tulum",            div: "women", h: 177, a: "w04", b: "loc-gown" },
    { n: "Adriana Vega",    city: "Playa del Carmen", div: "women", h: 175, a: "w05", b: "ls06" },
    { n: "Sofía Lombardi",  city: "Milan",            div: "women", h: 179, a: "w09", b: "loc-ed2" },
    { n: "Elena Petrov",    city: "Ibiza",            div: "women", h: 180, a: "w10", b: "ed01" },
    { n: "Renata Cruz",     city: "Mexico City",      div: "women", h: 173, a: "w13", b: "loc-ed3" },
    { n: "Bianca Russo",    city: "Tulum",            div: "women", h: 176, a: "w14", b: "ls01" },
    { n: "Mateo Silva",     city: "Playa del Carmen", div: "men",   h: 186, a: "m01", b: "loc-rw1" },
    { n: "Diego Ríos",      city: "Cancún",           div: "men",   h: 184, a: "m02", b: "loc-rw4" },
    { n: "Rafael Ibarra",   city: "Mexico City",      div: "men",   h: 188, a: "m04", b: "loc-rw3" },
    { n: "Omar Haddad",     city: "Cancún",           div: "men",   h: 187, a: "m06", b: "loc-rw5" },
    { n: "Tomás Vidal",     city: "Milan",            div: "men",   h: 185, a: "m07", b: "ed03" },
    { n: "Eric Watson",     city: "New York",         div: "men",   h: 190, a: "m11", b: "loc-rw2" },
    { n: "Nina Hart",       city: "Ibiza",            div: "new",   h: 175, a: "w06", b: "ls02" },
    { n: "Camila Ortega",   city: "Cancún",           div: "new",   h: 172, a: "w07", b: "ls03" },
    { n: "Daniela Sol",     city: "Tulum",            div: "new",   h: 174, a: "w11", b: "ls08" },
    { n: "Noah Klein",      city: "Tulum",            div: "new",   h: 183, a: "m05", b: "loc-mkrunway" },
    { n: "Luca Ferrari",    city: "Ibiza",            div: "new",   h: 182, a: "m03", b: "loc-mkparty" }
  ];
  var DIV_LABEL = { women: "Women", men: "Men", new: "New Faces" };
  var slug = function (s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-"); };
  var ftin = function (cm) { var t = Math.round(cm / 2.54); return Math.floor(t / 12) + "'" + (t % 12) + '"'; };

  var board = document.getElementById("board");
  if (board) {
    var state = { div: "all", city: "all", q: "" };

    var cities = MODELS.map(function (m) { return m.city; }).filter(function (v, idx, arr) { return arr.indexOf(v) === idx; }).sort();
    var citySel = document.getElementById("cityFilter");
    if (citySel) {
      cities.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; citySel.appendChild(o); });
    }

    var render = function () {
      var list = MODELS.filter(function (m) {
        if (state.div !== "all" && m.div !== state.div) return false;
        if (state.city !== "all" && m.city !== state.city) return false;
        if (state.q && m.n.toLowerCase().indexOf(state.q.toLowerCase()) === -1) return false;
        return true;
      });
      if (!list.length) { board.innerHTML = '<p class="empty">No faces match that search.</p>'; return; }
      board.innerHTML = list.map(function (m) {
        return '<a class="comp reveal" href="model.html?m=' + slug(m.n) + '">' +
          '<div class="comp__media">' +
            (m.div === "new" ? '<span class="new">New Face</span>' : '') +
            '<img class="a" src="img/' + m.a + '.jpg" alt="' + m.n + ', portrait" loading="lazy">' +
            '<img class="b" src="img/' + m.b + '.jpg" alt="" loading="lazy">' +
            '<div class="comp__stats">' +
              '<div>Height<b>' + m.h + ' cm</b></div>' +
              '<div>&nbsp;<b>' + ftin(m.h) + '</b></div>' +
              '<div>Division<b>' + DIV_LABEL[m.div] + '</b></div>' +
            '</div>' +
          '</div>' +
          '<div class="comp__info"><span class="nm">' + m.n + '</span><span class="ct">' + m.city + '</span></div>' +
        '</a>';
      }).join("");
      // re-arm reveal for freshly injected cards
      board.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
    };

    document.querySelectorAll(".tabs .tab").forEach(function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".tabs .tab").forEach(function (x) { x.classList.remove("on"); });
        t.classList.add("on");
        state.div = t.getAttribute("data-div");
        render();
      });
    });
    if (citySel) citySel.addEventListener("change", function () { state.city = citySel.value; render(); });
    var search = document.getElementById("searchInput");
    if (search) search.addEventListener("input", function () { state.q = search.value; render(); });

    // honor ?div= from divisions links
    var params = new URLSearchParams(location.search);
    var pd = params.get("div");
    if (pd && (pd === "women" || pd === "men" || pd === "new")) {
      state.div = pd;
      document.querySelectorAll(".tabs .tab").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-div") === pd); });
    }
    render();
  }

  /* ---------- model detail: hydrate name from ?m= ---------- */
  var mdName = document.getElementById("mdName");
  if (mdName) {
    var p2 = new URLSearchParams(location.search);
    var want = p2.get("m");
    var found = MODELS.filter(function (m) { return slug(m.n) === want; })[0];
    if (found) {
      mdName.textContent = found.n;
      var cityEl = document.getElementById("mdCity");
      if (cityEl) cityEl.textContent = found.city;
      var heroImg = document.getElementById("mdHero");
      if (heroImg) { heroImg.src = "img/" + found.a + ".jpg"; heroImg.alt = found.n + ", portrait"; }
      var bbImg = document.getElementById("bbAvatar");
      if (bbImg) bbImg.src = "img/" + found.a + ".jpg";
      var bbName = document.getElementById("bbName");
      if (bbName) bbName.textContent = found.n;
      document.title = found.n + " — Impronta Models";
    }
  }
})();
