// Account chip shared by the popup and the Analysis Panel: a "Sign in with
// Google" button when signed out; avatar + name + tier badge + sign-out when
// signed in. Pages own the container and styling hooks (.account-*); this
// module renders state and forwards clicks to the background via messages.
import { AuthState } from './auth';
import { HudMessage, HudResponse } from './messages';

function send(message: HudMessage): Promise<HudResponse> {
  return chrome.runtime.sendMessage(message);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

// Fallback avatar: first letter of the name in a colored circle.
function avatarHtml(state: AuthState): string {
  if (state.user.avatarUrl) {
    return `<img class="account-avatar" src="${esc(state.user.avatarUrl)}" alt="" referrerpolicy="no-referrer" />`;
  }
  const letter = (state.user.name || state.user.email || '?')[0]!.toUpperCase();
  return `<span class="account-avatar account-avatar-fallback">${esc(letter)}</span>`;
}

function render(el: HTMLElement, state: AuthState | null, busy = false, error = ''): void {
  if (busy) {
    el.innerHTML = `<span class="account-note">Signing in…</span>`;
    return;
  }
  if (!state) {
    el.innerHTML = `
      <button class="account-signin" id="account-signin">Sign in with Google</button>
      ${error ? `<span class="account-error" title="${esc(error)}">⚠</span>` : ''}`;
    return;
  }
  el.innerHTML = `
    ${avatarHtml(state)}
    <span class="account-name" title="${esc(state.user.email)}">${esc(state.user.name)}</span>
    <span class="account-tier ${state.tier}">${state.tier === 'pro' ? 'Pro' : 'Free'}</span>
    <button class="account-signout" id="account-signout" title="Sign out">Sign out</button>`;
}

export interface AccountChip {
  // Re-fetches auth state and re-renders (e.g. after the panel refreshes).
  refresh(): Promise<AuthState | null>;
}

// Mount the chip; returns a handle for re-syncing. onChange fires after any
// state change (sign-in/out) so pages can re-render tier-dependent views.
export function mountAccountChip(
  el: HTMLElement, onChange?: (state: AuthState | null) => void,
): AccountChip {
  let current: AuthState | null = null;

  async function refresh(): Promise<AuthState | null> {
    const res = await send({ type: 'get_auth_state' });
    current = res.ok ? res.auth ?? null : null;
    render(el, current);
    return current;
  }

  el.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.id === 'account-signin') {
      render(el, null, true);
      void (async () => {
        const res = await send({ type: 'sign_in' });
        current = res.ok ? res.auth ?? null : null;
        render(el, current, false, res.ok ? '' : res.error);
        onChange?.(current);
      })();
    } else if (target.id === 'account-signout') {
      void (async () => {
        await send({ type: 'sign_out' });
        current = null;
        render(el, null);
        onChange?.(null);
      })();
    }
  });

  void refresh();
  return { refresh };
}
