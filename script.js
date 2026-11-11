/* ==========================================================================
   My Tasks — 할 일 관리 앱

   파일 구성 (위에서 아래로 읽으면 됨)
     1. 상수
     2. DOM 참조 · 앱 상태
     3. 유틸리티 (디바운스, 텍스트 정리, 날짜 등)
     4. 저장소 (localStorage 읽기/쓰기, 디바운스 저장)
     5. 데이터 검증 (불러오기·가져오기 공통)
     6. 피드백 (토스트, 스크린 리더 안내)
     7. 다이얼로그
     8. 테마
     9. 할 일 조작 (추가/삭제/완료/수정/일괄 삭제)
    10. 실행 취소 (Undo)
    11. 정렬 · 드래그 앤 드롭
    12. 내보내기 · 가져오기
    13. 렌더링 (키 기반 DOM 재사용)
    14. 이벤트 연결
    15. 초기화

   데이터 구조: { id, text, completed, createdAt(ISO 문자열), category }
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. 상수
   ========================================================================== */

/** localStorage 키 */
const STORAGE_KEYS = {
  todos: 'todos',
  filter: 'todoFilter',
  theme: 'todoTheme',
  sort: 'todoSort',
  autoCategory: 'todoAutoCategory',
};
/** 저장된 데이터가 손상됐을 때 원본을 보관해 두는 키 (사용자가 직접 복구할 수 있도록) */
const CORRUPT_BACKUP_KEY = 'todos_corrupted_backup';

const CATEGORIES = {
  work: '업무',
  personal: '개인',
  study: '공부',
};
/** 카테고리 순서 (카테고리순 정렬, 검증에 사용). Object 프로토타입 키('toString' 등) 오인을 막기 위해 배열로 검사 */
const CATEGORY_KEYS = Object.keys(CATEGORIES);
const DEFAULT_CATEGORY = 'personal';

const FILTERS = ['all', ...CATEGORY_KEYS];
const FILTER_LABELS = { all: '전체', ...CATEGORIES };

const SORT_MODES = {
  manual: '직접 정렬',
  newest: '최신순',
  oldest: '오래된순',
  category: '카테고리순',
  status: '완료 상태순',
};

/**
 * 키워드 기반 자동 카테고리 분류 사전.
 * - 할 일 텍스트(소문자)에 키워드가 "포함"되면 해당 카테고리에 1점.
 * - 점수가 가장 높은 카테고리를 선택, 동점이면 더 긴(구체적인) 키워드가 맞은 쪽, 그래도 같으면 분류하지 않음.
 * - 한국어는 띄어쓰기 없이 붙여 쓰는 경우가 많아 단어 경계 대신 부분 일치를 쓴다.
 *   그래서 다른 뜻으로 자주 쓰이는 짧은 단어('보고', '책', '리뷰' 등)는 일부러 넣지 않았다.
 * 키워드를 추가하려면 아래 배열에 소문자로 넣으면 된다.
 */
const CATEGORY_KEYWORDS = {
  work: [
    '회의', '미팅', '보고서', '업무', '출근', '퇴근', '프로젝트', '기획', '발표', '클라이언트',
    '고객', '거래처', '메일', '결재', '계약', '견적', '마감', '회사', '팀장', '팀원', '상사',
    '야근', '출장', '제안서', '기안', '엑셀', '피피티', '배포', '코드 리뷰', '면접', '세미나', '워크숍',
    'meeting', 'report', 'deadline', 'client', 'email', 'project', 'ppt', 'deploy',
  ],
  personal: [
    '장보기', '마트', '쇼핑', '청소', '빨래', '설거지', '요리', '운동', '헬스', '요가', '산책',
    '병원', '약국', '치과', '은행', '택배', '생일', '가족', '친구', '약속', '여행', '영화',
    '데이트', '집안일', '이사', '세탁', '미용실', '카페', '공과금', '관리비', '강아지', '고양이',
    '선물', '예약', '저녁', '분리수거',
    'gym', 'shopping', 'laundry', 'birthday', 'dinner',
  ],
  study: [
    '공부', '강의', '수업', '과제', '숙제', '시험', '복습', '예습', '독서', '책 읽기', '자격증',
    '토익', '토플', '영어', '단어', '문제집', '학원', '인강', '논문', '레포트', '스터디', '알고리즘',
    '튜토리얼', '문법', '암기', '필기', '학습', '교재', '퀴즈', '온라인 강좌',
    'study', 'lecture', 'homework', 'exam', 'course', 'tutorial',
  ],
};

const MAX_TEXT_LENGTH = 200;              // 할 일 한 개의 최대 글자 수 (input maxlength와 동일)
const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 가져오기 파일 최대 크기 (5MB)
const MAX_UNDO = 20;                      // 실행 취소 기록 최대 개수
const SEARCH_DEBOUNCE_MS = 150;
const SAVE_DEBOUNCE_MS = 300;
const EXPORT_FORMAT = 'my-tasks';
const EXPORT_VERSION = 1;

/** 오늘의 격언 목록. 날짜마다 하나가 정해지고, ↻ 버튼으로 무작위로 바꿀 수 있음 */
const QUOTES = [
  { text: '천 리 길도 한 걸음부터.', author: '속담' },
  { text: '시작이 반이다.', author: '속담' },
  { text: '늦었다고 생각할 때가 가장 빠를 때다.', author: '속담' },
  { text: '티끌 모아 태산.', author: '속담' },
  { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤저민 프랭클린' },
  { text: '우리가 반복적으로 하는 일이 곧 우리 자신이다. 그러므로 탁월함은 행동이 아니라 습관이다.', author: '윌 듀런트' },
  { text: '할 수 있다고 믿든 할 수 없다고 믿든, 당신이 옳다.', author: '헨리 포드' },
  { text: '성공은 매일 반복한 작은 노력들의 합이다.', author: '로버트 콜리어' },
  { text: '지금 하지 않으면 언제 하겠는가?', author: '힐렐' },
  { text: '가장 큰 위험은 아무 위험도 감수하지 않는 것이다.', author: '마크 저커버그' },
  { text: '미래를 예측하는 가장 좋은 방법은 미래를 만드는 것이다.', author: '피터 드러커' },
  { text: '행동은 모든 성공의 기본 열쇠다.', author: '파블로 피카소' },
  { text: '계획 없는 목표는 한낱 꿈에 불과하다.', author: '앙투안 드 생텍쥐페리' },
  { text: '완벽보다 완료가 낫다.', author: '작자 미상' },
  { text: '오늘 걷지 않으면 내일은 뛰어야 한다.', author: '작자 미상' },
  { text: '작은 일에 충실한 사람은 큰 일에도 충실하다.', author: '누가복음 16:10' },
];

/* ==========================================================================
   2. DOM 참조 · 앱 상태
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const dom = {
  form: $('todo-form'),
  input: $('todo-input'),
  categorySelect: $('todo-category'),
  autoCategoryToggle: $('auto-category-toggle'),
  autoCategoryHint: $('auto-category-hint'),
  searchInput: $('search-input'),
  sortSelect: $('sort-select'),
  filters: $('filters'),
  list: $('todo-list'),
  emptyState: $('empty-state'),
  emptyMessage: $('empty-message'),
  listFooter: $('list-footer'),
  remainingText: $('remaining-text'),
  remainingBadge: $('remaining-badge'),
  remainingSr: $('remaining-sr'),
  clearCompletedBtn: $('clear-completed'),
  themeToggle: $('theme-toggle'),
  exportBtn: $('export-btn'),
  importBtn: $('import-btn'),
  importFile: $('import-file'),
  quoteBody: $('quote-body'),
  quoteText: $('quote-text'),
  quoteAuthor: $('quote-author'),
  quoteRefresh: $('quote-refresh'),
  overallText: $('overall-text'),
  overallProgress: $('overall-progress'),
  cheer: $('cheer-message'),
  todayCount: $('today-count'),
  dialog: $('app-dialog'),
  dialogTitle: $('dialog-title'),
  dialogMessage: $('dialog-message'),
  dialogExtra: $('dialog-extra'),
  dialogActions: $('dialog-actions'),
  toasts: $('toasts'),
  srStatus: $('sr-status'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * 앱 상태. 화면은 항상 이 값으로부터 render()로 다시 그려진다.
 * @type {{
 *   todos: { id: string, text: string, completed: boolean, createdAt: string, category: string }[],
 *   filter: string, sort: string, query: string, editingId: string | null
 * }}
 */
const state = {
  todos: [],
  filter: 'all',
  sort: 'manual',
  query: '',        // 검색어 (앞뒤 공백 제거, 연속 공백 1칸)
  editingId: null,  // 인라인 편집 중인 할 일 id
  autoCategory: true, // 키워드 자동 분류 사용 여부 (저장됨)
};

/**
 * 추가 폼의 카테고리 선택 상태
 * - baseCategory: 자동 분류가 없을 때 돌아갈 값 (필터로 정해지거나 사용자가 직접 고른 값)
 * - categoryTouched: 지금 입력 중인 할 일에 대해 사용자가 직접 카테고리를 골랐는지.
 *   true면 자동 분류가 사용자의 선택을 덮어쓰지 않는다. 추가하거나 입력창을 비우면 초기화.
 * - autoPicked: 현재 선택된 카테고리가 자동 분류 결과인지 ({ category, keyword } 또는 null)
 */
const categoryPicker = {
  baseCategory: DEFAULT_CATEGORY,
  categoryTouched: false,
  autoPicked: null,
};

/** 다음 render 때 한 번 재생할 애니메이션: id → CSS 클래스 */
const pendingAnimations = new Map();

/** 시작할 때 보여 줄 경고 (데이터 손상 등). 토스트 영역이 준비된 뒤 표시 */
const startupWarnings = [];

/* ==========================================================================
   3. 유틸리티
   ========================================================================== */

/**
 * 마지막 호출 후 wait(ms) 동안 추가 호출이 없을 때 한 번만 실행.
 * flush(): 대기 중인 호출을 즉시 실행 (페이지를 떠날 때 저장 누락 방지)
 * cancel(): 대기 중인 호출을 취소, pending(): 대기 중인지 여부
 */
function debounce(fn, wait) {
  let timer = null;
  let lastArgs = [];
  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, wait);
  };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  debounced.pending = () => timer !== null;
  return debounced;
}

