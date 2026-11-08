/** Loads the built-in frontends (browser). Bundles are plain { name, files } objects. */

const DEFAULT_FILES = ['index.html', 'style.css', 'main.js'];

async function loadBundle(name, baseUrl, fileNames, fetchImpl = fetch) {
  const files = {};
  for (const fileName of fileNames) {
    const response = await fetchImpl(`${baseUrl}/${fileName}`);
    if (!response.ok) throw new Error(`Could not load ${baseUrl}/${fileName} (${response.status})`);
    files[fileName] = await response.text();
  }
  return { name, files };
}

export const loadDefaultBundle = (fetchImpl) =>
  loadBundle('Flappy Kiro (default)', './src/frontend/default', DEFAULT_FILES, fetchImpl);

export const loadGuitarHeroBundle = (fetchImpl) =>
  loadBundle('Guitar Kiro', './src/frontend/examples/guitar-hero', DEFAULT_FILES, fetchImpl);

/**
 * Offline "themed" demo: recolours the default frontend between its THEME markers.
 * The hue comes from the prompt text, so different prompts give different looks.
 */
export function themeDefaultBundle(defaultBundle, prompt) {
  const palettes = [
    { match: /night|dark|moon|space/i, theme: { sky: '#0b1233', cloud: '#2b3a7a', pipe: '#6c3fb5', pipeCap: '#4a2a80', ghost: '#e8f0ff', eye: '#111111', text: '#e8f0ff', overlay: 'rgba(0,0,10,0.55)' } },
    { match: /sunset|orange|warm|desert/i, theme: { sky: '#ff9a62', cloud: '#ffe0c2', pipe: '#8b3a2f', pipeCap: '#5e241d', ghost: '#fffaf0', eye: '#222222', text: '#fffaf0', overlay: 'rgba(60,10,0,0.45)' } },
    { match: /under ?water|ocean|sea|fish/i, theme: { sky: '#0f6c8c', cloud: '#7fd6e8', pipe: '#2a9d8f', pipeCap: '#1b6f65', ghost: '#e9fbff', eye: '#003344', text: '#e9fbff', overlay: 'rgba(0,30,50,0.5)' } },
  ];
  const picked = palettes.find((p) => p.match.test(prompt)) ?? palettes[0];
  const themeSource = `const THEME = ${JSON.stringify(picked.theme, null, 2)};`;
  const main = defaultBundle.files['main.js'].replace(/const THEME = \{[\s\S]*?\};/, themeSource);
  return {
    name: `Themed: ${prompt.slice(0, 30) || 'night'}`,
    files: { ...defaultBundle.files, 'main.js': main },
  };
}
