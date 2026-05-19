const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Source-Lang',
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
  },
  body: JSON.stringify(body),
});

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server env ${name}`);
  return value;
};

const getHeader = (headers, name) => {
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
};

const isTest = (value) =>
  value &&
  typeof value.id === 'string' &&
  typeof value.categoryId === 'string' &&
  Array.isArray(value.tags) &&
  (value.labs === null || Array.isArray(value.labs));

const mergeTranslated = (current = {}, patch = {}) => ({ ...current, ...patch });

const mergeTest = (current, patch) => ({
  ...current,
  ...patch,
  title: mergeTranslated(current.title, patch.title),
  summary: mergeTranslated(current.summary, patch.summary),
  why: mergeTranslated(current.why, patch.why),
  how: mergeTranslated(current.how, patch.how),
  tags: patch.tags || current.tags || [],
  labs: Object.prototype.hasOwnProperty.call(patch, 'labs') ? patch.labs : current.labs,
});

async function githubRequest(url, options = {}) {
  const token = requiredEnv('GITHUB_TOKEN');
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = payload?.message || `GitHub API failed with ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

async function readTestsFile() {
  const owner = requiredEnv('GITHUB_OWNER');
  const repo = requiredEnv('GITHUB_REPO');
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path = process.env.GITHUB_CONTENT_PATH || 'public/data/tests.json';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(url);
  const content = Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  const tests = JSON.parse(content);
  if (!Array.isArray(tests)) throw new Error(`${path} must contain a JSON array`);
  return { owner, repo, branch, path, sha: file.sha, tests };
}

async function writeTestsFile({ owner, repo, branch, path, sha, tests, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const content = Buffer.from(`${JSON.stringify(tests, null, 2)}\n`, 'utf8').toString('base64');
  const result = await githubRequest(url, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha, branch }),
  });
  return result.commit;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  try {
    const expectedKey = requiredEnv('ADMIN_API_KEY');
    const providedKey = getHeader(event.headers, 'x-admin-key');
    if (!providedKey || providedKey !== expectedKey) {
      return json(401, { detail: 'Invalid admin key' });
    }

    const method = event.httpMethod;
    const suffix = event.path.split('/.netlify/functions/admin-tests')[1] || '';
    const match = suffix.match(/^\/tests\/?([^/]*)?$/);
    if (!match || !['POST', 'PUT'].includes(method)) {
      return json(404, { detail: 'Unsupported admin route' });
    }

    const payload = event.body ? JSON.parse(event.body) : null;
    const sourceLang = getHeader(event.headers, 'x-source-lang') || 'en';
    const file = await readTestsFile();

    let saved;
    if (method === 'POST') {
      if (!isTest(payload)) return json(400, { detail: 'Invalid test payload' });
      if (file.tests.some((test) => test.id === payload.id)) {
        return json(409, { detail: `Test ${payload.id} already exists` });
      }
      saved = payload;
      file.tests.push(saved);
    } else {
      const testId = decodeURIComponent(match[1] || '');
      if (!testId) return json(400, { detail: 'Missing test id' });
      const index = file.tests.findIndex((test) => test.id === testId);
      if (index < 0) return json(404, { detail: `Test ${testId} not found` });
      saved = mergeTest(file.tests[index], payload || {});
      if (!isTest(saved)) return json(400, { detail: 'Invalid merged test payload' });
      file.tests[index] = saved;
    }

    const commit = await writeTestsFile({
      ...file,
      message: `Update lab test ${saved.id} (${sourceLang})`,
    });

    return json(method === 'POST' ? 201 : 200, {
      ...saved,
      _commit: {
        sha: commit?.sha,
        url: commit?.html_url,
      },
    });
  } catch (error) {
    console.error('[admin-tests]', error);
    return json(500, { detail: error instanceof Error ? error.message : 'Unexpected admin error' });
  }
}
