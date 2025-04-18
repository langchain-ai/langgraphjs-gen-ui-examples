import { ChatAnthropic } from "@langchain/anthropic";
import { Annotation, Command, END, interrupt, Send, START, StateGraph } from "@langchain/langgraph";
import { GenerativeUIAnnotation } from "../types";
import { z } from "zod";
import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import { HumanInterrupt } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

const MathAgentAnnotation = Annotation.Root({
  messages: GenerativeUIAnnotation.spec.messages,
  toolCallArgs: Annotation<Record<string, any>>(),
});

const workflow = new StateGraph(MathAgentAnnotation)
  .addNode("callModel", async (state) => {
    const mathSchema = z
      .object({
        operation: z
          .string()
          .describe("The operation to perform. E.g. 'add' or 'subtract'"),
        numbers: z
          .array(z.number())
          .describe("The numbers to perform the operation on"),
      })
      .describe("The schema for math operations");
    const model = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
    }).bindTools([
      {
        name: "math_operation",
        description: "A tool to perform math operations.",
        schema: mathSchema,
      }
    ])

    const response = await model.invoke([
      {
        role: "system",
        content:
          "You are a helpful AI assistant, tasked with assisting the user with their math questions. You should ALWAYS use the math tool to perform calculations, no matter how simple they may seem. Additionally, always execute tools in parallel, if the user requests multiple calculations.",
      },
      ...state.messages,
    ]);

    const toolCalls = response.tool_calls;

    return toolCalls?.map((tc) => new Command({
      update: {
        messages: [response],
      },
      goto: new Send("executeTool", {
        toolCallArgs: tc.args,
      }),
    }))
  }, {
    ends: ["executeTool"],
  })
  .addNode("executeTool", async (state) => {
    if (state.toolCallArgs.operation === "add") {
      console.log("INTERRUPTING")
      // Interrupt!
      const interruptSchema: HumanInterrupt = {
        action_request: {
          action: "Math Request",
          args: state.toolCallArgs,
        },
        config: {
          allow_accept: true,
          allow_ignore: true,
          allow_respond: true,
          allow_edit: true,
        },
        description: "Some math things going on here"
      }

      interrupt(interruptSchema)
    }

    console.log("After executeTool!");
    return {};
  })
  .addEdge(START, "callModel")
  .addEdge("executeTool", END);

export const graph = workflow.compile();
graph.name = "Math Agent Graph";
