// Alla foton i src/assets/images, nåbara via filnamnet utan ändelse (t.ex. 'kitchen-white').
const modules = import.meta.glob('../assets/images/*.jpg', { eager: true });

export const images = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/').pop().replace(/\.jpg$/, ''), mod.default]),
);

export function img(key) {
  const found = images[key];
  if (!found) throw new Error(`Bild saknas: ${key}`);
  return found;
}
