import type { Category, Lab, Test } from '../models/types';
import { dataLoader } from './dataLoader';
import { fetchCmsContent } from './cmsService';

export async function loadContent(): Promise<{ labs: Lab[]; categories: Category[]; tests: Test[] }> {
  const [localLabs, localCategories, localTests] = await Promise.all([
    dataLoader.getLabs(),
    dataLoader.getCategories(),
    dataLoader.getTests(),
  ]);

  const cms = await fetchCmsContent();
  if (cms && cms.labs.length && cms.categories.length && cms.tests.length) {
    return cms;
  }

  return { labs: localLabs, categories: localCategories, tests: localTests };
}
