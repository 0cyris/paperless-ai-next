'use strict';

/**
 * The OpenRouter provider: the OpenAI-compatible service configured from the
 * OPENROUTER_* settings. Everything lives in services/openaiCompatibleService.js.
 */
module.exports = require('./openaiCompatibleService').forProvider('openrouter');
