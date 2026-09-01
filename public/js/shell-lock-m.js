document.documentElement.setAttribute('data-shell','mobile');
document.documentElement.classList.add('is-mobile');
document.documentElement.classList.remove('is-desktop');
window.StudioShell={apply:function(){},isDesktop:function(){return false;}};
