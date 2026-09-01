// Vitest's Node integration workers already execute outside the browser.
// Production modules keep importing the real `server-only` marker.
export {};
