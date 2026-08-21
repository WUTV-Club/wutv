/* ==========================================================================
   WUTV — site.js
   One deferred, cacheable script shared by every page. Replaces the three
   separate inline <script> blocks that used to ship (uncached) with each
   HTML document.

   Everything here is feature-detected and no-ops cleanly on pages that do
   not contain the relevant elements.
   ========================================================================== */
(function () {
    'use strict';

    var root = document.documentElement;
    var STORAGE_THEME = 'wutv_theme';
    var STORAGE_REC = 'wutv_recmode';

    /* Safe localStorage access — Safari private mode throws on write. */
    function readStore(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeStore(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    /* --- Theme ------------------------------------------------------------
       The initial theme is applied by a tiny inline script in <head> so the
       page never flashes the default palette. This only handles switching. */

    function setTheme(theme) {
        if (theme === 'default') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', theme);
        writeStore(STORAGE_THEME, theme);
    }
    window.setTheme = setTheme;

    /* --- Lens / REC overlay ----------------------------------------------- */

    var isRecMode = false;
    var GLOW = 'shadow-[0_0_10px_rgba(239,68,68,1)]';

    function toggleRecMode(forceState) {
        var overlay = document.getElementById('rec-overlay');
        if (!overlay) return;

        isRecMode = (forceState === undefined || forceState === null) ? !isRecMode : !!forceState;
        if (forceState === undefined || forceState === null) writeStore(STORAGE_REC, String(isRecMode));

        var indicators = document.querySelectorAll('.rec-indicator');

        if (isRecMode) {
            overlay.classList.remove('hidden');
            // Force a reflow so the opacity transition actually runs.
            void overlay.offsetWidth;
            overlay.classList.remove('opacity-0');
            overlay.setAttribute('aria-hidden', 'false');
            indicators.forEach(function (dot) {
                dot.classList.remove('bg-gray-500');
                dot.classList.add('bg-red-500', GLOW);
            });
        } else {
            overlay.classList.add('opacity-0');
            overlay.setAttribute('aria-hidden', 'true');
            indicators.forEach(function (dot) {
                dot.classList.remove('bg-red-500', GLOW);
                dot.classList.add('bg-gray-500');
            });
            window.setTimeout(function () {
                if (!isRecMode) overlay.classList.add('hidden');
            }, 500);
        }
    }
    window.toggleRecMode = toggleRecMode;

    /* --- Expandable "Our Work" cards -------------------------------------- */

    function toggleCard(card) {
        var content = card.querySelector('.expand-content');
        if (!content) return;
        var expanded = content.classList.contains('max-h-40');

        content.classList.toggle('max-h-40', !expanded);
        content.classList.toggle('opacity-100', !expanded);
        content.classList.toggle('mt-4', !expanded);
        card.setAttribute('aria-expanded', String(!expanded));
    }
    window.toggleCard = toggleCard;

    function handleCardKey(event, card) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleCard(card);
        }
    }
    window.handleCardKey = handleCardKey;

    /* --- Collapsed navigation menu ----------------------------------------
       Below 1024px the nav links live in a panel behind the toggle. CSS owns
       the appearance; this only tracks open/closed state. */

    function initNavMenu() {
        var toggle = document.getElementById('nav-toggle');
        var panel = document.getElementById('nav-panel');
        if (!toggle || !panel) return;

        function isOpen() {
            return toggle.getAttribute('aria-expanded') === 'true';
        }

        function setOpen(open) {
            panel.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }

        toggle.addEventListener('click', function () {
            setOpen(!isOpen());
        });

        // Close on selection, so the panel is not left covering the section
        // the link just jumped to.
        panel.addEventListener('click', function (event) {
            if (event.target.closest('a')) setOpen(false);
        });

        document.addEventListener('click', function (event) {
            if (!isOpen()) return;
            if (toggle.contains(event.target) || panel.contains(event.target)) return;
            setOpen(false);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || !isOpen()) return;
            setOpen(false);
            toggle.focus();
        });

        // Growing past the breakpoint would otherwise leave a stale open panel
        // behind the now-hidden toggle.
        if (window.matchMedia) {
            var wide = window.matchMedia('(min-width: 1024px)');
            var onWide = function (event) { if (event.matches) setOpen(false); };
            if (wide.addEventListener) wide.addEventListener('change', onWide);
            else if (wide.addListener) wide.addListener(onWide);
        }
    }

    /* --- Custom cursor -----------------------------------------------------
       Skipped entirely on touch/coarse-pointer devices, so phones never
       register a pointermove listener or run the animation frame loop. */

    function initCursor() {
        var cursor = document.getElementById('cursor');
        if (!cursor) return;
        if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        root.classList.add('has-custom-cursor');

        var x = -100, y = -100, queued = false;

        function paint() {
            queued = false;
            cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        }

        document.addEventListener('pointermove', function (e) {
            x = e.clientX;
            y = e.clientY;
            // Coalesce to one paint per frame instead of one per mouse event.
            if (!queued) {
                queued = true;
                window.requestAnimationFrame(paint);
            }
        }, { passive: true });

        // Delegated hover state: one pair of listeners for the whole document
        // rather than two per interactive element.
        var HOVER_SELECTOR = 'a, button, .interactive, .cursor-pointer, [role="button"], iframe';

        document.addEventListener('pointerover', function (e) {
            if (e.target.closest && e.target.closest(HOVER_SELECTOR)) {
                document.body.classList.add('hover-active');
            }
        }, { passive: true });

        document.addEventListener('pointerout', function (e) {
            var from = e.target.closest && e.target.closest(HOVER_SELECTOR);
            if (!from) return;
            if (e.relatedTarget && from.contains(e.relatedTarget)) return;
            document.body.classList.remove('hover-active');
        }, { passive: true });
    }

    /* --- Scroll reveal ----------------------------------------------------- */

    function initReveal() {
        var targets = document.querySelectorAll('.reveal');
        if (!targets.length) return;

        if (!('IntersectionObserver' in window)) {
            for (var i = 0; i < targets.length; i++) targets[i].classList.add('active');
            return;
        }

        var observer = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

        targets.forEach(function (el) { observer.observe(el); });
    }

    /* --- Deferred iframes --------------------------------------------------
       The Google Calendar embed is by far the heaviest thing on the site.
       Its real src is held in data-src and only swapped in once the frame is
       close to the viewport, so it never competes with the first paint. */

    function initDeferredFrames() {
        var frames = document.querySelectorAll('iframe[data-src]');
        if (!frames.length) return;

        function load(frame) {
            if (frame.dataset.src) {
                frame.src = frame.dataset.src;
                delete frame.dataset.src;
            }
        }

        if (!('IntersectionObserver' in window)) {
            frames.forEach(load);
            return;
        }

        var observer = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    load(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: '400px 0px' });

        frames.forEach(function (frame) { observer.observe(frame); });
    }

    /* --- Boot -------------------------------------------------------------- */

    function init() {
        // Restore the lens overlay without writing back to storage.
        if (readStore(STORAGE_REC) === 'true') toggleRecMode(true);

        initNavMenu();
        initCursor();
        initReveal();
        initDeferredFrames();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
