import { StateGraph, START, END } from "@langchain/langgraph";
import { stockbrokerGraph } from "../stockbroker";
import { tripPlannerGraph } from "../trip-planner";
import { graph as openCodeGraph } from "../open-code";
import { graph as orderPizzaGraph } from "../pizza-orderer";
import { SupervisorAnnotation, SupervisorState } from "./types";
import { generalInput } from "./nodes/general-input";
import { router } from "./nodes/router";
import { graph as mathAgentGraph } from "../math";

export const ALL_TOOL_DESCRIPTIONS = `- stockbroker: can fetch the price of a ticker, purchase/sell a ticker, or get the user's portfolio
- tripPlanner: helps the user plan their trip. it can suggest restaurants, and places to stay in any given location.
- openCode: can write a React TODO app for the user. Only call this tool if they request a TODO app.
- orderPizza: can order a pizza for the user
- math: can perform math operations. Always call this tool if the user requests a math operation, no matter how simple it may seem.`;

export const ALL_TOOL_NAMES: ["stockbroker", "tripPlanner", "openCode", "orderPizza", "generalInput", "math"] = ["stockbroker", "tripPlanner", "openCode", "orderPizza", "generalInput", "math"];

function handleRoute(
  state: SupervisorState,
): "stockbroker" | "tripPlanner" | "openCode" | "orderPizza" | "generalInput" | "math" {
  return state.next;
}

const builder = new StateGraph(SupervisorAnnotation)
  .addNode("router", router)
  .addNode("stockbroker", stockbrokerGraph)
  .addNode("tripPlanner", tripPlannerGraph)
  .addNode("openCode", openCodeGraph)
  .addNode("orderPizza", orderPizzaGraph)
  .addNode("generalInput", generalInput)
  .addNode("math", mathAgentGraph)

  .addConditionalEdges("router", handleRoute, ALL_TOOL_NAMES)
  .addEdge(START, "router")
  .addEdge("stockbroker", END)
  .addEdge("tripPlanner", END)
  .addEdge("openCode", END)
  .addEdge("orderPizza", END)
  .addEdge("generalInput", END)
  .addEdge("math", END);

export const graph = builder.compile();
graph.name = "Generative UI Agent";
