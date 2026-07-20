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
      code_challenge_method: 's256',
    },
    'Expected the code, verifier, and normalized challenge method in the request body'
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

async function main() {
  await testSuccessfulExchange();
  await testPlainChallengeMethodAccepted();
  await testRejectsEmptyCode();
  await testRejectsUnknownChallengeMethod();
  await testRejectsResponseWithoutKey();
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
