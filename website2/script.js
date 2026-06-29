/* ============================================
   智研通学术 — 合并版交互脚本
   结合 web + website 交互逻辑
   ============================================ */

(function () {
  "use strict";

  // --- Elements ---
  var header = document.querySelector(".site-header");
  var menuButton = document.querySelector(".menu-button");
  var navLinks = document.querySelectorAll(".site-nav a");
  var reveals = document.querySelectorAll(".reveal");
  var progressBar = document.getElementById("scrollProgress");

  // --- Header scroll effect ---
  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  // --- Scroll progress bar ---
  if (progressBar) {
    window.addEventListener("scroll", function () {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var scrollPercent = (docHeight > 0) ? (window.scrollY / docHeight) * 100 : 0;
      progressBar.style.width = Math.min(scrollPercent, 100) + "%";
    }, { passive: true });
  }

  // --- Mobile menu ---
  function closeMenu() {
    if (!header || !menuButton) return;
    header.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  if (menuButton && header) {
    menuButton.addEventListener("click", function () {
      var isOpen = header.classList.toggle("is-open");
      document.body.classList.toggle("nav-open", isOpen);
      menuButton.setAttribute("aria-expanded", String(isOpen));
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var targetId = this.getAttribute("href").substring(1);
      var target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        var offsetTop = target.offsetTop - 80;
        window.scrollTo({ top: offsetTop, behavior: "smooth" });
      }
    });
  });

  // --- Active nav link highlight ---
  var sections = [];
  document.querySelectorAll("section[id]").forEach(function (section) {
    sections.push({
      id: section.id,
      top: section.offsetTop - 150,
      bottom: section.offsetTop + section.offsetHeight - 150
    });
  });

  function highlightNav() {
    var scrollPos = window.scrollY;
    var currentId = "";

    sections.forEach(function (sec) {
      if (scrollPos >= sec.top && scrollPos < sec.bottom) {
        currentId = sec.id;
      }
    });

    navLinks.forEach(function (link) {
      link.style.color = "";
      if (link.getAttribute("href") === "#" + currentId) {
        link.style.color = "var(--amber)";
      }
    });
  }

  window.addEventListener("scroll", highlightNav, { passive: true });

  // --- Reveal on scroll (IntersectionObserver) ---
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });

    reveals.forEach(function (element) {
      observer.observe(element);
    });
  } else {
    reveals.forEach(function (element) {
      element.classList.add("is-visible");
    });
  }

  // --- Back to top button ---
  var backToTop = document.createElement("div");
  backToTop.className = "back-to-top";
  backToTop.innerHTML = "↑";
  backToTop.setAttribute("aria-label", "回到顶部");
  document.body.appendChild(backToTop);

  window.addEventListener("scroll", function () {
    if (window.scrollY > 600) {
      backToTop.classList.add("visible");
    } else {
      backToTop.classList.remove("visible");
    }
  }, { passive: true });

  backToTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  console.log("🚀 智研通学术宣传页已就绪");
})();