/** 저장용 텍스트 정리: 줄바꿈·탭·연속 공백을 한 칸으로, 앞뒤 공백 제거, 최대 길이 제한 */
function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

/** 중복 비교용 키: 정리된 텍스트를 소문자로 */
function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

/** 긴 텍스트를 토스트·다이얼로그에 넣기 좋게 줄임 */
function shorten(text, max = 20) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isCategory(value) {
  return CATEGORY_KEYS.includes(value);
}

function generateId() {
  // crypto.randomUUID는 보안 컨텍스트(https, localhost, file)에서만 존재하므로 대체 경로를 둠
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function findTodo(id) {
  return state.todos.find((t) => t.id === id);
}

function percent(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** "방금 전 / N분 전 / N시간 전 / N일 전 / 날짜" 형식 */
function formatRelativeTime(isoString) {
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return '';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return '방금 전'; // 미래 시각(기기 시계 차이 등)도 '방금 전'으로 처리

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;

  return new Date(time).toLocaleDateString('ko-KR');
}

/** 파일 이름용 타임스탬프: 2026-11-11_1430 */
function fileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/* ==========================================================================
   4. 저장소
   ========================================================================== */

/** localStorage 접근을 감싼 래퍼. 시크릿 모드·저장소 차단·용량 초과에서도 예외가 밖으로 새지 않음 */
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  /** @returns {boolean} 저장 성공 여부 */
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.error(`localStorage 저장 실패 (${key}):`, err);
      return false;
    }
  },
};

/** 저장 실패 경고를 한 번만 띄우기 위한 플래그 (성공하면 다시 초기화) */
let storageWarningShown = false;

/** 할 일 목록을 즉시 저장 */
function saveTodosNow() {
  const ok = storage.set(STORAGE_KEYS.todos, JSON.stringify(state.todos));
  if (ok) {
    storageWarningShown = false;
  } else if (!storageWarningShown) {
    storageWarningShown = true;
    showToast('저장하지 못했습니다. 저장 공간이 부족하거나 브라우저가 저장을 막고 있습니다.', { type: 'warn', duration: 5000 });
  }
}

/**
 * 디바운스 저장: 빠르게 연속으로 바뀌어도(드래그, 연속 체크 등) 마지막에 한 번만 직렬화한다.
 * 항목이 수백 개일 때 매번 JSON.stringify + 동기 쓰기를 하는 비용을 줄이기 위함.
 */
const scheduleSave = debounce(saveTodosNow, SAVE_DEBOUNCE_MS);

/** 상태가 바뀐 뒤 공통으로 호출: 저장 예약 + 화면 갱신 */
function commit() {
  scheduleSave();
  render();
}

function loadTodos() {
  const raw = storage.get(STORAGE_KEYS.todos);
  if (raw === null) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON이 깨진 경우: 원본을 별도 키에 보관하고 빈 목록으로 시작
    storage.set(CORRUPT_BACKUP_KEY, raw);
    startupWarnings.push(`저장된 데이터가 손상되어 불러오지 못했습니다. 원본은 '${CORRUPT_BACKUP_KEY}'에 보관했습니다.`);
    return [];
  }

  const result = sanitizeTodos(parsed);
  if (!result) {
    storage.set(CORRUPT_BACKUP_KEY, raw);
    startupWarnings.push('저장된 데이터 형식이 올바르지 않아 빈 목록으로 시작합니다.');
    return [];
  }
  if (result.skipped > 0) {
    startupWarnings.push(`손상된 항목 ${result.skipped}개를 제외하고 불러왔습니다.`);
  }
  return result.items;
}

function loadChoice(key, allowed, fallback) {
  const saved = storage.get(key);
  return allowed.includes(saved) ? saved : fallback;
}

/* ==========================================================================
   5. 데이터 검증 (저장소 불러오기와 파일 가져오기에서 공통 사용)
   ========================================================================== */

/**
 * 외부에서 들어온 값 하나를 올바른 할 일 객체로 정리. 쓸 수 없으면 null.
 * - text: 문자열이고 정리 후 비어 있지 않아야 함 (필수)
 * - id: 없거나 이상하면 새로 발급
 * - completed: true일 때만 완료 (문자열 "true" 등은 미완료로 취급)
 * - createdAt: 유효한 날짜가 아니면 현재 시각
 * - category: 알 수 없는 값이면 기본 카테고리
 */
function sanitizeTodo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.text !== 'string') return null;

  const text = cleanText(raw.text);
  if (!text) return null;

  let id;
  if (typeof raw.id === 'string' && raw.id.trim()) id = raw.id.trim().slice(0, 100);
  else if (typeof raw.id === 'number' && Number.isFinite(raw.id)) id = String(raw.id);
  else id = generateId();

  // new Date(null)은 1970년이 되므로 문자열/숫자일 때만 날짜로 해석
  const created = typeof raw.createdAt === 'string' || typeof raw.createdAt === 'number'
    ? new Date(raw.createdAt)
    : new Date(NaN);

  return {
    id,
    text,
    completed: raw.completed === true,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
    // 카테고리가 없거나 잘못된 항목(이전 버전 데이터, 다른 앱에서 가져온 파일)은 키워드로 추정
    category: isCategory(raw.category) ? raw.category : (classifyText(text)?.category ?? DEFAULT_CATEGORY),
  };
}

/* ---------- 키워드 자동 분류 ---------- */

/**
 * 텍스트에 맞는 카테고리를 추정.
 * @returns {{ category: string, keyword: string } | null} 맞는 키워드가 없거나 판단이 애매하면 null
 */
function classifyText(text) {
  const lower = String(text ?? '').toLowerCase();
  if (!lower.trim()) return null;

  let best = null;   // { category, score, keyword }
  let tied = false;  // 1등이 둘 이상인지

  for (const category of CATEGORY_KEYS) {
    let score = 0;
    let longest = '';
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (lower.includes(keyword)) {
        score++;
        if (keyword.length > longest.length) longest = keyword;
      }
    }
    if (score === 0) continue;

    // 비교 순서: 맞은 키워드 수 → 가장 긴 키워드 길이
    const better = !best
      || score > best.score
      || (score === best.score && longest.length > best.keyword.length);
    const same = best && score === best.score && longest.length === best.keyword.length;

    if (better) {
      best = { category, score, keyword: longest };
      tied = false;
    } else if (same) {
      tied = true;
    }
  }

  return best && !tied ? { category: best.category, keyword: best.keyword } : null;
}

/**
 * 배열 또는 { todos: [...] } 형태를 받아 정리된 목록을 반환.
 * @returns {{ items: object[], skipped: number } | null} 구조 자체가 잘못됐으면 null
 */
function sanitizeTodos(input) {
  let source = null;
  if (Array.isArray(input)) source = input;
  else if (input && typeof input === 'object' && Array.isArray(input.todos)) source = input.todos;
  if (!source) return null;

  const seenIds = new Set();
  const items = [];
  let skipped = 0;

  for (const raw of source) {
    const todo = sanitizeTodo(raw);
    if (!todo) {
      skipped++;
      continue;
    }
    // 같은 id가 여러 번 나오면 뒤의 것에 새 id 부여 (DOM 키 충돌 방지)
    if (seenIds.has(todo.id)) todo.id = generateId();
    seenIds.add(todo.id);
    items.push(todo);
  }
  return { items, skipped };
}

/* ==========================================================================
   6. 피드백: 토스트 · 스크린 리더 안내
   ========================================================================== */

/**
 * 화면 하단 알림. 토스트 영역이 aria-live라서 스크린 리더도 읽어 준다.
 * @param {string} message
 * @param {{ type?: 'info'|'warn', duration?: number, action?: { label: string, onClick: () => void } }} [options]
 */
function showToast(message, { type = 'info', duration, action } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'warn' ? ' warn' : '');

  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    toast.append(btn);
  }

  dom.toasts.append(toast);
  // 너무 많이 쌓이지 않게 최근 3개만 유지
  while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();

  // 액션이 있으면 누를 시간을 넉넉히, 마우스를 올리거나 포커스하면 사라지지 않게 멈춤
  const life = duration ?? (action ? 6000 : 2500);
  let timer = setTimeout(dismiss, life);
  const pause = () => clearTimeout(timer);
  const resume = () => {
    clearTimeout(timer);
    timer = setTimeout(dismiss, 2000);
  };
  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('mouseleave', resume);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('focusout', resume);

  function dismiss() {
    clearTimeout(timer);
    if (!toast.isConnected || toast.classList.contains('hide')) return;
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), reducedMotion.matches ? 0 : 250);
  }
  return toast;
}

