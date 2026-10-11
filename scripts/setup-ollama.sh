#!/usr/bin/env bash
# scripts/setup-ollama.sh — Setup and pull Ollama gemma4 model
set -euo pipefail

echo "=== Setting up Ollama for E-Broker ==="

if ! command -v ollama &> /dev/null; then
    echo "Error: 'ollama' is not installed."
    echo "Install it via: curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

# Check if Ollama server is running
if ! curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama is not running. Starting background server..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
fi

MODEL="${1:-gemma4:latest}"
echo "Pulling model: $MODEL..."
ollama pull "$MODEL"

echo "Verifying available models..."
curl -sf http://localhost:11434/api/tags | grep -q "gemma4" && echo "✅ Model $MODEL ready in Ollama." || echo "⚠️ Model check returned non-zero, check ollama list."

echo "=== Ollama setup complete ==="

