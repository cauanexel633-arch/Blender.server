# Blender AI Cloud — Project overview

## Architecture

The system has three planes:

1. Control plane: FastAPI manages projects, job records, status and dispatch.
2. MCP plane: a separate MCP Streamable HTTP server exposes Blender actions to compatible AI agents.
3. Execution plane: Docker workers claim jobs and run Blender with --background using a constrained Python entrypoint.

## Main folders

- apps/: dashboard and API container entrypoint
- backend/: FastAPI, MCP server, schemas, agents and services
- blender_engine/: Blender runtime, discovery and validation
- workers/: Docker worker and job execution
- infrastructure/: cloud deployment configuration
- scripts/: Windows PowerShell helpers
- tests/: automated tests
- docs/: architecture, deployment and interaction manual

## Local startup on Windows

1. Install Git and Docker Desktop with WSL2 enabled.
2. Extract the project archive and open PowerShell in the blender-ai-cloud folder.
3. Run Copy-Item .env.example .env.
4. Edit .env and set strong API_SECRET, MCP_ACCESS_TOKEN and WORKER_TOKEN values.
5. Run .\\scripts\\start.ps1.
6. Check http://localhost:8000/health and open http://localhost:8000/docs.
7. Dashboard: http://localhost:3000. MCP: http://localhost:8001/mcp.

## MCP client

Use the Streamable HTTP endpoint http://localhost:8001/mcp and header Authorization: Bearer YOUR_MCP_ACCESS_TOKEN. See docs/INTERACTIONS.md for the complete tool manual.

## Production notes

Deploy the dashboard separately if desired. Run API and MCP as authenticated container services. Run Blender workers as ephemeral container jobs. Use PostgreSQL and S3-compatible storage for shared state and assets. Configure cloud IAM so only the API can start workers. Add quotas, CPU/RAM/time limits, HTTPS, monitoring and backups before exposing the service to untrusted users.

This repository's starter architecture does not mean every Blender feature or cloud integration is production-complete. Test the worker image and each desired operator against the target Blender build.
