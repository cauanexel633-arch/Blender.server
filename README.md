# Blender AI Cloud

Cloud-first Blender automation service built with FastAPI, MCP Streamable HTTP, Blender Headless workers and Docker.

## Project source

The complete source bundle is available in `blender-ai-cloud.zip`. Extract it to obtain the application source tree.

## Documentation

- `docs/INTERACTIONS.md` — full guide to MCP tools, API endpoints, arguments, examples, workflows, limitations and security.
- `README-project.md` — project setup and architecture overview.

## Status

This is an early development starter. Blender operations are declarative and restricted; discovery does not guarantee every UI operator works in background mode. Advanced sculpting, complete Geometry Nodes authoring, rigging, animation and physics workflows require further implementation.

## Security

Use strong independent API, MCP and worker tokens. Expose MCP only over HTTPS in production. Never expose worker credentials to AI clients or enable arbitrary Python execution from untrusted prompts.
