import logging
import os
from pathlib import Path

from aiohttp import web
from azure.core.credentials import AzureKeyCredential
from azure.identity import AzureDeveloperCliCredential, DefaultAzureCredential
from dotenv import load_dotenv

from ragtools import attach_rag_tools
from rtmt import RTMiddleTier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicerag")


async def create_app():
    if not os.environ.get("RUNNING_IN_PRODUCTION"):
        logger.info("Running in development mode, loading from .env file")
        load_dotenv()

    llm_key = os.environ.get("AZURE_OPENAI_API_KEY")
    search_key = os.environ.get("AZURE_SEARCH_API_KEY")

    credential = None
    if not llm_key or not search_key:
        if tenant_id := os.environ.get("AZURE_TENANT_ID"):
            logger.info(
                "Using AzureDeveloperCliCredential with tenant_id %s", tenant_id
            )
            credential = AzureDeveloperCliCredential(
                tenant_id=tenant_id, process_timeout=60
            )
        else:
            logger.info("Using DefaultAzureCredential")
            credential = DefaultAzureCredential()
    llm_credential = AzureKeyCredential(llm_key) if llm_key else credential
    search_credential = AzureKeyCredential(search_key) if search_key else credential

    app = web.Application()

    rtmt = RTMiddleTier(
        credentials=llm_credential,
        endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        deployment=os.environ["AZURE_OPENAI_REALTIME_DEPLOYMENT"],
        voice_choice=os.environ.get("AZURE_OPENAI_REALTIME_VOICE_CHOICE") or "alloy",
    )
    rtmt.system_message = """
You are an assistant that must use the 'langgraph_tool' to handle all user queries.

Instructions:
1. For every user message, immediately forward it to the LangGraph backend using the 'langgraph_tool'.
2. Always include the full user message as the 'message' parameter. If a 'thread_id' is available from previous interactions, include it to maintain context; otherwise, omit it to start a new thread.
3. If the backend returns an error or is unavailable, inform the user: "Sorry, the backend is temporarily unavailable. Please try again later."
4. For multi-turn conversations, always preserve and use the thread context for accuracy.

Be efficient, accurate, and transparent in relaying information between the user and the backend.
""".strip()

    attach_rag_tools(
        rtmt,
        credentials=search_credential,
        search_endpoint=os.environ.get("AZURE_SEARCH_ENDPOINT"),
        search_index=os.environ.get("AZURE_SEARCH_INDEX"),
        semantic_configuration=os.environ.get("AZURE_SEARCH_SEMANTIC_CONFIGURATION", "")
        or None,
        identifier_field=os.environ.get("AZURE_SEARCH_IDENTIFIER_FIELD", "")
        or "chunk_id",
        content_field=os.environ.get("AZURE_SEARCH_CONTENT_FIELD", "") or "chunk",
        embedding_field=os.environ.get("AZURE_SEARCH_EMBEDDING_FIELD", "")
        or "text_vector",
        title_field=os.environ.get("AZURE_SEARCH_TITLE_FIELD", "") or "title",
        use_vector_query=(os.getenv("AZURE_SEARCH_USE_VECTOR_QUERY", "true") == "true"),
    )

    rtmt.attach_to_app(app, "/realtime")

    return app


if __name__ == "__main__":
    host = "localhost"
    port = 8765
    web.run_app(create_app(), host=host, port=port)
