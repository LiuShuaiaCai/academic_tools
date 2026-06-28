/* ============================================
   智研通学术 — 宣传页交互脚本
   ============================================ */

(function () {
  'use strict';

  // --- Navbar scroll effect ---
  const navbar = document.getElementById('navbar');
  const scrollThreshold = 80;

  function updateNavbar() {
    if (window.scrollY > scrollThreshold) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar(); // initial check

  // --- Mobile hamburger ---
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      navLinks.classList.toggle('active');
    });

    // Close nav when clicking a link on mobile
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('active');
      });
    });
  }

  // --- AOS (Animate on Scroll) ---
  const aosElements = document.querySelectorAll('[data-aos]');

  function initAOS() {
    const observerOptions = {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('aos-animate');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    aosElements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // Fallback for browsers without IntersectionObserver
  if ('IntersectionObserver' in window) {
    initAOS();
  } else {
    aosElements.forEach(function (el) {
      el.classList.add('aos-animate');
    });
  }

  // --- Smooth scroll for anchor links (enhanced) ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      var targetId = this.getAttribute('href').substring(1);
      var target = document.getElementById(targetId);
      if (target) {
        var offsetTop = target.offsetTop - 80; // navbar height offset
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });

  // --- Scroll progress bar ---
  var progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    window.addEventListener('scroll', function () {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var scrollPercent = (window.scrollY / docHeight) * 100;
      progressBar.style.width = Math.min(scrollPercent, 100) + '%';
    }, { passive: true });
  }

  // --- Parallax effect for hero shapes ---
  var heroSection = document.querySelector('.hero');
  var shapes = document.querySelectorAll('.hero-bg-shapes .shape');

  if (heroSection && shapes.length) {
    window.addEventListener('scroll', function () {
      var scrolled = window.pageYOffset;
      var heroHeight = heroSection.offsetHeight;
      var heroTop = heroSection.offsetTop;
      var relativeScroll = scrolled - heroTop;

      if (relativeScroll < heroHeight && relativeScroll > -heroHeight) {
        var factor = relativeScroll / heroHeight;
        if (shapes[0]) {
          shapes[0].style.transform = 'translateY(' + (factor * 60) + 'px)';
        }
        if (shapes[1]) {
          shapes[1].style.transform = 'translateY(' + (factor * -40) + 'px)';
        }
        if (shapes[2]) {
          shapes[2].style.transform = 'translate(-50%, -50%) translateY(' + (factor * 30) + 'px)';
        }
      }
    }, { passive: true });
  }

  // --- Active nav link highlight based on scroll position ---
  var sections = [];
  document.querySelectorAll('section[id]').forEach(function (section) {
    sections.push({
      id: section.id,
      top: section.offsetTop - 150,
      bottom: section.offsetTop + section.offsetHeight - 150
    });
  });

  var navItems = document.querySelectorAll('.nav-links a');

  function highlightNav() {
    var scrollPos = window.scrollY;

    var currentId = '';
    sections.forEach(function (sec) {
      if (scrollPos >= sec.top && scrollPos < sec.bottom) {
        currentId = sec.id;
      }
    });

    navItems.forEach(function (link) {
      link.style.color = '';
      if (link.getAttribute('href') === '#' + currentId) {
        link.style.color = 'var(--primary)';
      }
    });
  }

  window.addEventListener('scroll', highlightNav, { passive: true });

  // --- AOS: handle staggered delays ---
  var aosItems = document.querySelectorAll('[data-aos-delay]');
  if (aosItems.length && 'IntersectionObserver' in window) {
    var delayObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('aos-animate');
          delayObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    aosItems.forEach(function (el) { delayObserver.observe(el); });
  }

  // --- Back to top button ---
  var backToTop = document.createElement('div');
  backToTop.className = 'back-to-top';
  backToTop.innerHTML = '↑';
  backToTop.setAttribute('aria-label', '回到顶部');
  document.body.appendChild(backToTop);

  window.addEventListener('scroll', function () {
    if (window.scrollY > 600) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
  }, { passive: true });

  backToTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  console.log('🚀 智研通学术宣传页已就绪');
})();
