import type { Category, Lab, Test, UiStrings, AppState, Lang } from '../models/types';
import type { MapController } from '../map/mapController';
import { escapeHtml, tx } from './utils';
import { runExportTestPdf, runExportTestsExcel } from './exportActions';
import { createStore } from '../store/store';
import { createAdminTest, hasAdminApiKey, updateAdminTest } from '../services/adminApi';
import { setContentBundle } from '../store/contentStore';

const CATEGORY_COLORS: Record<string, string> = {
  CAT_ENV: '#3dcd58',
  CAT_MECH: '#299bcd',
  CAT_ELEC: '#ffd100',
  CAT_FIRE: '#c20241',
  CAT_MAR: '#0075a3',
  CAT_ACOU: '#676f73',
  CAT_ASM: '#008029',
};
const TESTS_PER_PAGE = 12;
const LOCAL_ADMIN_TESTS_KEY = 'lab_admin_tests_draft';

function getCategoryColor(categoryId: string | null | undefined): string {
  if (!categoryId) return '#3dcd58';
  return CATEGORY_COLORS[categoryId] || '#3dcd58';
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLImageElement) {
    el.alt = value;
    return;
  }
  el.textContent = value;
}

function setPlaceholder(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.placeholder = value;
}

function getHash(): string {
  return decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
}

function readLocalAdminTests(): Test[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_TESTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is Test =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.categoryId === 'string' &&
        Array.isArray(item.tags) &&
        (item.labs === null || Array.isArray(item.labs)),
    );
  } catch {
    return null;
  }
}

