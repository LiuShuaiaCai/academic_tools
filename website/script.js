(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var menuButton = document.querySelector(".menu-button");
  var navLinks = document.querySelectorAll(".site-nav a");
  var reveals = document.querySelectorAll(".reveal");

  function updateHeader() {
    if (!header) {
      return;
    }
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  function closeMenu() {
    if (!header || !menuButton) {
      return;
    }
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

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

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
})();
