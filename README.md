# LangGraph Generative UI Examples

This repository contains a series of agents intended to be used with the [Agent Chat UI](https://agentchat.vercel.app) ([repo](https://github.com/langchain-ai/agent-chat-ui)).

![Generative UI Example](./static/gen_ui.gif)

# Setup

> [!TIP]
> 🎥 Want to watch a video walkthrough instead? Click [here](https://youtu.be/sCqN01R8nIQ).

First, clone this repository:

```bash
git clone https://github.com/langchain-ai/langgraphjs-gen-ui-examples.git

cd langgraphjs-gen-ui-examples
```

Then, install dependencies:

```bash
# pnpm is the default package manager in this project
pnpm install
```

Next, copy the `.env.example` file, and set the necessary environment variables:

```bash
cp .env.example .env
```

Only [OpenAI](https://platform.openai.com/), and [Google GenAI](https://aistudio.google.com/), API keys are required ([Financial Datasets](https://www.financialdatasets.ai/) is only required if you want to call the stockbroker graph, and [Anthropic](https://console.anthropic.com) is only used in the pizza ordering agent).

```bash
# Required
OPENAI_API_KEY=""
GOOGLE_API_KEY=""

# Optional, but recommended for best in class tracing and observability.
# LANGSMITH_PROJECT="default"
# LANGSMITH_API_KEY=""
# LANGSMITH_TRACING_V2=true

# Optional
# ANTHROPIC_API_KEY=""
# FINANCIAL_DATASETS_API_KEY=""
```

Start the LangGraph server:

```bash
pnpm agent
```

You should see output similar to:

```
          Welcome to

╦  ┌─┐┌┐┌┌─┐╔═╗┬─┐┌─┐┌─┐┬ ┬
║  ├─┤││││ ┬║ ╦├┬┘├─┤├─┘├─┤
╩═╝┴ ┴┘└┘└─┘╚═╝┴└─┴ ┴┴  ┴ ┴.js

- 🚀 API: http://localhost:2024
- 🎨 Studio UI: https://smith.langchain.com/studio?baseUrl=http://localhost:2024
```

# Example usage

The following are some prompts, and corresponding graph IDs you can use to test the agents:

- Graph ID: `agent`:
  - `What can you do?` - Will list all of the tools/actions it has available
  - `Show me places to stay in <insert location here>` - Will trigger a generative UI travel agent which renders a UI to select accommodations.
  - `Recommend some restaurants for me in <insert location here>` - Will trigger a generative UI travel agent which renders a UI to select restaurants.
  - `What's the current price of <insert company/stock ticker here>` - Will trigger a generative UI stockbroker agent which renders the current price of the stock.
  - `I want to buy <insert quantity here> shares of <insert company/stock ticker here>.` - Will trigger a generative UI stockbroker agent which renders a UI to buy a stock at its current price.
  - `Show me my portfolio` - Will trigger a generative UI stockbroker agent which renders a UI to show the user's portfolio.
  - `Write a React TODO app for me` - Will trigger the `Open Code` agent, which is a dummy re-implementation of Anthropic's Claude Code CLI. This agent is solely used to demonstrate different UI components you can render with LangGraph, and will not actually generate new code. The planning steps & generated code are all static values.
  - `Order me a pizza <include optional topping instructions> in <include location here>` - Used to demonstrate how tool calls/results are rendered.
- Graph ID: `chat`:
  - This is a plain chat agent, which simply passes the conversation to an LLM and generates a text response. This does not have access to any tools, or generative UI components.
- Graph ID: `email_agent`:
  - `Write me an email to <insert email here> about <insert email description here>` - Will generate an email for you, addressed to the email address you specified. Used to demonstrate how you can trigger the built in Human in the Loop (HITL) UI in the Agent Chat UI. This agent will throw an `interrupt`, with the standard [`HumanInterrupt`](https://github.com/langchain-ai/langgraph/blob/84c956bc8c3b2643819677bea962425e02e15ba4/libs/prebuilt/langgraph/prebuilt/interrupt.py#L42) schema, which the Agent Chat UI is able to automatically detect, and render a HITL UI component to manage the interrupt.

## Devcontainer setup

[![Open in Dev Containers](https://img.shields.io/static/v1?label=Dev%20Containers&message=Open&color=blue)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/langchain-ai/langgraphjs-gen-ui-examples)

Click the badge above if you wanna, you can run the project in a devcontainer.

Otherwise, clone the repo and open the directory with VSCode and run it in a devcontainer.

During the startup process a `.env` file will be created, starting from `.env.example`. All dependecies will be installed automatically, so no need for a `pnpm i `.

You need to set you all the required API keys in `.env` file.

Start the LangGraph server:

```bash
pnpm agent --host 127.0.0.1
```

# Agents

Key

- [Supervisor](#supervisor)
  - [Stockbroker](#stockbroker)
  - [Trip Planner](#trip-planner)
  - [Open Code](#open-code)
  - [Order Pizza](#order-pizza)
- [Chat Agent](#chat-agent)
- [Email Agent](#email-agent)

## Supervisor

This is the default agent, which has access to a series of subgraphs it can call, depending on the context of the conversation. This includes the following agents:

- [Stockbroker](#stockbroker)
- [Trip Planner](#trip-planner)
- [Open Code](#open-code)
- [Order Pizza](#order-pizza)

This agent works by taking in the input, and passing it, along with the rest of the chat history to a `router` node. This node passes the entire chat history to Gemini 2.0 Flash, and forces it to call a tool, with the route to take based on the conversation.

If the context does not have a clear subgraph which should be called, it routes to the `General Input` node, which contains a single LLM call used to respond to the user's input.

### Stockbroker

The stockbroker agent has a series of tools available to it which will render generative UI components in the Agent Chat UI. It should be accessed via the `agent` graph ID, which means you'll need to go through the Supervisor agent to access it. The following are the prompts you can use to test the stockbroker agent:

- `What's the current price of <insert company/stock ticker here>` - Will trigger a generative UI stockbroker agent which renders the current price of the stock.
- `I want to buy <insert quantity here> shares of <insert company/stock ticker here>.` - Will trigger a generative UI stockbroker agent which renders a UI to buy a stock at its current price.
- `Show me my portfolio` - Will trigger a generative UI stockbroker agent which renders a UI to show the user's portfolio.

### Trip Planner

The trip planner agent has tools available to it which can render generative UI components for planning/booking trips. It should be accessed via the `agent` graph ID, which means you'll need to go through the Supervisor agent to access it. The following prompts will trigger the trip planner agent:

- `Show me places to stay in <insert location here>` - Will trigger a generative UI travel agent which renders a UI to select accommodations.
- `Recommend some restaurants for me in <insert location here>` - Will trigger a generative UI travel agent which renders a UI to select restaurants.

The agent will first extract the following information from your input, if present:

- `location` - Required field. This can be the city, state, or some other location for the trip.
- `startDate` - Optional field. The start date of the trip. Defaults to 4 weeks from now.
- `endDate` - Optional field. The end date of the trip. Defaults to 5 weeks from now.
- `numberOfGuests` - Optional field. The number of guests attending the trip. Defaults to 2.

The only field, `location`, is required, and the rest are optional.

### Open Code

This is a dummy code writing agent, used to demonstrate how you can implement generative UI components in agents. It should be accessed via the `agent` graph ID, which means you'll need to go through the Supervisor agent to access it. It is triggered by requesting the agent to write a React TODO app, like this:

- `Write a React TODO app for me`

This will then render a plan (these steps are static, and will always be the same). After that, it'll "generate" code (each plan item has a corresponding "generated code output") for each item in the plan. It only does this one at a time, and will not suggest the next part of generated code until after the previous suggestion has been accepted, rejected, or accepted for all future requests in this session. If you select that button, it will resume the graph, and continue through the rest of the steps, and suggest code without pausing to wait for your approval.

### Order Pizza

The order pizza agent is used to demonstrate how tool calls/results are rendered in the UI. It should be accessed via the `agent` graph ID, which means you'll need to go through the Supervisor agent to access it. You can trigger it via the following query:

- `Order me a pizza <include optional topping instructions> in <include location here>`

It will then call two tools, once to extract the fields from your input for the pizza order (order details, and location). After that, it calls the tool to "order" the pizza. Each of these tool calls will have corresponding tool call/result UI components rendered in the Agent Chat UI. These are the default UI components rendered when your graph calls a tool/returns a tool result.

## Chat Agent

The chat agent is a single LLM call, used to demonstrate the plain back and forth of a chat agent. It should be accessed via the `chat` graph ID. It does not have access to any tools, or generative UI components.

## Email Agent

The email agent is a dummy implementation of how you'd implement an email assistant with the Agent Chat UI. It is accessed via the `email_agent` graph ID. You can trigger it via the following query:

- `Write me an email to <insert email here> about <insert email description here>`

This will then call the graph which extracts fields from your input (or responds with a request for more information). Once it's extracted all of the required information it will interrupt, passing the standardized [`HumanInterrupt`](https://github.com/langchain-ai/langgraph/blob/84c956bc8c3b2643819677bea962425e02e15ba4/libs/prebuilt/langgraph/prebuilt/interrupt.py#L42) schema. The Agent Chat UI is able to detect when interrupts with this schema are thrown, and when it finds one it renders a UI component to handle actions by the user which are used to resume the graph.

The allowed actions are:

- `Accept` - If you accept the email as is, without making changes to any fields, it will "send" the email (emails aren't actually sent, just a message is displayed indicating the email was sent).
- `Edit` - If you edit any of the email fields and submit, it will "send" the email with the new values.
- `Respond` - If you send a text response back, it will be used to rewrite the email in some way, then interrupt again and wait for you to take an action.
- `Ignore` - This will send back an `ignore` response, and the graph will end without taking any actions.
- `Mark as resolved` - If you select this, it will resume the graph, but starting at the `__end__` node, causing the graph to end without taking any actions.
