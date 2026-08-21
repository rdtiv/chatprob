import { useEffect, useState } from 'react';

export function useSheetMode() {
  const [isSheet, setIsSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse), (hover: none)').matches
  );
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse), (hover: none)');
    const sync = () => setIsSheet(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return isSheet;
}

function observeSurfaceEdges(apply) {
  apply();
  const vv = window.visualViewport;
  const form = document.querySelector('.message-form');
  const observer = typeof ResizeObserver !== 'undefined' && form ? new ResizeObserver(apply) : null;
  observer?.observe(form);
  window.addEventListener('resize', apply);
  vv?.addEventListener('resize', apply);
  vv?.addEventListener('scroll', apply);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', apply);
    vv?.removeEventListener('resize', apply);
    vv?.removeEventListener('scroll', apply);
  };
}

export function useAnchoredSurface({ ref, isSheet, anchor, remeasureKey }) {
  useEffect(() => {
    if (!ref.current) return;
    const card = ref.current;
    if (isSheet) {
      card.style.top = '';
      card.style.left = '';
      return;
    }
    const apply = () => {
      if (!ref.current) return;
      const rect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const padding = 12;
      const header = document.querySelector('.chat-header');
      const legend = document.querySelector('.confidence-legend');
      const form = document.querySelector('.message-form');
      const chromeBottom = (legend || header)?.getBoundingClientRect().bottom ?? 0;
      const topSafe = Math.max(padding, chromeBottom + 8);
      const bottomSafe = form
        ? form.getBoundingClientRect().top - 8
        : window.innerHeight - 80;

      // Prefer below the token so the card does not cover the header/legend.
      let top = anchor.y + 20;
      let left = anchor.x - (rect.width / 2);

      if (top + rect.height > bottomSafe) {
        top = anchor.y - rect.height - 8;
      }
      if (top < topSafe) {
        top = topSafe;
      }
      if (top + rect.height > bottomSafe) {
        top = Math.max(topSafe, bottomSafe - rect.height);
      }

      left = Math.max(padding, Math.min(left, viewportWidth - rect.width - padding));

      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    };
    return observeSurfaceEdges(apply);
  }, [ref, anchor, isSheet, remeasureKey]);

  // `bottom` on a fixed element is measured from the layout viewport, which iOS does
  // not shrink for the keyboard; `visualViewport.offsetTop + height` is the bottom of
  // what is actually visible; `min(formTop, viewportBottom)` docks above the composer
  // when visible, above the keyboard when not.
  useEffect(() => {
    if (!isSheet) {
      const card = ref.current;
      if (card) { card.style.bottom = ''; card.style.maxHeight = ''; }
      return undefined;
    }
    const vv = window.visualViewport;
    const apply = () => {
      const card = ref.current;
      if (!card) return;
      const vvTop = vv ? vv.offsetTop : 0;
      const vvHeight = vv ? vv.height : window.innerHeight;
      const viewportBottom = vvTop + vvHeight;
      const form = document.querySelector('.message-form');
      const formTop = form ? form.getBoundingClientRect().top : viewportBottom;
      const dockTop = Math.min(formTop, viewportBottom) - 8;
      card.style.bottom = `${window.innerHeight - dockTop}px`;
      card.style.maxHeight = `${Math.min(dockTop - vvTop - 12, Math.max(160, Math.round(vvHeight * 0.55)))}px`;
    };
    return observeSurfaceEdges(apply);
  }, [ref, isSheet, remeasureKey]);
}
