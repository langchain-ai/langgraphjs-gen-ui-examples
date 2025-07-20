import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ALL_TOOL_DESCRIPTIONS } from "../index";
import { SupervisorState, SupervisorUpdate } from "../types";
import { formatMessages } from "@/agent/utils/format-messages";
import { ChatOpenAI } from "@langchain/openai";

export async function router(
  state: SupervisorState,
): Promise<Partial<SupervisorUpdate>> {
  const routerDescription = `The route to take based on the user's input.
${ALL_TOOL_DESCRIPTIONS}
- generalInput: handles all other cases where the above tools don't apply
`;
  const routerSchema = z.object({
    route: z
      .enum([
        "stockbroker",
        "tripPlanner",
        "openCode",
        "orderPizza",
        "generalInput",
        "writerAgent",
      ])
      .describe(routerDescription),
  });
  const routerTool = {
    name: "router",
    description: "A tool to route the user's query to the appropriate tool.",
    schema: routerSchema,
  };

  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
  })
    .bindTools([routerTool], { tool_choice: "router" })
    .withConfig({ tags: ["langsmith:nostream"] });

  const prompt = `You're a highly helpful AI assistant, tasked with routing the user's query to the appropriate tool.
You should analyze the user's input, and choose the appropriate tool to use.`;

  const allMessagesButLast = state.messages.slice(0, -1);
  const lastMessage = state.messages.at(-1);

  const formattedPreviousMessages = formatMessages(allMessagesButLast);
  const formattedLastMessage = lastMessage ? formatMessages([lastMessage]) : "";

  const humanMessage = `Here is the full conversation, excluding the most recent message:
  
${formattedPreviousMessages}

Here is the most recent message:

${formattedLastMessage}

Please pick the proper route based on the most recent message, in the context of the entire conversation.`;

  const response = await llm.invoke([
    { role: "system", content: prompt },
    { role: "user", content: humanMessage },
  ]);

  const toolCall = response.tool_calls?.[0]?.args as
    | z.infer<typeof routerSchema>
    | undefined;
  if (!toolCall) {
    throw new Error("No tool call found in response");
  }

  return {
    next: toolCall.route,
  };
}
