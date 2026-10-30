// Inline paths keep preview and PDF independent of icon fonts and network requests.
const paths = {
  age: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="M9 15h2v4"/>',
  gender: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  city: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  nativePlace: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  experienceYears: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
  phone: '<path d="m6 3 4 5-3 3c2 3 3 4 6 6l3-3 5 4-2 3C11 23 1 13 3 6Z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/>',
} as const;

export type ContactIcon = keyof typeof paths;

export function contactIcon(kind: ContactIcon): string {
  return `<svg class="r-contact-icon" data-icon="${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
}