/** 화면에는 표시하지 않고 스크린 리더에만 읽어 줄 안내 */
function announce(message) {
  // 같은 문장을 연속으로 넣어도 다시 읽히도록 비운 뒤 잠시 후 설정
  dom.srStatus.textContent = '';
  setTimeout(() => {
    dom.srStatus.textContent = message;
  }, 50);
}

/* ==========================================================================
   7. 다이얼로그 (확인/선택 창을 하나의 <dialog>로 재사용)
   ========================================================================== */

let dialogResolver = null;     // 열려 있는 다이얼로그의 Promise resolve
let dialogReturnFocus = null;  // 닫힌 뒤 포커스를 돌려줄 요소

/**
 * 다이얼로그를 열고 사용자가 누른 버튼의 value를 반환 (취소·Esc·바깥 클릭은 null).
 * @param {{
 *   title: string, message: string, extra?: Node,
 *   buttons: { label: string, value: string, variant?: 'primary'|'danger', autofocus?: boolean }[]
 * }} options
 * @returns {Promise<string|null>}
 */
function openDialog({ title, message, buttons, extra = null }) {
  // <dialog>를 지원하지 않는 아주 오래된 브라우저: 기본 confirm으로 대체 (주 버튼 = 마지막 버튼)
  if (typeof dom.dialog.showModal !== 'function') {
    const ok = window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(ok ? buttons[buttons.length - 1].value : null);
  }
  if (dialogResolver) closeDialog(null);

  dialogReturnFocus = document.activeElement;
  dom.dialogTitle.textContent = title;
  dom.dialogMessage.textContent = message;
  dom.dialogExtra.replaceChildren(...(extra ? [extra] : []));
  dom.dialogExtra.hidden = !extra;

  dom.dialogActions.replaceChildren(...buttons.map((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialog-btn' + (b.variant ? ` ${b.variant}` : '');
    btn.textContent = b.label;
    btn.dataset.value = b.value;
    return btn;
  }));

  dom.dialog.showModal();
  // 기본 포커스는 안전한 선택지(autofocus 지정, 보통 '취소')에 둔다
  const focusIndex = Math.max(0, buttons.findIndex((b) => b.autofocus));
  dom.dialogActions.children[focusIndex].focus();

  return new Promise((resolve) => {
    dialogResolver = resolve;
  });
}

/**
 * 버튼을 누른 그 시점에 결과를 확정한다.
 * (<dialog>의 close 이벤트는 비동기로 늦게 와서, 곧바로 다시 연 다이얼로그를 잘못 닫을 수 있으므로 쓰지 않음)
 */
function closeDialog(value) {
  if (!dialogResolver) return;
  const resolve = dialogResolver;
  dialogResolver = null;
  if (dom.dialog.open) dom.dialog.close();

  // 다이얼로그를 열기 전 포커스 위치로 복귀 (요소가 사라졌으면 생략, 호출한 쪽에서 다시 지정 가능)
  const target = dialogReturnFocus;
  dialogReturnFocus = null;
  if (target && target.isConnected && typeof target.focus === 'function') target.focus();

  resolve(value);
}

dom.dialogActions.addEventListener('click', (e) => {
  const btn = e.target.closest('.dialog-btn');
  if (btn) closeDialog(btn.dataset.value);
});

// Esc: 결과를 null(취소)로 확정. 기본 동작(닫기)은 막지 않음 —
// Chrome은 cancel을 반복해서 막으면 강제로 닫아 버리므로, 막으면 오히려 Promise가 영원히 대기할 수 있음
dom.dialog.addEventListener('cancel', () => closeDialog(null));

// 안전장치: 위 경로 밖에서 닫힌 경우(브라우저가 강제로 닫음 등)에도 대기 중인 Promise를 정리.
// close 이벤트는 늦게 도착하므로, 그 사이 새 다이얼로그가 열려 있으면(open) 건드리지 않음
dom.dialog.addEventListener('close', () => {
  if (!dom.dialog.open) closeDialog(null);
});

// 바깥(배경) 클릭 시 취소. 다이얼로그 안쪽 여백을 클릭해도 target이 dialog라서 좌표로 판별
dom.dialog.addEventListener('click', (e) => {
  if (e.target !== dom.dialog) return;
  const r = dom.dialog.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) closeDialog(null);
});

/* ==========================================================================
   8. 테마
   ========================================================================== */

function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

let themeTransitionTimer = null;

/** @param {boolean} animate 색 전환 애니메이션 여부 (첫 로드 때는 끔) */
function applyTheme(theme, animate) {
  const root = document.documentElement;
  if (animate && !reducedMotion.matches) {
    root.classList.add('theme-transition');
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 400);
  }
  root.dataset.theme = theme;
  dom.themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
}

function toggleTheme(fromShortcut = false) {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, true);
  storage.set(STORAGE_KEYS.theme, next);
  // 스위치를 직접 누른 경우엔 스위치 자체가 피드백이므로 토스트는 단축키일 때만
  if (fromShortcut) showToast(next === 'dark' ? '다크 모드' : '라이트 모드');
}

/* ==========================================================================
   9. 할 일 조작
   ========================================================================== */

/** 같은 내용(공백·대소문자 무시)의 다른 할 일 찾기 */
function findDuplicate(text, exceptId = null) {
  const key = normalizeText(text);
  return state.todos.find((t) => t.id !== exceptId && normalizeText(t.text) === key);
}

/**
 * 할 일 추가. 같은 내용이 이미 있으면 확인을 받는다.
 * @returns {Promise<boolean>} 추가 여부
 */
async function addTodo(rawText, category) {
  const text = cleanText(rawText);
  if (!text) {
    replayAnimation(dom.input, 'invalid');
    showToast('할 일 내용을 입력하세요', { type: 'warn' });
    return false;
  }

  const duplicate = findDuplicate(text);
  if (duplicate) {
    const choice = await openDialog({
      title: '중복된 할 일',
      message: `"${shorten(duplicate.text, 40)}"이(가) 이미 있습니다.\n(${CATEGORIES[duplicate.category]} · ${duplicate.completed ? '완료' : '미완료'})\n\n그래도 추가할까요?`,
      buttons: [
        { label: '취소', value: 'cancel', autofocus: true },
        { label: '추가', value: 'add', variant: 'primary' },
      ],
    });
    if (choice !== 'add') return false;
  }

  const todo = {
    id: generateId(),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
    category: isCategory(category) ? category : DEFAULT_CATEGORY,
  };
  // 이 카테고리가 자동 분류로 정해진 것인지 (안내 문구용)
  const autoPicked = categoryPicker.autoPicked?.category === todo.category;

  state.todos.push(todo);
  pendingAnimations.set(todo.id, 'enter');
  commit();

  // 추가한 항목이 현재 필터·검색 때문에 안 보이면 알려 줌
  const visible = nodeCache.has(todo.id);
  const autoNote = autoPicked ? ` (자동 분류: ${CATEGORIES[todo.category]})` : '';
  showToast(visible
    ? `할 일을 추가했습니다${autoNote}`
    : `${CATEGORIES[todo.category]}에 추가했습니다${autoPicked ? ' (자동 분류)' : ''} · 현재 목록에서는 숨겨짐`);
  return true;
}

/** 할 일 삭제 (실행 취소 가능) */
function deleteTodo(id) {
  const index = state.todos.findIndex((t) => t.id === id);
  if (index === -1) return;

  const [removed] = state.todos.splice(index, 1);
  if (state.editingId === id) state.editingId = null;
  const entry = pushUndo({ type: 'items', items: [{ todo: removed, index }] });
  commit();

  showToast(`"${shorten(removed.text)}" 삭제됨`, {
    action: { label: '실행 취소', onClick: () => undo(entry) },
  });
}

function toggleTodo(id) {
  const todo = findTodo(id);
  if (!todo) return;
  todo.completed = !todo.completed;
  pendingAnimations.set(id, 'slide-in');
  commit();

  // 마지막 하나를 완료한 순간에는 renderStats의 축하 메시지가 대신 뜸
  const allDone = state.todos.every((t) => t.completed);
  if (!(todo.completed && allDone)) {
    showToast(todo.completed ? '완료했습니다' : '미완료로 되돌렸습니다');
  }
}

function startEdit(id) {
  if (!findTodo(id)) return;
  state.editingId = id;
  render();
  const field = dom.list.querySelector('.edit-input');
  if (field) {
    field.focus();
    field.select();
  }
  announce('편집 모드입니다. Enter로 저장, Esc로 취소합니다.');
}

/**
 * 편집 내용 저장.
 * @param {boolean} restoreFocus Enter로 저장했을 때만 true (다른 곳을 클릭해 저장된 경우 포커스를 빼앗지 않음)
 */
function updateTodo(id, rawText, category, restoreFocus) {
  const todo = findTodo(id);
  state.editingId = null;

  if (todo) {
    const text = cleanText(rawText);
    const nextCategory = isCategory(category) ? category : todo.category;
    if (!text) {
      showToast('내용이 비어 있어 수정하지 않았습니다', { type: 'warn' });
    } else if (text !== todo.text || nextCategory !== todo.category) {
      // 수정은 흐름을 끊지 않도록 막지 않고 경고만 표시
      if (text !== todo.text && findDuplicate(text, id)) {
        showToast('같은 내용의 할 일이 이미 있습니다', { type: 'warn' });
      }
      todo.text = text;
      todo.category = nextCategory;
      scheduleSave();
      showToast('수정했습니다');
    }
  }

  render();
  if (restoreFocus && todo) focusItem(id, 'edit-btn');
}

