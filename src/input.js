/**
 * Input capture on the Core host page (CORE-IN-01). The frontend never sees input:
 * a transparent overlay sits above the iframe and the keyboard is handled here.
 */

const FLAP_KEYS = new Set(['Space', 'ArrowUp']);

function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target.isContentEditable;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.overlay element placed over the game
 * @param {() => void} options.onPress
 * @param {() => void} options.onTogglePause
 * @returns {() => void} detach function
 */
export function attachInput({ overlay, onPress, onTogglePause, doc = document }) {
  const onKeyDown = (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return; // held keys count once
    if (isTypingTarget(event.target)) return;
    if (FLAP_KEYS.has(event.code)) {
      event.preventDefault(); // no page scrolling
      onPress();
    } else if (event.code === 'KeyP') {
      onTogglePause();
    }
  };
  const onPointerDown = (event) => {
    event.preventDefault();
    if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
    onPress();
  };
  doc.addEventListener('keydown', onKeyDown);
  overlay.addEventListener('pointerdown', onPointerDown);
  return () => {
    doc.removeEventListener('keydown', onKeyDown);
    overlay.removeEventListener('pointerdown', onPointerDown);
  };
}
