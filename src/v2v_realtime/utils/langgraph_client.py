import requests
import uuid
import time

API_URL = "http://localhost:2024"
ASSISTANT_ID = "agent"


def create_thread():
    resp = requests.post(f"{API_URL}/threads", json={"metadata": {}})
    resp.raise_for_status()
    return resp.json()["thread_id"]


def send_message(thread_id: str, user_message: str, max_wait: int = 15):
    """
    Sends a message to the specified thread and prints all assistant ('ai') replies in the history (non-streaming).
    Polls the history endpoint until at least one 'ai' message is found or until max_wait seconds have passed.
    """
    message_id = str(uuid.uuid4())
    payload = {
        "assistant_id": ASSISTANT_ID,
        "input": {
            "messages": [
                {
                    "type": "human",
                    "id": message_id,
                    "content": [{"type": "text", "text": user_message}],
                }
            ]
        },
    }
    response = requests.post(
        f"{API_URL}/threads/{thread_id}/runs",
        json=payload,
        headers={"Content-Type": "application/json"},
    )
    response.raise_for_status()

    payload = {"limit": 1000}
    ai_messages = []
    for _ in range(max_wait):
        response = requests.post(
            f"{API_URL}/threads/{thread_id}/history",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        history = response.json()
        ai_messages = []
        for step in history:
            messages = step.get("values", {}).get("messages", [])
            for msg in messages:
                if msg.get("type") == "ai" and "content" in msg:
                    ai_messages.append(msg["content"])
        if ai_messages:
            break
        time.sleep(1)
    return ai_messages


if __name__ == "__main__":
    thread_id = create_thread()
    print(f"Created thread: {thread_id}")
    user_message = input("Enter your message: ")
    ai_messages = send_message(thread_id, user_message)
    print("\n--- Assistant Replies ---")
    print(ai_messages)
