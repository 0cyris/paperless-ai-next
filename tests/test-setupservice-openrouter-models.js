// OpenRouter OCR model discovery must request only image/document-capable
// models (input_modalities=image) and, when the Zero-Data-Retention switch
// is enabled, must also constrain discovery to ZDR-capable models (zdr=true).
// The response is additionally filtered client-side as defense in depth.

const assert = require('assert');
const dnsPromises = require('dns').promises;

const setupServiceModulePath = require.resolve('../services/setupService');
const axiosModulePath = require.resolve('axios');

const originalResolve4 = dnsPromises.resolve4;
const originalResolve6 = dnsPromises.resolve6;

async function withMockedOpenRouterDns(fn) {
  dnsPromises.resolve4 = async (hostname) => {
    if (hostname === 'openrouter.ai') {
      return ['104.18.10.10'];
    }
    const error = new Error('DNS lookup failed');
    error.code = 'ENOTFOUND';
    throw error;
  };
  dnsPromises.resolve6 = async () => {
    const error = new Error('DNS lookup failed');
    error.code = 'ENODATA';
    throw error;
  };

  try {
    await fn();
  } finally {
    dnsPromises.resolve4 = originalResolve4;
    dnsPromises.resolve6 = originalResolve6;
  }
}

function loadSetupServiceWithAxiosMock(axiosMock) {
  delete require.cache[setupServiceModulePath];
  delete require.cache[axiosModulePath];

  require.cache[axiosModulePath] = {
    id: axiosModulePath,
    filename: axiosModulePath,
    loaded: true,
    exports: axiosMock,
  };

  return require('../services/setupService');
}

const MIXED_MODELS_RESPONSE = {
  data: [
    { id: 'text-only-model', architecture: { input_modalities: ['text'] } },
    {
      id: 'vision-model-a',
      architecture: { input_modalities: ['text', 'image'] },
    },
    {
      id: 'file-model',
      architecture: { input_modalities: ['text', 'file'] },
    },
    { id: 'no-architecture-model' },
  ],
};

async function testDiscoveryRequestsImageModalityAndFiltersResponse() {
  const state = { getCalls: [] };

  const setupService = loadSetupServiceWithAxiosMock({
    get: async (url) => {
      state.getCalls.push(url);
      return { status: 200, data: MIXED_MODELS_RESPONSE };
    },
  });

  await withMockedOpenRouterDns(async () => {
    const models = await setupService.discoverOcrModels({
      provider: 'openrouter',
      apiUrl: '',
      apiKey: 'test-key',
    });

    // discoverOcrModels tries both the versioned (/v1) and bare base URL
    // candidates, same as the existing Mistral discovery path, so a
    // successful mock response is fetched twice and then deduped.
    assert.strictEqual(
      state.getCalls.length,
      2,
      'Expected requests for both the /v1 and bare base URL candidates'
    );
    const requestedUrl = new URL(state.getCalls[0]);
    assert.strictEqual(
      requestedUrl.origin + requestedUrl.pathname,
      'https://openrouter.ai/api/v1/models',
      'Expected the versioned OpenRouter models endpoint to be tried first'
    );
    assert.strictEqual(
      requestedUrl.searchParams.get('input_modalities'),
      'image',
      'Expected input_modalities=image query parameter'
    );
    assert.strictEqual(
      requestedUrl.searchParams.has('zdr'),
      false,
      'Expected no zdr parameter when ZDR is not requested'
    );

    assert.deepStrictEqual(
      models,
      ['vision-model-a', 'file-model', 'no-architecture-model'],
      'Expected only image/file-capable (or unclassified) models to survive client-side filtering'
    );
  });
}

async function testZdrQueryParamForwarded() {
  const state = { getCalls: [] };

  const setupService = loadSetupServiceWithAxiosMock({
    get: async (url) => {
      state.getCalls.push(url);
      return { status: 200, data: { data: [] } };
    },
  });

  await withMockedOpenRouterDns(async () => {
    await setupService.discoverOcrModels({
      provider: 'openrouter',
      apiUrl: '',
      apiKey: 'test-key',
      zdr: true,
    });

    assert.strictEqual(
      state.getCalls.length,
      2,
      'Expected requests for both the /v1 and bare base URL candidates'
    );
    for (const calledUrl of state.getCalls) {
      const requestedUrl = new URL(calledUrl);
      assert.strictEqual(
        requestedUrl.searchParams.get('zdr'),
        'true',
        'Expected zdr=true query parameter on every candidate request when ZDR is enabled'
      );
    }
  });
}

async function testApiKeyRequired() {
  const setupService = loadSetupServiceWithAxiosMock({
    get: async () => {
      throw new Error('should not be called without an API key');
    },
  });

  await assert.rejects(
    () =>
      setupService.discoverOcrModels({
        provider: 'openrouter',
        apiUrl: '',
        apiKey: '',
      }),
    /API key is required/,
    'Expected model discovery to require an API key for OpenRouter'
  );
}

async function main() {
  await testDiscoveryRequestsImageModalityAndFiltersResponse();
  await testZdrQueryParamForwarded();
  await testApiKeyRequired();
}

main()
  .then(() => {
    console.log(
      '[PASS] setupService OpenRouter OCR model discovery filters by image/file modality and forwards the ZDR flag'
    );
  })
  .catch((error) => {
    console.error(
      '[FAIL] setupService OpenRouter model discovery test failed:',
      error.message
    );
    process.exitCode = 1;
  });
