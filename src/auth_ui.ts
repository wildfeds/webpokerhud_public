// Account chip shared by the popup and the Analysis Panel: a "Sign in with
// Google" button when signed out; avatar + name + tier badge + sign-out when
// signed in. Pages own the container and styling hooks (.account-*); this
// module renders state and forwards clicks to the background via messages.
import { AuthState } from './auth';
import { HudMessage, HudResponse } from './messages';
import { html, setHtml, SafeHtml } from './ui/html';

function send(message: HudMessage): Promise<HudResponse> {
  return chrome.runtime.sendMessage(message);
}

// Fallback avatar: first letter of the name in a colored circle.
function avatarHtml(state: AuthState): SafeHtml {
  if (state.user.avatarUrl) {
    return html`<img class="account-avatar" src="${state.user.avatarUrl}" alt="" referrerpolicy="no-referrer" />`;
  }
  const letter = (state.user.name || state.user.email || '?')[0]!.toUpperCase();
  return html`<span class="account-avatar account-avatar-fallback">${letter}</span>`;
}

function render(el: HTMLElement, state: AuthState | null, busy = false, error = ''): void {
  if (busy) {
    setHtml(el, html`<span class="account-note">Signing in…</span>`);
    return;
  }
  if (!state) {
    setHtml(el, html`
      <button class="account-signin" id="account-signin">Sign in with Google</button>
      ${error ? html`<span class="account-error" title="${error}">⚠</span>` : ''}`);
    return;
  }
  setHtml(el, html`
    ${avatarHtml(state)}
    <span class="account-name" title="${state.user.email}">${state.user.name}</span>
    <span class="account-tier ${state.tier}">${state.tier === 'pro' ? 'Pro' : 'Free'}</span>
    <button class="account-signout" id="account-signout" title="Sign out">Sign out</button>`);
}

export interface AccountChip {
  // Re-fetches auth state and re-renders (e.g. after the panel refreshes).
  refresh(): Promise<AuthState | null>;
}

// Mount the chip; returns a handle for re-syncing. onChange fires after any
// state change (sign-in/out) so pages can re-render tier-dependent views.
// The live auth state costs a network round trip (tier check) on every open,
// so the last known state is kept in storage.local and painted first; the
// live answer replaces it. A stale chip for ~300ms beats an empty one.
const AUTH_SNAPSHOT_KEY = 'auth_snapshot';

export function mountAccountChip(
  el: HTMLElement, onChange?: (state: AuthState | null) => void,
): AccountChip {
  let current: AuthState | null = null;
  let live = false;   // true once the background has answered at least once

  void chrome.storage.local.get({ [AUTH_SNAPSHOT_KEY]: null }).then(stored => {
    const snap = stored[AUTH_SNAPSHOT_KEY] as AuthState | null;
    if (!live && snap) render(el, snap);
  });

  async function refresh(): Promise<AuthState | null> {
    const res = await send({ type: 'get_auth_state' });
    current = res.ok ? res.auth ?? null : null;
    live = true;
    render(el, current);
    void chrome.storage.local.set({ [AUTH_SNAPSHOT_KEY]: current });
    return current;
  }

  el.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.id === 'account-signin') {
      render(el, null, true);
      void (async () => {
        const res = await send({ type: 'sign_in' });
        current = res.ok ? res.auth ?? null : null;
        live = true;
        render(el, current, false, res.ok ? '' : res.error);
        void chrome.storage.local.set({ [AUTH_SNAPSHOT_KEY]: current });
        onChange?.(current);
      })();
    } else if (target.id === 'account-signout') {
      void (async () => {
        await send({ type: 'sign_out' });
        current = null;
        live = true;
        render(el, null);
        void chrome.storage.local.set({ [AUTH_SNAPSHOT_KEY]: null });
        onChange?.(null);
      })();
    }
  });

  void refresh();
  return { refresh };
}
