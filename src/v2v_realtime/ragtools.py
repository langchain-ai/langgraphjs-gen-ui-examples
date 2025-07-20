import re
import json
from typing import Any

from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential
from azure.search.documents.aio import SearchClient
from rtmt import RTMiddleTier, Tool, ToolResult, ToolResultDirection

from utils.rag_summary_data import get_answer, QARequest
from utils.langgraph_client import send_message, create_thread

# New tool schema for langgraph
_langgraph_tool_schema = {
    "type": "function",
    "name": "langgraph_tool",
    "description": "Use this tool to send a message to a LangGraph backend and get a response.",
    "parameters": {
        "type": "object",
        "properties": {
            "thread_id": {
                "type": "string",
                "description": "Thread ID to use for the message (optional).",
            },
            "message": {
                "type": "string",
                "description": "Message to send to the backend.",
            },
        },
        "required": ["message"],  # Only message is required
        "additionalProperties": False,
    },
}


async def _langgraph_tool(args: Any) -> ToolResult:
    message = args["message"]
    thread_id = args.get("thread_id") or create_thread()
    result = send_message(thread_id, message)
    return ToolResult(
        json.dumps({"thread_id": thread_id, "response": result}),
        ToolResultDirection.TO_SERVER,
    )


def attach_rag_tools(
    rtmt: RTMiddleTier,
    credentials: AzureKeyCredential | DefaultAzureCredential,
    search_endpoint: str,
    search_index: str,
    semantic_configuration: str | None,
    identifier_field: str,
    content_field: str,
    embedding_field: str,
    title_field: str,
    use_vector_query: bool,
) -> None:
    if not isinstance(credentials, AzureKeyCredential):
        credentials.get_token(
            "https://search.azure.com/.default"
        )  # warm this up before we start getting requests
    search_client = SearchClient(
        search_endpoint, search_index, credentials, user_agent="RTMiddleTier"
    )

    # rtmt.tools["search"] = Tool(schema=_search_tool_schema, target=lambda args: _search_tool(search_client, semantic_configuration, identifier_field, content_field, embedding_field, use_vector_query, args))
    rtmt.tools["langgraph_tool"] = Tool(
        schema=_langgraph_tool_schema, target=lambda args: _langgraph_tool(args)
    )