function cancelEdit() {
  const id = state.editingId;
  state.editingId = null;
  render();
  if (id) focusItem(id, 'edit-btn');
}

/* ---------- 추가 폼의 카테고리 자동 선택 ---------- */

/**
 * 입력 중인 텍스트로 카테고리를 자동 선택.
 * 사용자가 이번 할 일에 대해 직접 카테고리를 골랐으면(categoryTouched) 건드리지 않는다.
 * 맞는 키워드가 없어지면(지웠거나 수정) 원래 기본값(baseCategory)으로 되돌린다.
 */
function updateAutoCategory() {
  const picker = categoryPicker;
  // 입력창을 비우면 다음 할 일은 다시 자동 분류 대상
  if (!dom.input.value.trim()) picker.categoryTouched = false;
  if (picker.categoryTouched) return;

  const result = state.autoCategory ? classifyText(dom.input.value) : null;
  const next = result ? result.category : picker.baseCategory;
  const changed = dom.categorySelect.value !== next;

  dom.categorySelect.value = next;
  picker.autoPicked = result;
  renderAutoCategoryHint();

  if (result && changed) {
    playOnce(dom.categorySelect, 'auto-picked'); // 선택 상자가 바뀌었음을 눈에 띄게
    announce(`카테고리를 ${CATEGORIES[next]}(으)로 자동 선택했습니다`);
  }
}

/** 폼 아래 "자동 분류: 업무 · '회의'" 안내 */
function renderAutoCategoryHint() {
  const picked = categoryPicker.autoPicked;
  dom.autoCategoryHint.hidden = !picked;
  if (!picked) return;
  dom.autoCategoryHint.dataset.category = picked.category;
  dom.autoCategoryHint.textContent = `자동 분류: ${CATEGORIES[picked.category]} · '${picked.keyword}'`;
}

/** 사용자가 카테고리를 직접 고름 → 이번 할 일은 자동 분류하지 않고, 이후 기본값으로도 사용 */
function onCategoryChosenManually() {
  categoryPicker.categoryTouched = true;
  categoryPicker.baseCategory = dom.categorySelect.value;
  categoryPicker.autoPicked = null;
  renderAutoCategoryHint();
}

/** 할 일을 추가한 뒤: 선택 상태 초기화, 카테고리는 기본값으로 */
function resetCategoryPicker() {
  categoryPicker.categoryTouched = false;
  categoryPicker.autoPicked = null;
  dom.categorySelect.value = categoryPicker.baseCategory;
  renderAutoCategoryHint();
}

function setAutoCategory(enabled) {
  state.autoCategory = enabled;
  storage.set(STORAGE_KEYS.autoCategory, enabled ? 'on' : 'off');
  updateAutoCategory(); // 끄면 즉시 기본값으로, 켜면 지금 입력에 바로 적용
}

function setFilter(filter, fromShortcut = false) {
  if (!FILTERS.includes(filter)) return;
  state.filter = filter;
  storage.set(STORAGE_KEYS.filter, filter);
  // 필터를 고르면 새 할 일의 기본 카테고리도 맞춰 줌 (입력 중인 텍스트에 키워드가 있으면 그쪽이 우선)
  if (filter !== 'all') {
    categoryPicker.baseCategory = filter;
    categoryPicker.categoryTouched = false;
    updateAutoCategory();
  }
  render();
  if (fromShortcut) showToast(`필터: ${FILTER_LABELS[filter]}`);
  announce(`${FILTER_LABELS[filter]} 필터, ${dom.list.children.length}개 표시`);
}

function setSort(mode) {
  if (!Object.hasOwn(SORT_MODES, mode)) return;
  state.sort = mode;
  storage.set(STORAGE_KEYS.sort, mode);
  render();
  showToast(mode === 'manual'
    ? '직접 정렬: ⠿ 를 끌어서 순서를 바꿀 수 있습니다'
    : `정렬: ${SORT_MODES[mode]}`);
}

/** 완료된 항목 모두 삭제 (확인 후, 실행 취소 가능) */
async function clearCompleted() {
  const count = state.todos.filter((t) => t.completed).length;
  if (count === 0) {
    showToast('완료된 항목이 없습니다', { type: 'warn' });
    return;
  }

  const choice = await openDialog({
    title: '완료된 항목 삭제',
    message: `완료된 할 일 ${count}개를 모두 삭제할까요?\n삭제 직후에는 '실행 취소'로 되돌릴 수 있습니다.`,
    buttons: [
      { label: '취소', value: 'cancel', autofocus: true },
      { label: `${count}개 삭제`, value: 'delete', variant: 'danger' },
    ],
  });
  if (choice !== 'delete') return;

  // 화면에 보이는 완료 항목들은 동시에 사라지는 애니메이션
  const leaving = [...dom.list.querySelectorAll('.todo-item.completed')];
  await Promise.all(leaving.map((li) => playExit(li, 'leaving')));

  // 다이얼로그가 떠 있는 동안 다른 탭에서 바뀌었을 수도 있으니 다시 계산
  const removedItems = [];
  state.todos.forEach((todo, index) => {
    if (todo.completed) removedItems.push({ todo, index });
  });
  if (removedItems.length === 0) {
    render();
    return;
  }

  state.todos = state.todos.filter((t) => !t.completed);
  if (state.editingId && !findTodo(state.editingId)) state.editingId = null;
  const entry = pushUndo({ type: 'items', items: removedItems });
  commit();
  dom.input.focus();

  showToast(`완료된 할 일 ${removedItems.length}개를 삭제했습니다`, {
    action: { label: '실행 취소', onClick: () => undo(entry) },
  });
}

/* ==========================================================================
   10. 실행 취소 (Undo)

   두 종류의 기록:
   - items:    삭제된 항목과 원래 위치. 복구할 때 그 사이에 추가된 항목은 그대로 둔다.
   - snapshot: 목록 전체의 이전 상태 (가져오기처럼 목록을 통째로 바꾼 경우)
   ========================================================================== */

const undoStack = [];

function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  return entry;
}

/**
 * @param {object} [entry] 특정 기록을 되돌림 (토스트의 '실행 취소' 버튼). 생략하면 가장 최근 기록 (Ctrl+Z)
 */
function undo(entry) {
  const position = entry ? undoStack.indexOf(entry) : undoStack.length - 1;
  if (position === -1) {
    showToast(entry ? '이미 되돌린 작업입니다' : '되돌릴 작업이 없습니다', { type: 'warn' });
    return;
  }
  const [target] = undoStack.splice(position, 1);

  if (target.type === 'snapshot') {
    state.todos = target.todos;
    state.editingId = null;
    commit();
    showToast(`${target.label} 이전 상태로 되돌렸습니다`);
    return;
  }

  // items: 원래 인덱스가 작은 것부터 끼워 넣어야 각자의 위치가 정확히 복원됨
  const existingIds = new Set(state.todos.map((t) => t.id));
  const restored = [];
  for (const { todo, index } of [...target.items].sort((a, b) => a.index - b.index)) {
    if (existingIds.has(todo.id)) continue; // 다른 탭이나 가져오기로 이미 같은 항목이 있으면 건너뜀
    state.todos.splice(Math.min(index, state.todos.length), 0, todo);
    existingIds.add(todo.id);
    pendingAnimations.set(todo.id, 'enter');
    restored.push(todo);
  }

  commit();
  if (restored.length === 0) {
    showToast('복구할 항목이 이미 목록에 있습니다', { type: 'warn' });
    return;
  }
  focusItem(restored[0].id, 'todo-checkbox');
  showToast(restored.length === 1
    ? `"${shorten(restored[0].text)}"을(를) 복구했습니다`
    : `${restored.length}개 항목을 복구했습니다`);
}

/* ==========================================================================
   11. 정렬 · 드래그 앤 드롭
   ========================================================================== */

/**
 * 정렬 기준
 * - manual:   사용자가 끌어서 정한 순서. 단, 완료 항목은 항상 아래 그룹으로 모음
 * - newest / oldest: 생성 시각
 * - category: 업무 → 개인 → 공부, 같은 카테고리 안에서는 미완료 먼저
 * - status:   미완료 → 완료, 같은 그룹 안에서는 최신순
 * Array.prototype.sort는 안정 정렬이므로 기준이 같으면 직접 정한 순서가 유지된다.
 */
const SORTERS = {
  manual: (a, b) => Number(a.completed) - Number(b.completed),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  category: (a, b) => CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category)
    || Number(a.completed) - Number(b.completed),
  status: (a, b) => Number(a.completed) - Number(b.completed) || b.createdAt.localeCompare(a.createdAt),
};

/** 현재 필터·검색·정렬을 적용한 목록 */
function getVisibleTodos() {
  const query = state.query.toLowerCase();
  return state.todos
    .filter((t) => state.filter === 'all' || t.category === state.filter)
    .filter((t) => !query || t.text.toLowerCase().includes(query))
    .sort(SORTERS[state.sort]);
}

/**
 * 화면에 보이는 항목들의 새 순서를 전체 배열에 반영.
 * 필터·검색으로 일부만 보일 때도 동작하도록, 보이는 항목들이 차지하던 "자리"에 새 순서대로 다시 채운다.
 * (숨겨진 항목의 위치는 그대로 유지)
 */
