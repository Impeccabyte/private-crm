/**
 * Address of a user's profile photo, or null when they have none (show initials instead).
 * The photo is served by /api/avatars/[id] to signed-in users only. Each upload gets a new id, so the
 * address changes whenever the photo does and browsers can cache it. Safe to import from client components.
 */
export function avatarSrc(avatarKey: string | null | undefined): string | null {
  const id = avatarKey?.match(/([0-9a-f-]{36})\.bin$/)?.[1];
  return id ? `/api/avatars/${id}` : null;
}
