import './styles/app.css';
import 'leaflet/dist/leaflet.css';
import type { Category, Lab, Test } from './models/types';
import { dataLoader } from './services/dataLoader';
import { fetchPublicContent, hasPublicApiBase } from './services/api';
import { createStore } from './store/store';
import { MapController } from './map/mapController';
import { initApp } from './ui/app';
import { setContentBundle } from './store/contentStore';
import { initCollageEffects } from './ui/collageEffects';

function renderFatalError(message: string): void {
  const host = document.getElementById('main') ?? document.body;
  const card = document.createElement('section');
  card.setAttribute('role', 'alert');
  card.style.maxWidth = '680px';
  card.style.margin = '40px auto';
  card.style.padding = '20px';
  card.style.border = '1px solid #e3e6e8';
  card.style.borderRadius = '10px';
  card.style.background = '#ffffff';
  card.style.boxShadow = '0 10px 24px rgba(0,0,0,.08)';

  const title = document.createElement('h2');
  title.textContent = 'Unable to load application data';
  title.style.margin = '0 0 10px 0';
  title.style.fontSize = '18px';

  const body = document.createElement('p');
  body.textContent = message;
  body.style.margin = '0';
  body.style.color = '#5b6570';

  card.append(title, body);
  host.innerHTML = '';
  host.appendChild(card);
}

async function bootstrap(): Promise<void> {
  try {
    const store = createStore();

    let labs: Lab[] = [];
    let categories: Category[] = [];
    let tests: Test[] = [];

    // Try backend API only when explicitly configured; otherwise use bundled JSON.
    try {
      if (!hasPublicApiBase()) {
        throw new Error('Public API not configured');
      }
      const payload = await fetchPublicContent();
      labs = Array.isArray(payload.labs) ? (payload.labs as Lab[]) : [];
      categories = Array.isArray(payload.categories) ? (payload.categories as Category[]) : [];
      tests = Array.isArray(payload.tests) ? (payload.tests as Test[]) : [];
    } catch {
      console.warn('[bootstrap] Backend API unavailable — loading from local JSON files');
      [labs, categories, tests] = await Promise.all([
        dataLoader.getLabs(),
        dataLoader.getCategories(),
        dataLoader.getTests(),
      ]);
    }

    const validLabs = labs;
    const validCategories = categories;
    const validTests = tests;

    if (!validLabs.length || !validCategories.length || !validTests.length) {
      renderFatalError('Content is empty or invalid. Check /public/data JSON files or backend /public/content.');
      return;
    }

    const mapController = new MapController();
    setContentBundle({ labs: validLabs, categories: validCategories, tests: validTests, ui: null });
    initCollageEffects();
    await initApp({
      labs: validLabs,
      categories: validCategories,
      tests: validTests,
      mapController,
      loadUiStrings: dataLoader.getUiStrings,
      store,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected startup error';
    console.error('[bootstrap]', error);
    renderFatalError(msg);
  }
}

bootstrap();
