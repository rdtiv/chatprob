// Sheet only on a phone-width touch surface. Pointer-only (the old rule)
// opened a full-bleed docked card on coarse-pointer desktops and made the
// candidate popup span the window. Desktop stays the 300px popover.
export function shouldUseSheet({ coarse, narrow }) {
  return Boolean(coarse && narrow);
}

export const SHEET_POINTER = '(pointer: coarse), (hover: none)';
export const SHEET_NARROW = '(max-width: 640px)';
