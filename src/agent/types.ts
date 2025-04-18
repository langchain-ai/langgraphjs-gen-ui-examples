import { MessagesAnnotation, Annotation } from "@langchain/langgraph";
import {
  RemoveUIMessage,
  UIMessage,
  uiMessageReducer,
} from "@langchain/langgraph-sdk/react-ui/server";

export const GenerativeUIAnnotation = Annotation.Root({
  messages: MessagesAnnotation.spec["messages"],
  ui: Annotation<
    UIMessage[],
    UIMessage | RemoveUIMessage | (UIMessage | RemoveUIMessage)[]
  >({ default: () => [], reducer: uiMessageReducer }),
  timestamp: Annotation<number>,
  next: Annotation<
    "stockbroker" | "tripPlanner" | "openCode" | "orderPizza" | "generalInput" | "math"
  >(),
});

export type GenerativeUIState = typeof GenerativeUIAnnotation.State;

export type Accommodation = {
  id: string;
  name: string;
  price: number;
  rating: number;
  city: string;
  image: string;
};

export type Price = {
  ticker: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  time: string;
};

export type Snapshot = {
  price: number;
  ticker: string;
  day_change: number;
  day_change_percent: number;
  market_cap: number;
  time: string;
};
