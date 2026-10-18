// Page changes without reloading (Astro's ClientRouter), so the music keeps playing.
//
// Astro normally swaps the whole <body>. Here everything is swapped except a few
// elements that live across pages and must never be moved in the document:
//   .song-player  the music (moving the Spotify embed would restart it)
//   .cursor-glow  the background glow
//   .page-mosh    the page transition, which covers the swap
// Component scripts that set things up on a page listen for 'astro:page-load',
// which fires on the first load and after every page change.
import { swapFunctions } from 'astro:transitions/client';

const KEEP = '.song-player, .cursor-glow, .page-mosh';

// Remember which page's colours the visitor is leaving (the experimental page tints its background with them)
document.addEventListener('astro:before-preparation', () => {
  if (document.body.dataset.page === 'peek') return;
  try {
    sessionStorage.setItem('came-from', document.body.dataset.theme || 'neutral');
  } catch {}
});

document.addEventListener('astro:before-swap', (e) => {
  e.swap = () => {
    const next = e.newDocument;
    swapFunctions.deselectScripts(next);
    swapFunctions.swapRootAttributes(next);
    swapFunctions.swapHeadElements(next);
    const restoreFocus = swapFunctions.saveFocus();

    // The <body> attributes (the case study colour theme)
    for (const attr of [...document.body.attributes]) document.body.removeAttribute(attr.name);
    for (const attr of next.body.attributes) document.body.setAttribute(attr.name, attr.value);

    // Out with the old page, in with the new one, around the elements that stay
    for (const el of [...document.body.children]) if (!el.matches(KEEP)) el.remove();
    const anchor = document.body.querySelector('.page-mosh');
    const nextAnchor = next.body.querySelector('.page-mosh');
    for (const el of [...next.body.children]) {
      if (el.matches(KEEP)) continue;
      const before = anchor && nextAnchor && el.compareDocumentPosition(nextAnchor) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (before) anchor.before(el);
      else document.body.append(el);
    }

    restoreFocus();
  };
});
