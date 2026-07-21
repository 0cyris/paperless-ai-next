// OpenRouter as an AI (document-analysis) provider reuses customService's
// OpenAI-compatible plumbing, parametrized by provider name. This verifies:
// the factory routes to the openrouter service, the client is built from
// config.openRouter (not config.custom), the chat request carries
// provider:{zdr:true} iff OPENROUTER_ZDR=yes, and the default 'custom'
// provider is unaffected (no provider field, config.custom.* still used).

const assert = require('assert');

const configModulePath = require.resolve('../config/config');
const openaiModulePath = require.resolve('openai');
const customServiceModulePath = require.resolve('../services/customService');
const openrouterServiceModulePath =
  require.resolve('../services/openrouterService');
const aiServiceFactoryModulePath =
  require.resolve('../services/aiServiceFactory');

function loadServicesWithMocks(configOverrides = {}) {
  delete require.cache[configModulePath];
  delete require.cache[openaiModulePath];
  delete require.cache[customServiceModulePath];
  delete require.cache[openrouterServiceModulePath];
  delete require.cache[aiServiceFactoryModulePath];

  const state = { constructorCalls: [], createCalls: [] };

  const configMock = {
    aiProvider: 'openrouter',
    aiTemperatureAnalysis: 0.3,
    aiTemperatureGeneration: 0.7,
    tokenLimit: 128000,
    responseTokens: 1000,
    useExistingData: 'no',
    restrictToExistingTags: 'no',
    restrictToExistingCorrespondents: 'no',
    custom: {
      apiUrl: 'http://custom.example/v1',
      apiKey: 'custom-key',
      model: 'custom-model',
    },
    // aiServiceFactory unconditionally requires ollamaService, whose
    // singleton constructor reads config.ollama.* at require time.
    ollama: {
      apiUrl: 'http://localhost:11434',
      apiKey: '',
      model: 'llama3.2',
    },
    openRouter: {
      apiUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'or-key',
      model: 'openrouter-model',
      zdr: 'no',
    },
    ...configOverrides,
  };

  class FakeOpenAI {
    constructor(options) {
      state.constructorCalls.push(options);
      this.chat = {
        completions: {
          create: async (params) => {
            state.createCalls.push(params);
            return {
              choices: [{ message: { content: 'Generated text' } }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            };
          },
        },
      };
      this.models = { list: async () => ({ data: [] }) };
    }
  }

  require.cache[configModulePath] = {
    id: configModulePath,
    filename: configModulePath,
    loaded: true,
    exports: configMock,
  };

  require.cache[openaiModulePath] = {
    id: openaiModulePath,
    filename: openaiModulePath,
    loaded: true,
    exports: FakeOpenAI,
  };

  const openrouterService = require('../services/openrouterService');
  const AIServiceFactory = require('../services/aiServiceFactory');

  return { openrouterService, AIServiceFactory, state };
}

async function testFactoryRoutesToOpenrouterService() {
  const { openrouterService, AIServiceFactory } = loadServicesWithMocks();

  const resolved = AIServiceFactory.getService();
  assert.strictEqual(
    resolved,
    openrouterService,
    'Expected the factory to return the openrouter service when aiProvider is openrouter'
  );
}

async function testClientUsesOpenRouterConfig() {
  const { openrouterService, state } = loadServicesWithMocks();

  await openrouterService.generateText('Say hi');

  assert.strictEqual(
    state.constructorCalls.length,
    1,
    'Expected the OpenAI client to be constructed exactly once'
  );
  assert.strictEqual(
    state.constructorCalls[0].baseURL,
    'https://openrouter.ai/api/v1',
    'Expected the client baseURL to come from config.openRouter, not config.custom'
  );
  assert.strictEqual(
    state.constructorCalls[0].apiKey,
    'or-key',
    'Expected the client apiKey to come from config.openRouter'
  );
  assert.strictEqual(
    state.createCalls[0].model,
    'openrouter-model',
    'Expected the request model to come from config.openRouter.model'
  );
}

async function testZdrFlagIncludedWhenEnabled() {
  const { openrouterService, state } = loadServicesWithMocks({
    openRouter: {
      apiUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'or-key',
      model: 'openrouter-model',
      zdr: 'yes',
    },
  });

  await openrouterService.generateText('Say hi');

  assert.deepStrictEqual(
    state.createCalls[0].provider,
    { zdr: true },
    'Expected provider.zdr to be true when OPENROUTER_ZDR=yes'
  );
}

async function testNoProviderFieldWhenZdrDisabled() {
  const { openrouterService, state } = loadServicesWithMocks();

  await openrouterService.generateText('Say hi');

  assert.strictEqual(
    state.createCalls[0].provider,
    undefined,
    'Expected no provider field when ZDR is disabled'
  );
}

async function testDefaultCustomProviderUnaffected() {
  delete require.cache[configModulePath];
  delete require.cache[openaiModulePath];
  delete require.cache[customServiceModulePath];

  const state = { createCalls: [] };
  class FakeOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (params) => {
            state.createCalls.push(params);
            return {
              choices: [{ message: { content: 'Generated text' } }],
            };
          },
        },
      };
    }
  }

  require.cache[openaiModulePath] = {
    id: openaiModulePath,
    filename: openaiModulePath,
    loaded: true,
    exports: FakeOpenAI,
  };

  require.cache[configModulePath] = {
    id: configModulePath,
    filename: configModulePath,
    loaded: true,
    exports: {
      aiProvider: 'custom',
      aiTemperatureGeneration: 0.7,
      tokenLimit: 128000,
      responseTokens: 1000,
      custom: {
        apiUrl: 'http://custom.example/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
      },
      openRouter: {
        apiUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        model: '',
        zdr: 'no',
      },
    },
  };

  const { CustomOpenAIService } = require('../services/customService');
  const defaultService = new CustomOpenAIService();
  const text = await defaultService.generateText('Say hi');

  assert.strictEqual(text, 'Generated text');
  assert.strictEqual(
    state.createCalls[0].model,
    'custom-model',
    'Expected the default (no-arg) CustomOpenAIService to still use config.custom.*'
  );
  assert.strictEqual(
    state.createCalls[0].provider,
    undefined,
    'Expected the default custom provider to never send a provider field'
  );
}

async function main() {
  await testFactoryRoutesToOpenrouterService();
  await testClientUsesOpenRouterConfig();
  await testZdrFlagIncludedWhenEnabled();
  await testNoProviderFieldWhenZdrDisabled();
  await testDefaultCustomProviderUnaffected();
}

main()
  .then(() => {
    console.log(
      '[PASS] OpenRouter AI provider reuses customService with the correct config block and optional ZDR routing'
    );
  })
  .catch((error) => {
    console.error('[FAIL] AI provider openrouter test failed:', error.message);
    process.exitCode = 1;
  });