function applyManualOrder(orderedIds) {
  const idSet = new Set(orderedIds);
  const slots = [];
  state.todos.forEach((t, i) => {
    if (idSet.has(t.id)) slots.push(i);
  });
  const byId = new Map(state.todos.map((t) => [t.id, t]));
  orderedIds.forEach((id, k) => {
    state.todos[slots[k]] = byId.get(id);
  });
}

function currentDomOrder() {
  return [...dom.list.children].map((el) => el.dataset.id);
}

/** 완료 항목은 아래 그룹에 고정되므로, 같은 완료 상태끼리만 순서를 바꿀 수 있음 */
function sameGroup(a, b) {
  return a.classList.contains('completed') === b.classList.contains('completed');
}

/** 키보드(↑/↓)로 한 칸 이동 — 드래그를 쓸 수 없는 사용자를 위한 대안 */
function moveByKeyboard(li, direction) {
  if (state.sort !== 'manual') return;
  const sibling = direction < 0 ? li.previousElementSibling : li.nextElementSibling;
  if (!sibling || !sameGroup(li, sibling)) {
    announce('더 이상 이동할 수 없습니다');
    return;
  }
  const ids = currentDomOrder();
  const from = ids.indexOf(li.dataset.id);
  const to = from + direction;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  applyManualOrder(ids);
  commit(); // render가 포커스(순서 변경 버튼)를 유지해 줌
  announce(`${to + 1}번째로 이동했습니다. 전체 ${ids.length}개 중`);
}

/**
 * 포인터 이벤트 기반 드래그 (마우스·터치·펜 모두 지원. HTML5 drag API는 터치에서 동작하지 않음)
 *
 * 동작 방식:
 * - 끌고 있는 항목(li)은 DOM에서 직접 옮기지 않고, 이웃 항목을 li의 앞/뒤로 옮긴다.
 *   li를 옮기면 포인터 캡처와 포커스가 풀리기 때문.
 * - li는 transform으로 포인터를 따라가고, 자리를 바꾼 이웃은 FLIP 기법으로 부드럽게 이동한다.
 * - 손을 떼면 DOM 순서를 데이터에 반영(applyManualOrder)하고, Esc를 누르면 원래 순서로 되돌린다.
 */
let drag = null;

function onDragStart(e) {
  const handle = e.target.closest('.drag-handle');
  if (!handle || drag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (state.sort !== 'manual' || state.editingId !== null) return;

  const li = handle.closest('.todo-item');
  if (!li || isAnimating(li)) return;

  e.preventDefault(); // 텍스트 선택, 터치 스크롤 방지
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // 일부 환경(합성 이벤트 등)에서는 캡처 실패 → window 리스너로 계속 추적
  }

  drag = {
    li,
    handle,
    pointerId: e.pointerId,
    startPageY: e.pageY,
    startTop: li.offsetTop,
    originalOrder: currentDomOrder(),
  };
  li.classList.add('dragging');
  document.body.classList.add('is-dragging');

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  const { li } = drag;

  // 화면 위/아래 가장자리에 가까우면 자동 스크롤 (긴 목록 대응)
  const edge = 60;
  if (e.clientY < edge) window.scrollBy(0, -12);
  else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);

  // 끌고 있는 항목의 "눈에 보이는" 중심 위치 (offsetParent 기준 좌표)
  const draggedCenter = drag.startTop + (e.pageY - drag.startPageY) + li.offsetHeight / 2;

  // 중심이 이웃의 중심을 넘으면 자리 교환 (빠르게 끌면 여러 칸을 한 번에 넘을 수 있어 반복)
  for (;;) {
    const next = li.nextElementSibling;
    if (next && sameGroup(li, next) && draggedCenter > next.offsetTop + next.offsetHeight / 2) {
      shiftWithAnimation(next, () => dom.list.insertBefore(next, li));
      continue;
    }
    const prev = li.previousElementSibling;
    if (prev && sameGroup(li, prev) && draggedCenter < prev.offsetTop + prev.offsetHeight / 2) {
      shiftWithAnimation(prev, () => dom.list.insertBefore(prev, li.nextElementSibling));
      continue;
    }
    break;
  }

  // li의 레이아웃 위치가 바뀐 만큼 보정해서 포인터 아래에 계속 붙어 있게 함
  const offset = (e.pageY - drag.startPageY) - (li.offsetTop - drag.startTop);
  li.style.transform = `translateY(${offset}px)`;
}

/** FLIP: 요소를 옮긴 뒤, 옮기기 전 위치에서 새 위치로 미끄러지듯 이동 */
function shiftWithAnimation(el, mutate) {
  const before = el.offsetTop;
  mutate();
  const delta = before - el.offsetTop;
  if (!delta || reducedMotion.matches) return;
  el.style.transition = 'none';
  el.style.transform = `translateY(${delta}px)`;
  void el.offsetHeight; // 강제 리플로우로 시작 위치 확정
  el.style.transition = 'transform 0.15s ease';
  el.style.transform = '';
}

function onDragEnd(e) {
  if (drag && e.pointerId === drag.pointerId) finishDrag(true);
}

function onDragCancel(e) {
  if (drag && e.pointerId === drag.pointerId) finishDrag(false);
}

/** @param {boolean} keep true면 새 순서 저장, false면 원래 순서로 되돌림 */
function finishDrag(keep) {
  if (!drag) return;
  const { li, handle, pointerId, originalOrder } = drag;
  drag = null;

  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
  try {
    handle.releasePointerCapture(pointerId);
  } catch {
    // 이미 해제된 경우 무시
  }

  // dragging 클래스를 먼저 빼면 .todo-item의 transform 전환이 살아나서 제자리로 부드럽게 내려앉음
  li.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  for (const el of dom.list.children) {
    el.style.transform = '';
    el.style.transition = '';
  }

  const newOrder = currentDomOrder();
  const changed = newOrder.join('\n') !== originalOrder.join('\n');
  if (keep && changed) {
    applyManualOrder(newOrder);
    commit();
    announce(`${newOrder.indexOf(li.dataset.id) + 1}번째로 이동했습니다`);
  } else {
    render(); // 데이터는 그대로이므로 DOM이 원래 순서로 돌아감
  }
}

/* ==========================================================================
   12. 내보내기 · 가져오기
   ========================================================================== */

/**
 * 현재 목록을 JSON 파일로 다운로드.
 * @param {'export'|'backup'} kind 파일 이름 구분용
 * @returns {boolean} 성공 여부
 */
