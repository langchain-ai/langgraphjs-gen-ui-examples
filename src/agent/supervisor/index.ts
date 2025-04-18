import { StateGraph, START, END } from "@langchain/langgraph";
import { stockbrokerGraph } from "../stockbroker";
import { tripPlannerGraph } from "../trip-planner";
import { graph as openCodeGraph } from "../open-code";
import { graph as orderPizzaGraph } from "../pizza-orderer";
import { SupervisorAnnotation, SupervisorState, SupervisorZodConfiguration } from "./types";
import { generalInput } from "./nodes/general-input";
import { router } from "./nodes/router";

export const ALL_TOOL_DESCRIPTIONS = `- stockbroker: can fetch the price of a ticker, purchase/sell a ticker, or get the user's portfolio
- tripPlanner: helps the user plan their trip. it can suggest restaurants, and places to stay in any given location.
- openCode: can write a React TODO app for the user. Only call this tool if they request a TODO app.
- orderPizza: can order a pizza for the user`;

function handleRoute(
  state: SupervisorState,
): "stockbroker" | "tripPlanner" | "openCode" | "orderPizza" | "generalInput" {
  return state.next;
}

const builder = new StateGraph(SupervisorAnnotation, SupervisorZodConfiguration)
  .addNode("router", router)
  .addNode("stockbroker", stockbrokerGraph)
  .addNode("tripPlanner", tripPlannerGraph)
  .addNode("openCode", openCodeGraph)
  .addNode("orderPizza", orderPizzaGraph)
  .addNode("generalInput", generalInput)

  .addConditionalEdges("router", handleRoute, [
    "stockbroker",
    "tripPlanner",
    "openCode",
    "orderPizza",
    "generalInput",
  ])
  .addEdge(START, "router")
  .addEdge("stockbroker", END)
  .addEdge("tripPlanner", END)
  .addEdge("openCode", END)
  .addEdge("orderPizza", END)
  .addEdge("generalInput", END);

export const graph = builder.compile();
graph.name = "Generative UI Agent";
