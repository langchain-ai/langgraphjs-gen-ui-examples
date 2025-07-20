import {
  Annotation,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { typedUi } from "@langchain/langgraph-sdk/react-ui/server";
import {
  isAIMessage,
  isBaseMessage,
  type AIMessageChunk,
  type BaseMessageLike,
} from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { findToolCall } from "../find-tool-call";
import { GenerativeUIAnnotation } from "../types";

import type ComponentMap from "../../agent-uis/index";
import { ChatOpenAI } from "@langchain/openai";

const MODEL_NAME = "gpt-4o";

const WriterAnnotation = Annotation.Root({
  messages: GenerativeUIAnnotation.spec.messages,
  ui: GenerativeUIAnnotation.spec.ui,
  context: Annotation<{ writer?: { selected?: string } } | undefined>(),
});

type WriterState = typeof WriterAnnotation.State;
type WriterUpdate = Promise<typeof WriterAnnotation.Update>;

async function prepare(
  state: WriterState,
  config: LangGraphRunnableConfig,
): WriterUpdate {
  const ui = typedUi<typeof ComponentMap>(config);
  const model = new ChatAnthropic({ model: MODEL_NAME });

  // create an initial draft of the document
  const CreateTextDocumentTool = z.object({
    title: z.string(),
    description: z.string(),
  });

  const initStream = await model
    .bindTools([
      {
        name: "draft_text_document",
        description:
          "Prepare a text document for the user with a short title and short description for browsing purposes. " +
          "Can be also used when creating a new version of the document.",
        schema: CreateTextDocumentTool,
      } as const,
    ])
    .stream([
      ...(state.context?.writer?.selected
        ? [
            {
              type: "system" as const,
              content: state.context.writer?.selected
                ? `Selected text in question: ${state.context.writer?.selected}`
                : "",
            },
          ]
        : []),
      ...state.messages,
    ]);

  const id = uuidv4();
  let message: AIMessageChunk | undefined;

  for await (const chunk of initStream) {
    message = message?.concat(chunk) ?? chunk;

    const tool = message.tool_calls?.find(
      findToolCall("draft_text_document")<typeof CreateTextDocumentTool>,
    )?.args;

    if (tool) {
      ui.push(
        { id, name: "writer", props: { ...tool, isGenerating: true } },
        { message, merge: true },
      );
    }
  }

  return { messages: message ? [message] : [] };
}

async function writer(
  state: WriterState,
  config: LangGraphRunnableConfig,
): WriterUpdate {
  const ui = typedUi<typeof ComponentMap>(config);

  const lastMessage = state.messages.at(-1);
  const lastUi = state.ui.findLast(
    (i) => i.name === "writer" && i.metadata.message_id === lastMessage?.id,
  );

  if (!lastUi || !lastMessage) return {};
  const { id } = lastUi;

  const contentStream = await new ChatAnthropic({ model: MODEL_NAME })
    .withConfig({ tags: ["nostream"] }) // do not stream to the UI
    .stream([
      {
        role: "system",
        content:
          "Write a text document based on the user's request. " +
          "Only output the content, do not ask any additional questions." +
          (state.context?.writer?.selected
            ? `\n\nSelected text in question: ${state.context.writer?.selected}`
            : ""),
      },
      ...state.messages.slice(0, -1),
    ]);

  let contentMessage: AIMessageChunk | undefined;
  for await (const chunk of contentStream) {
    contentMessage = contentMessage?.concat(chunk) ?? chunk;
    const content = contentMessage?.text ?? "";

    ui.push(
      { id, name: "writer", props: { content, isGenerating: true } },
      { message: lastMessage, merge: true },
    );
  }

  ui.push(
    { id, name: "writer", props: { isGenerating: false } },
    { message: lastMessage, merge: true },
  );

  return { messages: [] };
}

async function suggestions(state: WriterState): WriterUpdate {
  const messages: BaseMessageLike[] = state.messages.slice();
  const lastMessage = messages.at(-1);

  if (!isBaseMessage(lastMessage) || !isAIMessage(lastMessage)) {
    return {};
  }

  for (const tool of lastMessage.tool_calls ?? []) {
    if (!tool.id) continue;
    messages.push({ type: "tool", content: "Finished", tool_call_id: tool.id });
  }

  const model = new ChatOpenAI({ model: MODEL_NAME });
  const finish = await model.invoke(messages);
  messages.push(finish);

  return { messages: messages };
}

export const graph = new StateGraph(WriterAnnotation)
  .addNode("prepare", prepare)
  .addNode("writer", writer)
  .addNode("suggestions", suggestions)
  .addEdge(START, "prepare")
  .addEdge("prepare", "writer")
  .addEdge("writer", "suggestions")
  .compile();
