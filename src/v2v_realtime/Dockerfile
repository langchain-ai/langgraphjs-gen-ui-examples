# Use the official Python image from the Docker Hub
FROM python:3.10-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Create and activate a virtual environment
RUN uv venv --python 3.10
ENV PATH="/app/.venv/bin:$PATH"

# Install the dependencies
RUN uv pip install --no-cache-dir -r requirements.txt

# Copy the FastAPI app code into the container
COPY . .

# Expose the port that the app runs on
EXPOSE 8765

# Command to run the FastAPI app using uvicorn
CMD ["python", "app.py"]