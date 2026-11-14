# Blender AI Cloud

Cloud-first Blender automation service built around FastAPI, MCP Streamable HTTP, Blender Headless workers and Docker.

## Source code

The complete project source archive is provided in the ChatGPT conversation as `blender-ai-cloud-updated.zip`. Extract its `blender-ai-cloud/` directory into this repository to add the full source tree. The GitHub connector used for this session can create text files and Git objects, but cannot transfer the local binary archive directly; the final source import therefore requires the PowerShell Git commands below.

## Documentation

- [Complete interaction manual](docs/INTERACTIONS.md) — every MCP tool, HTTP endpoint, arguments, examples, workflows, limitations and security notes.
- [Architecture and setup](README-project.md) — project overview, local development and deployment notes.

## Import the supplied project archive on Windows

Download and extract `blender-ai-cloud-updated.zip` from the conversation. Open PowerShell in the extracted `blender-ai-cloud` folder and run:

```powershell
git clone https://github.com/cauanexel633-arch/Blender.server.git ..\Blender.server
Copy-Item .\* ..\Blender.server\ -Recurse -Force
Set-Location ..\Blender.server
git add .
git commit -m "feat: add Blender AI Cloud source"
git push origin main
```

Review the copied files before committing. Do not commit `.env`, API keys, worker tokens, generated assets, local databases or caches.

## Local development

Requirements: Docker Desktop with WSL2 and Git. From the project root:

```powershell
Copy-Item .env.example .env
# Set strong API_SECRET, MCP_ACCESS_TOKEN and WORKER_TOKEN values in .env
.\scripts\start.ps1
```

Local endpoints:
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- MCP: http://localhost:8001/mcp
- Dashboard: http://localhost:3000

## Status and limitations

This is an early development starter. Blender operations are declarative and restricted. Operator discovery does not guarantee that every UI operator works in background mode. Advanced sculpting, complete Geometry Nodes authoring, rigging, animation, physics workflows and production-grade multi-tenant isolation require further implementation and validation.

## Security

Use strong independent API, MCP and worker tokens. Expose MCP only over HTTPS in production. Never expose worker credentials to AI clients or enable arbitrary Python execution from untrusted prompts. Keep `.env`, credentials, generated assets and local databases out of Git.
