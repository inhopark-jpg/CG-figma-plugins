// Change Marker — plugin UI (iframe).
// Owns the entry list and all REST calls; the sandbox (code.js) persists data,
// resolves where a comment should be pinned, and moves the view to a pin.

// Entry colors. Comments can't be colored, so each color also maps to a square
// emoji that starts the comment text — that's the color coding developers see.
const PALETTE = [
  { hex: '#F24822', emoji: '🟥' },
  { hex: '#FF8A00', emoji: '🟧' },
  { hex: '#FFC700', emoji: '🟨' },
  { hex: '#14AE5C', emoji: '🟩' },
  { hex: '#0D99FF', emoji: '🟦' },
  { hex: '#9747FF', emoji: '🟪' },
  { hex: '#8B5E3C', emoji: '🟫' },
  { hex: '#333333', emoji: '⬛' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every comment ends with its id: "🟥 9.21 변경사항 · 변경 ID: 13ctm0".
// Figma replaces a comment (new id of its own) when its pin is dragged and the
// text carries over, so this is what re-links a row to it. The older labels are
// what earlier versions wrote.
const TAG_RE = /(?:변경 ID:\s*|Change ID:\s*|주석 ID:\s*|#)([a-z0-9]{6})\s*$/;
const LEGACY_MARK = '다음 날짜까지 해당 주석 표시:';

const S = {
  view: 'list',          // 'setup' | 'list' | 'detail' | 'form'
  tab: 'entries',        // list view tab: 'entries' | 'comments'
  lang: 'ko',            // 'ko' | 'en'
  entries: [],           // { id, label, color, createdAt, expiresAt, comments: [] }
  today: '',
  token: '',
  fileKey: '',
  leftovers: [],         // ids of our comments that belong to no group
  released: 0,           // comments dropped by the last sync because they were edited
  activeId: null,
  form: null,
  setup: null,
  armedDelete: false,
  busy: '',              // translated label of the request in flight, '' when idle
  error: '',
};

const GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
</svg>`;

const app = document.getElementById('app');
const send = (type, data) => parent.postMessage({ pluginMessage: { type, ...data } }, '*');
const toast = (text, error) => send('notify', { text, error });
const save = () => send('save', { entries: S.entries });

// Request/response with the sandbox, so a comment is pinned where the view is
// at the moment of posting rather than at the last poll.
let rid = 0;
const pending = new Map();
function ask(type) {
  const id = ++rid;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send(type, { rid: id });
  });
}

// ------------------------------------------------------------------ utils --

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// "Sep 21" / "9월 21일", with the year when it isn't this one.
function fmtDate(iso) {
  const d = parseISO(iso);
  const sameYear = iso.slice(0, 4) === S.today.slice(0, 4);
  if (S.lang === 'ko') {
    const s = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return sameYear ? s : `${d.getFullYear()}년 ${s}`;
  }
  const s = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return sameYear ? s : `${s}, ${d.getFullYear()}`;
}

function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(toISO(d))}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function normHex(v) {
  const h = v.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toUpperCase() : null;
}

function swatch(color, cls = '') {
  return `<span class="esw ${cls}" style="color:${color};border-color:${color}"></span>`;
}

const emojiFor = (hex) => (PALETTE.find((p) => p.hex === hex) || PALETTE[7]).emoji;
const isExpired = (e) => e.expiresAt !== null && e.expiresAt <= S.today;
const active = () => S.entries.find((e) => e.id === S.activeId);
const allComments = () => S.entries.flatMap((e) => e.comments.map((c) => ({ ...c, entryId: e.id })));
const errText = (err) => (err && err.code ? t(err.code) : (err && err.message) || String(err));

// What the plugin writes into the comment. `uid` is the comment's id; '…'
// stands in for it in the previews.
function commentText(entry, uid) {
  const label = S.lang === 'ko' ? '변경 ID:' : 'Change ID:';
  return `${emojiFor(entry.color)} ${entry.label} · ${label} ${uid || '000000'}`;
}

const tagOf = (message) => {
  const m = typeof message === 'string' && message.match(TAG_RE);
  return m ? m[1] : null;
};

// An untouched plugin comment: one line ending in an id, or one of the older
// formats. An edited comment stops matching, which is what releases it.
const OURS_RE = /^\S+ .+ · (?:변경 ID:|Change ID:|주석 ID:) [a-z0-9]{6}$/;
const isOurComment = (c) =>
  !c.parent_id && typeof c.message === 'string' &&
  (OURS_RE.test(c.message.trim()) || c.message.includes(LEGACY_MARK));

// Short, and unique among the ids already in use in this file.
function newUid() {
  const used = new Set(allComments().map((c) => c.uid));
  for (;;) {
    const uid = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    if (!used.has(uid)) return uid;
  }
}

function expiryBadge(e) {
  if (e.expiresAt === null) return `<span class="badge">${t('indefinite')}</span>`;
  const left = daysBetween(S.today, e.expiresAt);
  const soon = left <= 3 ? ' soon' : '';
  const tail = left <= 3 ? t('daysLeft', left) : '';
  return `<span class="badge${soon}">${t('until', fmtDate(e.expiresAt))}${tail}</span>`;
}

function sortedComments(list) {
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// One comment in a log. Clicking it moves the view to the comment's pin;
// the ✕ deletes that one comment.
function commentRow(c, showEntry) {
  const e = S.entries.find((x) => x.id === c.entryId);
  const where = c.target && c.target !== 'Canvas' ? `${c.page} › ${c.target}` : c.page;
  const sub = [showEntry && e.label, c.author, where].filter(Boolean).join(' · ');
  return `
    <div class="trow mrow" data-act="goto" data-id="${c.uid || c.id}" title="${t('gotoTitle')}">
      ${swatch(e.color)}
      <div class="mcol">
        <div class="tname mono">${esc(c.uid || '—')}${c.resolved ? ` <span class="badge">${t('resolved')}</span>` : ''}</div>
        <div class="msub">${esc(sub)}</div>
      </div>
      <span class="tsub">${fmtStamp(c.createdAt)}</span>
      <button class="xs tmain danger" data-act="delComment" data-id="${c.uid || c.id}" title="${t('deleteCommentTitle')}">✕</button>
    </div>`;
}

function langToggle() {
  const btn = (id, label) => `<button class="lang-btn${S.lang === id ? ' active' : ''}" data-act="lang" data-lang="${id}">${label}</button>`;
  return `<div class="lang-toggle">${btn('ko', '한국어')}${btn('en', 'EN')}</div>`;
}

// ------------------------------------------------------------------ views --

function viewSetup() {
  const f = S.setup;
  const connected = S.token && S.fileKey;
  return `
    <div class="navbar">
      ${connected ? `<button class="navbtn" data-act="back" title="${t('back')}">←</button>` : ''}
      <div class="trail">${t('setup')}</div>
      ${langToggle()}
    </div>
    <main><div class="tabbody">
      <div class="muted" style="font-size:11px;line-height:1.5;margin-bottom:14px">${t('setupIntro')}</div>
      <div class="form-row">
        <div class="lbl">${t('token')}</div>
        <input class="wide" id="s-token" type="password" value="${esc(f.token)}" placeholder="figd_…" />
      </div>
      <div class="form-row">
        <div class="lbl">${t('file')}</div>
        <input class="wide" id="s-file" value="${esc(f.fileKey)}" placeholder="${t('filePlaceholder')}" />
        <div class="muted" style="font-size:11px;margin-top:4px">${t('fileHint')}</div>
      </div>
      ${f.error ? `<div class="field-err" style="margin-bottom:10px">${esc(f.error)}</div>` : ''}
      <div class="head-actions">
        ${connected ? `<button data-act="back">${t('cancel')}</button>` : ''}
        <button class="primary" data-act="saveSetup"${S.busy ? ' disabled' : ''}>${t('connect')}</button>
      </div>
    </div></main>`;
}

function viewList() {
  const notices = [
    S.error ? `<div class="notice err"><span>${esc(S.error)}</span><button class="xs" data-act="refresh">${t('retry')}</button></div>` : '',
    S.leftovers.length
      ? `<div class="notice"><span>${t('leftovers', S.leftovers.length)}</span>
           <button class="xs" data-act="removeLeftovers">${t('remove')}</button></div>`
      : '',
  ].join('');

  const entryCards = S.entries.length
    ? S.entries.map((e) => `
        <div class="card clickable" data-act="open" data-id="${e.id}">
          <div class="card-head">
            ${swatch(e.color)}
            <div class="ch-name">${esc(e.label)}</div>
            <div class="ch-sub">${t('commentCount', e.comments.length)}</div>
          </div>
          <div class="card-meta">${expiryBadge(e)}</div>
        </div>`).join('')
    : `<div class="empty">
         <div class="empty-t">${t('noEntriesTitle')}</div>
         ${t('noEntriesBody')}
       </div>`;

  const log = allComments().length
    ? sortedComments(allComments()).map((c) => commentRow(c, true)).join('')
    : `<div class="empty">
         <div class="empty-t">${t('noCommentsTitle')}</div>
         ${t('noCommentsBody')}
       </div>`;

  const tab = (id, label, n) =>
    `<button class="tab${S.tab === id ? ' active' : ''}" data-act="tab" data-tab="${id}">${label} <span class="tb">${n}</span></button>`;

  return `
    <header class="has-tabs">
      <div class="hrow">
        <div class="hactions">
          <button class="ghost sm icon-btn" data-act="setup" title="${t('settings')}">${GEAR}</button>
          <button class="ghost sm" data-act="refresh" title="${t('syncTitle')}"${S.busy ? ' disabled' : ''}>↻</button>
          <button class="primary sm" data-act="new">${t('newEntry')}</button>
          ${langToggle()}
        </div>
      </div>
      <div class="tabs">${tab('entries', t('entries'), S.entries.length)}${tab('comments', t('comments'), allComments().length)}</div>
    </header>
    <main><div class="tabbody">${notices}${S.tab === 'entries' ? entryCards : log}</div></main>
    <div class="foot">${t('foot')}</div>`;
}

function viewDetail() {
  const e = active();
  const mine = sortedComments(e.comments.map((c) => ({ ...c, entryId: e.id })));
  const del = S.armedDelete
    ? `<button class="danger armed" data-act="delete">${t('deleteArmed', e.comments.length)}</button>`
    : `<button class="danger" data-act="delete">${t('delete')}</button>`;

  return `
    <div class="navbar">
      <button class="navbtn" data-act="back" title="${t('back')}">←</button>
      <div class="trail">${esc(e.label)}</div>
      ${langToggle()}
    </div>
    <main><div class="tabbody">
      <div class="var-head">
        <div style="display:flex;align-items:center;gap:8px">${swatch(e.color, 'lg')}<div class="leaf">${esc(e.label)}</div></div>
        <div class="badges">
          ${expiryBadge(e)}
          <span class="badge">${t('commentCount', e.comments.length)}</span>
          <span class="badge">${t('createdOn', fmtDate(e.createdAt))}</span>
        </div>
      </div>
      <div class="preview">${esc(commentText(e))}</div>
      <div class="detail-actions top">
        <button data-act="edit">${t('editExpiry')}</button>
        ${del}
      </div>
      <button class="primary full big-add" data-act="add"${S.busy ? ' disabled' : ''}>${t('addComment')}</button>
      <div class="list-head"><span>${t('comments')} <span class="sc">${e.comments.length}</span></span></div>
      ${mine.length
        ? mine.map((c) => commentRow(c, false)).join('')
        : `<div class="muted" style="font-size:11px">${t('noCommentsHint')}</div>`}
    </div></main>`;
}

function viewForm() {
  const f = S.form;
  const palette = PALETTE.map((c) => `
    <button class="pal${c.hex === f.color ? ' picked' : ''}" data-act="pick" data-color="${c.hex}" title="${c.hex}">${swatch(c.hex)}</button>`).join('');
  const preview = commentText({ color: normHex(f.color) || '#333333', label: f.label || '…' });

  return `
    <div class="navbar">
      <button class="navbtn" data-act="cancel" title="${t('cancel')}">←</button>
      <div class="trail">${f.id ? t('formEdit') : t('formNew')}</div>
      ${langToggle()}
    </div>
    <main><div class="tabbody">
      ${f.id ? '' : `
      <div class="form-row">
        <div class="lbl">${t('label')}</div>
        <input class="wide" id="f-label" value="${esc(f.label)}" />
      </div>
      <div class="form-row">
        <div class="lbl">${t('color')}</div>
        <div class="palette">${palette}</div>
        <div class="hex-row">
          <span id="f-prev">${swatch(f.color)}</span>
          <input class="wide" id="f-hex" value="${f.color}" maxlength="7" />
        </div>
      </div>`}
      <div class="form-row">
        <div class="lbl">${t('removeOn')}</div>
        <div class="date-row">
          <input class="wide" type="date" id="f-date" value="${f.expiresAt}" min="${addDays(S.today, 1)}"${f.indefinite ? ' disabled' : ''} />
          <div class="hcheck${f.indefinite ? ' on' : ''}" data-act="indef"><span class="box">${f.indefinite ? '✓' : ''}</span>${t('indefinite')}</div>
        </div>
      </div>
      ${f.id ? '' : `
      <div class="form-row">
        <div class="lbl">${t('commentTextLabel')}</div>
        <div class="preview" id="f-preview">${esc(preview)}</div>
        <div class="muted" style="font-size:11px;margin-top:4px">${t('idNote')}</div>
      </div>`}
      ${f.error ? `<div class="field-err" style="margin-bottom:10px">${esc(f.error)}</div>` : ''}
      <div class="head-actions">
        <button data-act="cancel">${t('cancel')}</button>
        <button class="primary" data-act="save">${f.id ? t('saveEntry') : t('createEntry')}</button>
      </div>
    </div></main>`;
}

// Keeps the comment preview in step with the title/color being typed, without
// re-rendering the form (which would drop the caret).
function updatePreview() {
  const box = document.getElementById('f-preview');
  if (!box || !S.form) return;
  box.textContent = commentText({ color: normHex(S.form.color) || '#333333', label: S.form.label || '…' });
}

let lastKey = '';
function render() {
  if (S.view === 'detail' && !active()) S.view = 'list';
  // Keep the scroll position when re-rendering the same screen.
  const key = `${S.view}:${S.tab}:${S.activeId}`;
  const prev = app.querySelector('.tabbody');
  const scroll = prev && key === lastKey ? prev.scrollTop : 0;
  app.innerHTML = S.view === 'setup' ? viewSetup()
    : S.view === 'form' ? viewForm()
    : S.view === 'detail' ? viewDetail()
    : viewList();
  const body = app.querySelector('.tabbody');
  if (body) body.scrollTop = scroll;
  if (S.busy) {
    // The veil also swallows clicks, so nothing is fired twice mid-request.
    app.innerHTML += `<div class="veil"></div><div class="veil-box"><span class="spin"></span>${esc(S.busy)}…</div>`;
  }
  lastKey = key;
}

// ------------------------------------------------------------------- sync --

async function withBusy(label, fn) {
  S.busy = label;
  S.error = '';
  render();
  try {
    await fn();
  } catch (err) {
    S.error = errText(err);
    toast(S.error, true);
  }
  S.busy = '';
  render();
}

// Re-read the file's comments and bring the entry list in line with them:
// refresh each pin's position, flag resolved ones, drop deleted ones.
//
// Dragging a pin in Figma replaces the comment with a new one (new id), so a
// tracked comment that vanished is re-linked to the identical comment that took
// its place — same text, same id line.
//
// Editing a comment's text in Figma releases it: the plugin drops it from the
// group and never touches it again, since it is no longer the comment it posted.
async function pullComments() {
  const comments = await api.listComments(S.token, S.fileKey);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const tracked = new Set(S.entries.flatMap((e) => e.comments.map((c) => c.id)));
  const spare = comments.filter((c) => isOurComment(c) && !tracked.has(c.id));
  const released = [];

  for (const e of S.entries) {
    const kept = [];
    for (const c of e.comments) {
      const live = byId.get(c.id);
      if (live) {
        if (c.message && live.message !== c.message) {
          released.push(live.id);                 // edited by hand: let it go
          continue;
        }
        kept.push({ ...c, clientMeta: live.client_meta || c.clientMeta, resolved: !!live.resolved_at });
        continue;
      }
      // The text must match exactly; the id line then tells identical comments
      // of the same group apart.
      const want = c.message || commentText(e, c.uid);
      let i = spare.findIndex((s) => s.message === want && (!c.uid || tagOf(s.message) === c.uid));
      if (i === -1 && !c.message) i = spare.findIndex((s) => tagOf(s.message) === c.uid);
      if (i === -1) continue;                     // deleted, or edited and released
      const moved = spare.splice(i, 1)[0];
      kept.push({
        ...c,
        id: moved.id,
        message: moved.message,
        clientMeta: moved.client_meta || c.clientMeta,
        resolved: !!moved.resolved_at,
      });
    }
    e.comments = kept;
  }

  // A released comment belongs to the designer now: not a leftover either.
  const releasedSet = new Set(released);
  S.released = released.length;
  S.leftovers = spare.filter((c) => !releasedSet.has(c.id)).map((c) => c.id);
  return comments;
}

const findComment = (uid) => allComments().find((c) => (c.uid || c.id) === uid);

// Reconcile with the file, and (with `expire`) delete the comments of entries
// whose date has passed.
async function sync({ expire }) {
  if (!S.token || !S.fileKey) return;
  await withBusy(expire ? t('busySync') : t('busyRefresh'), async () => {
    await pullComments();

    let removed = 0;
    let failed = 0;
    if (expire) {
      const expired = S.entries.filter(isExpired);
      for (const e of expired) {
        for (const c of e.comments) {
          try {
            await api.deleteComment(S.token, S.fileKey, c.id);
            removed++;
          } catch (err) {
            if (err.status === 404) removed++;    // already gone
            else failed++;
          }
        }
      }
      if (expired.length) S.entries = S.entries.filter((e) => !isExpired(e));
      if (removed) toast(t('sweptToast', expired.length, removed));
      // A comment posted by someone else can't be deleted with this token.
      if (failed) toast(t('failedToast', failed), true);
    }
    if (S.released) toast(t('releasedToast', S.released));

    save();
  });
}

// ---------------------------------------------------------------- actions --

function openForm(entry) {
  const used = new Set(S.entries.map((e) => e.color));
  const md = `${Number(S.today.slice(5, 7))}.${S.today.slice(8)}`;
  S.form = entry
    ? { id: entry.id, label: entry.label, color: entry.color, expiresAt: entry.expiresAt || addDays(S.today, 14), indefinite: entry.expiresAt === null }
    : {
        id: null,
        label: t('defaultLabel', md),
        color: (PALETTE.find((c) => !used.has(c.hex)) || PALETTE[0]).hex,
        expiresAt: addDays(S.today, 14),
        indefinite: false,
      };
  S.view = 'form';
  render();
  const input = document.getElementById(entry ? 'f-date' : 'f-label');
  if (input) {
    input.focus();
    if (!entry) input.select();
  }
}

function saveForm() {
  const f = S.form;
  f.label = f.label.trim();
  f.error = !f.indefinite && !(f.expiresAt > S.today) ? t('errDate')
    : f.id ? null                               // title/color are fixed once posted
    : !f.label ? t('errLabel')
    : !normHex(f.color) ? t('errColor')
    : null;
  if (f.error) return render();

  const expiresAt = f.indefinite ? null : f.expiresAt;
  if (f.id) {
    active().expiresAt = expiresAt;
  } else {
    const entry = { id: 'e-' + Date.now().toString(36), label: f.label, color: normHex(f.color), createdAt: S.today, expiresAt, comments: [] };
    S.entries.push(entry);
    S.activeId = entry.id;
  }
  S.view = 'detail';
  S.form = null;
  save();
  render();
}

const actions = {
  new: () => openForm(null),
  refresh: () => sync({ expire: true }),
  setup: () => { S.setup = { token: S.token, fileKey: S.fileKey, error: null }; S.view = 'setup'; render(); },
  tab: (el) => { S.tab = el.dataset.tab; render(); },
  open: (el) => { S.activeId = el.dataset.id; S.armedDelete = false; S.view = 'detail'; render(); },
  back: () => { S.view = 'list'; S.armedDelete = false; S.setup = null; render(); },
  edit: () => openForm(active()),
  cancel: () => { S.view = S.form.id ? 'detail' : 'list'; S.form = null; render(); },
  save: saveForm,
  pick: (el) => { S.form.color = el.dataset.color; render(); },
  indef: () => { S.form.indefinite = !S.form.indefinite; render(); },

  lang: (el) => {
    S.lang = el.dataset.lang;
    send('setLang', { lang: S.lang });
    render();
  },

  goto: (el) => {
    const uid = el.dataset.id;
    withBusy(t('busyLocate'), async () => {
      await pullComments();     // a pin dragged since the last sync has moved
      save();
      const c = findComment(uid);
      if (!c) return toast(t('goneToast'), true);
      send('goto', { clientMeta: c.clientMeta });
    });
  },

  add: () => {
    const entry = active();
    withBusy(t('busyPost'), async () => {
      const p = await ask('placementNow');
      const uid = newUid();
      const posted = await api.postComment(S.token, S.fileKey, commentText(entry, uid), p.clientMeta);
      entry.comments.push({
        uid,
        id: posted.id,
        message: posted.message,
        clientMeta: p.clientMeta,
        target: p.target,
        page: p.page,
        author: (posted.user && posted.user.handle) || '',
        createdAt: posted.created_at || new Date().toISOString(),
        resolved: false,
      });
      save();
      toast(t('postedToast'));
    });
  },

  delComment: (el) => {
    const uid = el.dataset.id;
    withBusy(t('busyDeleteOne'), async () => {
      await pullComments();     // picks up a new id if the pin was moved
      const c = findComment(uid);
      const entry = c && S.entries.find((e) => e.comments.some((x) => (x.uid || x.id) === uid));
      if (!c || !entry) {
        save();
        return toast(t('goneToast'));
      }
      try {
        await api.deleteComment(S.token, S.fileKey, c.id);
      } catch (err) {
        if (err.status !== 404) throw err;        // 404 = already gone
      }
      entry.comments = entry.comments.filter((x) => (x.uid || x.id) !== uid);
      save();
      toast(t('deletedToast'));
    });
  },

  delete: () => {
    if (!S.armedDelete) { S.armedDelete = true; return render(); }
    const entry = active();
    S.armedDelete = false;
    withBusy(t('busyDeleteMany'), async () => {
      let failed = 0;
      await pullComments();
      for (const c of entry.comments) {
        try {
          await api.deleteComment(S.token, S.fileKey, c.id);
        } catch (err) {
          if (err.status !== 404) failed++;       // 404 = already gone
        }
      }
      S.entries = S.entries.filter((e) => e.id !== entry.id);
      S.view = 'list';
      save();
      if (failed) toast(t('failedToast', failed), true);
    });
  },

  removeLeftovers: () => {
    withBusy(t('busyDeleteMany'), async () => {
      for (const id of S.leftovers) {
        try {
          await api.deleteComment(S.token, S.fileKey, id);
        } catch (err) { /* reported by the sync that follows */ }
      }
      S.leftovers = [];
    }).then(() => sync({ expire: false }));
  },

  saveSetup: () => {
    const f = S.setup;
    const token = f.token.trim();
    const fileKey = parseFileKey(f.fileKey || '');
    f.error = !token ? t('errToken') : !fileKey ? t('errFile') : null;
    if (f.error) return render();
    withBusy(t('busyCheck'), async () => {
      await api.listComments(token, fileKey);   // fails loudly if token/file is wrong
      S.token = token;
      S.fileKey = fileKey;
      send('saveToken', { token });
      send('saveFileKey', { fileKey });
      S.setup = null;
      S.view = 'list';
    }).then(() => {
      if (S.error) { S.setup.error = S.error; S.error = ''; render(); }
      else sync({ expire: true });
    });
  },
};

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (S.armedDelete && el.dataset.act !== 'delete') S.armedDelete = false;
  actions[el.dataset.act](el);
});

// Inputs update state without re-rendering, so focus/caret are kept.
app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (S.setup) {
    if (el.id === 's-token') S.setup.token = el.value;
    if (el.id === 's-file') S.setup.fileKey = el.value;
    return;
  }
  if (!S.form) return;
  if (el.id === 'f-label') {
    S.form.label = el.value;
    updatePreview();
  }
  if (el.id === 'f-date') S.form.expiresAt = el.value;
  if (el.id === 'f-hex') {
    S.form.color = el.value;
    const hex = normHex(el.value);
    el.classList.toggle('invalid', !hex);
    if (hex) {
      document.getElementById('f-prev').innerHTML = swatch(hex);
      document.querySelectorAll('.pal').forEach((p) => p.classList.toggle('picked', p.dataset.color === hex));
      updatePreview();
    }
  }
});

document.addEventListener('keydown', (ev) => {
  if (S.view === 'form' && ev.key === 'Enter' && ev.target.tagName === 'INPUT') saveForm();
  else if (S.view === 'setup' && ev.key === 'Enter' && ev.target.tagName === 'INPUT') actions.saveSetup();
  else if (ev.key === 'Escape' && S.view !== 'list' && S.token) actions[S.view === 'form' ? 'cancel' : 'back']();
});

// --------------------------------------------------------------- messages --

onmessage = (ev) => {
  const msg = ev.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'init') {
    Object.assign(S, {
      entries: (msg.entries || []).map((e) => ({ ...e, comments: e.comments || [] })),
      today: msg.today,
      token: msg.token,
      fileKey: msg.fileKey,
      lang: msg.lang || 'ko',
    });
    if (!S.token || !S.fileKey) {
      S.setup = { token: S.token, fileKey: S.fileKey, error: null };
      S.view = 'setup';
      render();
    } else {
      render();
      sync({ expire: true });
    }
    return;
  }
  if (msg.type === 'placementNow') {
    const resolve = pending.get(msg.rid);
    if (resolve) { pending.delete(msg.rid); resolve(msg.placement); }
    return;
  }
  if (S.view !== 'form' && S.view !== 'setup') render();   // never clobber a form
};

app.innerHTML = `<div class="center-msg">${t('loading')}</div>`;
send('init');
