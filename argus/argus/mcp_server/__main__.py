"""`python -m argus.mcp_server` entrypoint."""
from .server import run_stdio

if __name__ == "__main__":
    run_stdio()
