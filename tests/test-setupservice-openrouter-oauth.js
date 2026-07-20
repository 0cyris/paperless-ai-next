// OpenRouter OAuth PKCE key exchange: the authorization code and the
// client-held verifier are posted to a hardcoded OpenRouter endpoint (never
// built from user input) and the returned API key is handed back to the
// caller. Malformed input must be rejected before any network call.

const assert = require('assert');

const setupServiceModulePath = require.resolve('../services/setupService');
const axiosModulePath = require.resolve('axios');

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

async function testSuccessfulExchange() {
  const state = { calls: [] };

  const setupService = loadSetupServiceWithAxiosMock({
    post: async (url, body) => {
      state.calls.push({ url, body });
      return { data: { key: 'sk-or-v1-generated-key' } };
    },
  });

  const key = await setupService.exchangeOpenRouterOauthCode({
    code: 'auth-code-123',
    codeVerifier: 'verifier-abc',
    codeChallengeMethod: 'S256',
  });

  assert.strictEqual(
    key,
    'sk-or-v1-generated-key',
    'Expected the returned API key'
  );
  assert.strictEqual(
    state.calls.length,
    1,
    'Expected exactly one exchange request'
  );
  assert.strictEqual(
    state.calls[0].url,
    'https://openrouter.ai/api/v1/auth/keys',
    'Expected the hardcoded OpenRouter key-exchange endpoint'
  );
  assert.deepStrictEqual(
    state.calls[0].body,
    {
      code: 'auth-code-123',
      code_verifier: 'verifier-abc',
      // PKCE method names are case-sensitive; OpenRouter rejects 's256'.
      code_challenge_method: 'S256',
    },
    'Expected the code, verifier, and canonical challenge method in the request body'
  );
}

async function testMethodCasingIsCanonicalized() {
  const state = { calls: [] };

  const setupService = loadSetupServiceWithAxiosMock({
    post: async (url, body) => {
      state.calls.push({ url, body });
      return { data: { key: 'sk-or-v1-generated-key' } };
    },
  });

  await setupService.exchangeOpenRouterOauthCode({
    code: 'auth-code-123',
    codeVerifier: 'verifier-abc',
    codeChallengeMethod: 's256',
  });

  assert.strictEqual(
    state.calls[0].body.code_challenge_method,
    'S256',
    'Expected lowercase input to be sent with the canonical S256 spelling'
  );
}

async function testPlainChallengeMethodAccepted() {
  const setupService = loadSetupServiceWithAxiosMock({
    post: async () => ({
      data: { key: 'sk-or-v1-plain' },
    }),
  });

  const key = await setupService.exchangeOpenRouterOauthCode({
    code: 'auth-code-123',
    codeVerifier: 'verifier-abc',
    codeChallengeMethod: 'plain',
  });

  assert.strictEqual(key, 'sk-or-v1-plain');
}

async function testRejectsEmptyCode() {
  const setupService = loadSetupServiceWithAxiosMock({
    post: async () => {
      throw new Error('should not be called without a code');
    },
  });

  await assert.rejects(
    () =>
      setupService.exchangeOpenRouterOauthCode({
        code: '',
        codeVerifier: 'verifier-abc',
        codeChallengeMethod: 'S256',
      }),
    /authorization code is required/i
  );
}

async function testRejectsUnknownChallengeMethod() {
  const setupService = loadSetupServiceWithAxiosMock({
    post: async () => {
      throw new Error('should not be called with an invalid challenge method');
    },
  });

  await assert.rejects(
    () =>
      setupService.exchangeOpenRouterOauthCode({
        code: 'auth-code-123',
        codeVerifier: 'verifier-abc',
        codeChallengeMethod: 'md5',
      }),
    /unsupported code challenge method/i
  );
}

async function testRejectsResponseWithoutKey() {
  const setupService = loadSetupServiceWithAxiosMock({
    post: async () => ({ data: {} }),
  });

  await assert.rejects(
    () =>
      setupService.exchangeOpenRouterOauthCode({
        code: 'auth-code-123',
        codeVerifier: 'verifier-abc',
        codeChallengeMethod: 'S256',
      }),
    /did not return an API key/i
  );
}

async function testSurfacesUpstreamErrorMessage() {
  const setupService = loadSetupServiceWithAxiosMock({
    post: async () => {
      const error = new Error('Request failed with status code 400');
      error.response = {
        status: 400,
        data: { error: { message: 'Invalid code_verifier', code: 400 } },
      };
      throw error;
    },
  });

  await assert.rejects(
    () =>
      setupService.exchangeOpenRouterOauthCode({
        code: 'auth-code-123',
        codeVerifier: 'verifier-abc',
        codeChallengeMethod: 'S256',
      }),
    /OpenRouter rejected the key exchange: Invalid code_verifier/,
    'Expected the upstream OpenRouter error message, not the generic axios one'
  );
}

async function main() {
  await testSuccessfulExchange();
  await testMethodCasingIsCanonicalized();
  await testPlainChallengeMethodAccepted();
  await testRejectsEmptyCode();
  await testRejectsUnknownChallengeMethod();
  await testRejectsResponseWithoutKey();
  await testSurfacesUpstreamErrorMessage();
}

main()
  .then(() => {
    console.log(
      '[PASS] setupService OpenRouter OAuth PKCE code exchange returns the API key and validates its inputs'
    );
  })
  .catch((error) => {
    console.error(
      '[FAIL] setupService OpenRouter OAuth exchange test failed:',
      error.message
    );
    process.exitCode = 1;
  });
