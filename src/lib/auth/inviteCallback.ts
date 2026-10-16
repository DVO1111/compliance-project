export function isInviteCallback(search: string, hash: string): boolean {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return queryParams.get('type') === 'invite' || hashParams.get('type') === 'invite';
}