function exportData(kind = 'export') {
  try {
    scheduleSave.flush(); // 저장 대기 중인 변경까지 확정
    const payload = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      count: state.todos.length,
      todos: state.todos,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-tasks-${kind === 'backup' ? 'backup-' : ''}${fileTimestamp()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    // 다운로드가 시작될 시간을 준 뒤 메모리 해제
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error('내보내기 실패:', err);
    showToast('파일을 만들지 못했습니다', { type: 'warn' });
    return false;
  }
}

function handleExportClick() {
  if (state.todos.length === 0) {
    showToast('내보낼 할 일이 없습니다', { type: 'warn' });
    return;
  }
  if (exportData('export')) showToast(`할 일 ${state.todos.length}개를 내보냈습니다`);
}

/** 가져오기 다이얼로그에 넣을 "대체 / 합치기" 선택 */
function createImportModeField() {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = '가져오기 방식';
  fieldset.append(legend);

  const options = [
    ['replace', '현재 목록을 파일 내용으로 대체'],
    ['merge', '현재 목록에 합치기 (중복 제외)'],
  ];
  for (const [value, label] of options) {
    const wrap = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'import-mode';
    radio.value = value;
    radio.checked = value === 'replace';
    wrap.append(radio, label);
    fieldset.append(wrap);
  }
  return fieldset;
}

/**
 * 파일 하나를 검증하고, 사용자 확인(백업 여부·방식)을 거쳐 가져온다.
 * 처리하는 예외 상황: 빈 파일, 너무 큰 파일, JSON이 아닌 파일, 읽기 실패, 잘못된 구조,
 * 유효한 항목 0개, 일부 항목 손상, 더 최신 버전 파일, 백업 실패
 */
async function importFromFile(file) {
  if (!file) return;
  if (file.size === 0) {
    showToast('빈 파일입니다', { type: 'warn' });
    return;
  }
  if (file.size > MAX_IMPORT_BYTES) {
    showToast('파일이 너무 큽니다 (최대 5MB)', { type: 'warn' });
    return;
  }
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    showToast('JSON 파일(.json)만 가져올 수 있습니다', { type: 'warn' });
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (err) {
    console.error('파일 읽기 실패:', err);
    showToast('파일을 읽지 못했습니다', { type: 'warn' });
    return;
  }

  let parsed;
  try {
    // BOM(﻿)이 붙은 파일도 허용
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    showToast('올바른 JSON 형식이 아닙니다', { type: 'warn' });
    return;
  }

  if (parsed && typeof parsed === 'object' && Number(parsed.version) > EXPORT_VERSION) {
    showToast('더 최신 버전에서 만든 파일입니다. 일부 정보는 무시될 수 있습니다.', { type: 'warn' });
  }

  const result = sanitizeTodos(parsed);
  if (!result) {
    showToast('파일에서 할 일 목록을 찾을 수 없습니다', { type: 'warn' });
    return;
  }
  if (result.items.length === 0) {
    showToast(result.skipped > 0
      ? `가져올 수 있는 할 일이 없습니다 (잘못된 항목 ${result.skipped}개)`
      : '파일에 할 일이 없습니다', { type: 'warn' });
    return;
  }

  const found = `파일에서 할 일 ${result.items.length}개를 찾았습니다.`
    + (result.skipped > 0 ? ` (잘못된 항목 ${result.skipped}개는 제외)` : '');

  let mode = 'replace';
  if (state.todos.length === 0) {
    // 현재 데이터가 없으면 백업할 것도 없음
    const choice = await openDialog({
      title: '데이터 가져오기',
      message: `${found}\n가져올까요?`,
      buttons: [
        { label: '취소', value: 'cancel', autofocus: true },
        { label: '가져오기', value: 'import', variant: 'primary' },
      ],
    });
    if (choice !== 'import') return;
  } else {
    // 현재 데이터가 있으면: 백업 여부 + 대체/합치기 선택
    const modeField = createImportModeField();
    const choice = await openDialog({
      title: '데이터 가져오기',
      message: `${found}\n현재 목록에는 ${state.todos.length}개가 있습니다.\n가져오기 전에 현재 데이터를 백업 파일로 저장할까요?`,
      extra: modeField,
      buttons: [
        { label: '취소', value: 'cancel', autofocus: true },
        { label: '백업 없이 가져오기', value: 'import' },
        { label: '백업 후 가져오기', value: 'backup', variant: 'primary' },
      ],
    });
    if (choice !== 'backup' && choice !== 'import') return;

    mode = modeField.querySelector('input[name="import-mode"]:checked')?.value ?? 'replace';
    if (choice === 'backup' && !exportData('backup')) {
      // 백업이 실패하면 데이터를 잃을 수 있으므로 가져오기를 중단
      showToast('백업에 실패해서 가져오기를 취소했습니다', { type: 'warn' });
      return;
    }
  }

  applyImport(result.items, mode, result.skipped);
}

/**
 * @param {object[]} items 검증된 항목
 * @param {'replace'|'merge'} mode
 * @param {number} skipped 검증에서 제외된 개수 (안내용)
 */
function applyImport(items, mode, skipped) {
  // 가져오기 전 상태를 통째로 보관 → '실행 취소'로 되돌릴 수 있음
  const entry = pushUndo({
    type: 'snapshot',
    label: '가져오기',
    todos: state.todos.map((t) => ({ ...t })),
  });

  let added = 0;
  let duplicates = 0;

  if (mode === 'merge') {
    const ids = new Set(state.todos.map((t) => t.id));
    const keys = new Set(state.todos.map((t) => `${normalizeText(t.text)}|${t.category}`));
    for (const item of items) {
      const key = `${normalizeText(item.text)}|${item.category}`;
      if (keys.has(key)) {
        duplicates++; // 같은 내용·같은 카테고리는 건너뜀
        continue;
      }
      if (ids.has(item.id)) item.id = generateId(); // id만 겹치면 새 id로
      ids.add(item.id);
      keys.add(key);
      state.todos.push(item);
      added++;
    }
  } else {
    state.todos = items;
    added = items.length;
  }

  state.editingId = null;
  commit();

  let message = `할 일 ${added}개를 가져왔습니다`;
  if (duplicates > 0) message += ` · 중복 ${duplicates}개 건너뜀`;
  if (skipped > 0) message += ` · 잘못된 항목 ${skipped}개 제외`;
  showToast(message, { action: { label: '실행 취소', onClick: () => undo(entry) } });
}

/* ==========================================================================
   13. 렌더링

   성능 전략 (항목 수백~수천 개 대응):
   - 키 기반 재사용: id → { el, sig } 캐시를 두고, 내용(sig)이 바뀐 항목만 새로 만든다.
     나머지는 기존 DOM을 재사용하고 순서만 맞춘다. (매번 전체를 다시 만들지 않음)
   - 진행률 대시보드는 DOM을 그대로 두고 숫자·너비만 바꾼다. (바 전환 애니메이션 유지)
   - 상대 시간("N분 전")은 1분마다 텍스트만 갱신한다.
   - 검색 입력과 저장은 디바운스한다.
   ========================================================================== */

/** id → { el: HTMLLIElement, sig: string } */
const nodeCache = new Map();

/** render 도중에 발생하는 focusout(요소 이동으로 인한 포커스 해제)을 무시하기 위한 플래그 */
let isRendering = false;

/** 렌더 후 포커스를 복원할 때 찾을 수 있는 항목 내부 요소들 */
const FOCUSABLE_IN_ITEM = ['todo-checkbox', 'drag-handle', 'edit-btn', 'delete-btn', 'edit-input', 'edit-category'];

/** 항목의 DOM을 다시 만들어야 하는지 판단하는 서명 (시간 표시는 별도 갱신이라 제외) */
function itemSignature(todo) {
  return [
    todo.text,
    todo.completed,
    todo.category,
    todo.id === state.editingId,
    state.query,              // 검색어 하이라이트
    state.sort === 'manual',  // 드래그 핸들 표시 여부
  ].join('\u0000');
}

/** 같은 애니메이션을 다시 재생 (클래스 제거 → 리플로우 → 추가) */
function replayAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** 한 번만 재생되는 애니메이션. 끝나면 클래스를 제거해서, 나중에 DOM 순서가 바뀌어도 다시 재생되지 않게 함 */
function playOnce(el, className) {
  if (reducedMotion.matches) return;
  // 이미 재생 중일 때만 강제 리플로우로 재시작 (불필요한 동기 레이아웃 계산을 피함 — 긴 목록에서 비용이 큼)
  if (el.classList.contains(className)) replayAnimation(el, className);
  else el.classList.add(className);
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
}

/** el에 퇴장 애니메이션 클래스를 붙이고 끝나면 resolve (모션 줄이기 설정 시 즉시) */
function playExit(el, className) {
  if (reducedMotion.matches) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 400); // animationend가 오지 않는 경우(탭 비활성 등) 대비
    el.classList.add(className);
  });
}

function isAnimating(el) {
  return el.classList.contains('leaving') || el.classList.contains('slide-out');
}

/** 특정 항목 안의 요소에 포커스. 성공 여부 반환 */
function focusItem(id, className = 'todo-checkbox') {
  const el = nodeCache.get(id)?.el.querySelector(`.${className}`);
  if (!el) return false;
  el.focus();
  return true;
}

/** 검색어와 일치하는 부분을 <mark>로 감싸서 표시 (텍스트 노드만 사용 → XSS 안전) */
function setHighlightedText(el, text, query) {
  if (!query) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(q, pos)) !== -1) {
    if (idx > pos) el.append(text.slice(pos, idx));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + q.length);
    el.append(mark);
    pos = idx + q.length;
  }
  if (pos < text.length) el.append(text.slice(pos));
}

