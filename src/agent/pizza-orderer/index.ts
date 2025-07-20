import { ChatAnthropic } from "@langchain/anthropic";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { GenerativeUIAnnotation } from "../types";
import { z } from "zod";
import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";

const PizzaOrdererAnnotation = Annotation.Root({
  messages: GenerativeUIAnnotation.spec.messages,
});

async function sleep(ms = 5000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const workflow = new StateGraph(PizzaOrdererAnnotation)
  .addNode("findStore", async (state) => {
    const findShopSchema = z
      .object({
        location: z
          .string()
          .describe(
            "The location the user is in. E.g. 'San Francisco' or 'New York'",
          ),
        pizza_company: z
          .string()
          .optional()
          .describe(
            "The name of the pizza company. E.g. 'Dominos' or 'Papa John's'. Optional, if not defined it will search for all pizza shops",
          ),
      })
      .describe("The schema for finding a pizza shop for the user");
    const model = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
    }).withStructuredOutput(findShopSchema, {
      name: "find_pizza_shop",
      includeRaw: true,
    });

    const response = await model.invoke([
      {
        role: "system",
        content:
          "You are a helpful AI assistant, tasked with extracting information from the conversation between you, and the user, in order to find a pizza shop for them.",
      },
      ...state.messages,
    ]);

    await sleep();

    const toolResponse: ToolMessage = {
      type: "tool",
      id: uuidv4(),
      content:
        "I've found a pizza shop at 1119 19th St, San Francisco, CA 94107. The phone number for the shop is 415-555-1234.",
      tool_call_id:
        (response.raw as unknown as AIMessage).tool_calls?.[0].id ?? "",
    };

    return {
      messages: [response.raw, toolResponse],
    };
  })
  .addNode("orderPizza", async (state) => {
    await sleep(1500);

    const placeOrderSchema = z
      .object({
        address: z
          .string()
          .describe("The address of the store to order the pizza from"),
        phone_number: z
          .string()
          .describe("The phone number of the store to order the pizza from"),
        order: z.string().describe("The full pizza order for the user"),
      })
      .describe("The schema for ordering a pizza for the user");
    const model = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
    }).withStructuredOutput(placeOrderSchema, {
      name: "place_pizza_order",
      includeRaw: true,
    });

    const response = await model.invoke([
      {
        role: "system",
        content:
          "You are a helpful AI assistant, tasked with placing an order for a pizza for the user.",
      },
      ...state.messages,
    ]);

    const toolResponse: ToolMessage = {
      type: "tool",
      id: uuidv4(),
      content: "Pizza order successfully placed.",
      tool_call_id:
        (response.raw as unknown as AIMessage).tool_calls?.[0].id ?? "",
    };

    return {
      messages: [response.raw, toolResponse],
    };
  })
  .addEdge(START, "findStore")
  .addEdge("findStore", "orderPizza")
  .addEdge("orderPizza", END);

export const graph = workflow.compile();
graph.name = "Order Pizza Graph";
