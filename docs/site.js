// Doc Orbit : navigation sans rechargement (comme les onglets d'Orbit) et mouvements discrets, sans bibliothèque.
(() => {
  const d = document;
  d.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPRING = CSS.supports('transition-timing-function', 'linear(0, 1)')
    ? 'linear(0, .142 10%, .38 20%, .589 30%, .74 40%, .841 50%, .905 60%, .945 70%, .968 80%, .982 90%, 1)'
    : 'cubic-bezier(.2, .9, .25, 1)';
  const PAGES = window.ORBIT_DOC_PAGES || null; // pages.js ; absent = navigation classique
  const main = d.querySelector('main');
  const layout = d.querySelector('.layout');
  const navUl = d.querySelector('.side ul');
  const navLinks = navUl ? [...navUl.querySelectorAll('a')] : [];
  const fileOf = (path) => decodeURIComponent(path.split('/').pop() || 'index.html');
  // En file://, Edge et Chrome refusent pushState vers un autre fichier (origine « null ») : la page visée passe
  // alors dans le fragment, « index.html#/drive.html », toujours permis. En ligne : vraie adresse.
  const ROUTE = /^#\/([^#/]+\.html)(#.*)?$/;
  const route = () => ROUTE.exec(location.hash) || [];
  let hashMode = !!route()[1];
  let curName = route()[1] || fileOf(location.pathname);
  let skipHash = false;

  // ── Pastille du menu : glisse d'un lien à l'autre, comme la barre latérale d'Orbit ──
  const pill = d.createElement('span');
  pill.className = 'pill still';
  const place = (a) => {
    const y = a.getBoundingClientRect().top - navUl.getBoundingClientRect().top; // les li sont positionnés : pas offsetTop
    pill.style.height = a.offsetHeight + 'px';
    pill.style.transform = 'translateY(' + y + 'px)';
  };
  let here = navLinks.findIndex((a) => a.hasAttribute('aria-current'));
  if (here >= 0) {
    navUl.prepend(pill);
    navUl.classList.add('has-pill');
    place(navLinks[here]);
    pill.getBoundingClientRect();
    pill.classList.remove('still');
  }

  // ── Ombre de la barre du haut seulement quand le contenu passe dessous ──
  const top = d.querySelector('.top');
  const edge = () => top && top.classList.toggle('scrolled', scrollY > 4);
  addEventListener('scroll', edge, { passive: true });
  edge();

  // ── Ce qui dépend du contenu de la page : relancé après chaque changement de page ──
  let io = null;
  let spy = () => {};
  const setup = (fresh) => {
    if (io) io.disconnect();
    io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -6% 0px' });
      const blocks = [...d.querySelectorAll('article > *')].filter((el) => !el.matches('h1, .cards, .gallery'));
      const kids = [...d.querySelectorAll('.cards > a, .gallery > img')];
      kids.forEach((el) => el.style.setProperty('--i', [...el.parentNode.children].indexOf(el) % 6));
      blocks.concat(kids).forEach((el) => {
        if (el.getBoundingClientRect().top < innerHeight) return; // le haut arrive avec la transition de page
        el.classList.add('rv');
        io.observe(el);
      });
    }
    d.querySelectorAll('.cards a, .hero').forEach((el) => el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', (e.clientX - r.left) + 'px');
      el.style.setProperty('--y', (e.clientY - r.top) + 'px');
    }));
    d.querySelectorAll('figure img, .gallery img').forEach((img) => {
      if (img.complete) return;
      img.classList.add('ld');
      const done = () => img.classList.remove('ld');
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
    // Sur cette page : section en cours + indicateur qui glisse.
    const links = [...d.querySelectorAll('.toc a')];
    spy = () => {};
    if (links.length) {
      const ind = d.createElement('span');
      ind.className = 'ind';
      links[0].closest('ul').prepend(ind);
      const heads = links.map((a) => d.getElementById(decodeURIComponent(a.hash.slice(1))));
      spy = () => {
        let cur = 0;
        heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top < 140) cur = i; });
        links.forEach((a, i) => a.classList.toggle('on', i === cur));
        const a = links[cur];
        ind.style.opacity = 1;
        ind.style.height = a.offsetHeight + 'px';
        ind.style.transform = 'translateY(' + a.offsetTop + 'px)';
      };
      spy();
    }
    if (fresh) preload();
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; spy(); }); } }, { passive: true });

  // Décode à l'avance les captures du haut des autres pages : le changement de page reste instantané.
  const preload = () => {
    if (!PAGES || preload.done) return;
    preload.done = true;
    const run = () => Object.values(PAGES).forEach((p) => {
      const m = /<img alt="[^"]*" src="([^"]+)"/.exec(p.body);
      if (m) { const i = new Image(); i.decoding = 'async'; i.src = m[1]; }
    });
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 1500);
  };

  // ── Changement de page sans rechargement ──
  const show = (name, dir, hash) => {
    const p = PAGES && PAGES[name];
    if (!p) return false;
    d.querySelector('article').innerHTML = p.body;
    d.querySelector('.pager').innerHTML = p.pager;
    const oldToc = d.querySelector('.toc');
    if (oldToc) oldToc.remove();
    if (p.toc) layout.insertAdjacentHTML('beforeend', p.toc);
    d.title = p.title;
    const lang = d.querySelector('.lang');
    if (lang) lang.setAttribute('href', p.other);
    navLinks.forEach((a) => a.removeAttribute('aria-current'));
    const to = navLinks.findIndex((a) => a.getAttribute('href') === name);
    if (to >= 0) { navLinks[to].setAttribute('aria-current', 'page'); place(navLinks[to]); }
    here = to;
    curName = name;
    const target = hash && d.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView(); else scrollTo(0, 0);
    main.getAnimations().forEach((x) => x.cancel());
    main.animate([{ opacity: 0, transform: 'translateX(' + (dir * 28) + 'px)' }, { opacity: 1, transform: 'none' }],
      { duration: 480, easing: SPRING });
    setup(false);
    edge();
    return true;
  };
  const dirTo = (name) => {
    const to = navLinks.findIndex((a) => a.getAttribute('href') === name);
    return to < 0 || here < 0 || to === here ? 0 : (to > here ? 1 : -1);
  };
  const scrollToHash = (hash) => {
    const t = hash && d.getElementById(decodeURIComponent(hash.slice(1)));
    if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); else scrollTo({ top: 0, behavior: 'smooth' });
  };
  d.addEventListener('click', (e) => {
    if (!PAGES) return;
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
    const href = a.getAttribute('href');
    if (hashMode && href.charAt(0) === '#') { e.preventDefault(); scrollToHash(href); return; } // garder la route
    if (!/^[^:/]+\.html(#.*)?$/.test(href)) return; // pages de la même langue seulement (pas en/, ../, http…)
    const url = new URL(a.href);
    const name = fileOf(url.pathname);
    if (!PAGES[name]) return;
    e.preventDefault();
    if (name === curName) { scrollToHash(url.hash); return; }
    const dir = dirTo(name);
    if (!hashMode) {
      try { history.pushState({ name: name }, '', url.href); } catch (err) { hashMode = true; }
    }
    if (hashMode) { skipHash = true; location.hash = '/' + name + url.hash; }
    show(name, dir, url.hash);
  });
  const fromHistory = () => {
    const m = route();
    const name = m[1] || fileOf(location.pathname);
    if (PAGES && PAGES[name] && name !== curName) show(name, dirTo(name), m[1] ? m[2] : location.hash);
  };
  addEventListener('popstate', fromHistory);
  addEventListener('hashchange', () => { if (skipHash) { skipHash = false; return; } fromHistory(); });

  // ── Zoom des captures : part de sa place et y revient ; interruptible (repart de la position affichée) ──
  let open = null;
  const toThumb = (big, thumb) => {
    const r0 = thumb.getBoundingClientRect(), r1 = big.getBoundingClientRect();
    return 'translate(' + (r0.left - r1.left) + 'px,' + (r0.top - r1.top) + 'px) scale(' + (r0.width / r1.width) + ')';
  };
  const close = () => {
    if (!open) return;
    const { box, big, thumb } = open;
    open = null;
    box.classList.remove('on');
    const finish = () => { box.remove(); thumb.style.visibility = ''; };
    if (reduce) {
      big.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' }).onfinish = finish;
      return;
    }
    const cur = getComputedStyle(big).transform;
    big.getAnimations().forEach((x) => x.cancel());
    const to = toThumb(big, thumb);
    big.animate([{ transform: cur }, { transform: to }], { duration: 380, easing: SPRING, fill: 'forwards' }).onfinish = finish;
  };
  d.addEventListener('click', (e) => {
    const a = e.target.closest('figure a');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const thumb = a.querySelector('img');
    const box = d.createElement('div');
    box.className = 'lb';
    const big = new Image();
    big.src = a.href;
    big.alt = thumb.alt;
    box.append(big);
    box.addEventListener('click', close);
    d.body.append(box);
    const go = () => {
      thumb.style.visibility = 'hidden';
      requestAnimationFrame(() => box.classList.add('on'));
      if (reduce) big.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease' });
      else big.animate([{ transform: toThumb(big, thumb) }, { transform: 'none' }], { duration: 460, easing: SPRING });
      open = { box, big, thumb };
    };
    (big.decode ? big.decode() : Promise.resolve()).then(go, go);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  if (hashMode && PAGES && PAGES[curName] && curName !== fileOf(location.pathname)) {
    const start = route();
    curName = '';
    show(start[1], 0, start[2]); // rechargement sur « index.html#/drive.html » : on rouvre drive
  } else {
    try { history.replaceState({ name: curName }, '', location.href); } catch (err) { /* file:// : sans importance */ }
    setup(true);
  }
})();
