// The experimental page (/lorem-ipsum): one curved 3D wall of project tiles that follows the mouse
// (src/scripts/curve.ts), and a glass modal that shows one project's images one at a time.
//
// Grid: click or tap a tile to open its project. For keyboard and screen readers, the projects
// are also a list of buttons, shown when one of them has focus.
// Modal: one scroll (or swipe, or arrow key) moves exactly one image. The indicator on
// the right shows which image is on screen.

import { startCurve, type CurveProject } from './curve';

let page: AbortController | null = null;

export function initPeek() {
  page?.abort();
  page = new AbortController();
  const signal = page.signal;
  document.addEventListener('astro:before-swap', () => page?.abort(), { once: true, signal });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = document.querySelector<HTMLElement>('.peek-stage');
  const host = stage?.querySelector<HTMLElement>('.peek-canvas');
  const dialog = document.querySelector<HTMLDialogElement>('.peek-modal');
  if (!stage || !host || !dialog) return;

  // ---------- Modal ----------
  const lists = [...dialog.querySelectorAll<HTMLElement>('.peek-slides')];
  const dots = dialog.querySelector<HTMLElement>('.peek-dots')!;
  const count = dialog.querySelector<HTMLElement>('.peek-count')!;
  let list: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let index = 0;
  let total = 0;

  const show = (i: number) => {
    index = i;
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    [...dots.children].forEach((d, n) => d.classList.toggle('is-on', n === i));
  };
  const goTo = (i: number) => {
    if (!list) return;
    const next = Math.max(0, Math.min(total - 1, i));
    list.scrollTo({ top: next * list.clientHeight, behavior: reduce ? 'auto' : 'smooth' });
    show(next);
  };
  const openProject = (n: number, from: HTMLElement) => {
    opener = from;
    lists.forEach((l, i) => (l.hidden = i !== n));
    list = lists[n];
    total = list.children.length;
    dots.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
    list.scrollTop = 0;
    show(0);
    dialog.showModal();
    dialog.focus(); // focus the modal itself (Tab reaches the close button next)
  };

  // ---------- Grid ----------
  const projects = JSON.parse(stage.dataset.projects ?? '[]') as CurveProject[];
  host.tabIndex = -1; // so focus can come back here after closing a project opened by click
  // the wall stays below the title and description
  const header = document.querySelector<HTMLElement>('.peek-header');
  const stop = startCurve(host, projects, (n) => openProject(n, host), {
    topInset: () => header?.getBoundingClientRect().bottom ?? 0,
  });
  signal.addEventListener('abort', stop);

  for (const button of stage.querySelectorAll<HTMLButtonElement>('.peek-open')) {
    button.addEventListener('click', () => openProject(Number(button.dataset.project), button), { signal });
  }

  // Credit for the 3D models: the info button opens it; Escape, a second click or a click elsewhere closes it
  const info = document.querySelector<HTMLButtonElement>('.peek-info');
  const credit = document.querySelector<HTMLElement>('.peek-credit-text');
  if (info && credit) {
    const setCredit = (open: boolean) => {
      credit.hidden = !open;
      info.setAttribute('aria-expanded', String(open));
    };
    info.addEventListener('click', () => setCredit(credit.hidden), { signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !credit.hidden) {
        setCredit(false);
        info.focus();
      }
    }, { signal });
    document.addEventListener('pointerdown', (e) => {
      if (!credit.hidden && !(e.target as Element).closest('.peek-credit')) setCredit(false);
    }, { signal });
  }

  dialog.querySelector('.peek-close')?.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }), { signal });

  // Keep the indicator in step with swipes and native scrolling
  for (const l of lists) {
    l.addEventListener('scroll', () => {
      if (l !== list) return;
      const i = Math.round(l.scrollTop / l.clientHeight);
      if (i !== index) show(i);
    }, { passive: true, signal });
  }

  // One wheel gesture = one image. Trackpads keep sending events after a flick (momentum),
  // so a new step only starts after a short pause in the events, and not too soon after the last.
  let lastWheel = 0;
  let lastStep = 0;
  dialog.addEventListener('wheel', (e) => {
    if (!list) return;
    e.preventDefault();
    const now = performance.now();
    const pause = now - lastWheel > 180;
    lastWheel = now;
    if (!pause || now - lastStep < 450 || Math.abs(e.deltaY) < 2) return;
    lastStep = now;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false, signal });

  dialog.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      goTo(index + 1);
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      goTo(index - 1);
    }
  }, { signal });
}
