// DBBet Kenya — shared JS
(function () {
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.getAttribute('data-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      var t = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = t; }, 1400);
    });
  });

  // Mobile menu — built from the existing nav so every page gets it automatically
  var header = document.querySelector('header');
  var nav = header && header.querySelector('.nav');
  var links = header && header.querySelector('.nav-links');
  var cta = header && header.querySelector('.nav-cta');
  if (nav && (links || cta)) {
    var toggle = document.createElement('button');
    toggle.className = 'menu-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    nav.appendChild(toggle);

    var panel = document.createElement('div');
    panel.className = 'mobile-menu';
    if (links) panel.innerHTML = links.innerHTML;
    if (cta) {
      var c = document.createElement('div');
      c.className = 'mm-cta';
      c.innerHTML = cta.innerHTML;
      panel.appendChild(c);
    }
    header.appendChild(panel);

    var close = function () { header.classList.remove('menu-open'); toggle.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
  }

  // Sticky mobile registration CTA — built once here, shown on mobile via CSS.
  // (On mobile the header Register button is hidden behind the menu, so this
  // keeps a one-tap registration path visible at all times.)
  var reg = document.querySelector('header .nav-cta a.btn-primary')
    || document.querySelector('a.btn-primary[href*="refpa"]');
  if (reg && !document.querySelector('.sticky-cta')) {
    var bar = document.createElement('div');
    bar.className = 'sticky-cta';
    bar.innerHTML =
      '<div class="sc-text">' +
        '<span class="sc-lbl">Welcome bonus</span>' +
        '<span class="sc-bonus">100% up to <b>KES 14,803</b></span>' +
      '</div>' +
      '<a class="btn btn-primary sc-btn" href="' + reg.getAttribute('href') + '">Register</a>';
    document.body.appendChild(bar);
  }
})();
