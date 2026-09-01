(function () {
  var BP = 1024;
  function shell() {
    try {
      return window.innerWidth >= BP ? 'desktop' : 'mobile';
    } catch (e) {
      return 'mobile';
    }
  }
  function apply() {
    var s = shell();
    document.documentElement.setAttribute('data-shell', s);
    document.documentElement.classList.toggle('is-desktop', s === 'desktop');
    document.documentElement.classList.toggle('is-mobile', s === 'mobile');
  }
  apply();
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(apply, 120);
  });
  window.StudioShell = { apply: apply, isDesktop: function () { return shell() === 'desktop'; } };
})();
