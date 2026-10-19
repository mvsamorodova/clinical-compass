import { MLCEngine, type ChatCompletionMessageParam } from '@mlc-ai/web-llm';

let engine: MLCEngine | null = null;
const systemPrompt = `Ты — внимательный ИИ-собеседник в дневнике настроения. Отвечай только по-русски, естественно, в 2–4 предложениях. Отвечай на конкретное сообщение, учитывай контекст; можно задать один вопрос. Не выдумывай факты о человеке. Ты не врач: не ставь диагнозы, не назначай лекарства и не меняй лечение. Медицинские вопросы направляй врачу. При угрозе жизни предложи местную экстренную службу и человека рядом. Не поощряй опасные действия. Ты не можешь связаться с врачом или сохранить дневник. /no_think`;

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  const send = (type: string, data: unknown) => self.postMessage({ id, type, data });
  try {
    if (type === 'load') {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error('GPU_UNAVAILABLE');
      const model = adapter.features.has('shader-f16') ? 'Qwen3-1.7B-q4f16_1-MLC' : 'Qwen3-1.7B-q4f32_1-MLC';
      engine = new MLCEngine({ initProgressCallback: report => send('progress', Math.min(99, Math.round(report.progress * 100))), logLevel: 'ERROR' });
      await engine.reload(model, { context_window_size: 4096 });
      send('result', model);
    } else if (type === 'generate') {
      if (!engine) throw new Error('MODEL_NOT_READY');
      const history: ChatCompletionMessageParam[] = [];
      // Limit by UTF-8 bytes as well as turns: worst-case tokenization fits the 4096-token window.
      const encoder = new TextEncoder();
      let budget = 2100 - encoder.encode(payload.message).length;
      for (const turn of [...payload.turns].reverse()) {
        const cost = encoder.encode(turn.message + turn.reply).length + 32;
        if (cost > budget) break;
        history.unshift({ role: 'user', content: turn.message }, { role: 'assistant', content: turn.reply });
        budget -= cost;
      }
      const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: payload.message }];
      const chunks = await engine.chat.completions.create({ messages, stream: true, max_tokens: 320, temperature: 0.5, top_p: 0.9, presence_penalty: 0.3, extra_body: { enable_thinking: false } });
      let text = '', finishReason = '';
      for await (const chunk of chunks) {
        text += chunk.choices[0]?.delta.content || '';
        finishReason = chunk.choices[0]?.finish_reason || finishReason;
        send('delta', text);
      }
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!text) throw new Error('EMPTY_MODEL_REPLY');
      if (finishReason === 'length') text += '\n\n[Достигнут лимит ответа. Можно попросить продолжить.]';
      send('result', text);
    }
  } catch (error) {
    // Do not log conversations or model prompts.
    send('error', error instanceof Error ? error.message : 'MODEL_ERROR');
  }
};
