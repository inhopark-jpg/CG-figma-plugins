// Figma REST API client. Runs in the UI iframe: the plugin sandbox has no
// fetch, and comments can only be created/deleted over REST.
//
// Auth is a personal access token with the scopes file_comments:read and
// file_comments:write. Note the API can create and delete comments but cannot
// edit one, so an entry's text is fixed once its comments are posted.

const API = 'https://api.figma.com/v1';

async function request(path, { method = 'GET', body, token }) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { 'X-Figma-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // `code` lets the UI show this in the current language; the message here is
    // the English fallback.
    throw Object.assign(new Error("Couldn't reach api.figma.com."), { code: 'errOffline' });
  }
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data && data.message ? ` · ${data.message}` : '';
    } catch (err) { /* no JSON body */ }
    // Callers check err.status: a 404 on DELETE means the comment is already
    // gone, which is a success, not a failure.
    const fail = (m, code) => Object.assign(new Error(m), { status: res.status, code });
    if (res.status === 403) throw fail(`Token rejected${detail}.`, 'err403');
    if (res.status === 404) throw fail(`Not found${detail}.`, 'err404');
    if (res.status === 429) throw fail('Figma is rate limiting the plugin.', 'err429');
    throw fail(`Figma API ${res.status}${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  listComments: (token, key) =>
    request(`/files/${key}/comments`, { token }).then((r) => (r && r.comments) || []),

  postComment: (token, key, message, clientMeta) =>
    request(`/files/${key}/comments`, { method: 'POST', token, body: { message, client_meta: clientMeta } }),

  deleteComment: (token, key, id) =>
    request(`/files/${key}/comments/${id}`, { method: 'DELETE', token }),
};

// Accepts a file key or any Figma file URL.
function parseFileKey(input) {
  const s = input.trim();
  const m = s.match(/figma\.com\/(?:file|design|board|proto)\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,}$/.test(s) ? s : null;
}