function createIconButton(className, label, symbol) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn ${className}`;
  btn.textContent = symbol;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  return btn;
}

function createCategorySelect(className, selected, label) {
  const select = document.createElement('select');
  select.className = className;
  select.setAttribute('aria-label', label);
  for (const [value, text] of Object.entries(CATEGORIES)) {
    select.add(new Option(text, value, false, value === selected));
  }
  return select;
}

function createViewBody(todo) {
  const body = document.createElement('div');
  body.className = 'todo-body';

  const text = document.createElement('span');
  text.className = 'todo-text';
  setHighlightedText(text, todo.text, state.query);
  text.title = '더블클릭하여 수정';

  const meta = document.createElement('div');
  meta.className = 'todo-meta';

  const tag = document.createElement('span');
  tag.className = 'category-tag';
  tag.textContent = CATEGORIES[todo.category];

  const time = document.createElement('time');
  time.className = 'todo-time';
  time.dateTime = todo.createdAt;
  time.title = new Date(todo.createdAt).toLocaleString('ko-KR');
  time.textContent = formatRelativeTime(todo.createdAt);

  meta.append(tag, time);
  body.append(text, meta);
  return body;
}

function createEditBody(todo) {
  const wrap = document.createElement('div');
  wrap.className = 'todo-edit';

  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'edit-input';
  field.value = todo.text;
  field.maxLength = MAX_TEXT_LENGTH;
  field.setAttribute('aria-label', '할 일 내용 수정');

  wrap.append(field, createCategorySelect('edit-category', todo.category, '카테고리 수정'));
  return wrap;
}

function createTodoElement(todo) {
  const editing = todo.id === state.editingId;
  const shortText = shorten(todo.text, 30);

  const li = document.createElement('li');
  li.className = 'todo-item'
    + (todo.completed ? ' completed' : '')
    + (editing ? ' editing' : '');
  li.dataset.id = todo.id;
  li.dataset.category = todo.category;

  // 직접 정렬일 때만 드래그 핸들 (키보드: 포커스 후 ↑/↓)
  if (state.sort === 'manual' && !editing) {
    const handle = createIconButton('drag-handle', `"${shortText}" 순서 변경 (위·아래 화살표 키)`, '⠿');
    handle.setAttribute('aria-describedby', 'list-help');
    li.append(handle);
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = todo.completed;
  checkbox.disabled = editing;
  checkbox.setAttribute('aria-label', `${shortText} (${CATEGORIES[todo.category]}) 완료`);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  // 더블클릭이 어려운 터치 기기·키보드 사용자를 위한 수정 버튼
  if (!editing) actions.append(createIconButton('edit-btn', `"${shortText}" 수정`, '✎'));
  actions.append(createIconButton('delete-btn', `"${shortText}" 삭제`, '×'));

  li.append(checkbox, editing ? createEditBody(todo) : createViewBody(todo), actions);
  return li;
}

/**
 * 최장 증가 부분 수열(LIS)에 속하는 위치들을 반환. O(n log n)
 * seq의 -1(아직 DOM에 없는 새 요소)은 건너뛴다.
 * → 이미 올바른 상대 순서로 놓인 가장 긴 요소 묶음은 그대로 두고, 나머지만 옮기면 이동 횟수가 최소가 된다.
 */
function longestIncreasingSubsequence(seq) {
  const tails = [];          // tails[k] = 길이 k+1 수열의 마지막 원소 위치(seq 인덱스)
  const prev = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i];
    if (v < 0) continue;
    // 이진 탐색: seq[tails[k]] >= v 인 첫 k
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const result = new Set();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) result.add(i);
  return result;
}

/**
 * 목록 갱신 (키 기반 재조정)
 *  1단계: 내용이 바뀐 항목은 새로 만들고, 낡은 요소·안 보이게 된 요소는 먼저 제거
 *  2단계: 남은 요소 중 이미 올바른 순서인 최대 묶음(LIS)은 그대로 두고 나머지만 이동/삽입
 *  예) 1000개 중 1개를 완료 → 그 1개만 아래로 이동 (나머지 999개는 DOM 변경 없음)
 * @returns {number} 화면에 보이는 항목 수
 */
function renderList() {
  const visible = getVisibleTodos();
  const visibleIds = new Set();
  const ordered = []; // 새 순서대로의 li 요소

  // 1단계
  for (const todo of visible) {
    visibleIds.add(todo.id);
    const sig = itemSignature(todo);
    let entry = nodeCache.get(todo.id);

    // 처음 보이거나 내용이 바뀐 항목만 새로 생성 (낡은 요소는 즉시 제거)
    if (!entry || entry.sig !== sig) {
      if (entry) entry.el.remove();
      entry = { el: createTodoElement(todo), sig };
      nodeCache.set(todo.id, entry);
    }

    const animation = pendingAnimations.get(todo.id);
    if (animation) playOnce(entry.el, animation);
    ordered.push(entry.el);
  }

  // 더 이상 보이지 않는 항목 제거 (Map은 순회 중 삭제해도 안전)
  for (const [id, entry] of nodeCache) {
    if (!visibleIds.has(id)) {
      entry.el.remove();
      nodeCache.delete(id);
    }
  }

  // 2단계: 현재 DOM 위치 → LIS로 "움직이지 않을" 요소 결정
  const currentIndex = new Map();
  Array.prototype.forEach.call(dom.list.children, (el, i) => currentIndex.set(el, i));
  const seq = ordered.map((el) => currentIndex.get(el) ?? -1);
  const stable = longestIncreasingSubsequence(seq);

  // 뒤에서부터 채우면 "다음 요소" 기준점이 항상 확정되어 있음
  let nextEl = null;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i];
    if (!stable.has(i)) dom.list.insertBefore(el, nextEl);
    nextEl = el;
  }

  pendingAnimations.clear();
  return visible.length;
}

function renderFilters() {
  dom.filters.querySelectorAll('.filter-btn').forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  dom.sortSelect.value = state.sort;
}

function renderEmptyState(visibleCount) {
  dom.emptyState.classList.toggle('hidden', visibleCount > 0);
  if (visibleCount > 0) return;

  if (state.todos.length === 0) {
    dom.emptyMessage.textContent = '할 일이 없습니다. 추가해보세요!';
  } else if (state.query) {
    dom.emptyMessage.textContent = `"${shorten(state.query, 30)}"와(과) 일치하는 할 일이 없습니다.`;
  } else if (state.filter !== 'all') {
    dom.emptyMessage.textContent = `${CATEGORIES[state.filter]} 카테고리에 할 일이 없습니다. 추가해보세요!`;
  } else {
    dom.emptyMessage.textContent = '할 일이 없습니다. 추가해보세요!';
  }
}

/** 완료율에 따른 응원 메시지 */
function cheerMessage(total, done, pct) {
  if (total === 0) return '첫 번째 할 일을 추가해 보세요!';
  if (pct === 100) return '🎉 모든 할 일을 끝냈어요! 정말 멋져요.';
  if (done === 0) return '시작이 반이에요. 하나씩 해볼까요?';
  if (pct < 30) return '좋은 출발이에요! 이 흐름을 이어가요.';
  if (pct < 50) return `잘하고 있어요! 벌써 ${pct}%를 해냈어요.`;
  if (pct < 80) return '절반을 넘었어요. 조금만 더 힘내요!';
  return '거의 다 왔어요! 마지막 힘을 내요!';
}

/** 직전 완료율 (100% 달성 순간을 감지해서 축하하기 위함) */
let lastPercent = null;

/** 대시보드: 필터·검색과 관계없이 전체 데이터 기준, 한 번의 순회로 모든 수치 계산 */
function renderStats() {
  const now = new Date();
  const perCategory = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, { done: 0, total: 0 }]));
  let done = 0;
  let today = 0;

  for (const t of state.todos) {
    const bucket = perCategory[t.category];
    bucket.total++;
    if (t.completed) {
      done++;
      bucket.done++;
    }
    if (isSameLocalDay(new Date(t.createdAt), now)) today++;
  }

  const total = state.todos.length;
  const pct = percent(done, total);

  dom.overallText.textContent = `${done}/${total} 완료 (${pct}%)`;
  dom.overallProgress.querySelector('.progress-fill').style.width = `${pct}%`;
  dom.overallProgress.setAttribute('aria-valuenow', String(pct));
  dom.overallProgress.setAttribute('aria-valuetext', `${total}개 중 ${done}개 완료, ${pct}%`);

  document.querySelectorAll('.cat-stat').forEach((el) => {
    const { done: d, total: n } = perCategory[el.dataset.category];
    const p = percent(d, n);
    el.querySelector('.cat-count').textContent = `${d}/${n}`;
    el.querySelector('.progress-fill').style.width = `${p}%`;
    const bar = el.querySelector('.progress');
    bar.setAttribute('aria-valuenow', String(p));
    bar.setAttribute('aria-valuetext', `${n}개 중 ${d}개 완료`);
  });

  dom.todayCount.textContent = String(today);
  dom.cheer.textContent = cheerMessage(total, done, pct);
  dom.cheer.classList.toggle('done', total > 0 && pct === 100);

  // 100%에 "도달한 순간"에만 축하 (처음 로드할 때나 이미 100%인 상태에서는 띄우지 않음)
  if (total > 0 && pct === 100 && lastPercent !== null && lastPercent < 100) {
    showToast('🎉 모든 할 일을 완료했어요!');
  }
  lastPercent = total > 0 ? pct : null;
}

/** 직전 남은 개수 (배지 바운스 애니메이션용) */
let lastRemaining = null;

function renderSummary() {
  let remaining = 0;
  for (const t of state.todos) if (!t.completed) remaining++;
  const completed = state.todos.length - remaining;

  dom.remainingBadge.textContent = String(remaining);
  dom.remainingSr.textContent = `남은 할 일 ${remaining}개`;
  dom.remainingBadge.classList.toggle('zero', remaining === 0 && state.todos.length > 0);
  if (lastRemaining !== null && lastRemaining !== remaining) playOnce(dom.remainingBadge, 'bump');
  lastRemaining = remaining;

  dom.listFooter.classList.toggle('hidden', state.todos.length === 0);
  dom.remainingText.textContent = remaining === 0 ? '모두 완료했습니다!' : `남은 할 일 ${remaining}개`;
  dom.clearCompletedBtn.disabled = completed === 0;
  dom.clearCompletedBtn.textContent = completed > 0
    ? `완료된 항목 모두 삭제 (${completed})`
    : '완료된 항목 모두 삭제';
}

/** 화면 전체 갱신. 목록 안에 있던 포커스는 같은 항목의 같은 요소로 복원한다 */
function render() {
  const active = document.activeElement;
  const activeLi = active && dom.list.contains(active) ? active.closest('.todo-item') : null;
  const focusTarget = activeLi
    ? { id: activeLi.dataset.id, cls: FOCUSABLE_IN_ITEM.find((c) => active.classList.contains(c)) }
    : null;

  isRendering = true;
  let visibleCount;
  try {
    visibleCount = renderList();
  } finally {
    isRendering = false;
  }

  if (focusTarget?.cls && !dom.list.contains(document.activeElement)) {
    focusItem(focusTarget.id, focusTarget.cls);
  }

  renderEmptyState(visibleCount);
  renderFilters();
  renderStats();
  renderSummary();
}

/* ---------- 오늘의 격언 ---------- */

/** 로컬 날짜 기준 일 번호 → 같은 날에는 항상 같은 격언 */
function todayQuoteIndex() {
  const d = new Date();
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor(localMidnight / 86400000) % QUOTES.length;
}

let quoteIndex = todayQuoteIndex();

function renderQuote(animate = false) {
  const quote = QUOTES[quoteIndex];
  dom.quoteText.textContent = quote.text;
  dom.quoteAuthor.textContent = quote.author;
  if (animate) playOnce(dom.quoteBody, 'swap');
}

function showRandomQuote() {
  if (QUOTES.length < 2) return;
  let next;
  do {
    next = Math.floor(Math.random() * QUOTES.length);
  } while (next === quoteIndex); // 같은 격언이 연속으로 나오지 않게
  quoteIndex = next;
  renderQuote(true);
  announce(`${QUOTES[quoteIndex].text} — ${QUOTES[quoteIndex].author}`);
}

/* ==========================================================================
   14. 이벤트 연결
   ========================================================================== */

/* ---------- 추가 폼: submit은 버튼 클릭과 Enter 키를 모두 처리 ---------- */
let isSubmitting = false; // 중복 확인 다이얼로그가 떠 있는 동안 재제출 방지

dom.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  try {
    if (await addTodo(dom.input.value, dom.categorySelect.value)) {
      dom.input.value = '';
      dom.input.classList.remove('invalid');
      resetCategoryPicker();
    }
  } finally {
    isSubmitting = false;
    dom.input.focus();
  }
});

dom.input.addEventListener('input', () => {
  dom.input.classList.remove('invalid');
  updateAutoCategory(); // 키워드 사전 검사는 수십 개 문자열 비교라 매 입력마다 해도 충분히 가벼움
});

// 사용자가 직접 바꾼 경우에만 발생 (JS로 value를 바꾸면 change 이벤트가 나지 않음)
dom.categorySelect.addEventListener('change', onCategoryChosenManually);
dom.autoCategoryToggle.addEventListener('change', () => setAutoCategory(dom.autoCategoryToggle.checked));

/* ---------- 검색: 입력이 멈춘 뒤 150ms 후 필터링 ---------- */
const runSearch = debounce(() => {
  state.query = cleanText(dom.searchInput.value);
  render();
  if (state.query) announce(`검색 결과 ${dom.list.children.length}개`);
}, SEARCH_DEBOUNCE_MS);

dom.searchInput.addEventListener('input', runSearch);

dom.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.searchInput.value) {
    e.preventDefault();
    e.stopPropagation(); // 전역 Esc 처리(드래그 취소)와 겹치지 않게
    runSearch.cancel();
    dom.searchInput.value = '';
    state.query = '';
    render();
    announce('검색어를 지웠습니다');
  }
});

/* ---------- 필터 · 정렬 · 테마 · 일괄 삭제 · 데이터 ---------- */
dom.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (btn) setFilter(btn.dataset.filter);
});

dom.sortSelect.addEventListener('change', () => setSort(dom.sortSelect.value));
dom.themeToggle.addEventListener('click', () => toggleTheme());
dom.clearCompletedBtn.addEventListener('click', clearCompleted);
dom.quoteRefresh.addEventListener('click', showRandomQuote);
dom.exportBtn.addEventListener('click', handleExportClick);
dom.importBtn.addEventListener('click', () => dom.importFile.click());

dom.importFile.addEventListener('change', async () => {
  const file = dom.importFile.files?.[0];
  // 같은 파일을 다시 선택해도 change가 발생하도록 비워 둠
  dom.importFile.value = '';
  await importFromFile(file);
});

/* ---------- 목록: 이벤트 위임 (항목이 수백 개여도 리스너는 목록에 하나씩) ---------- */

// 완료 체크: 슬라이드 아웃 → 상태 변경 → 아래 그룹으로 슬라이드 인
dom.list.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('todo-checkbox')) return;
  const li = e.target.closest('.todo-item');
  if (isAnimating(li)) return;
  await playExit(li, 'slide-out');
  toggleTodo(li.dataset.id);
});

dom.list.addEventListener('click', async (e) => {
  const li = e.target.closest('.todo-item');
  if (!li || isAnimating(li)) return;

  if (e.target.closest('.delete-btn')) {
    // 삭제 후 포커스를 옮길 곳: 다음 항목 → 이전 항목 → 입력창
    const neighbor = li.nextElementSibling || li.previousElementSibling;
    const neighborId = neighbor?.dataset.id;
    await playExit(li, 'leaving');
    deleteTodo(li.dataset.id);
    if (!(neighborId && focusItem(neighborId, 'delete-btn'))) dom.input.focus();
  } else if (e.target.closest('.edit-btn')) {
    startEdit(li.dataset.id);
  }
});

dom.list.addEventListener('dblclick', (e) => {
  const text = e.target.closest('.todo-text');
  if (!text) return;
  startEdit(text.closest('.todo-item').dataset.id);
});

dom.list.addEventListener('keydown', (e) => {
  // 순서 변경 버튼에서 ↑/↓
  if (e.target.classList.contains('drag-handle') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveByKeyboard(e.target.closest('.todo-item'), e.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  // 편집 중 Enter 저장 / Esc 취소 (한글 조합 중 Enter는 무시)
  const wrap = e.target.closest('.todo-edit');
  if (!wrap) return;
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    updateTodo(state.editingId, wrap.querySelector('.edit-input').value, wrap.querySelector('.edit-category').value, true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelEdit();
  }
});

// 편집 영역 밖으로 포커스가 나가면 저장 (입력창 ↔ 카테고리 select 사이 이동은 유지)
dom.list.addEventListener('focusout', (e) => {
  if (isRendering || state.editingId === null) return;
  const wrap = e.target.closest('.todo-edit');
  if (!wrap || wrap.contains(e.relatedTarget)) return;
  updateTodo(state.editingId, wrap.querySelector('.edit-input').value, wrap.querySelector('.edit-category').value, false);
});

// 드래그 시작 (이동·종료는 onDragStart에서 window에 연결)
dom.list.addEventListener('pointerdown', onDragStart);

/* ---------- 전역 키보드 단축키 ---------- */
// e.code(물리 키 위치)를 써서 한글 입력 상태에서도 동작
document.addEventListener('keydown', (e) => {
  if (drag && e.key === 'Escape') {
    e.preventDefault();
    finishDrag(false);
    return;
  }
  if (dom.dialog.open) return;

  // Ctrl+Z (Mac: Cmd+Z): 입력창 안에서는 브라우저 기본 실행 취소(글자 되돌리기)를 그대로 둠
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyZ') {
    const tag = e.target.tagName;
    const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    // 체크박스는 INPUT이지만 텍스트 입력이 아니므로 실행 취소 허용
    if (editable && e.target.type !== 'checkbox') return;
    e.preventDefault();
    undo();
    return;
  }

  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
  if (digit) {
    e.preventDefault();
    setFilter(FILTERS[Number(digit[1]) - 1], true);
  } else if (e.code === 'KeyN') {
    e.preventDefault();
    dom.input.focus();
    dom.input.select();
  } else if (e.code === 'KeyD') {
    e.preventDefault();
    toggleTheme(true);
  }
});

/* ---------- 저장 누락 방지: 탭을 닫거나 숨길 때 대기 중인 저장을 즉시 실행 ---------- */
window.addEventListener('pagehide', () => scheduleSave.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') scheduleSave.flush();
});

/* ---------- 다른 탭과 동기화 ---------- */
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEYS.todos) {
    // 이 탭에 아직 저장 안 된 변경이 있으면 그것이 곧 저장되므로 덮어쓰지 않음
    if (scheduleSave.pending()) return;
    let parsed = [];
    try {
      parsed = e.newValue ? JSON.parse(e.newValue) : [];
    } catch {
      return; // 다른 탭이 잘못된 값을 썼으면 무시
    }
    const result = sanitizeTodos(parsed);
    if (!result) return;
    state.todos = result.items;
    if (state.editingId && !findTodo(state.editingId)) state.editingId = null;
    render();
    showToast('다른 탭에서 변경한 내용을 반영했습니다');
  } else if (e.key === STORAGE_KEYS.theme && (e.newValue === 'dark' || e.newValue === 'light')) {
    applyTheme(e.newValue, true);
  }
});

/* ---------- 예기치 못한 오류: 사용자에게 알리고 콘솔에 기록 (5초에 한 번만) ---------- */
let lastErrorToast = 0;
function reportUnexpectedError(err) {
  console.error('예기치 못한 오류:', err);
  if (Date.now() - lastErrorToast < 5000) return;
  lastErrorToast = Date.now();
  showToast('예기치 못한 오류가 발생했습니다. 문제가 계속되면 새로고침해 주세요.', { type: 'warn', duration: 5000 });
}
window.addEventListener('error', (e) => reportUnexpectedError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportUnexpectedError(e.reason));

/* ---------- "N분 전"과 대시보드(오늘 추가 개수)를 1분마다 갱신 ---------- */
setInterval(() => {
  for (const el of dom.list.querySelectorAll('.todo-time')) {
    el.textContent = formatRelativeTime(el.dateTime);
  }
  renderStats();
}, 60 * 1000);

/* ==========================================================================
   15. 초기화
   ========================================================================== */

function init() {
  state.todos = loadTodos();
  state.filter = loadChoice(STORAGE_KEYS.filter, FILTERS, 'all');
  state.sort = loadChoice(STORAGE_KEYS.sort, Object.keys(SORT_MODES), 'manual');

  state.autoCategory = storage.get(STORAGE_KEYS.autoCategory) !== 'off'; // 기본값: 켜짐

  applyTheme(getTheme(), false);
  if (state.filter !== 'all') dom.categorySelect.value = state.filter;
  categoryPicker.baseCategory = dom.categorySelect.value;
  dom.autoCategoryToggle.checked = state.autoCategory;
  renderAutoCategoryHint();
  renderQuote();
  render();

  for (const message of startupWarnings) showToast(message, { type: 'warn', duration: 6000 });
}

init();
