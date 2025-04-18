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

  const response = await llm.invoke([
    {
      role: "system",
      content:
        "You are an AI assistant who helps users book trips. Use the user's most recent message(s) to contextually generate a response.",
    },
    ...state.messages,
  ]);

  const listAccommodationsToolCall = response.tool_calls?.find(
    findToolCall("list-accommodations")<typeof listAccommodationsSchema>,
  );
  const listRestaurantsToolCall = response.tool_calls?.find(
    findToolCall("list-restaurants")<typeof listRestaurantsSchema>,
  );

  if (!listAccommodationsToolCall && !listRestaurantsToolCall) {
    throw new Error("No tool calls found");
  }

  if (listAccommodationsToolCall) {
    ui.push(
      {
        name: "accommodations-list",
        props: {
          toolCallId: listAccommodationsToolCall.id ?? "",
          ...getAccommodationsListProps(state.tripDetails),
        },
      },
      { message: response },
    );
  }

  if (listRestaurantsToolCall) {
    ui.push(
      {
        name: "restaurants-list",
        props: { tripDetails: state.tripDetails },
      },
      { message: response },
    );
  }

  return {
    messages: [response],
  };
}
