import { readCloudflareAiResponseText } from '../app_writer/agent_response.ts';
import type { CloudflareAiBinding } from '../app_writer/agent_types.ts';
import type { PythonTestVectorGenerator } from './service.ts';

export function createCloudflarePythonTestVectorGenerator(input: {
  readonly ai: CloudflareAiBinding;
  readonly model: string;
}): PythonTestVectorGenerator {
  return {
    async generate(request) {
      const response = await input.ai.run(input.model, {
        messages: [
          {
            role: 'system',
            content:
              'Return raw JSON only. Design diverse input vectors for an instructor-authored Python function assignment. Never return Python code, expected values, explanations, markdown, or keys other than cases. Return exactly three public and five hidden cases. Each case must have label, visibility, and args. args must be a JSON array.',
          },
          {
            role: 'user',
            content: JSON.stringify(request),
          },
        ],
        stream: true,
      });
      const text = await readCloudflareAiResponseText(response);

      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Python test-vector generation did not return valid JSON.');
      }
    },
  };
}
