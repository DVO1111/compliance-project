export function isInviteCallback(search: string, hash: string): boolean {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return queryParams.get('type') === 'invite'
    || hashParams.get('type') === 'invite'
    || queryParams.get('setup') === '1';
}

export function isPasswordRecoveryCallback(search: string, hash: string): boolean {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return queryParams.get('recovery') === '1'
    || (queryParams.has('code') && queryParams.get('recovery') === '1')
    || queryParams.get('type') === 'recovery'
    || hashParams.get('type') === 'recovery';
}