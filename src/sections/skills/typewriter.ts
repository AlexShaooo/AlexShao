/**
 * Simple typewriter effect: adds characters one-by-one to an element.
 * Returns a handle to cancel the animation and await completion.
 */

export interface TypewriterHandle {
  cancel(): void;
  done: Promise<void>;
}

/**
 * Type `text` into `el` character by character.
 * @param el     Target element (textContent is replaced)
 * @param text   String to type out
 * @param charDelayMs  Milliseconds between characters (default 35)
 */
export function typewrite(
  el: HTMLElement,
  text: string,
  charDelayMs = 35,
): TypewriterHandle {
  let i = 0;
  let cancelled = false;
  el.textContent = '';

  const promise = new Promise<void>((resolve) => {
    const id = setInterval(() => {
      if (cancelled) {
        clearInterval(id);
        resolve();
        return;
      }
      if (i < text.length) {
        el.textContent += text[i];
        i++;
      } else {
        clearInterval(id);
        resolve();
      }
    }, charDelayMs);
  });

  return {
    cancel() { cancelled = true; },
    done: promise,
  };
}