function writeLocalAdminTests(tests: Test[]): void {
  localStorage.setItem(LOCAL_ADMIN_TESTS_KEY, JSON.stringify(tests, null, 2));
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type InitAppParams = {
  labs: Lab[];
  categories: Category[];
  tests: Test[];
  mapController: MapController;
  loadUiStrings: (lang: Lang) => Promise<UiStrings>;
  store: ReturnType<typeof createStore>;
};

export async function initApp({
  labs,
  categories,
  tests,
  mapController,
  loadUiStrings,
  store,
}: InitAppParams): Promise<void> {
  // NOTE: UI-only gate for convenience; not a secure auth mechanism.
  const SE_MEMBER_PASSWORDS = new Set([
    'SESA73820',
    'SESA25223',
    'SESA27660',
    'SESA40975',
    'SESA16193',
    'SESA147800',
    'SESA50280',
    'SESA50396',
    'SESA824934',
    'SESA842946',
  ]);
  const SE_MEMBER_KEY = 'se_member_unlocked';
  const remoteAdminEnabled = hasAdminApiKey();
  const localAdminTests = readLocalAdminTests();
  if (localAdminTests?.length) {
    tests = localAdminTests;
  }
  const SAMPLE_IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`\n      <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"220\" viewBox=\"0 0 320 220\">\n        <defs>\n          <linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n            <stop offset=\"0\" stop-color=\"rgba(0,255,170,0.35)\"/>\n            <stop offset=\"1\" stop-color=\"rgba(40,140,255,0.35)\"/>\n          </linearGradient>\n        </defs>\n        <rect x=\"0\" y=\"0\" width=\"320\" height=\"220\" rx=\"18\" fill=\"rgba(10,14,22,0.6)\"/>\n        <rect x=\"16\" y=\"16\" width=\"288\" height=\"188\" rx=\"14\" fill=\"url(#g)\"/>\n        <path d=\"M48 154 L112 106 L160 136 L220 88 L272 130\" fill=\"none\" stroke=\"rgba(255,255,255,0.8)\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n        <circle cx=\"112\" cy=\"106\" r=\"8\" fill=\"rgba(255,255,255,0.9)\"/>\n        <circle cx=\"220\" cy=\"88\" r=\"8\" fill=\"rgba(255,255,255,0.9)\"/>\n        <text x=\"160\" y=\"206\" text-anchor=\"middle\" font-family=\"system-ui,Segoe UI,Roboto,Arial\" font-size=\"16\" fill=\"rgba(234,241,255,0.95)\" font-weight=\"800\">\n          Sample image\n        </text>\n      </svg>\n    `);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const testsByCategory = new Map<string, Test[]>();
  const rebuildTestsByCategory = (): void => {
    testsByCategory.clear();
    tests.forEach((t) => {
      const arr = testsByCategory.get(t.categoryId) || [];
      arr.push(t);
      testsByCategory.set(t.categoryId, arr);
    });
  };
  rebuildTestsByCategory();

  let ui = await loadUiStrings(store.getState().lang);
  let labViewMode: 'about' | 'tests' = 'about';
  let lastLabTestsId: string | null = null;
  const getLabViewMode = (): 'about' | 'tests' => labViewMode;
  let testsBrowseMode: 'category' | 'standard' = 'category';
  let selectedStandardKey: string | null = null;
  let panelHeightsWriteRaf = 0;
  let adminEditingTestId: string | null = null;
  const canUseAdminEditor = true;

  function syncContentBundle(): void {
    setContentBundle({ labs, categories, tests, ui });
  }

  function upsertLocalTest(test: Test): void {
    const idx = tests.findIndex((item) => item.id === test.id);
    if (idx >= 0) tests[idx] = test;
    else tests.push(test);
    rebuildTestsByCategory();
    syncContentBundle();
  }

  function saveLocalAdminDraft(test: Test): Test {
    upsertLocalTest(test);
    writeLocalAdminTests(tests);
    return test;
  }

  function setTestsBrowsePanels(activeMode: 'category' | 'standard'): void {
    const categoryPanel = document.getElementById('viewTestsCategory');
    const standardPanel = document.getElementById('viewTestsStandard');
    if (categoryPanel) {
      categoryPanel.hidden = activeMode !== 'category';
      categoryPanel.style.display = activeMode === 'category' ? '' : 'none';
    }
    if (standardPanel) {
      standardPanel.hidden = activeMode !== 'standard';
      standardPanel.style.display = activeMode === 'standard' ? '' : 'none';
    }
    updatePanelBodyHeights();
  }

  function updateUrlState(): void {
    const state = store.getState();
    const params = new URLSearchParams();
    const q = state.searchQuery.trim();
    if (q) params.set('q', q);
    params.set('mode', testsBrowseMode);
    if (testsBrowseMode === 'standard' && selectedStandardKey) params.set('std', selectedStandardKey);
    if (testsBrowseMode === 'category' && state.selectedCategoryId) params.set('cat', state.selectedCategoryId);
    if (state.testPage > 0) params.set('page', String(state.testPage));

    let hash = '';
    if (state.selectedTestId) hash = encodeURIComponent(state.selectedTestId);
    else if (state.selectedLabId && labViewMode === 'tests') hash = `labtests:${encodeURIComponent(state.selectedLabId)}`;
    else if (state.selectedLabId) hash = `lab:${encodeURIComponent(state.selectedLabId)}`;

    const query = params.toString();
    const next = `${location.pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
    history.replaceState(null, '', next);
  }

  function triggerDetailFade(host: HTMLElement): void {
    host.classList.remove('fade-in');
    void host.offsetWidth;
    host.classList.add('fade-in');
  }

  function applyUiStrings(state: AppState): void {
    setText('uiTitle', ui.uiTitle);
    setText('uiSubtitle', ui.uiSubtitle);
    setPlaceholder('search', ui.searchPlaceholder);
    setText('navTitle', ui.navTitle);
    setText('navSub', ui.navSub);
    setText('currentCategory', ui.categoriesLabel);
    setText('btnBackCats', ui.categoriesLabel);
    setText('btnPrevPage', ui.prevPage);
    setText('btnNextPage', ui.nextPage);
    setText('btnExportExcel', ui.exportExcel);
    setText('btnExportPdfAll', ui.exportPdf);
    setText('detailTitle', ui.detailTitle);
    setText('detailSub', ui.detailSub);
    setText('navTestsBtn', ui.navTestsLabel);
    setText('navLabsBtn', ui.navLabsLabel);
    setText('navOverviewBtn', ui.navOverviewLabel);
    setText('testsBrowseCategory', ui.testsBrowseCategory);
    setText('testsBrowseStandard', ui.testsBrowseStandard);
    setText('navCompanyLink', ui.navCompanyLabel);
    setText('navVideoProceduresBtn', ui.navVideoProceduresLabel);
    setText('navTemplatesBtn', ui.navTemplatesLabel);
    setText('navStandardsBtn', ui.navStandardsLabel);
    setText('navMethodsBtn', ui.navMethodsLabel);
    setText('videoProceduresTitle', ui.videoProceduresTitle);
    setText('videoProcedure1Thumb', ui.videoProcedure1Thumb);
    setText('videoProcedure1Title', ui.videoProcedure1Title);
    setText('videoProcedure1Sub', ui.videoProcedure1Sub);
    setText('videoProcedure1Btn', ui.videoProcedure1Btn);
    setText('videoProcedure2Thumb', ui.videoProcedure2Thumb);
    setText('videoProcedure2Title', ui.videoProcedure2Title);
    setText('videoProcedure2Sub', ui.videoProcedure2Sub);
    setText('videoProcedure2Btn', ui.videoProcedure2Btn);
    setText('videoProceduresPlaceholder', ui.videoProceduresPlaceholder);
    setText('templatesTitle', ui.templatesTitle);
    setText('template1Thumb', ui.template1Thumb);
    setText('template1Title', ui.template1Title);
    setText('template1Sub', ui.template1Sub);
    setText('template1Btn', ui.template1Btn);
    setText('template2Thumb', ui.template2Thumb);
    setText('template2Title', ui.template2Title);
    setText('template2Sub', ui.template2Sub);
    setText('template2Btn', ui.template2Btn);
    setText('template3Thumb', ui.template3Thumb);
    setText('template3Title', ui.template3Title);
    setText('template3Sub', ui.template3Sub);
    setText('template3Btn', ui.template3Btn);
    setText('templatesNote', ui.templatesNote);
    setText('templatesHowLead', ui.templatesHowLead);
    setText('templatesHowTitle', ui.templatesHowTitle);
    setText('templatesStep1', ui.templatesStep1);
    setText('templatesStep2', ui.templatesStep2);
    setText('templatesStep3', ui.templatesStep3);
    setText('templatesPS', ui.templatesPS);
    setText('standardsTitle', ui.standardsTitle);
    setText('standard1Thumb', ui.standard1Thumb);
    setText('standard1Title', ui.standard1Title);
    setText('standard1Sub', ui.standard1Sub);
    setText('standard1Btn', ui.standard1Btn);
    setText('standard2Thumb', ui.standard2Thumb);
    setText('standard2Title', ui.standard2Title);
    setText('standard2Sub', ui.standard2Sub);
    setText('standard2Btn', ui.standard2Btn);
    setText('standard3Thumb', ui.standard3Thumb);
    setText('standard3Title', ui.standard3Title);
    setText('standard3Sub', ui.standard3Sub);
    setText('standard3Btn', ui.standard3Btn);
    setText('standard4Thumb', ui.standard4Thumb);
    setText('standard4Title', ui.standard4Title);
    setText('standard4Sub', ui.standard4Sub);
    setText('standard4Btn', ui.standard4Btn);
    setText('standard5Thumb', ui.standard5Thumb);
    setText('standard5Title', ui.standard5Title);
    setText('standard5Sub', ui.standard5Sub);
    setText('standard5Btn', ui.standard5Btn);
    setText('standardsNote', ui.standardsNote);
    const video1Btn = document.getElementById('videoProcedure1Btn');
    if (video1Btn) video1Btn.setAttribute('data-video-title', ui.videoProcedure1Title);
    const video2Btn = document.getElementById('videoProcedure2Btn');
    if (video2Btn) video2Btn.setAttribute('data-video-title', ui.videoProcedure2Title);
    setText('featureValidationTitle', ui.featureValidationTitle);
    setText('featureValidationSub', ui.featureValidationSub);
    setText('featureSelectionTitle', ui.featureSelectionTitle);
    setText('featureSelectionSub', ui.featureSelectionSub);
    setText('featureNetworkTitle', ui.featureNetworkTitle);
    setText('featureNetworkSub', ui.featureNetworkSub);

    document.querySelectorAll('.langBtn').forEach((btn) => {
      const lang = btn.getAttribute('data-lang');
      btn.setAttribute('aria-checked', lang === state.lang ? 'true' : 'false');
    });

    const closeBtn = document.getElementById('mapClose');
    if (closeBtn) closeBtn.textContent = ui.closeMap;

    renderNavMenus(state);
    syncContentBundle();
  }

  function setMemberUnlocked(unlocked: boolean): void {
    const memberItems = document.querySelectorAll('.navMemberOnly');
    memberItems.forEach((el) => el.classList.toggle('is-visible', unlocked));
    if (unlocked) sessionStorage.setItem(SE_MEMBER_KEY, 'true');
    else sessionStorage.removeItem(SE_MEMBER_KEY);
  }

  function isMemberUnlocked(): boolean {
    return sessionStorage.getItem(SE_MEMBER_KEY) === 'true';
  }

  const mapDock = document.getElementById('mapDock');
  const mapPanel = document.getElementById('mapPanel');

  function dockMap(): void {
    if (mapDock && mapPanel && mapPanel.parentElement !== mapDock) {
      mapDock.appendChild(mapPanel);
    }
  }

  function placeMap(target: HTMLElement | null): void {
    if (!mapPanel) return;
    if (target) {
      target.appendChild(mapPanel);
    } else {
      dockMap();
    }
    mapController.invalidateSize();
  }

  function updateTopHeightVar(): void {
    const top = document.getElementById('topHeader');
    if (!top) return;
    const h = top.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--topH', Math.ceil(h) + 'px');
    updatePanelBodyHeights();
  }

  function updatePanelBodyHeights(): void {
    const leftPanel = document.querySelector('section[aria-label="Browse tests"]');
    const rightPanel = document.querySelector('section[aria-label="Test details"]');
    const leftTop = leftPanel?.querySelector('.panelTop');
    const rightTop = rightPanel?.querySelector('.panelTop');
    const leftBody =
      (leftPanel?.querySelector('#viewTestsCategory:not([hidden])') as HTMLElement | null) ||
      (leftPanel?.querySelector('#viewTestsStandard:not([hidden])') as HTMLElement | null);
    const rightBody = rightPanel?.querySelector('#detailBody') as HTMLElement | null;
    const leftPx = leftPanel && leftTop ? Math.max(0, Math.floor(leftPanel.getBoundingClientRect().height - leftTop.getBoundingClientRect().height)) + 'px' : null;
    const rightPx = rightPanel && rightTop ? Math.max(0, Math.floor(rightPanel.getBoundingClientRect().height - rightTop.getBoundingClientRect().height)) + 'px' : null;
    if (panelHeightsWriteRaf) cancelAnimationFrame(panelHeightsWriteRaf);
    panelHeightsWriteRaf = requestAnimationFrame(() => {
      if (leftBody && leftPx) {
        leftBody.style.maxHeight = leftPx;
        leftBody.style.height = leftPx;
      }
      if (rightBody && rightPx) {
        rightBody.style.maxHeight = rightPx;
        rightBody.style.height = rightPx;
      }
    });
  }

  function renderLabsStrip(): void {
    const host = document.getElementById('labsStrip');
    if (!host) return;
    const state = store.getState();
    const labSubtitles: Record<Lang, Record<string, string>> = {
      es: {
        molins: 'Molins de Rei: Molins de Rei, Cataluña, España',
        capellades: 'Capellades: Capellades, Cataluña, España',
        sarre: 'Sarre-Union: Sarre-Union, Alsacia, Francia',
      },
      fr: {
        molins: 'Molins de Rei : Molins de Rei, Catalogne, Espagne',
        capellades: 'Capellades : Capellades, Catalogne, Espagne',
        sarre: 'Sarre-Union : Sarre-Union, Alsace, France',
      },
      en: {
        molins: 'Molins de Rei: Molins de Rei, Catalonia, Spain',
        capellades: 'Capellades: Capellades, Catalonia, Spain',
        sarre: 'Sarre-Union: Sarre-Union, Alsace, France',
      },
      ca: {
        molins: 'Molins de Rei: Molins de Rei, Catalunya, Espanya',
        capellades: 'Capellades: Capellades, Catalunya, Espanya',
        sarre: 'Sarre-Union: Sarre-Union, Alsàcia, França',
      },
    };
    host.innerHTML = '';
    labs.forEach((lab) => {
      const isSelected = lab.id === state.selectedLabId;
      const el = document.createElement('div');
      el.className = 'labCard' + (isSelected ? ' selected' : '');
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      const imgSrc = lab.img && lab.img.trim() ? lab.img : SAMPLE_IMG;
      const subtitle = labSubtitles[state.lang]?.[lab.id] || '';

      const labImg = document.createElement('div');
      labImg.className = 'labImg';
      const image = document.createElement('img');
      image.src = imgSrc;
      image.alt = 'Lab image';
      image.width = 320;
      image.height = 220;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.className = 'labPhoto labPhotoStrip';
      image.dataset.labId = lab.id;
      image.id = `labPhotoStrip-${lab.id}`;
      labImg.appendChild(image);

      const labBody = document.createElement('div');
      labBody.className = 'labBody';

      const labName = document.createElement('div');
      labName.className = 'labName';
      const colorDot = document.createElement('span');
      colorDot.className = 'labColorDot';
      colorDot.style.setProperty('--lab-color', lab.color);
      const nameText = document.createTextNode(tx(lab.name, state.lang));
      labName.append(colorDot, nameText);

      const labSubtitle = document.createElement('div');
      labSubtitle.className = 'labSubtitle';
      labSubtitle.textContent = subtitle;
      labBody.append(labName, labSubtitle);

      el.append(labImg, labBody);
      el.addEventListener('click', () => selectLabTests(lab.id));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      host.appendChild(el);
    });
  }

  function testMatchesQuery(test: Test, q: string, lang: Lang): boolean {
    if (!q) return true;
    const s = q.toLowerCase().trim();
    const title = tx(test.title, lang).toLowerCase();
    const tokens = s.split(/\s+/).filter(Boolean);
    return tokens.some((token) => title.includes(token));
  }

  function getStandardLabel(test: Test): string {
    if (test.refStdId === 'IEC_62208') return 'IEC 62208';
    if (test.refStdId === 'IEC_61439_5') return 'IEC 61439-5';
    if (test.refStdId === 'IEC_61386_1') return 'IEC 61386-1';
    if (test.refStdId === 'ISO_13347_1') return 'ISO 13347-1';
    const id = test.id || '';
    if (id.startsWith('IEC62208')) return 'IEC 62208';
    if (id.startsWith('IEC61439')) return 'IEC 61439-5';
    if (id.startsWith('IEC61386')) return 'IEC 61386-1';
    if (id.startsWith('ISO13347')) return 'ISO 13347-1';
    if (id.startsWith('UL_')) return 'UL';
    return 'Internal Method';
  }
  const STANDARD_COLORS: Record<string, string> = {
    'IEC 62208': '#009e4d',
    'IEC 61439-5': '#0075a3',
    'IEC 61386-1': '#005c80',
    'ISO 13347-1': '#299bcd',
    UL: '#c20241',
    'Internal Method': '#626469',
  };
  function getStandardColor(label: string): string {
    return STANDARD_COLORS[label] || '#626469';
  }

  function categoryMatchesQuery(category: Category, q: string, lang: Lang): boolean {
    if (!q) return true;
    const s = q.toLowerCase().trim();
    const testsInCat = testsByCategory.get(category.id) || [];
    const hay = (
      tx(category.title, lang) +
      ' ' +
      tx(category.subtitle, lang) +
      ' ' +
      testsInCat.map((t) => tx(t.title, lang)).join(' ')
    )
      .toLowerCase()
      .trim();
    return hay.includes(s);
  }

  function createEmptyStateCard(): HTMLDivElement {
    const empty = document.createElement('div');
    empty.className = 'infoCard';
    const title = document.createElement('div');
    title.className = 'infoTitle';
    title.textContent = ui.searchEmptyTitle;
    const sub = document.createElement('div');
    sub.className = 'infoSub';
    sub.textContent = ui.searchEmptySub;
    empty.append(title, sub);
    return empty;
  }

  function createCategoryCard(index: number, swatchColor: string, titleText: string, subtitleText: string): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'categoryCard';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const catIndex = document.createElement('div');
    catIndex.className = 'catIndex';
    catIndex.setAttribute('aria-hidden', 'true');
    catIndex.textContent = String(index + 1);

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.setProperty('--swatch', swatchColor);

    const textWrap = document.createElement('div');
    textWrap.className = 'testText';

    const title = document.createElement('div');
    title.className = 'testTitle';
    title.textContent = titleText;

    const subtitle = document.createElement('div');
    subtitle.className = 'testSub';
    subtitle.textContent = subtitleText;

    textWrap.append(title, subtitle);
    card.append(catIndex, swatch, textWrap);
    return card;
  }

  function createTestCard(test: Test, lang: Lang, selectedTestId: string | null): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'testCard';
    card.setAttribute('data-testid', test.id);
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-current', test.id === selectedTestId ? 'true' : 'false');

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.setProperty('--swatch', getCategoryColor(test.categoryId));

    const textWrap = document.createElement('div');
    textWrap.className = 'testText';

    const title = document.createElement('div');
    title.className = 'testTitle';
    title.textContent = tx(test.title, lang);

    const sub = document.createElement('div');
    sub.className = 'testSub';
    sub.textContent = tx(test.summary, lang);

    const tags = document.createElement('div');
    tags.className = 'tags';
    (test.tags || []).slice(0, 3).forEach((tagText) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tagText;
      tags.appendChild(tag);
    });

    textWrap.append(title, sub, tags);
    card.append(swatch, textWrap);
    return card;
  }

  function openAdminEditor(testId: string | null): void {
    if (!isMemberUnlocked() || !canUseAdminEditor) return;
    const overlay = document.getElementById('adminEditorOverlay');
    const form = document.getElementById('adminEditorForm') as HTMLFormElement | null;
    const error = document.getElementById('adminEditorError');
    const title = document.getElementById('adminEditorTitle');
    if (!overlay || !form || !title) return;

    const test = testId ? tests.find((item) => item.id === testId) || null : null;
    adminEditingTestId = test?.id || null;
    title.textContent = test ? 'Edit test content' : 'Create new test';
    if (error) error.textContent = '';

    const idInput = form.elements.namedItem('id') as HTMLInputElement | null;
    const categoryInput = form.elements.namedItem('categoryId') as HTMLSelectElement | null;
    const refStdInput = form.elements.namedItem('refStdId') as HTMLInputElement | null;
    const refClauseInput = form.elements.namedItem('refClause') as HTMLInputElement | null;
    const noClauseInput = form.elements.namedItem('noClause') as HTMLInputElement | null;
    const labsAll = form.elements.namedItem('labsAll') as HTMLInputElement | null;
    const labList = document.getElementById('adminLabList');
    const langLabel = document.getElementById('adminEditorLangLabel');
    const currentLang = store.getState().lang;
    if (langLabel) langLabel.textContent = currentLang.toUpperCase();

    if (categoryInput) {
      categoryInput.innerHTML = categories
        .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(tx(cat.title, store.getState().lang))}</option>`)
        .join('');
    }
    if (labList) {
      labList.innerHTML = labs
        .map(
          (lab) => `
            <label class="adminCheck">
              <input type="checkbox" name="labIds" value="${escapeHtml(lab.id)}" />
              <span>${escapeHtml(tx(lab.name, store.getState().lang))}</span>
            </label>
          `,
        )
        .join('');
    }

    if (idInput) {
      idInput.value = test?.id || '';
      idInput.readOnly = !!test;
    }
    if (categoryInput) categoryInput.value = test?.categoryId || categories[0]?.id || '';
    if (refStdInput) refStdInput.value = test?.refStdId || '';
    if (refClauseInput) refClauseInput.value = test?.refClause || '';
    if (noClauseInput) noClauseInput.checked = !test?.refClause;
    if (refClauseInput) refClauseInput.disabled = !!noClauseInput?.checked;
    if (labsAll) labsAll.checked = !test || !test.labs || !test.labs.length;

    const titleInput = form.elements.namedItem('title_text') as HTMLInputElement | null;
    const summaryInput = form.elements.namedItem('summary_text') as HTMLTextAreaElement | null;
    const whyInput = form.elements.namedItem('why_text') as HTMLTextAreaElement | null;
    const howInput = form.elements.namedItem('how_text') as HTMLTextAreaElement | null;
    if (titleInput) titleInput.value = test?.title?.[currentLang] || '';
    if (summaryInput) summaryInput.value = test?.summary?.[currentLang] || '';
    if (whyInput) whyInput.value = test?.why?.[currentLang] || '';
    if (howInput) howInput.value = test?.how?.[currentLang] || '';

    const languageHint = form.querySelector('.adminLanguageHint');
    if (languageHint) {
      languageHint.innerHTML = remoteAdminEnabled
        ? `Editing language: <strong id="adminEditorLangLabel">${escapeHtml(currentLang.toUpperCase())}</strong>. Other languages are handled by the admin API on save.`
        : `Static mode: editing <strong id="adminEditorLangLabel">${escapeHtml(currentLang.toUpperCase())}</strong> locally. Download <strong>tests.json</strong> and commit it to publish changes.`;
    }

    const selectedLabs = new Set(test?.labs || []);
    form.querySelectorAll<HTMLInputElement>('input[name="labIds"]').forEach((input) => {
      input.checked = selectedLabs.has(input.value);
      input.disabled = !!labsAll?.checked;
    });

    const toggleLabs = () => {
      const lock = !!labsAll?.checked;
      form.querySelectorAll<HTMLInputElement>('input[name="labIds"]').forEach((input) => {
        input.disabled = lock;
      });
    };
    if (labsAll) labsAll.onchange = toggleLabs;
    if (noClauseInput && refClauseInput) {
      noClauseInput.onchange = () => {
        refClauseInput.disabled = noClauseInput.checked;
        if (noClauseInput.checked) refClauseInput.value = '';
      };
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAdminEditor(): void {
    const overlay = document.getElementById('adminEditorOverlay');
    if (!overlay) return;
    adminEditingTestId = null;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function saveAdminEditor(): Promise<void> {
    if (!isMemberUnlocked() || !canUseAdminEditor) return;
    const form = document.getElementById('adminEditorForm') as HTMLFormElement | null;
    const error = document.getElementById('adminEditorError');
    const saveBtn = document.getElementById('adminEditorSaveBtn') as HTMLButtonElement | null;
    if (!form) return;

    const readValue = (name: string): string => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      return el?.value.trim() || '';
    };

    const id = readValue('id');
    const categoryId = readValue('categoryId');
    const noClause = (form.elements.namedItem('noClause') as HTMLInputElement | null)?.checked ?? false;
    const currentLang = store.getState().lang;
    if (!id || !categoryId) {
      if (error) error.textContent = 'Test ID and category are required.';
      return;
    }

    const labsAll = (form.elements.namedItem('labsAll') as HTMLInputElement | null)?.checked ?? false;
    const selectedLabs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="labIds"]:checked')).map(
      (el) => el.value,
    );
    const testPayloadBase = {
      id,
      categoryId,
      title: { [currentLang]: readValue('title_text') },
      summary: { [currentLang]: readValue('summary_text') },
      why: { [currentLang]: readValue('why_text') },
      how: { [currentLang]: readValue('how_text') },
      labs: labsAll ? null : selectedLabs,
      refStdId: readValue('refStdId') || undefined,
      refClause: noClause ? undefined : readValue('refClause') || undefined,
    };

    if (saveBtn) saveBtn.disabled = true;
    if (error) error.textContent = '';
    try {
      if (adminEditingTestId) {
        const existing = tests.find((t) => t.id === adminEditingTestId);
        const localTest: Test = {
          ...(existing || {
            id,
            categoryId,
            icon: '📄',
            title: {},
            summary: {},
            why: {},
            how: {},
            tags: [],
            labs: null,
          }),
          ...testPayloadBase,
          title: { ...(existing?.title || {}), ...testPayloadBase.title },
          summary: { ...(existing?.summary || {}), ...testPayloadBase.summary },
          why: { ...(existing?.why || {}), ...testPayloadBase.why },
          how: { ...(existing?.how || {}), ...testPayloadBase.how },
        };
        const saved = remoteAdminEnabled
          ? await updateAdminTest(adminEditingTestId, testPayloadBase, currentLang)
          : saveLocalAdminDraft(localTest);
        upsertLocalTest(saved);
      } else {
        if (tests.some((t) => t.id === id)) {
          if (error) error.textContent = 'Test ID already exists.';
          return;
        }
        const newTest: Test = { ...testPayloadBase, icon: '📄', tags: [] };
        const created = remoteAdminEnabled
          ? await createAdminTest(newTest, currentLang)
          : saveLocalAdminDraft(newTest);
        upsertLocalTest(created);
      }

      const selected = tests.find((t) => t.id === id);
      if (!selected) throw new Error('Unable to resolve saved test.');
      store.setState({
        selectedTestId: selected.id,
        selectedCategoryId: selected.categoryId,
      });
      renderCategoryView();
      renderDetail(selected.id);
      renderNavMenus(store.getState());
      updateUrlState();
      closeAdminEditor();
    } catch (err) {
      if (error) error.textContent = err instanceof Error ? err.message : 'Unable to save test.';
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function buildDonutSegments(
    entries: { key: string; count: number; color: string }[],
    total: number,
  ) {
    const cx = 70;
    const cy = 70;
    const rOuter = 60;
    const rInner = 36;
    let angle = -90;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    return entries.map((item) => {
      const sweep = (item.count / total) * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const large = sweep > 180 ? 1 : 0;
      const x1 = cx + rOuter * Math.cos(toRad(start));
      const y1 = cy + rOuter * Math.sin(toRad(start));
      const x2 = cx + rOuter * Math.cos(toRad(end));
      const y2 = cy + rOuter * Math.sin(toRad(end));
      const x3 = cx + rInner * Math.cos(toRad(end));
      const y3 = cy + rInner * Math.sin(toRad(end));
      const x4 = cx + rInner * Math.cos(toRad(start));
      const y4 = cy + rInner * Math.sin(toRad(start));
      const d = [
        `M ${x1} ${y1}`,
        `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ');
      return { ...item, d };
    });
  }

  function createOverviewCharts(state: AppState): HTMLElement {
    const catCounts = categories
      .map((cat) => ({
        key: tx(cat.title, state.lang),
        count: (testsByCategory.get(cat.id) || []).length,
        color: getCategoryColor(cat.id),
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
    const totalCat = Math.max(1, catCounts.reduce((sum, c) => sum + c.count, 0));
    const catSegments = buildDonutSegments(catCounts, totalCat);

    const stdMap = new Map<string, number>();
    tests.forEach((t) => {
      const key = getStandardLabel(t);
      stdMap.set(key, (stdMap.get(key) || 0) + 1);
    });
    const stdCounts = Array.from(stdMap.entries())
      .map(([key, count]) => ({ key, count, color: getStandardColor(key) }))
      .sort((a, b) => b.count - a.count);
    const totalStd = Math.max(1, stdCounts.reduce((sum, c) => sum + c.count, 0));
    const stdSegments = buildDonutSegments(stdCounts, totalStd);

    const labCounts = labs.map((l) => {
      const count = tests.filter((t) => {
        const labList = t.labs && t.labs.length ? t.labs : labs.map((lx) => lx.id);
        return labList.includes(l.id);
      }).length;
      return { key: tx(l.name, state.lang), count, color: l.color || '#3dcd58' };
    });
    const totalLab = Math.max(1, labCounts.reduce((sum, l) => sum + l.count, 0));
    const labSegments = buildDonutSegments(labCounts, totalLab);

    const wrap = document.createElement('div');
    wrap.className = 'overviewCharts';
    wrap.innerHTML = `
      <div class="labChart">
        <div class="labChartHeader">
          <div class="labChartTitle">${escapeHtml(ui.testsOverviewCategoryTitle)}</div>
          <div class="overviewValueToggle" role="group" aria-label="${escapeHtml(
            ui.testsOverviewCategoryTitle,
          )}">
            <button type="button" class="overviewToggleBtn is-active overviewToggleBtn--numbers" data-mode="numbers"><span aria-hidden="true"></span><span class="srOnly">${escapeHtml(
              ui.overviewValueNumbers,
            )}</span></button>
            <button type="button" class="overviewToggleBtn" data-mode="percent">${escapeHtml(
              ui.overviewValuePercent,
            )}</button>
          </div>
        </div>
        <div class="labChartDonutWrap">
          <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
            ui.testsOverviewCategoryTitle,
          )}">
            ${catSegments
              .map(
                (c) => `
                <path class="labDonutSegment overviewDonutSegment overviewDonutSegment--cat" data-key="${escapeHtml(
                  c.key,
                )}" d="${c.d}" style="--seg-color:${c.color}" title="${escapeHtml(
                  `${c.key}: ${c.count}`,
                )}"></path>
              `,
              )
              .join('')}
          </svg>
          <div class="labChartLegend">
            ${catCounts
              .map(
                (c) => `
                <div class="labChartLegendItem overviewLegendItem overviewLegendItem--cat" data-key="${escapeHtml(
                  c.key,
                )}">
                  <span class="labChartLegendSwatch" style="--swatch:${c.color}"></span>
                  <span class="labChartLegendLabel">${escapeHtml(c.key)}</span>
                  <span class="labChartLegendValue" data-count="${c.count}" data-total="${totalCat}">${c.count}</span>
                </div>
              `,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="labChart">
        <div class="labChartHeader">
          <div class="labChartTitle">${escapeHtml(ui.testsOverviewStandardTitle)}</div>
          <div class="overviewValueToggle" role="group" aria-label="${escapeHtml(
            ui.testsOverviewStandardTitle,
          )}">
            <button type="button" class="overviewToggleBtn is-active overviewToggleBtn--numbers" data-mode="numbers"><span aria-hidden="true"></span><span class="srOnly">${escapeHtml(
              ui.overviewValueNumbers,
            )}</span></button>
            <button type="button" class="overviewToggleBtn" data-mode="percent">${escapeHtml(
              ui.overviewValuePercent,
            )}</button>
          </div>
        </div>
        <div class="labChartDonutWrap">
          <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
            ui.testsOverviewStandardTitle,
          )}">
            ${stdSegments
              .map(
                (s) => `
                <path class="labDonutSegment overviewDonutSegment overviewDonutSegment--std" data-key="${escapeHtml(
                  s.key,
                )}" d="${s.d}" style="--seg-color:${s.color}" title="${escapeHtml(
                  `${s.key}: ${s.count}`,
                )}"></path>
              `,
              )
              .join('')}
          </svg>
          <div class="labChartLegend">
            ${stdCounts
              .map(
                (s) => `
                <div class="labChartLegendItem overviewLegendItem overviewLegendItem--std" data-key="${escapeHtml(
                  s.key,
                )}">
                  <span class="labChartLegendSwatch" style="--swatch:${s.color}"></span>
                  <span class="labChartLegendLabel">${escapeHtml(s.key)}</span>
                  <span class="labChartLegendValue" data-count="${s.count}" data-total="${totalStd}">${s.count}</span>
                </div>
              `,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="labChart">
        <div class="labChartHeader">
          <div class="labChartTitle">${escapeHtml(ui.labChartLabTitle)}</div>
          <div class="overviewValueToggle" role="group" aria-label="${escapeHtml(ui.labChartLabTitle)}">
            <button type="button" class="overviewToggleBtn is-active overviewToggleBtn--numbers" data-mode="numbers"><span aria-hidden="true"></span><span class="srOnly">${escapeHtml(
              ui.overviewValueNumbers,
            )}</span></button>
            <button type="button" class="overviewToggleBtn" data-mode="percent">${escapeHtml(
              ui.overviewValuePercent,
            )}</button>
          </div>
        </div>
        <div class="labChartDonutWrap">
          <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
            ui.labChartLabTitle,
          )}">
            ${labSegments
              .map(
                (l) => `
                <path class="labDonutSegment overviewDonutSegment overviewDonutSegment--lab" data-key="${escapeHtml(
                  l.key,
                )}" d="${l.d}" style="--seg-color:${l.color}" title="${escapeHtml(
                  `${l.key}: ${l.count}`,
                )}"></path>
              `,
              )
              .join('')}
          </svg>
          <div class="labChartLegend">
            ${labCounts
              .map(
                (l) => `
                <div class="labChartLegendItem overviewLegendItem overviewLegendItem--lab" data-key="${escapeHtml(
                  l.key,
                )}">
                  <span class="labChartLegendSwatch" style="--swatch:${l.color}"></span>
                  <span class="labChartLegendLabel">${escapeHtml(l.key)}</span>
                  <span class="labChartLegendValue" data-count="${l.count}" data-total="${totalLab}">${l.count}</span>
                </div>
              `,
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
    const toggles = Array.from(wrap.querySelectorAll<HTMLElement>('.overviewValueToggle'));
    toggles.forEach((toggle) => {
      const buttons = Array.from(toggle.querySelectorAll<HTMLButtonElement>('.overviewToggleBtn'));
      const chart = toggle.closest('.labChart');
      if (!chart) return;
      const values = Array.from(chart.querySelectorAll<HTMLElement>('.labChartLegendValue'));
      const updateValues = (mode: 'numbers' | 'percent') => {
        values.forEach((el) => {
          const count = Number(el.dataset.count || 0);
          const total = Number(el.dataset.total || 1);
          if (mode === 'percent') {
            const pct = total ? Math.round((count / total) * 100) : 0;
            el.textContent = `${pct}%`;
          } else {
            el.textContent = String(count);
          }
        });
      };
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode === 'percent' ? 'percent' : 'numbers';
          buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
          updateValues(mode);
        });
      });
    });

    const hookHoverSync = (kind: 'cat' | 'std' | 'lab') => {
      const segments = Array.from(
        wrap.querySelectorAll<SVGPathElement>(`.overviewDonutSegment--${kind}`),
      );
      const items = Array.from(
        wrap.querySelectorAll<HTMLElement>(`.overviewLegendItem--${kind}`),
      );
      const segByKey = new Map<string, SVGPathElement>();
      const itemByKey = new Map<string, HTMLElement>();
      segments.forEach((seg) => {
        const key = seg.dataset.key;
        if (key) segByKey.set(key, seg);
      });
      items.forEach((item) => {
        const key = item.dataset.key;
        if (key) itemByKey.set(key, item);
      });
      const setActive = (key: string, on: boolean) => {
        const seg = segByKey.get(key);
        const item = itemByKey.get(key);
        if (seg) seg.classList.toggle('is-active', on);
        if (item) item.classList.toggle('is-active', on);
      };
      segments.forEach((seg) => {
        const key = seg.dataset.key;
        if (!key) return;
        seg.addEventListener('mouseenter', () => setActive(key, true));
        seg.addEventListener('mouseleave', () => setActive(key, false));
        seg.addEventListener('focus', () => setActive(key, true));
        seg.addEventListener('blur', () => setActive(key, false));
      });
      items.forEach((item) => {
        const key = item.dataset.key;
        if (!key) return;
        item.addEventListener('mouseenter', () => setActive(key, true));
        item.addEventListener('mouseleave', () => setActive(key, false));
        item.addEventListener('focus', () => setActive(key, true));
        item.addEventListener('blur', () => setActive(key, false));
      });
    };

    hookHoverSync('cat');
    hookHoverSync('std');
    hookHoverSync('lab');
    return wrap;
  }

  function renderCategoryView(): void {
    setTestsBrowsePanels(testsBrowseMode);
    const inactiveHost = document.getElementById(
      testsBrowseMode === 'standard' ? 'viewTestsCategory' : 'viewTestsStandard',
    );
    if (inactiveHost) inactiveHost.innerHTML = '';
    const host = document.getElementById(
      testsBrowseMode === 'standard' ? 'viewTestsStandard' : 'viewTestsCategory',
    );
    if (!host) return;
    host.innerHTML = '';
    const state = store.getState();
    const q = state.searchQuery.trim();
    const pager = document.getElementById('testsPager');
    const btnBack = document.getElementById('btnBackCats');
    const currentCategory = document.getElementById('currentCategory');

    if (testsBrowseMode === 'standard') {
      if (!selectedStandardKey) {
        host.dataset.mode = 'categories';
        if (pager) pager.style.display = 'none';
        if (btnBack) btnBack.style.display = 'none';
        if (currentCategory) currentCategory.textContent = ui.testsBrowseStandard;

        const stdMap = new Map<string, Test[]>();
        tests.forEach((t) => {
          const key = getStandardLabel(t);
          const arr = stdMap.get(key) || [];
          arr.push(t);
          stdMap.set(key, arr);
        });
        const stdList = Array.from(stdMap.entries()).map(([key, items]) => ({
          key,
          count: items.length,
          tests: items,
        }));
        const visibleStd = stdList.filter(
          (s) =>
            s.key.toLowerCase().includes(q.toLowerCase()) ||
            s.tests.some((t) => testMatchesQuery(t, q, state.lang)),
        );

        visibleStd.forEach((std, idx) => {
          const card = createCategoryCard(
            idx,
            getStandardColor(std.key),
            std.key,
            `${std.count} ${std.count === 1 ? 'test' : 'tests'}`,
          );
          const activate = () => {
            selectedStandardKey = std.key;
            store.setState({ testPage: 0 });
            renderCategoryView();
            updateUrlState();
          };
          card.addEventListener('click', activate);
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          });
          host.appendChild(card);
        });
        const hitCount = document.getElementById('hitCount');
        if (hitCount) hitCount.textContent = String(visibleStd.length);
        if (visibleStd.length === 0) {
          host.appendChild(createEmptyStateCard());
        }
        return;
      }

      host.dataset.mode = 'tests';
      if (btnBack) btnBack.style.display = 'inline-flex';
      if (pager) pager.style.display = 'inline-flex';
      if (currentCategory) currentCategory.textContent = selectedStandardKey;
      if (btnBack) btnBack.textContent = ui.backCategories;

      const testsInStd = tests.filter((t) => getStandardLabel(t) === selectedStandardKey);
      const filtered = testsInStd.filter((t) => testMatchesQuery(t, q, state.lang));
      const totalPages = Math.max(1, Math.ceil(filtered.length / TESTS_PER_PAGE));
      const testPage = Math.min(state.testPage, totalPages - 1);
      if (testPage !== state.testPage) store.setState({ testPage });
      const pageInfo = document.getElementById('testPageInfo');
      if (pageInfo) pageInfo.textContent = `${testPage + 1}/${totalPages}`;
      const btnPrev = document.getElementById('btnPrevPage') as HTMLButtonElement | null;
      const btnNext = document.getElementById('btnNextPage') as HTMLButtonElement | null;
      if (btnPrev) btnPrev.disabled = testPage <= 0;
      if (btnNext) btnNext.disabled = testPage >= totalPages - 1;

      const pageTests = filtered.slice(testPage * TESTS_PER_PAGE, (testPage + 1) * TESTS_PER_PAGE);
      pageTests.forEach((test) => {
        const card = createTestCard(test, state.lang, state.selectedTestId);
        const activate = () => selectTest(test.id, { focusDetail: false });
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });
        host.appendChild(card);
      });

      const hitCount = document.getElementById('hitCount');
      if (hitCount) hitCount.textContent = String(filtered.length);
      if (filtered.length === 0) {
        host.appendChild(createEmptyStateCard());
      }
      return;
    }

    if (!state.selectedCategoryId) {
      host.dataset.mode = 'categories';
      if (pager) pager.style.display = 'none';
      if (btnBack) btnBack.style.display = 'none';
      if (currentCategory) currentCategory.textContent = ui.categoriesLabel;

      const visibleCats = categories.filter(
        (cat) => categoryMatchesQuery(cat, q, state.lang) ||
          (testsByCategory.get(cat.id) || []).some((t) => testMatchesQuery(t, q, state.lang)),
      );

      visibleCats.forEach((cat, idx) => {
        const card = createCategoryCard(
          idx,
          getCategoryColor(cat.id),
          tx(cat.title, state.lang),
          tx(cat.subtitle, state.lang),
        );
        const activate = () => {
          store.setState({ selectedCategoryId: cat.id, testPage: 0 });
          renderCategoryView();
          updateUrlState();
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });
        host.appendChild(card);
      });

      const hitCount = document.getElementById('hitCount');
      if (hitCount) hitCount.textContent = String(visibleCats.length);
      if (visibleCats.length === 0) {
        host.appendChild(createEmptyStateCard());
      }
      return;
    }

    if (!categoryById.has(state.selectedCategoryId)) {
      store.setState({ selectedCategoryId: null });
      renderCategoryView();
      updateUrlState();
      return;
    }

    host.dataset.mode = 'tests';
    const cat = categoryById.get(state.selectedCategoryId)!;
    if (btnBack) btnBack.style.display = 'inline-flex';
    if (pager) pager.style.display = 'inline-flex';
    if (currentCategory) currentCategory.textContent = tx(cat.title, state.lang);
    if (btnBack) btnBack.textContent = ui.backCategories;

    const testsInCat = (testsByCategory.get(cat.id) || []).filter((t) =>
      testMatchesQuery(t, q, state.lang),
    );

    const totalPages = Math.max(1, Math.ceil(testsInCat.length / TESTS_PER_PAGE));
    const testPage = Math.min(state.testPage, totalPages - 1);
    if (testPage !== state.testPage) store.setState({ testPage });

    const pageInfo = document.getElementById('testPageInfo');
    if (pageInfo) pageInfo.textContent = `${testPage + 1}/${totalPages}`;
    const btnPrev = document.getElementById('btnPrevPage') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btnNextPage') as HTMLButtonElement | null;
    if (btnPrev) btnPrev.disabled = testPage <= 0;
    if (btnNext) btnNext.disabled = testPage >= totalPages - 1;

    const pageTests = testsInCat.slice(testPage * TESTS_PER_PAGE, (testPage + 1) * TESTS_PER_PAGE);
    pageTests.forEach((test) => {
      const card = createTestCard(test, state.lang, state.selectedTestId);
      const activate = () => selectTest(test.id, { focusDetail: false });
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
      host.appendChild(card);
    });

    const hitCount = document.getElementById('hitCount');
    if (hitCount) hitCount.textContent = String(testsInCat.length);
    if (testsInCat.length === 0) {
      host.appendChild(createEmptyStateCard());
    }
  }

  function renderEmptyDetail(): void {
    store.setState({ selectedLabId: null, selectedTestId: null, selectedCategoryId: null });
    const host = document.getElementById('detailBody');
    if (!host) return;
    labViewMode = 'about';
    lastLabTestsId = null;
    triggerDetailFade(host);
    const overviewIntro = escapeHtml(ui.overviewIntro).replace(/\n\s*\n/g, '<br><br>');
    host.innerHTML = `
      <div class="hero">
        <div class="heroTitle">${escapeHtml(ui.overviewTitle)}</div>
        <div class="heroSub">${escapeHtml(ui.overviewSub)}</div>
        <div class="hint overviewIntro">${overviewIntro}</div>
      </div>
    `;
    host.appendChild(createOverviewCharts(store.getState()));
    placeMap(null);
    renderLabsStrip();
    mapController.fitToAllLabs();
  }

  function renderDetail(testId: string): void {
    const state = store.getState();
    const test = tests.find((t) => t.id === testId);
    if (!test) return renderEmptyDetail();
    const cat = categoryById.get(test.categoryId);
    const host = document.getElementById('detailBody');
    if (!host || !cat) return;
    labViewMode = 'about';
    triggerDetailFade(host);
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) backBtn.hidden = !lastLabTestsId;
    const labsForTest = test.labs && test.labs.length ? test.labs : labs.map((l) => l.id);

    host.innerHTML = `
      <div class="hero" data-test-id="${escapeHtml(test.id)}">
        <div class="heroTop">
          <div>
            <div class="heroTitle">${escapeHtml(tx(test.title, state.lang))}</div>
            <div class="heroSub">${escapeHtml(tx(test.summary, state.lang))}</div>
            <div class="hint">• ${escapeHtml(tx(cat.title, state.lang))}</div>
          </div>
          <div class="heroActions">
            ${
              isMemberUnlocked() && canUseAdminEditor
                ? `<button class="btn ghost" id="btnEditTestContent" type="button">Edit test</button>`
                : ''
            }
            <button class="btn" id="btnExportPdf" type="button">${escapeHtml(ui.exportPdf)}</button>
          </div>
        </div>
      </div>
      <div class="grid2">
        <div class="infoCard" data-kind="WHY">
          <div class="infoHead">
            <div class="infoLeft">
              <div class="infoSwatch" aria-hidden="true">WHY</div>
              <div style="min-width:0">
                <div class="infoTitle">${escapeHtml(ui.whyTitle)}</div>
                <div class="infoSub">${escapeHtml(ui.whySub)}</div>
              </div>
            </div>
          </div>
          <div class="infoBody">${escapeHtml(tx(test.why, state.lang))}</div>
        </div>
        <div class="infoCard" data-kind="HOW">
          <div class="infoHead">
            <div class="infoLeft">
              <div class="infoSwatch" aria-hidden="true">HOW</div>
              <div style="min-width:0">
                <div class="infoTitle">${escapeHtml(ui.howTitle)}</div>
                <div class="infoSub">${escapeHtml(ui.howSub)}</div>
              </div>
            </div>
          </div>
          <div class="infoBody">${escapeHtml(tx(test.how, state.lang))}</div>
        </div>
      </div>
      <div class="where">
        <div class="whereTitle">
          <span>${escapeHtml(ui.whereTitle)}</span>
        </div>
        <div class="whereSub">${escapeHtml(ui.whereSub)}</div>
        <div class="whereGrid">
          ${labsForTest
            .map((id) => {
              const lab = labs.find((l) => l.id === id);
              if (!lab) return '';
              return `
                <div class="whereLab active" data-lab="${escapeHtml(id)}">
                  <div class="whereDot" aria-hidden="true"></div>
                  <div>
                    <div class="whereLabName">${escapeHtml(tx(lab.name, state.lang))}</div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    placeMap(null);
    renderLabsStrip();
    mapController.fitToLabs(labsForTest);

    host.querySelector('#btnExportPdf')?.addEventListener('click', () => {
      void runExportTestPdf(test.id, state.lang);
    });
    host.querySelector('#btnEditTestContent')?.addEventListener('click', () => {
      openAdminEditor(test.id);
    });
  }

  function formatLabText(raw: string): string {
    const safe = escapeHtml(raw).replaceAll(/\n+/g, ' ').trim();
    if (!safe) return '';
    const keywords = [
      'PanelSet PLM',
      'PanelSet PLA',
      'PanelSet PLS',
      'Schneider Electric',
      'HIMEL',
      'Sarel',
      'microgrid',
      'decarbonization',
      'LED',
      'CO₂',
      'zero CO₂',
    ];
    const sentences = safe
      .split(/\.\s+/)
      .filter(Boolean)
      .map((s) => s.replace(/\.$/, ''));
    const out: string[] = [];
    sentences.forEach((s, i) => {
      let line = s;
      keywords.forEach((k) => {
        const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        line = line.replace(re, `<strong>${k}</strong>`);
      });
      out.push(line + '.');
      if (i % 2 === 1) out.push('<br>');
    });
    return out.join('<br>');
  }

  function renderLabDetail(labId: string): void {
    const state = store.getState();
    const lab = labs.find((l) => l.id === labId);
    if (!lab) return renderEmptyDetail();
    const host = document.getElementById('detailBody');
    if (!host) return;
    labViewMode = 'about';
    triggerDetailFade(host);
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) backBtn.hidden = true;
    const imgSrc = lab.img && lab.img.trim() ? lab.img : SAMPLE_IMG;
    host.innerHTML = `
      <div class="hero">
        <div class="heroTitle">${escapeHtml(tx(lab.name, state.lang))}</div>
      </div>
      <div class="labDetailMedia">
        <div class="labDetailImage">
          <img
            src="${escapeHtml(imgSrc)}"
            alt="Lab image"
            class="labPhoto labPhotoDetail"
            data-lab-id="${escapeHtml(lab.id)}"
            id="labPhotoDetail-${escapeHtml(lab.id)}"
          />
        </div>
        <div class="labDetailMap" id="labDetailMap"></div>
      </div>
      <div class="grid2">
        <div class="infoCard" data-kind="WHY">
          <div class="infoHead">
            <div class="infoLeft">
              <div class="infoSwatch" aria-hidden="true">INFO</div>
              <div style="min-width:0">
                <div class="infoTitle">${escapeHtml(ui.labOverviewTitle)}</div>
                <div class="infoSub">${escapeHtml(ui.labOverviewSub)}</div>
              </div>
            </div>
          </div>
          <div class="infoBody">${formatLabText(tx(lab.overview || lab.desc, state.lang))}</div>
        </div>
        <div class="infoCard" data-kind="HOW">
          <div class="infoHead">
            <div class="infoLeft">
              <div class="infoSwatch" aria-hidden="true">LOC</div>
              <div style="min-width:0">
                <div class="infoTitle">${escapeHtml(ui.labLocationTitle)}</div>
                <div class="infoSub">${escapeHtml(ui.labLocationSub)}</div>
              </div>
            </div>
          </div>
          <div class="infoBody">${formatLabText(tx(lab.location || '', state.lang))}<br><br>${escapeHtml(
            tx(lab.address, state.lang),
          )}</div>
        </div>
      </div>
    `;

    placeMap(host.querySelector('#labDetailMap') as HTMLElement | null);
    renderLabsStrip();
    mapController.fitToLabs([labId]);
  }

  function renderLabTests(labId: string): void {
    const state = store.getState();
    const lab = labs.find((l) => l.id === labId);
    if (!lab) return renderEmptyDetail();
    const host = document.getElementById('detailBody');
    if (!host) return;
    labViewMode = 'tests';
    lastLabTestsId = labId;
    triggerDetailFade(host);
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) backBtn.hidden = true;

    const labTests = tests.filter((t) => {
      const labList = t.labs && t.labs.length ? t.labs : labs.map((l) => l.id);
      return labList.includes(labId);
    });

    const byCat = new Map<string, Test[]>();
    labTests.forEach((t) => {
      const arr = byCat.get(t.categoryId) || [];
      arr.push(t);
      byCat.set(t.categoryId, arr);
    });

    const labSummaries: Record<string, Partial<Record<Lang, string>>> = {
      sarre: {
        en: 'At the Sarre-Union / Sarel Laboratory, a total of 21 test procedures are performed. All seven overarching test categories are covered within the current test scope, demonstrating the laboratory’s broad technical capability and operational versatility across multiple evaluation domains. Within this distribution, Mechanical Robustness represents the predominant test category, accounting for 6 test procedures, and therefore constitutes the primary area of testing activity at this facility.',
        es: 'En el Laboratorio de Sarre-Union / Sarel se realizan un total de 21 procedimientos de ensayo. Las siete categorías generales de ensayo están cubiertas dentro del alcance actual, lo que demuestra la amplia capacidad técnica del laboratorio y su versatilidad operativa en múltiples ámbitos de evaluación. Dentro de esta distribución, la categoría Resistencia mecánica representa el ámbito predominante, con 6 procedimientos de ensayo, constituyendo así la principal área de actividad del centro.',
        fr: 'Au laboratoire de Sarre-Union / Sarel, un total de 21 procédures d’essai sont réalisées. Les sept grandes catégories d’essais sont couvertes dans le périmètre actuel, démontrant la large capacité technique du laboratoire ainsi que sa polyvalence opérationnelle dans différents domaines d’évaluation. Dans cette répartition, la catégorie Résistance mécanique constitue le domaine prédominant, avec 6 procédures d’essai, et représente donc l’activité principale du site.',
        ca: 'Al Laboratori de Sarre-Union / Sarel es duen a terme un total de 21 procediments d’assaig. Les set categories generals d’assaig estan cobertes dins l’abast actual, fet que demostra l’àmplia capacitat tècnica del laboratori i la seva versatilitat operativa en múltiples àmbits d’avaluació. Dins d’aquesta distribució, la categoria Resistència mecànica constitueix l’àmbit predominant, amb 6 procediments d’assaig, i representa així l’activitat principal del centre.',
      },
      capellades: {
        en: 'At the Capellades Laboratory, a total of 45 test procedures are performed, representing the highest testing volume within the Universal Enclosures laboratory network. This level of activity reflects the laboratory’s significant operational capacity and its central role in supporting product qualification and validation processes across multiple evaluation domains. Within this distribution, Mechanical Robustness constitutes the predominant test category, accounting for 22 test procedures, and therefore represents the principal area of testing activity at this facility.',
        fr: 'Au laboratoire de Capellades, un total de 45 procédures d’essai sont réalisées, représentant le volume d’essais le plus élevé au sein du réseau de laboratoires Universal Enclosures. Ce niveau d’activité reflète la capacité opérationnelle significative du laboratoire ainsi que son rôle central dans le soutien aux processus de qualification et de validation des produits à travers différents domaines d’évaluation. Dans cette répartition, la catégorie Résistance mécanique constitue le domaine d’essais prédominant, avec 22 procédures d’essai, et représente donc l’activité principale du site.',
        es: 'En el Laboratorio de Capellades se realizan un total de 45 procedimientos de ensayo, lo que representa el mayor volumen de pruebas dentro de la red de laboratorios de Universal Enclosures. Este nivel de actividad refleja la significativa capacidad operativa del laboratorio y su papel central en los procesos de cualificación y validación de productos en distintos ámbitos de evaluación. Dentro de esta distribución, la categoría Resistencia mecánica constituye el ámbito predominante, con 22 procedimientos de ensayo, representando así la principal área de actividad del centro.',
        ca: 'Al Laboratori de Capellades es duen a terme un total de 45 procediments d’assaig, fet que representa el volum d’assaigs més elevat dins la xarxa de laboratoris d’Universal Enclosures. Aquest nivell d’activitat reflecteix la capacitat operativa significativa del laboratori i el seu paper central en els processos de qualificació i validació de productes en diferents àmbits d’avaluació. Dins d’aquesta distribució, la categoria Resistència mecànica constitueix l’àmbit predominant, amb 22 procediments d’assaig, i representa així l’activitat principal del centre.',
      },
      molins: {
        en: 'At the Molins de Rei Laboratory, a total of 11 test procedures are performed. The laboratory plays an essential role within the Universal Enclosures testing network, providing operational support and maintaining close technical collaboration with both the Capellades Laboratory and the Sarre-Union / Sarel Laboratory. Through this coordinated approach, Molins de Rei contributes to workload optimization, cross-site alignment, and the overall efficiency of product qualification and validation activities across the laboratory ecosystem.',
        es: 'En el Laboratorio de Molins de Rei se realizan un total de 11 procedimientos de ensayo. El laboratorio desempeña un papel esencial dentro de la red de ensayos de Universal Enclosures, proporcionando soporte operativo y manteniendo una estrecha colaboración técnica tanto con el Laboratorio de Capellades como con el Laboratorio de Sarre-Union / Sarel. Mediante este enfoque coordinado, Molins de Rei contribuye a la optimización de cargas de trabajo, la alineación entre centros y la eficiencia global de las actividades de cualificación y validación de productos en el ecosistema de laboratorios.',
        fr: 'Au laboratoire de Molins de Rei, un total de 11 procédures d’essai sont réalisées. Le laboratoire joue un rôle essentiel au sein du réseau d’essais d’Universal Enclosures, en fournissant un support opérationnel et en maintenant une collaboration technique étroite avec le laboratoire de Capellades ainsi qu’avec le laboratoire de Sarre-Union / Sarel. Grâce à cette approche coordonnée, Molins de Rei contribue à l’optimisation de la charge de travail, à l’alignement inter-sites et à l’efficacité globale des activités de qualification et de validation des produits au sein de l’écosystème des laboratoires.',
        ca: 'Al Laboratori de Molins de Rei es duen a terme un total de 11 procediments d’assaig. El laboratori exerceix un paper essencial dins la xarxa d’assaigs d’Universal Enclosures, proporcionant suport operatiu i mantenint una estreta col·laboració tècnica tant amb el Laboratori de Capellades com amb el Laboratori de Sarre-Union / Sarel. Mitjançant aquest enfocament coordinat, Molins de Rei contribueix a l’optimització de càrregues de treball, a l’alineació entre centres i a l’eficiència global de les activitats de qualificació i validació de productes dins l’ecosistema de laboratoris.',
      },
    };

    const staticSummary = labSummaries[labId]?.[state.lang];
    let summaryText = staticSummary || '';
    if (!summaryText) {
      summaryText = ui.labTestsSummary
        .replace('{lab}', tx(lab.name, state.lang))
        .replace('{count}', String(labTests.length));
    }

    const labCounts = labs.map((l) => {
      const count = tests.filter((t) => {
        const labList = t.labs && t.labs.length ? t.labs : labs.map((lx) => lx.id);
        return labList.includes(l.id);
      }).length;
      return { id: l.id, name: tx(l.name, state.lang), count, color: l.color || '#3dcd58' };
    });
    labCounts.sort((a, b) => b.count - a.count);

    const labCatCounts = Array.from(byCat.entries())
      .map(([catId, items]) => ({
        id: catId,
        name: tx(categoryById.get(catId)?.title || { en: catId }, state.lang),
        count: items.length,
      }))
      .sort((a, b) => b.count - a.count);

    const getStandardLabel = (t: Test): string => {
      if (t.refStdId === 'IEC_62208') return 'IEC 62208';
      if (t.refStdId === 'IEC_61439_5') return 'IEC 61439-5';
      if (t.refStdId === 'IEC_61386_1') return 'IEC 61386-1';
      if (t.refStdId === 'ISO_13347_1') return 'ISO 13347-1';
      const id = t.id || '';
      if (id.startsWith('IEC62208')) return 'IEC 62208';
      if (id.startsWith('IEC61439')) return 'IEC 61439-5';
      if (id.startsWith('IEC61386')) return 'IEC 61386-1';
      if (id.startsWith('ISO13347')) return 'ISO 13347-1';
      if (id.startsWith('UL_')) return 'UL';
      return 'Internal Method';
    };

    const labStdMap = new Map<string, number>();
    const byStd = new Map<string, Test[]>();
    labTests.forEach((t) => {
      const key = getStandardLabel(t);
      labStdMap.set(key, (labStdMap.get(key) || 0) + 1);
      const arr = byStd.get(key) || [];
      arr.push(t);
      byStd.set(key, arr);
    });
    const labStdCounts = Array.from(labStdMap.entries())
      .map(([key, count]) => ({ key, count, color: getStandardColor(key) }))
      .sort((a, b) => b.count - a.count);
    const totalLab = Math.max(1, labCounts.reduce((sum, l) => sum + l.count, 0));
    const donutSegments = (() => {
      const cx = 70;
      const cy = 70;
      const rOuter = 60;
      const rInner = 36;
      let angle = -90;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const segs = labCounts.map((l) => {
        const sweep = (l.count / totalLab) * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const large = sweep > 180 ? 1 : 0;
        const x1 = cx + rOuter * Math.cos(toRad(start));
        const y1 = cy + rOuter * Math.sin(toRad(start));
        const x2 = cx + rOuter * Math.cos(toRad(end));
        const y2 = cy + rOuter * Math.sin(toRad(end));
        const x3 = cx + rInner * Math.cos(toRad(end));
        const y3 = cy + rInner * Math.sin(toRad(end));
        const x4 = cx + rInner * Math.cos(toRad(start));
        const y4 = cy + rInner * Math.sin(toRad(start));
        const d = [
          `M ${x1} ${y1}`,
          `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
          `L ${x3} ${y3}`,
          `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
          'Z',
        ].join(' ');
        return { ...l, d };
      });
      return segs;
    })();

    const totalCat = Math.max(1, labCatCounts.reduce((sum, c) => sum + c.count, 0));
    const categoryDonutSegments = (() => {
      const cx = 70;
      const cy = 70;
      const rOuter = 60;
      const rInner = 36;
      let angle = -90;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      return labCatCounts.map((c) => {
        const sweep = (c.count / totalCat) * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const large = sweep > 180 ? 1 : 0;
        const x1 = cx + rOuter * Math.cos(toRad(start));
        const y1 = cy + rOuter * Math.sin(toRad(start));
        const x2 = cx + rOuter * Math.cos(toRad(end));
        const y2 = cy + rOuter * Math.sin(toRad(end));
        const x3 = cx + rInner * Math.cos(toRad(end));
        const y3 = cy + rInner * Math.sin(toRad(end));
        const x4 = cx + rInner * Math.cos(toRad(start));
        const y4 = cy + rInner * Math.sin(toRad(start));
        const d = [
          `M ${x1} ${y1}`,
          `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
          `L ${x3} ${y3}`,
          `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
          'Z',
        ].join(' ');
        return { ...c, d, color: getCategoryColor(c.id) };
      });
    })();

    const totalStd = Math.max(1, labStdCounts.reduce((sum, c) => sum + c.count, 0));
    const standardDonutSegments = (() => {
      const cx = 70;
      const cy = 70;
      const rOuter = 60;
      const rInner = 36;
      let angle = -90;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      return labStdCounts.map((s) => {
        const sweep = (s.count / totalStd) * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const large = sweep > 180 ? 1 : 0;
        const x1 = cx + rOuter * Math.cos(toRad(start));
        const y1 = cy + rOuter * Math.sin(toRad(start));
        const x2 = cx + rOuter * Math.cos(toRad(end));
        const y2 = cy + rOuter * Math.sin(toRad(end));
        const x3 = cx + rInner * Math.cos(toRad(end));
        const y3 = cy + rInner * Math.sin(toRad(end));
        const x4 = cx + rInner * Math.cos(toRad(start));
        const y4 = cy + rInner * Math.sin(toRad(start));
        const d = [
          `M ${x1} ${y1}`,
          `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
          `L ${x3} ${y3}`,
          `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
          'Z',
        ].join(' ');
        return { ...s, d };
      });
    })();

    const sections = Array.from(byCat.entries()).map(([catId, items]) => {
      const cat = categoryById.get(catId);
      return `
        <div class="labTestsSection">
          <div class="labTestsHeader">
            <span>${escapeHtml(tx(cat?.title || { en: catId }, state.lang))}</span>
            <span class="labTestsCount">${items.length}</span>
          </div>
          <div class="labTestsGrid">
            ${items
              .map(
                (t) => `
                  <button class="labTestItem" type="button" data-testid="${escapeHtml(t.id)}">
                    <div class="labTestTitle">${escapeHtml(tx(t.title, state.lang))}</div>
                    <div class="labTestSub">${escapeHtml(tx(t.summary, state.lang))}</div>
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
      `;
    });

    const standardSections = Array.from(byStd.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => b.items.length - a.items.length)
      .map(({ key, items }) => {
        return `
        <div class="labTestsSection">
          <div class="labTestsHeader">
            <span>${escapeHtml(key)}</span>
            <span class="labTestsCount">${items.length}</span>
          </div>
          <div class="labTestsGrid">
            ${items
              .map(
                (t) => `
                  <button class="labTestItem" type="button" data-testid="${escapeHtml(t.id)}">
                    <div class="labTestTitle">${escapeHtml(tx(t.title, state.lang))}</div>
                    <div class="labTestSub">${escapeHtml(tx(t.summary, state.lang))}</div>
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
      `;
      });
    const chartTabCategoryId = `labChartTabCategory-${lab.id}`;
    const chartTabStandardId = `labChartTabStandard-${lab.id}`;
    const chartPaneCategoryId = `labChartPaneCategory-${lab.id}`;
    const chartPaneStandardId = `labChartPaneStandard-${lab.id}`;
    const listPaneCategoryId = `labTestsListPaneCategory-${lab.id}`;
    const listPaneStandardId = `labTestsListPaneStandard-${lab.id}`;

    host.innerHTML = `
      <div class="hero">
        <div class="heroTitle">${escapeHtml(tx(lab.name, state.lang))}</div>
        <div class="heroSub">${escapeHtml(ui.labTestsTitle)}</div>
        <div class="labTestsSummary">${escapeHtml(summaryText)}</div>
      </div>
      <div class="labCharts">
        <div class="labChart">
          <div class="labChartHeader">
            <div class="labChartTitle" id="labChartCategoryTitle">${escapeHtml(ui.labChartCategoryTitle)}</div>
            <div class="labChartTabs" role="tablist" aria-label="${escapeHtml(ui.labChartCategoryTitle)}">
              <button
                class="labChartTab is-active"
                type="button"
                data-mode="category"
                id="${chartTabCategoryId}"
                role="tab"
                aria-selected="true"
                aria-controls="${chartPaneCategoryId}"
                tabindex="0"
              >${escapeHtml(
                ui.labChartTabCategory,
              )}</button>
              <button
                class="labChartTab"
                type="button"
                data-mode="standard"
                id="${chartTabStandardId}"
                role="tab"
                aria-selected="false"
                aria-controls="${chartPaneStandardId}"
                tabindex="-1"
              >${escapeHtml(
                ui.labChartTabStandard,
              )}</button>
            </div>
          </div>
          <div
            class="labChartPane is-active"
            data-mode="category"
            id="${chartPaneCategoryId}"
            role="tabpanel"
            aria-labelledby="${chartTabCategoryId}"
          >
            <div class="labChartDonutWrap labChartDonutWrap--categories">
              <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
                ui.labChartCategoryTitle,
              )}">
                ${categoryDonutSegments
                  .map(
                    (c) => `
                    <path class="labDonutSegment labDonutSegment--cat" data-cat="${escapeHtml(
                      c.id,
                    )}" d="${c.d}" style="--seg-color:${c.color}" title="${escapeHtml(
                      `${c.name}: ${c.count}`,
                    )}"></path>
                  `,
                  )
                  .join('')}
              </svg>
              <div class="labChartLegend">
                ${labCatCounts
                  .map(
                    (c) => `
                      <div class="labChartLegendItem labChartLegendItem--cat" data-cat="${escapeHtml(
                        c.id,
                      )}" title="${escapeHtml(`${c.name}: ${c.count}`)}" tabindex="0">
                        <span class="labChartLegendSwatch" style="--swatch:${getCategoryColor(c.id)}"></span>
                        <span class="labChartLegendLabel">${escapeHtml(c.name)}</span>
                        <span class="labChartLegendValue">${c.count}</span>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
          <div
            class="labChartPane"
            data-mode="standard"
            id="${chartPaneStandardId}"
            role="tabpanel"
            aria-labelledby="${chartTabStandardId}"
            hidden
          >
            <div class="labChartDonutWrap labChartDonutWrap--standards">
              <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
                ui.labChartStandardTitle,
              )}">
                ${standardDonutSegments
                  .map(
                    (s) => `
                    <path class="labDonutSegment labDonutSegment--std" data-std="${escapeHtml(
                      s.key,
                    )}" d="${s.d}" style="--seg-color:${s.color}" title="${escapeHtml(
                      `${s.key}: ${s.count}`,
                    )}"></path>
                  `,
                  )
                  .join('')}
              </svg>
              <div class="labChartLegend">
                ${labStdCounts
                  .map(
                    (s) => `
                      <div class="labChartLegendItem labChartLegendItem--std" data-std="${escapeHtml(
                        s.key,
                      )}" title="${escapeHtml(`${s.key}: ${s.count}`)}" tabindex="0">
                        <span class="labChartLegendSwatch" style="--swatch:${s.color}"></span>
                        <span class="labChartLegendLabel">${escapeHtml(s.key)}</span>
                        <span class="labChartLegendValue">${s.count}</span>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="labChart">
          <div class="labChartTitle">${escapeHtml(ui.labChartLabTitle)}</div>
          <div class="labChartDonutWrap">
            <svg class="labChartDonutSvg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
              ui.labChartLabTitle,
            )}">
              ${donutSegments
                .map(
                  (l) => `
                  <path class="labDonutSegment labDonutSegment--lab" data-lab="${escapeHtml(
                    l.id,
                  )}" d="${l.d}" style="--seg-color:${l.color}" title="${escapeHtml(
                    `${l.name}: ${l.count}`,
                  )}"></path>
                `,
                )
                .join('')}
            </svg>
            <div class="labChartLegend">
              ${labCounts
                .map(
                  (l) => `
                    <div class="labChartLegendItem labChartLegendItem--lab" data-lab="${escapeHtml(
                      l.id,
                    )}" title="${escapeHtml(`${l.name}: ${l.count}`)}" tabindex="0">
                      <span class="labChartLegendSwatch" style="--swatch:${l.color}"></span>
                      <span class="labChartLegendLabel">${escapeHtml(l.name)}</span>
                      <span class="labChartLegendValue">${l.count}</span>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="labTestsList">
        <div
          class="labTestsListPane is-active"
          data-mode="category"
          id="${listPaneCategoryId}"
          role="tabpanel"
          aria-labelledby="${chartTabCategoryId}"
        >
          ${sections.join('')}
        </div>
        <div
          class="labTestsListPane"
          data-mode="standard"
          id="${listPaneStandardId}"
          role="tabpanel"
          aria-labelledby="${chartTabStandardId}"
          hidden
        >
          ${standardSections.join('')}
        </div>
      </div>
    `;

    const catSegments = Array.from(host.querySelectorAll<SVGPathElement>('.labDonutSegment--cat'));
    const catLegendItems = Array.from(host.querySelectorAll<HTMLElement>('.labChartLegendItem--cat'));
    const legendByCat = new Map<string, HTMLElement>();
    const segmentByCat = new Map<string, SVGPathElement>();
    catLegendItems.forEach((el) => {
      const id = el.dataset.cat;
      if (id) legendByCat.set(id, el);
    });
    catSegments.forEach((el) => {
      const id = el.dataset.cat;
      if (id) segmentByCat.set(id, el);
    });
    const setActive = (id: string, on: boolean) => {
      const legend = legendByCat.get(id);
      const seg = segmentByCat.get(id);
      if (legend) legend.classList.toggle('is-active', on);
      if (seg) seg.classList.toggle('is-active', on);
    };
    catSegments.forEach((seg) => {
      const id = seg.dataset.cat;
      if (!id) return;
      seg.addEventListener('mouseenter', () => setActive(id, true));
      seg.addEventListener('mouseleave', () => setActive(id, false));
      seg.addEventListener('focus', () => setActive(id, true));
      seg.addEventListener('blur', () => setActive(id, false));
    });
    catLegendItems.forEach((item) => {
      const id = item.dataset.cat;
      if (!id) return;
      item.addEventListener('mouseenter', () => setActive(id, true));
      item.addEventListener('mouseleave', () => setActive(id, false));
      item.addEventListener('focus', () => setActive(id, true));
      item.addEventListener('blur', () => setActive(id, false));
    });

    const stdSegments = Array.from(host.querySelectorAll<SVGPathElement>('.labDonutSegment--std'));
    const stdLegendItems = Array.from(host.querySelectorAll<HTMLElement>('.labChartLegendItem--std'));
    const legendByStd = new Map<string, HTMLElement>();
    const segmentByStd = new Map<string, SVGPathElement>();
    stdLegendItems.forEach((el) => {
      const id = el.dataset.std;
      if (id) legendByStd.set(id, el);
    });
    stdSegments.forEach((el) => {
      const id = el.dataset.std;
      if (id) segmentByStd.set(id, el);
    });
    const setStdActive = (id: string, on: boolean) => {
      const legend = legendByStd.get(id);
      const seg = segmentByStd.get(id);
      if (legend) legend.classList.toggle('is-active', on);
      if (seg) seg.classList.toggle('is-active', on);
    };
    stdSegments.forEach((seg) => {
      const id = seg.dataset.std;
      if (!id) return;
      seg.addEventListener('mouseenter', () => setStdActive(id, true));
      seg.addEventListener('mouseleave', () => setStdActive(id, false));
      seg.addEventListener('focus', () => setStdActive(id, true));
      seg.addEventListener('blur', () => setStdActive(id, false));
    });
    stdLegendItems.forEach((item) => {
      const id = item.dataset.std;
      if (!id) return;
      item.addEventListener('mouseenter', () => setStdActive(id, true));
      item.addEventListener('mouseleave', () => setStdActive(id, false));
      item.addEventListener('focus', () => setStdActive(id, true));
      item.addEventListener('blur', () => setStdActive(id, false));
    });

    const chartTabs = Array.from(host.querySelectorAll<HTMLButtonElement>('.labChartTab'));
    const chartPanes = Array.from(host.querySelectorAll<HTMLElement>('.labChartPane'));
    const chartTitle = host.querySelector<HTMLElement>('#labChartCategoryTitle');
    const listPanes = Array.from(host.querySelectorAll<HTMLElement>('.labTestsListPane'));
    const activateChartTab = (tab: HTMLButtonElement): void => {
      const mode = tab.dataset.mode;
      chartTabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.tabIndex = isActive ? 0 : -1;
      });
      chartPanes.forEach((pane) => {
        const isActive = pane.dataset.mode === mode;
        pane.classList.toggle('is-active', isActive);
        pane.hidden = !isActive;
      });
      listPanes.forEach((pane) => {
        const isActive = pane.dataset.mode === mode;
        pane.classList.toggle('is-active', isActive);
        pane.hidden = !isActive;
      });
      if (chartTitle) {
        chartTitle.textContent =
          mode === 'standard' ? ui.labChartStandardTitle : ui.labChartCategoryTitle;
      }
    };
    chartTabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => activateChartTab(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const next = chartTabs[(idx + dir + chartTabs.length) % chartTabs.length];
          next.focus();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateChartTab(tab);
        }
      });
    });

    const labSegments = Array.from(host.querySelectorAll<SVGPathElement>('.labDonutSegment--lab'));
    const labLegendItems = Array.from(host.querySelectorAll<HTMLElement>('.labChartLegendItem--lab'));
    const legendByLab = new Map<string, HTMLElement>();
    const segmentByLab = new Map<string, SVGPathElement>();
    labLegendItems.forEach((el) => {
      const id = el.dataset.lab;
      if (id) legendByLab.set(id, el);
    });
    labSegments.forEach((el) => {
      const id = el.dataset.lab;
      if (id) segmentByLab.set(id, el);
    });
    const setLabActive = (id: string, on: boolean) => {
      const legend = legendByLab.get(id);
      const seg = segmentByLab.get(id);
      if (legend) legend.classList.toggle('is-active', on);
      if (seg) seg.classList.toggle('is-active', on);
    };
    labSegments.forEach((seg) => {
      const id = seg.dataset.lab;
      if (!id) return;
      seg.addEventListener('mouseenter', () => setLabActive(id, true));
      seg.addEventListener('mouseleave', () => setLabActive(id, false));
      seg.addEventListener('focus', () => setLabActive(id, true));
      seg.addEventListener('blur', () => setLabActive(id, false));
    });
    labLegendItems.forEach((item) => {
      const id = item.dataset.lab;
      if (!id) return;
      item.addEventListener('mouseenter', () => setLabActive(id, true));
      item.addEventListener('mouseleave', () => setLabActive(id, false));
      item.addEventListener('focus', () => setLabActive(id, true));
      item.addEventListener('blur', () => setLabActive(id, false));
    });
    if (labId) setLabActive(labId, true);

    host.querySelectorAll<HTMLButtonElement>('.labTestItem').forEach((btn) => {
      const id = btn.dataset.testid;
      if (!id) return;
      btn.addEventListener('click', () => selectTest(id, { focusDetail: true }));
    });

    placeMap(null);
    renderLabsStrip();
    mapController.fitToLabs([labId]);
  }

  function renderNavMenus(state: AppState): void {
    const testsMenu = document.getElementById('navTestsMenu') as HTMLUListElement | null;
    if (testsMenu) {
      testsMenu.innerHTML = '';
      categories.forEach((cat) => {
        const wrap = document.createElement('li');
        wrap.className = 'navMenuSection';
        const heading = document.createElement('div');
        heading.className = 'navMenuTitle';
        heading.textContent = tx(cat.title, state.lang);
        wrap.appendChild(heading);
        const list = document.createElement('ul');
        list.className = 'navMenuList';
        list.setAttribute('aria-label', tx(cat.title, state.lang));
        (testsByCategory.get(cat.id) || []).forEach((test) => {
          const item = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = tx(test.title, state.lang);
          btn.addEventListener('click', () => selectTest(test.id, { focusDetail: true }));
          item.appendChild(btn);
          list.appendChild(item);
        });
        wrap.appendChild(list);
        testsMenu.appendChild(wrap);
      });
    }
    const labsMenu = document.getElementById('navLabsMenu') as HTMLUListElement | null;
    if (labsMenu) {
      labsMenu.innerHTML = '';
      labs.slice(0, 3).forEach((lab) => {
        const wrap = document.createElement('li');
        wrap.className = 'navLabItem';

        const label = document.createElement('div');
        label.className = 'navLabTitle';
        label.textContent = tx(lab.name, state.lang);
        wrap.appendChild(label);

        const sub = document.createElement('div');
        sub.className = 'navLabSub';

        const aboutBtn = document.createElement('button');
        aboutBtn.type = 'button';
        aboutBtn.textContent = ui.navLabAbout;
        aboutBtn.addEventListener('click', () => selectLab(lab.id, { focusDetail: true }));

        const testsBtn = document.createElement('button');
        testsBtn.type = 'button';
        testsBtn.textContent = ui.navLabTests;
        testsBtn.addEventListener('click', () => selectLabTests(lab.id, { focusDetail: true }));

        sub.appendChild(aboutBtn);
        sub.appendChild(testsBtn);
        wrap.appendChild(sub);
        labsMenu.appendChild(wrap);
      });
    }
  }

  function selectTest(id: string, opts: { focusDetail?: boolean } = {}): void {
    const prevLabId = store.getState().selectedLabId;
    const cameFromLabTests = labViewMode === 'tests' && !!prevLabId;
    lastLabTestsId = cameFromLabTests ? prevLabId : null;
    store.setState({ selectedTestId: id, selectedLabId: null });
    labViewMode = 'about';
    const found = tests.find((t) => t.id === id);
    if (found) store.setState({ selectedCategoryId: found.categoryId });
    renderDetail(id);
    updateUrlState();
    if (opts.focusDetail) {
      const target =
        document.querySelector('.pageIntro') ||
        document.querySelector('.app') ||
        document.getElementById('detailBody');
      if (target instanceof HTMLElement) {
        const header = document.getElementById('topHeader');
        const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const y = window.scrollY + target.getBoundingClientRect().top - headerH - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  }

  function selectLab(id: string, opts: { focusDetail?: boolean } = {}): void {
    store.setState({ selectedLabId: id, selectedTestId: null });
    labViewMode = 'about';
    lastLabTestsId = null;
    renderLabDetail(id);
    updateUrlState();
    if (opts.focusDetail) {
      const target =
        document.querySelector('.pageIntro') ||
        document.querySelector('.app') ||
        document.getElementById('detailBody');
      if (target instanceof HTMLElement) {
        const header = document.getElementById('topHeader');
        const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const y = window.scrollY + target.getBoundingClientRect().top - headerH - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  }

  function selectLabTests(id: string, opts: { focusDetail?: boolean } = {}): void {
    store.setState({ selectedLabId: id, selectedTestId: null });
    labViewMode = 'tests';
    lastLabTestsId = id;
    renderLabTests(id);
    updateUrlState();
    if (opts.focusDetail) {
      const target =
        document.querySelector('.pageIntro') ||
        document.querySelector('.app') ||
        document.getElementById('detailBody');
      if (target instanceof HTMLElement) {
        const header = document.getElementById('topHeader');
        const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const y = window.scrollY + target.getBoundingClientRect().top - headerH - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  }

  function selectOverview(opts: { focusDetail?: boolean } = {}): void {
    store.setState({ selectedLabId: null, selectedTestId: null, selectedCategoryId: null });
    labViewMode = 'about';
    lastLabTestsId = null;
    renderEmptyDetail();
    updateUrlState();
    if (opts.focusDetail) {
      const target =
        document.querySelector('.pageIntro') ||
        document.querySelector('.app') ||
        document.getElementById('detailBody');
      if (target instanceof HTMLElement) {
        const header = document.getElementById('topHeader');
        const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const y = window.scrollY + target.getBoundingClientRect().top - headerH - 12;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  }

  function setMapExpanded(on: boolean): void {
    document.body.classList.toggle('mapExpanded', on);
    const closeBtn = document.getElementById('mapClose');
    if (closeBtn) {
      closeBtn.textContent = ui.closeMap;
      closeBtn.onclick = () => setMapExpanded(false);
    }
    const scrim = document.getElementById('mapScrim');
    if (scrim) scrim.onclick = () => setMapExpanded(false);
    mapController.invalidateSize();
  }

  function initHandlers(): void {
    const searchEl = document.getElementById('search') as HTMLInputElement | null;
    const btnExportExcel = document.getElementById('btnExportExcel');
    const btnExportPdfAll = document.getElementById('btnExportPdfAll');
    const btnBackCats = document.getElementById('btnBackCats');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const testsBrowseTabs = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.testsBrowseTab'),
    );
    const navTestsBtn = document.getElementById('navTestsBtn');
    const navLabsBtn = document.getElementById('navLabsBtn');
    const navOverviewBtn = document.getElementById('navOverviewBtn');
    const navTestsItem = navTestsBtn ? navTestsBtn.closest('.navItem') : null;
    const navLabsItem = navLabsBtn ? navLabsBtn.closest('.navItem') : null;
    const navVideoProceduresBtn = document.getElementById('navVideoProceduresBtn');
    const navTemplatesBtn = document.getElementById('navTemplatesBtn');
    const navStandardsBtn = document.getElementById('navStandardsBtn');
    const navMethodsBtn = document.getElementById('navMethodsBtn');
    const navMemberBtn = document.getElementById('navMemberBtn');
    const navMemberLogoutBtn = document.getElementById('navMemberLogoutBtn');
    const memberOverlay = document.getElementById('memberModalOverlay');
    const memberPassword = document.getElementById('memberPassword') as HTMLInputElement | null;
    const memberError = document.getElementById('memberModalError');
    const memberCancel = document.getElementById('memberCancelBtn');
    const memberAccess = document.getElementById('memberAccessBtn');
    const videoOverlay = document.getElementById('videoProceduresOverlay');
    const videoAddBtn = document.getElementById('videoAddBtn');
    const videoList = document.getElementById('videoProceduresList');
    const videoCloseBtn = document.getElementById('videoProceduresCloseBtn');
    const videoFrame = document.getElementById('videoProceduresFrame') as HTMLIFrameElement | null;
    const videoPlaceholder = document.getElementById('videoProceduresPlaceholder');
    const templatesOverlay = document.getElementById('templatesOverlay');
    const templatesAddBtn = document.getElementById('templatesAddBtn');
    const templatesList = document.getElementById('templatesList');
    const templatesCloseBtn = document.getElementById('templatesCloseBtn');
    const internalMethodsOverlay = document.getElementById('internalMethodsOverlay');
    const internalMethodsAddBtn = document.getElementById('internalMethodsAddBtn');
    const internalMethodsList = document.getElementById('internalMethodsList');
    const internalMethodsCloseBtn = document.getElementById('internalMethodsCloseBtn');
    const standardsOverlay = document.getElementById('standardsOverlay');
    const standardsCloseBtn = document.getElementById('standardsCloseBtn');
    const addTestBtn = document.getElementById('btnAddTest');
    const adminEditorOverlay = document.getElementById('adminEditorOverlay');
    const adminEditorCancelBtn = document.getElementById('adminEditorCancelBtn');
    const adminEditorSaveBtn = document.getElementById('adminEditorSaveBtn');
    const adminDownloadTestsBtn = document.getElementById('adminDownloadTestsBtn');

    const setTestsBrowseTabA11y = (mode: 'category' | 'standard'): void => {
      testsBrowseTabs.forEach((btn) => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.tabIndex = isActive ? 0 : -1;
      });
      setTestsBrowsePanels(mode);
    };

    if (searchEl) searchEl.value = store.getState().searchQuery;
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        store.setState({ searchQuery: searchEl.value, testPage: 0 });
        renderCategoryView();
        updateUrlState();
      });
    }

    if (testsBrowseTabs.length) {
      testsBrowseTabs.forEach((tab) => {
        const activateTab = (tabEl: HTMLButtonElement) => {
          const mode = tabEl.dataset.mode === 'standard' ? 'standard' : 'category';
          testsBrowseMode = mode;
          selectedStandardKey = null;
          store.setState({ selectedCategoryId: null, testPage: 0 });
          setTestsBrowseTabA11y(mode);
          renderCategoryView();
          updateUrlState();
        };
        tab.addEventListener('click', () => {
          activateTab(tab);
        });
        tab.addEventListener('keydown', (e) => {
          const idx = testsBrowseTabs.indexOf(tab);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const next = testsBrowseTabs[(idx + dir + testsBrowseTabs.length) % testsBrowseTabs.length];
            next.focus();
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateTab(tab);
          }
        });
      });
      setTestsBrowseTabA11y(testsBrowseMode);
    }

    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        void runExportTestsExcel(store.getState().lang);
      });
    }
    if (btnExportPdfAll) {
      btnExportPdfAll.addEventListener('click', () => {
        const pdfWindow = window.open('/assets/clients_guide_lab.pdf', '_blank', 'noopener');
        if (!pdfWindow) {
          window.location.href = '/assets/clients_guide_lab.pdf';
        }
      });
    }
    const detailBackBtn = document.getElementById('detailBackBtn');
    if (detailBackBtn) {
      detailBackBtn.addEventListener('click', () => {
        if (lastLabTestsId) selectLabTests(lastLabTestsId, { focusDetail: true });
      });
    }

    if (btnBackCats) {
      btnBackCats.addEventListener('click', () => {
        if (testsBrowseMode === 'standard') {
          selectedStandardKey = null;
        } else {
          store.setState({ selectedCategoryId: null, testPage: 0 });
        }
        renderCategoryView();
        updateUrlState();
      });
    }

    if (btnPrevPage) {
      btnPrevPage.addEventListener('click', () => {
        store.setState({ testPage: Math.max(0, store.getState().testPage - 1) });
        renderCategoryView();
        updateUrlState();
      });
    }

    if (btnNextPage) {
      btnNextPage.addEventListener('click', () => {
        store.setState({ testPage: store.getState().testPage + 1 });
        renderCategoryView();
        updateUrlState();
      });
    }

    const closeNavMenus = () => {
      navTestsItem?.classList.remove('is-open');
      navLabsItem?.classList.remove('is-open');
    };

    const toggleMenu = (item: Element | null) => {
      if (!item) return;
      const isOpen = item.classList.contains('is-open');
      closeNavMenus();
      if (!isOpen) item.classList.add('is-open');
    };

    navTestsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(navTestsItem);
    });
    navLabsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(navLabsItem);
    });
    navOverviewBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNavMenus();
      selectOverview({ focusDetail: true });
    });
    document.addEventListener('click', () => closeNavMenus());

    const openMemberModal = (fromKeyboard = false) => {
      if (!memberOverlay) return;
      memberOverlay.classList.add('is-open');
      memberOverlay.setAttribute('aria-hidden', 'false');
      if (memberPassword) memberPassword.value = '';
      if (memberError) memberError.textContent = '';
      if (fromKeyboard && memberPassword) memberPassword.focus({ preventScroll: true });
    };

    const closeMemberModal = () => {
      if (!memberOverlay) return;
      memberOverlay.classList.remove('is-open');
      memberOverlay.setAttribute('aria-hidden', 'true');
    };

    const openVideoProcedures = () => {
      if (!videoOverlay) return;
      videoOverlay.classList.add('is-open');
      videoOverlay.setAttribute('aria-hidden', 'false');
    };

    const closeVideoProcedures = () => {
      if (!videoOverlay) return;
      videoOverlay.classList.remove('is-open');
      videoOverlay.setAttribute('aria-hidden', 'true');
      if (videoFrame) {
        videoFrame.src = '';
        videoFrame.setAttribute('hidden', 'true');
      }
      videoPlaceholder?.removeAttribute('hidden');
    };

    const openTemplates = () => {
      if (!templatesOverlay) return;
      templatesOverlay.classList.add('is-open');
      templatesOverlay.setAttribute('aria-hidden', 'false');
    };

    const closeTemplates = () => {
      if (!templatesOverlay) return;
      templatesOverlay.classList.remove('is-open');
      templatesOverlay.setAttribute('aria-hidden', 'true');
    };
    const openInternalMethods = () => {
      if (!internalMethodsOverlay) return;
      internalMethodsOverlay.classList.add('is-open');
      internalMethodsOverlay.setAttribute('aria-hidden', 'false');
    };
    const closeInternalMethods = () => {
      if (!internalMethodsOverlay) return;
      internalMethodsOverlay.classList.remove('is-open');
      internalMethodsOverlay.setAttribute('aria-hidden', 'true');
    };
    const openStandards = () => {
      if (!standardsOverlay) return;
      standardsOverlay.classList.add('is-open');
      standardsOverlay.setAttribute('aria-hidden', 'false');
    };
    const closeStandards = () => {
      if (!standardsOverlay) return;
      standardsOverlay.classList.remove('is-open');
      standardsOverlay.setAttribute('aria-hidden', 'true');
    };

    const submitMember = () => {
      if (!memberPassword) return;
      if (SE_MEMBER_PASSWORDS.has(memberPassword.value)) {
        setMemberUnlocked(true);
        closeMemberModal();
        location.reload();
      } else if (memberError) {
        memberError.textContent = 'Incorrect password';
      }
    };

    navMemberBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMemberUnlocked()) return;
      openMemberModal(e.detail === 0);
    });

    navMemberLogoutBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMemberUnlocked(false);
      location.reload();
    });

    navVideoProceduresBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNavMenus();
      if (!isMemberUnlocked()) {
        openMemberModal(e.detail === 0);
        return;
      }
      openVideoProcedures();
    });

    navTemplatesBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNavMenus();
      if (!isMemberUnlocked()) {
        openMemberModal(e.detail === 0);
        return;
      }
      openTemplates();
    });
    navStandardsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNavMenus();
      if (!isMemberUnlocked()) {
        openMemberModal(e.detail === 0);
        return;
      }
      openStandards();
    });

    navMethodsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNavMenus();
      if (!isMemberUnlocked()) {
        openMemberModal(e.detail === 0);
        return;
      }
      openInternalMethods();
    });

    addTestBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isMemberUnlocked()) {
        openMemberModal(e.detail === 0);
        return;
      }
      openAdminEditor(null);
    });

    memberAccess?.addEventListener('click', submitMember);
    memberCancel?.addEventListener('click', closeMemberModal);
    videoCloseBtn?.addEventListener('click', closeVideoProcedures);
    templatesCloseBtn?.addEventListener('click', closeTemplates);
    internalMethodsCloseBtn?.addEventListener('click', closeInternalMethods);
    standardsCloseBtn?.addEventListener('click', closeStandards);
    adminEditorCancelBtn?.addEventListener('click', closeAdminEditor);
    adminEditorSaveBtn?.addEventListener('click', () => {
      void saveAdminEditor();
    });
    adminDownloadTestsBtn?.addEventListener('click', () => {
      downloadJson('tests.json', tests);
    });
    templatesAddBtn?.addEventListener('click', () => {
      const title = window.prompt('Template title');
      const fileUrl = window.prompt('Template file URL');
      if (!title || !fileUrl || !templatesList) return;
      const item = document.createElement('div');
      item.className = 'templateCard';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="templateThumb"><span>TPL</span></div>
        <div class="templateMeta">
          <div class="templateTitle">${escapeHtml(title)}</div>
          <div class="templateSub">Added from editor</div>
          <a class="templateBtn" href="${escapeHtml(fileUrl)}" download>Download template</a>
        </div>
      `;
      templatesList.prepend(item);
    });
    internalMethodsAddBtn?.addEventListener('click', () => {
      const title = window.prompt('Internal method title');
      const fileUrl = window.prompt('Internal method file URL');
      if (!title || !fileUrl || !internalMethodsList) return;
      const item = document.createElement('div');
      item.className = 'templateCard';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="templateThumb"><span>INT</span></div>
        <div class="templateMeta">
          <div class="templateTitle">${escapeHtml(title)}</div>
          <div class="templateSub">Added from editor</div>
          <a class="templateBtn" href="${escapeHtml(fileUrl)}" download>Download template</a>
        </div>
      `;
      internalMethodsList.prepend(item);
    });
    videoAddBtn?.addEventListener('click', () => {
      const title = window.prompt('Video title');
      const url = window.prompt('Video URL');
      if (!title || !url || !videoList) return;
      const card = document.createElement('div');
      card.className = 'videoCard';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <div class="videoThumb"><span class="videoThumbFallback">VIDEO</span></div>
        <div class="videoMeta">
          <div class="videoTitle">${escapeHtml(title)}</div>
          <div class="videoSub">Added from editor</div>
          <button class="videoBtn" type="button" data-video-title="${escapeHtml(title)}" data-video-src="${escapeHtml(url)}">
            ▶ View procedure
          </button>
        </div>
      `;
      const btn = card.querySelector<HTMLButtonElement>('.videoBtn');
      btn?.addEventListener('click', () => {
        if (!videoFrame) return;
        videoFrame.src = url;
        videoFrame.setAttribute('title', title);
        videoFrame.removeAttribute('hidden');
        videoPlaceholder?.setAttribute('hidden', 'true');
      });
      videoList.prepend(card);
    });

    memberOverlay?.addEventListener('click', (e) => {
      if (e.target === memberOverlay) closeMemberModal();
    });
    videoOverlay?.addEventListener('click', (e) => {
      if (e.target === videoOverlay) closeVideoProcedures();
    });
    templatesOverlay?.addEventListener('click', (e) => {
      if (e.target === templatesOverlay) closeTemplates();
    });
    internalMethodsOverlay?.addEventListener('click', (e) => {
      if (e.target === internalMethodsOverlay) closeInternalMethods();
    });
    standardsOverlay?.addEventListener('click', (e) => {
      if (e.target === standardsOverlay) closeStandards();
    });
    adminEditorOverlay?.addEventListener('click', (e) => {
      if (e.target === adminEditorOverlay) closeAdminEditor();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMemberModal();
        closeVideoProcedures();
        closeTemplates();
        closeInternalMethods();
        closeStandards();
        closeAdminEditor();
      }
      if (e.key === 'Enter' && memberOverlay?.classList.contains('is-open')) submitMember();
    });

    document.querySelectorAll<HTMLButtonElement>('.videoBtn[data-video-src]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!videoFrame) return;
        const src = btn.dataset.videoSrc;
        if (!src) return;
        videoFrame.src = src;
        const title = btn.dataset.videoTitle || 'Video procedure';
        videoFrame.setAttribute('title', title);
        videoFrame.removeAttribute('hidden');
        videoPlaceholder?.setAttribute('hidden', 'true');
      });
    });

    const mapWrap = document.getElementById('mapWrap');
    if (mapWrap) {
      mapWrap.addEventListener('click', () => {
        setMapExpanded(true);
      });
    }

    document.querySelectorAll('.langBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lang = btn.getAttribute('data-lang') as Lang;
        if (!lang) return;
        store.setState({ lang });
        ui = await loadUiStrings(lang);
        applyUiStrings(store.getState());
        renderCategoryView();
        const state = store.getState();
        if (state.selectedTestId) renderDetail(state.selectedTestId);
        else if (state.selectedLabId) {
          if (getLabViewMode() === 'tests') renderLabTests(state.selectedLabId);
          else renderLabDetail(state.selectedLabId);
        }
        else renderEmptyDetail();
        mapController.invalidateSize();
        updatePanelBodyHeights();
        updateTopHeightVar();
      });
    });
  }

  function initDeepLink(): boolean {
    const params = new URLSearchParams(location.search);
    const modeParam = params.get('mode');
    testsBrowseMode = modeParam === 'standard' ? 'standard' : 'category';
    selectedStandardKey = testsBrowseMode === 'standard' ? params.get('std') : null;
    const rawPage = Number(params.get('page') || 0);
    const testPage = Number.isFinite(rawPage) ? Math.max(0, Math.floor(rawPage)) : 0;
    const query = (params.get('q') || '').trim();
    const catParam = params.get('cat');
    const initialCategoryId =
      testsBrowseMode === 'category' && catParam && categoryById.has(catParam) ? catParam : null;
    store.setState({ searchQuery: query, testPage, selectedCategoryId: initialCategoryId });

    const hash = getHash();
    if (hash.startsWith('labtests:')) {
      const labId = hash.slice(9);
      if (labs.some((l) => l.id === labId)) {
        store.setState({ selectedLabId: labId });
        labViewMode = 'tests';
        return true;
      }
    } else if (hash.startsWith('lab:')) {
      const labId = hash.slice(4);
      if (labs.some((l) => l.id === labId)) {
        store.setState({ selectedLabId: labId });
        return true;
      }
    } else if (hash && tests.some((t) => t.id === hash)) {
      store.setState({ selectedTestId: hash });
      return true;
    } else {
      store.setState({
        selectedTestId: null,
        selectedLabId: null,
      });
    }
    if (store.getState().selectedTestId) {
      const found = tests.find((t) => t.id === store.getState().selectedTestId);
      if (found) store.setState({ selectedCategoryId: found.categoryId });
    }
    return false;
  }

  mapController.init(labs, { onLabClick: selectLab });
  const hasDeepLink = initDeepLink();
  initHandlers();

  applyUiStrings(store.getState());
  setMemberUnlocked(isMemberUnlocked());
  renderCategoryView();

  if (hasDeepLink) {
    if (store.getState().selectedLabId) {
      if (getLabViewMode() === 'tests') renderLabTests(store.getState().selectedLabId!);
      else renderLabDetail(store.getState().selectedLabId!);
    } else if (store.getState().selectedTestId) {
      renderDetail(store.getState().selectedTestId!);
    } else {
      renderEmptyDetail();
    }
  } else {
    selectOverview();
  }
  updateUrlState();

  window.addEventListener('resize', () => {
    updateTopHeightVar();
    updatePanelBodyHeights();
    mapController.invalidateSize();
  });
  window.addEventListener('load', () => {
    updateTopHeightVar();
    updatePanelBodyHeights();
    mapController.invalidateSize();
  });

  updateTopHeightVar();
  updatePanelBodyHeights();
  mapController.invalidateSize();
}
