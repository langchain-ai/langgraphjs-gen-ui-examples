import { Email, EmailAgentState, EmailAgentUpdate } from "../types";
import { HumanInterrupt, HumanResponse } from "@langchain/langgraph/prebuilt";
import { interrupt } from "@langchain/langgraph";

export async function interruptNode(
  state: EmailAgentState,
): Promise<EmailAgentUpdate> {
  if (!state.email) {
    throw new Error("Can not interrupt if email is undefined.");
  }

  const description = `# New Email
  
## Subject
${state.email.subject}

## To
${state.email.to}

## Body
${state.email.body}

## Response Instructions

- **Response**: Any response submitted will be passed to an LLM to rewrite the email. It can rewrite the email body, subject, or recipient.

- **Edit or Accept**: Editing/Accepting the email will send the email.

- **Ignore**: Ignoring the email will end the conversation, and the email will not be sent.`;

  const res = interrupt<HumanInterrupt, HumanResponse[]>(
    {
      action_request: {
        action: "New Email Draft",
        args: {
          ...state.email,
        },
      },
      description,
      config: {
        allow_ignore: true,
        allow_respond: true,
        allow_edit: true,
        allow_accept: true,
      },
    },
  )[0];

  if (["ignore", "response", "accept"].includes(res.type)) {
    return {
      humanResponse: res,
    };
  }

  if (
    typeof res.args !== "object" ||
    !res.args ||
    !("subject" in res.args) ||
    !("body" in res.args) ||
    !("to" in res.args)
  ) {
    throw new Error(
      "If response type is edit, args must be an object with 'subject', 'body', and 'to' fields.",
    );
  }

  const { subject, body, to } = res.args as Email;

  return {
    email: {
      subject,
      body,
      to,
    },
    humanResponse: res,
  };
}
