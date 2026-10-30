// Inline paths keep preview and PDF independent of icon fonts and network requests.
const paths = {
  age: '<path d="M4 21h16"/><path d="M5.5 21v-7A1.5 1.5 0 0 1 7 12.5h10a1.5 1.5 0 0 1 1.5 1.5v7"/><path d="M8 12.5V9M12 12.5V9M16 12.5V9"/><circle cx="8" cy="7.4" r="1"/><circle cx="12" cy="7.4" r="1"/><circle cx="16" cy="7.4" r="1"/>',
  birthMonth: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="M7 15h.01M12 15h.01M17 15h.01M7 18h.01M12 18h.01"/>',
  gender: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  city: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  nativePlace: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  ethnicity: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15.5 6a3 3 0 0 1 0 5.6"/><path d="M17.5 14.4A5 5 0 0 1 20.5 20"/>',
  maritalStatus: '<path d="M12 20s-6.5-4-6.5-8.6A3.9 3.9 0 0 1 12 8.1a3.9 3.9 0 0 1 6.5 3.3C18.5 16 12 20 12 20Z"/>',
  politicalStatus: '<path d="M6 21V4"/><path d="M6 4.5c2-1.5 3.6.9 5.6-.6s3.4-1.4 5.4.1v6c-2 1.5-3.4-.9-5.4.6S8 12 6 10.5"/>',
  height: '<path d="M12 4v16"/><path d="m8.5 7.5 3.5-3.5 3.5 3.5"/><path d="m8.5 16.5 3.5 3.5 3.5-3.5"/>',
  weight: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 15.5a3.5 3.5 0 0 1 7 0"/><path d="M12 8.5v3"/>',
  experienceYears: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
  phone: '<path d="m6 3 4 5-3 3c2 3 3 4 6 6l3-3 5 4-2 3C11 23 1 13 3 6Z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/>',
} as const;

export type ContactIcon = keyof typeof paths;

export function contactIcon(kind: ContactIcon): string {
  return `<svg class="r-contact-icon" data-icon="${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
}
