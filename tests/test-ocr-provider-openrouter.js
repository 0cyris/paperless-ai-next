// OpenRouter OCR provider: a single OpenAI-compatible chat/completions
// request against the OpenRouter API, with no endpoint autodetection or
// Ollama-native fallback (unlike the local-vision "custom"/"ollama" path),
// and an optional Zero-Data-Retention routing flag.

const assert = require('assert');

const configModulePath = require.resolve('../config/config');
const paperlessServiceModulePath =
  require.resolve('../services/paperlessService');
const documentModelModulePath = require.resolve('../models/document');
const aiServiceFactoryModulePath =
  require.resolve('../services/aiServiceFactory');
const axiosModulePath = require.resolve('axios');
const mistralOcrServiceModulePath =
  require.resolve('../services/mistralOcrService');

function loadServiceWithMocks({ apiUrl = '', openRouterZdr = 'no' } = {}) {
  delete require.cache[configModulePath];
  delete require.cache[paperlessServiceModulePath];
  delete require.cache[documentModelModulePath];
  delete require.cache[aiServiceFactoryModulePath];
  delete require.cache[axiosModulePath];
  delete require.cache[mistralOcrServiceModulePath];

  const state = {
    calls: [],
  };

  const configMock = {
    mistralOcr: {
      enabled: 'yes',
      provider: 'openrouter',
      apiUrl,
      apiKey: 'test-openrouter-key',
      model: 'google/gemini-2.0-flash-001',
      openRouterZdr,
    },
    ollama: {
      apiUrl: 'http://localhost:11434',
    },
    limitFunctions: {
      activateTagging: 'yes',
      activateTitle: 'yes',
      activateDocumentType: 'yes',
      activateCorrespondents: 'yes',
    },
  };

  const paperlessServiceMock = {
    getThumbnailImage: async () => Buffer.from('thumbnail-image-binary'),
  };

  const axiosMock = {
    post: async (url, body) => {
      state.calls.push({ url, body });
      return {
        data: { choices: [{ message: { content: 'Extracted OCR text' } }] },
      };
    },
  };

  require.cache[configModulePath] = {
    id: configModulePath,
    filename: configModulePath,
    loaded: true,
    exports: configMock,
  };

  require.cache[paperlessServiceModulePath] = {
    id: paperlessServiceModulePath,
    filename: paperlessServiceModulePath,
    loaded: true,
    exports: paperlessServiceMock,
  };

  require.cache[documentModelModulePath] = {
    id: documentModelModulePath,
    filename: documentModelModulePath,
    loaded: true,
    exports: {},
  };

  require.cache[aiServiceFactoryModulePath] = {
    id: aiServiceFactoryModulePath,
    filename: aiServiceFactoryModulePath,
    loaded: true,
    exports: { getService: () => ({}) },
  };

  require.cache[axiosModulePath] = {
    id: axiosModulePath,
    filename: axiosModulePath,
    loaded: true,
    exports: axiosMock,
  };

  const service = require('../services/mistralOcrService');
  return { service, state };
}

function extractImageDataUrl(body) {
  const imagePart = (body?.messages?.[0]?.content || []).find(
    (part) => part.type === 'image_url'
  );
  return imagePart?.image_url?.url || '';
}

async function testSingleRequestNoFallback() {
  const { service, state } = loadServiceWithMocks();

  const text = await service.performOcr('cGRmLWJhc2U2NA==', 'image/png', 42);

  assert.strictEqual(
    text,
    'Extracted OCR text',
    'Expected OCR text from OpenRouter response'
  );
  assert.strictEqual(
    state.calls.length,
    1,
    'Expected exactly one OpenRouter API call (no /api/chat fallback)'
  );

  const [call] = state.calls;
  assert.strictEqual(
    call.url,
    'https://openrouter.ai/api/v1/chat/completions',
    'Expected the OpenRouter chat completions endpoint'
  );
  assert.strictEqual(
    call.body.model,
    'google/gemini-2.0-flash-001',
    'Expected OCR model from config'
  );
  assert.ok(
    Array.isArray(call.body.messages),
    'Expected chat messages payload'
  );
  assert.ok(
    extractImageDataUrl(call.body).startsWith('data:image/png;base64,'),
    'Expected an image_url data URL content part'
  );
  assert.strictEqual(
    call.body.provider,
    undefined,
    'Expected no provider field when ZDR is disabled'
  );
}

async function testZdrFlagIncluded() {
  const { service, state } = loadServiceWithMocks({ openRouterZdr: 'yes' });

  await service.performOcr('cGRmLWJhc2U2NA==', 'image/png', 42);

  assert.strictEqual(state.calls.length, 1, 'Expected one OpenRouter call');
  assert.deepStrictEqual(
    state.calls[0].body.provider,
    { zdr: true },
    'Expected provider.zdr to be true when OCR_OPENROUTER_ZDR=yes'
  );
}

async function testCustomApiUrlOverride() {
  const { service, state } = loadServiceWithMocks({
    apiUrl: 'https://eu.openrouter.ai/api/v1',
  });

  await service.performOcr('cGRmLWJhc2U2NA==', 'image/png', 42);

  assert.strictEqual(state.calls.length, 1, 'Expected one OpenRouter call');
  assert.strictEqual(
    state.calls[0].url,
    'https://eu.openrouter.ai/api/v1/chat/completions',
    'Expected the request to honor a configured OCR_API_URL override'
  );
}

async function main() {
  await testSingleRequestNoFallback();
  console.log('  ✓ single OpenAI-compatible request, no /api/chat fallback');

  await testZdrFlagIncluded();
  console.log('  ✓ provider.zdr included when OCR_OPENROUTER_ZDR=yes');

  await testCustomApiUrlOverride();
  console.log('  ✓ OCR_API_URL override respected');
}

main()
  .then(() => {
    console.log(
      '[PASS] OpenRouter OCR provider sends a single chat/completions request with optional ZDR routing'
    );
  })
  .catch((error) => {
    console.error('[FAIL] OCR provider openrouter test failed:', error.message);
    process.exitCode = 1;
  });
