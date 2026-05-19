const baseUrl = import.meta.env.BASE_URL || '/';

export function assetUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  return new URL(cleanPath, window.location.origin + baseUrl).toString();
}
