import { TripPlannerState, TripPlannerUpdate } from "../types";
import { ChatOpenAI } from "@langchain/openai";
import { typedUi } from "@langchain/langgraph-sdk/react-ui/server";
import type ComponentMap from "../../../agent-uis/index";
import { z } from "zod";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getAccommodationsListProps } from "../utils/get-accommodations";
import { findToolCall } from "../../find-tool-call";

const listAccommodationsSchema = z
  .object({})
  .describe("A tool to list accommodations for the user");
const listRestaurantsSchema = z
  .object({})
  .describe("A tool to list restaurants for the user");

const ACCOMMODATIONS_TOOLS = [
  {
    name: "list-accommodations",
    description: "A tool to list accommodations for the user",
    schema: listAccommodationsSchema,
  },
  {
    name: "list-restaurants",
    description: "A tool to list restaurants for the user",
    schema: listRestaurantsSchema,
  },
];

export async function callTools(
  state: TripPlannerState,
  config: LangGraphRunnableConfig,
): Promise<TripPlannerUpdate> {
  if (!state.tripDetails) {
    throw new Error("No trip details found");
  }

  const ui = typedUi<typeof ComponentMap>(config);

  const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(
    ACCOMMODATIONS_TOOLS,
  );

  const systemPrompt = {
    role: "system",
    content: `You are an AI assistant who helps users book trips. When a user asks about a trip or destination, you should:
1. Use the list-accommodations tool to show available accommodations.
2. Use the list-restaurants tool to show local dining options.

After using these tools, always summarize the results in a friendly, readable text reply for the user.
- List the top accommodations and restaurants you found, including their names, prices, and ratings if available.
- If no results are found, say so.
- Always include this summary in your reply, even if the user did not specifically ask for it.

These tools should be used for ANY trip-related query, even if the user hasn't specifically asked about accommodations or restaurants yet.

Current trip details:
- Location: ${state.tripDetails.location}
- Start Date: ${state.tripDetails.startDate}
- End Date: ${state.tripDetails.endDate}
- Number of Guests: ${state.tripDetails.numberOfGuests}`,
  };

  let messages: any[] = [systemPrompt, ...state.messages];
  let response = await llm.invoke(messages);

  // Tool call loop
  while (response.tool_calls && response.tool_calls.length > 0) {
    // 1. Generate tool messages for each tool call
    const toolMessages = response.tool_calls
      .map((toolCall: any) => {
        if (toolCall.name === "list-accommodations") {
          const accommodationsData = getAccommodationsListProps(
            state.tripDetails as import("../types").TripDetails,
          );
          ui.push(
            {
              name: "accommodations-list",
              props: {
                toolCallId: toolCall.id ?? "",
                ...accommodationsData,
              },
            },
            { message: response },
          );
          return {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(accommodationsData.accommodations),
          };
        } else if (toolCall.name === "list-restaurants") {
          ui.push(
            {
              name: "restaurants-list",
              props: {
                tripDetails:
                  state.tripDetails as import("../types").TripDetails,
              },
            },
            { message: response },
          );
          return {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: "(Restaurant data coming soon!)",
          };
        }
        return null;
      })
      .filter(Boolean);

    // 2. Only send: systemPrompt, userMessages, last ai message, tool messages
    messages = [systemPrompt, ...state.messages, response, ...toolMessages];
    response = await llm.invoke(messages);
    if (
      typeof response.content === "string" &&
      response.content.trim() !== ""
    ) {
      break;
    }
  }

  return {
    messages: [response],
    ui: ui.items,
    timestamp: Date.now(),
  };
}
