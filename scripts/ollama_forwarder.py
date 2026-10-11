"""Expose host Ollama (127.0.0.1:11434) to Docker containers.

Ollama binds loopback-only, so containers reaching the host via
host.docker.internal get refused. This forwarder listens on all interfaces
and relays to 127.0.0.1:11434. The api container then uses
OLLAMA_HOST=http://host.docker.internal:11435.

Run: nohup ./venv/bin/python scripts/ollama_forwarder.py > logs/ollama-forwarder.log 2>&1 &
"""
import asyncio

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 11435
TARGET_HOST = "127.0.0.1"
TARGET_PORT = 11434


async def relay(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionResetError, BrokenPipeError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_r: asyncio.StreamReader, client_w: asyncio.StreamWriter) -> None:
    try:
        upstream_r, upstream_w = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
    except OSError:
        client_w.close()
        return
    await asyncio.gather(relay(client_r, upstream_w), relay(upstream_r, client_w))


async def main() -> None:
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(f"forwarding {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
