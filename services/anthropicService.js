'use strict';

/**
 * The Claude API as an AI provider (AI_PROVIDER=anthropic).
 *
 * Same contract as the other four provider services — initialize(),
 * analyzeDocument(), generateText(), checkStatus() with the same arguments and
 * return shapes — so nothing that calls AIServiceFactory.getService() needs to
 * know which provider answers. Request building and answer reading go through
 * services/anthropicSupport.js.
 */

const config = require('../config/config');
const { createAnthropicClient } = require('./anthropicSupport');

class AnthropicService {
  constructor() {
    this.client = null;
    this.lastGenerateTextUsage = null;
  }

  initialize() {
    if (
      !this.client &&
      config.aiProvider === 'anthropic' &&
      config.anthropic.apiKey
    ) {
      this.client = createAnthropicClient({
        apiKey: config.anthropic.apiKey,
        apiUrl: config.anthropic.apiUrl,
      });
    }
  }

  // eslint-disable-next-line no-unused-vars
  async analyzeDocument(content, existingTags = [], ...rest) {
    return {
      document: { tags: [], correspondent: null },
      metrics: null,
      error: 'Anthropic analysis is not implemented yet',
    };
  }

  // eslint-disable-next-line no-unused-vars
  async generateText(prompt, options = {}) {
    throw new Error('Anthropic text generation is not implemented yet');
  }

  async checkStatus() {
    return {
      status: 'error',
      error: 'Anthropic status check is not implemented yet',
    };
  }
}

module.exports = new AnthropicService();
