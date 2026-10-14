// UI strings. `t(key, vars)` reads S.lang, set from the KO/EN toggle in the
// header and remembered per user in clientStorage. Values are plain strings, or
// functions when they take a value. English is the fallback for a missing key.
//
// The plugin sandbox (code.js) keeps its own small table for the few strings it
// shows: placement hints and figma.notify messages.

const STRINGS = {
  en: {
    entries: 'Groups',
    comments: 'Comments',
    newEntry: '+ New group',
    settings: 'Token and file settings',
    syncTitle: 'Sync and delete expired comments',
    foot: "Plugins can't run in the background: expired comments are deleted the next time this plugin is opened on or after their date.",

    noEntriesTitle: 'No comment groups yet',
    noEntriesBody: 'Create a group for a round of changes, then post color-coded comments on the parts you changed.',
    noCommentsTitle: 'No comments yet',
    noCommentsBody: 'Open a group, bring the changed spot into view and press “Add comment”.',
    noCommentsHint: 'No comments yet.',

    leftovers: (n) => `${n} comment${n === 1 ? '' : 's'} from this plugin ${n === 1 ? 'belongs' : 'belong'} to no group.`,
    remove: 'Remove',
    retry: 'Retry',

    commentCount: (n) => `${n} comment${n === 1 ? '' : 's'}`,
    until: (d) => `Until ${d}`,
    daysLeft: (n) => ` · ${n}d left`,
    indefinite: 'Indefinite',
    createdOn: (d) => `Created ${d}`,
    resolved: 'Resolved',

    addComment: '+ Add comment',
    editExpiry: 'Change expiry date',
    gotoTitle: 'Move the view to this comment',
    deleteCommentTitle: 'Delete this comment',
    delete: 'Delete',
    deleteArmed: (n) => (n ? `Delete + ${n} comment${n === 1 ? '' : 's'}?` : 'Delete?'),

    formNew: 'New comment group',
    formEdit: 'Change expiry date',
    label: 'Title',
    color: 'Color',
    removeOn: 'Remove comments on',
    commentTextLabel: 'Comment text',
    idNote: "The id lets the plugin find this comment again if its pin is moved.",
    cancel: 'Cancel',
    saveEntry: 'Save',
    createEntry: 'Create group',
    errLabel: 'Give the group a title.',
    errColor: 'Color must be a 6-digit hex value.',
    errDate: 'Pick a removal date after today, or choose Indefinite.',
    defaultLabel: (md) => `${md} update`,

    setup: 'Setup',
    setupIntro: 'Comments are posted through Figma’s REST API, which needs a personal access token. Create one in Figma → Settings → Security → Personal access tokens, with <b>file_comments</b> set to read + write. It is stored on this computer only.',
    token: 'Personal access token',
    file: 'File',
    filePlaceholder: "Paste this file's link",
    fileHint: "Paste the file's link from Figma's Share dialog.",
    back: 'Back',
    loading: 'Loading…',
    connect: 'Connect',
    errToken: 'Paste a personal access token.',
    errFile: "That doesn't look like a Figma file link.",

    busySync: 'Syncing comments',
    busyRefresh: 'Refreshing',
    busyPost: 'Posting comment',
    busyDeleteOne: 'Deleting comment',
    busyDeleteMany: 'Deleting comments',
    busyLocate: 'Locating comment',
    busyCheck: 'Checking',

    postedToast: 'Comment posted',
    deletedToast: 'Comment deleted',
    goneToast: 'That comment no longer exists in Figma',
    releasedToast: (n) => `${n} edited comment${n === 1 ? '' : 's'} released — no longer tracked or deleted by the plugin`,
    sweptToast: (groups, comments) => `${groups} expired group${groups === 1 ? '' : 's'} cleared · ${comments} comment${comments === 1 ? '' : 's'} deleted`,
    failedToast: (n) => `${n} comment${n === 1 ? '' : 's'} couldn't be deleted (posted by another account)`,

    errOffline: "Couldn't reach api.figma.com. Check your internet connection.",
    err403: 'Token rejected. It needs file_comments read + write, and access to this file.',
    err404: 'Not found. The comment or file may be gone.',
    err429: 'Figma is rate limiting the plugin. Wait a moment and press sync.',
  },

  ko: {
    entries: '코멘트 모음',
    comments: '코멘트',
    newEntry: '+ 코멘트 모음 추가',
    settings: 'Token 및 파일 설정',
    syncTitle: '동기화 및 만료된 코멘트 삭제',
    foot: '플러그인은 백그라운드에서 실행되지 않습니다. 만료된 코멘트는 만료일 이후 플러그인을 다시 열 때 삭제됩니다.',

    noEntriesTitle: '코멘트 모음이 없습니다',
    noEntriesBody: '변경 사항 묶음을 코멘트 모음으로 만든 뒤, 수정한 부분에 색상별 코멘트를 남기세요.',
    noCommentsTitle: '코멘트가 없습니다',
    noCommentsBody: '코멘트 모음을 열고 수정한 위치를 화면 가운데에 둔 뒤 “코멘트 추가”를 누르세요.',
    noCommentsHint: '아직 코멘트가 없습니다.',

    leftovers: (n) => `이 플러그인이 남긴 코멘트 ${n}개가 어느 코멘트 모음에도 속해 있지 않습니다.`,
    remove: '삭제',
    retry: '다시 시도',

    commentCount: (n) => `코멘트 ${n}개`,
    until: (d) => `${d}까지`,
    daysLeft: (n) => ` · ${n}일 남음`,
    indefinite: '무기한',
    createdOn: (d) => `${d} 생성`,
    resolved: '해결됨',

    addComment: '+ 코멘트 추가',
    editExpiry: '코멘트 표출 기한 수정',
    gotoTitle: '이 코멘트 위치로 이동',
    deleteCommentTitle: '이 코멘트 삭제',
    delete: '삭제',
    deleteArmed: (n) => (n ? `코멘트 모음과 코멘트 ${n}개를 삭제할까요?` : '삭제할까요?'),

    formNew: '새 코멘트 모음',
    formEdit: '코멘트 표출 기한 수정',
    label: '제목',
    color: '색상',
    removeOn: '코멘트 삭제일',
    commentTextLabel: '코멘트 내용',
    idNote: '변경 ID 덕분에 핀을 옮겨도 플러그인이 같은 코멘트를 찾을 수 있습니다.',
    cancel: '취소',
    saveEntry: '저장',
    createEntry: '코멘트 모음 만들기',
    errLabel: '코멘트 모음 제목을 입력하세요.',
    errColor: '색상은 6자리 hex 값이어야 합니다.',
    errDate: '오늘 이후의 삭제일을 고르거나 무기한을 선택하세요.',
    defaultLabel: (md) => `${md} 변경사항`,

    setup: '설정',
    setupIntro: '코멘트는 Figma REST API로 등록되며 개인 액세스 token이 필요합니다. Figma → Settings → Security → Personal access tokens에서 <b>file_comments</b> 읽기 + 쓰기 권한으로 발급하세요. token은 이 컴퓨터에만 저장됩니다.',
    token: '개인 액세스 token',
    file: '파일',
    filePlaceholder: '이 파일의 링크를 붙여넣으세요',
    fileHint: 'Figma 공유 창에서 파일 링크를 복사해 붙여넣으세요.',
    back: '뒤로',
    loading: '불러오는 중…',
    connect: '연결',
    errToken: '개인 액세스 token을 입력하세요.',
    errFile: 'Figma 파일 링크 형식이 아닙니다.',

    busySync: '코멘트 동기화 중',
    busyRefresh: '새로고침 중',
    busyPost: '코멘트 등록 중',
    busyDeleteOne: '코멘트 삭제 중',
    busyDeleteMany: '코멘트 삭제 중',
    busyLocate: '코멘트 위치 찾는 중',
    busyCheck: '확인 중',

    postedToast: '코멘트를 등록했습니다',
    deletedToast: '코멘트를 삭제했습니다',
    goneToast: 'Figma에 해당 코멘트가 더 이상 없습니다',
    releasedToast: (n) => `내용이 수정된 코멘트 ${n}개의 연결을 해제했습니다. 더 이상 추적하거나 삭제하지 않습니다`,
    sweptToast: (entries, comments) => `만료된 코멘트 모음 ${entries}개 정리 · 코멘트 ${comments}개 삭제`,
    failedToast: (n) => `코멘트 ${n}개를 삭제하지 못했습니다 (다른 계정이 등록한 코멘트)`,

    errOffline: 'api.figma.com에 연결하지 못했습니다. 인터넷 연결을 확인하세요.',
    err403: 'Token이 거부되었습니다. file_comments 읽기 + 쓰기 권한과 이 파일에 대한 접근 권한이 필요합니다.',
    err404: '찾을 수 없습니다. 코멘트나 파일이 삭제되었을 수 있습니다.',
    err429: 'Figma가 요청을 제한하고 있습니다. 잠시 후 동기화를 눌러 주세요.',
  },
};

function t(key, ...vars) {
  const table = STRINGS[S.lang] || STRINGS.en;
  const value = key in table ? table[key] : STRINGS.en[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...vars) : value;
}
