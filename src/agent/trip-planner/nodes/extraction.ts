import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { TripDetails, TripPlannerState, TripPlannerUpdate } from "../types";
import { z } from "zod";
import { ToolMessage } from "@langchain/langgraph-sdk";
import { formatMessages } from "@/agent/utils/format-messages";
import { DO_NOT_RENDER_ID_PREFIX } from "@/constants";

function calculateDates(
  startDate: string | undefined,
  endDate: string | undefined,
): { startDate: Date; endDate: Date } {
  const now = new Date();

  if (!startDate && !endDate) {
    // Both undefined: 4 and 5 weeks in future
    const start = new Date(now);
    start.setDate(start.getDate() + 28); // 4 weeks
    const end = new Date(now);
    end.setDate(end.getDate() + 35); // 5 weeks
    return { startDate: start, endDate: end };
  }

  if (startDate && !endDate) {
    // Only start defined: end is 1 week after
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { startDate: start, endDate: end };
  }

  if (!startDate && endDate) {
    // Only end defined: start is 1 week before
    const end = new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { startDate: start, endDate: end };
  }

  // Both defined: use as is
  return {
    startDate: new Date(startDate!),
    endDate: new Date(endDate!),
  };
}

export async function extraction(
  state: TripPlannerState,
): Promise<TripPlannerUpdate> {
  const schema = z.object({
    location: z
      .string()
      .describe(
        "The location to plan the trip for. Can be a city, state, or country.",
      ),
    startDate: z
      .string()
      .optional()
      .describe("The start date of the trip. Should be in YYYY-MM-DD format"),
    endDate: z
      .string()
      .optional()
      .describe("The end date of the trip. Should be in YYYY-MM-DD format"),
    numberOfGuests: z
      .number()
      .describe(
        "The number of guests for the trip. Should default to 2 if not specified",
      ),
  });

  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools([
    {
      name: "extract",
      description: "A tool to extract information from a user's request.",
      schema: schema,
    },
  ]);

  const USER_PROFILE = {
      "id": "user123",
      "name": "Alice",
      "profile": {
        "personalHistory": "Alice was born in Munich and moved to Berlin for her studies. She holds a Master’s degree in Computer Science from TU Berlin. From a young age, she was fascinated by how machines learn and evolve, which led her into the field of artificial intelligence. She started her career as a backend developer and gradually transitioned into AI-focused roles. Outside of work, Alice enjoys hiking in the Alps, painting, and participating in tech meetups.",
        "education": "M.Sc. in Computer Science, Technische Universität Berlin",
        "expertise": "Machine learning, deep learning, distributed systems, transformer models, and open-source AI contributions.",
        "projectA": {
          "title": "Multilingual Generative Language Model",
          "description": "Led the development of a multilingual transformer-based model capable of generating coherent text in over 15 languages. The project aimed to enhance NLP capabilities in underrepresented languages.",
          "technologies": ["PyTorch", "Transformers", "HuggingFace", "TensorBoard"]
        },
        "projectB": {
          "title": "Federated Learning System",
          "description": "Built a federated learning pipeline enabling training on decentralized datasets across devices to maintain data privacy while improving model generalizability.",
          "technologies": ["Python", "gRPC", "TensorFlow Federated", "Docker", "Kubernetes"]
        },
        "currentLocation":"Delhi",
        "ongoingProjects": [
          "Experimenting with sparse attention mechanisms for large language models.",
          "Mentoring junior developers in the open-source AI community.",
          "Collaborating with a university lab on adversarial robustness in deep models."
        ]
      }
    }

  const prompt = `You’re an enthusiastic travel buddy named "Sunny" who chats with the user like a friend. You’ve been given the user’s profile (${USER_PROFILE}) so you can sprinkle in personal touches and even guess why they’re planning this trip.

Conversation Starter:

Greet warmly and mention something from their profile:

“Hey there! I remember you love street photography—ready to plan a trip full of colorful corners and candid moments?”

Spark curiosity about their dream destination:

“If you could teleport anywhere this instant, where would you land? A bustling city, a quiet beach, or maybe a mountain retreat?”

Uncover their why:

“I’m guessing you’re after this getaway to recharge after that big project at work—or is it to celebrate something special?”

Explore travel style and companions:

“Are you flying solo, road-tripping with friends, or bringing the whole family along?”

“Do you lean more toward adventurous hikes, lazy beach days, foodie tours, or cultural explorations?”

Nail down the basics (location, dates, guests):

“Which place are we looking at?” (city/state/country)

“Do you have dates in mind, or an ideal season?” (ask for YYYY‑MM‑DD if they know)

“How many people should I plan for?”

Bucket-list moments:

“Any must-do experiences on your list? Hot-air balloon ride, local cooking class, or maybe dancing under the northern lights?”

Extraction Rules:

location: The trip destination (city/state/country).

startDate/endDate: YYYY‑MM‑DD (optional; if unknown, ask for a season or month).

numberOfGuests: Integer (optional; if unknown, ask for a headcount).

Use the full conversation history to reuse provided details. Don’t guess or invent anything—if some info is missing, ask the user in your next message with a friendly follow-up.

Once all details are collected, reply with a warm confirmation like:

"Awesome! Planning a trip to [location] from [startDate] to [endDate] for [numberOfGuests] people. Let’s make it unforgettable! 🎉"
`;

  const humanMessage = `Here is the entire conversation so far:\n${formatMessages(state.messages)}`;

  const response = await model.invoke([
    { role: "system", content: prompt },
    { role: "human", content: humanMessage },
  ]);

  const toolCall = response.tool_calls?.[0];
  if (!toolCall) {
    return {
      messages: [response],
    };
  }
  const extractedDetails = toolCall.args as z.infer<typeof schema>;

  const { startDate, endDate } = calculateDates(
    extractedDetails.startDate,
    extractedDetails.endDate,
  );

  const extractionDetailsWithDefaults: TripDetails = {
    startDate,
    endDate,
    numberOfGuests:
      extractedDetails.numberOfGuests && extractedDetails.numberOfGuests > 0
        ? extractedDetails.numberOfGuests
        : 2,
    location: extractedDetails.location,
  };

  const extractToolResponse: ToolMessage = {
    type: "tool",
    id: `${DO_NOT_RENDER_ID_PREFIX}${uuidv4()}`,
    tool_call_id: toolCall.id ?? "",
    content: "Successfully extracted trip details",
  };

  return {
    tripDetails: extractionDetailsWithDefaults,
    messages: [response, extractToolResponse],
  };
}
