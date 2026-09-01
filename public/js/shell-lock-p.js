document.documentElement.setAttribute('data-shell','desktop');
document.documentElement.classList.add('is-desktop');
document.documentElement.classList.remove('is-mobile');
window.StudioShell={apply:function(){},isDesktop:function(){return true;}};
