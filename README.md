# ⭐ Azure DevOps MCP Server for Google Gemini Enterprise

This repository is a specialized fork of the official [microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp) server, adapted specifically to run as a **remote, StreamableHTTP, OAuth-protected** Model Context Protocol (MCP) server on **Google Cloud Run** for seamless integration with **Google Cloud Gemini Enterprise (GE)** data connectors.

---

## 📺 Overview & Architecture

While Microsoft's managed remote endpoint (`https://mcp.dev.azure.com/{org}`) requires Dynamic Client Registration (RFC 7591) which is currently restricted to VS Code and Visual Studio, this self-hosted implementation allows organizations to integrate their Azure DevOps software development lifecycle data into Gemini Enterprise without friction.

### Key Architectural Enhancements for Gemini Enterprise:

1. **StreamableHTTP Transport:** Replaces the local `stdio` transport with stateless HTTP/SSE over `POST /mcp`, meeting Gemini Enterprise preview requirements.
2. **Microsoft Entra ID OAuth 2.0 Middleware:** Validates inbound Bearer tokens from Gemini Enterprise, supporting flexible token audience formats (`api://{client_id}`, `{client_id}`, and `{ado_resource_id}`).
3. **MSAL On-Behalf-Of (OBO) Flow:** Automatically exchanges the user's Entra ID chat session token for an Azure DevOps user-impersonation token. All tool calls respect the exact read/write permissions of the signed-in user without storing static Personal Access Tokens (PAT).
4. **Automated `readOnlyHint` Metadata Injection:** Automatically annotates all query and read-only tools with `{ readOnlyHint: true }`. This guarantees that Gemini Enterprise recognizes non-mutating operations and does **not** prompt users with excessive approval confirmation widgets during simple data lookups.

---

## 📁 Modified & Added Files (Architecture Breakdown)

This project adapts the upstream codebase while preserving core tool logic. The table below outlines the primary modifications and additions introduced in this Gemini Enterprise specialized release:

| File Path                                            | Purpose & Changes                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/http-server.ts`](./src/http-server.ts)         | **Added:** Implements an Express HTTP server using `StreamableHTTPServerTransport` over `/mcp` and a `/healthz` probe. Implements safe token extraction to support raw PAT fallback without Base64 binary corruption. |
| [`src/auth-middleware.ts`](./src/auth-middleware.ts) | **Added:** Express middleware that verifies Microsoft Entra ID JWT Bearer tokens using `jwks-rsa`. Validates standard and custom audiences (`api://<client_id>`, `<client_id>`, `<resource_id>`).                     |
| [`src/obo.ts`](./src/obo.ts)                         | **Added:** Implements On-Behalf-Of token exchange via `@azure/msal-node`, converting inbound user chat tokens into Azure DevOps access tokens (`499b84ac-1321-427f-aa17-267ca6975798/.default`).                      |
| [`src/tools.ts`](./src/tools.ts)                     | **Modified:** Wraps tool registration to automatically inject `{ readOnlyHint: true }` metadata into read-only tool contracts, eliminating excessive confirmation widgets in GE chat.                                 |
| [`src/index.ts`](./src/index.ts)                     | **Modified:** Aligned token handling logic with HTTP server improvements to ensure consistent execution across both stdio and remote HTTP transports.                                                                 |
| [`Dockerfile`](./Dockerfile)                         | **Added:** Multi-stage Docker build utilizing Node 20 slim and Corepack for lightweight containerization on Cloud Run.                                                                                                |
| [`.env.example`](./.env.example)                     | **Added:** Template for required environment variables (`TENANT_ID`, `AZDO_ORG`, `CLIENT_ID`, `OAUTH_AUDIENCE`, `MCP_DOMAINS`).                                                                                       |

---

## 🚀 Setup, Installation & Deployment on Google Cloud Run

Follow this step-by-step guide from cloning the repository to running your containerized remote MCP server on Google Cloud Run.

### 📋 Prerequisites

Ensure you have the following CLI tools and account permissions installed and configured before proceeding:

- **Node.js (v20+) & npm/Corepack:** Required for installing project dependencies and executing local builds.
- **Google Cloud SDK (`gcloud` CLI):** Required for interacting with Google Cloud Secret Manager and deploying containers to Cloud Run.
- **Git:** Required for cloning and versioning the repository.
- **Microsoft Entra ID Access:** A tenant administrator or developer account capable of registering single-tenant OAuth client applications and granting delegated permissions.
- **Google Cloud Project:** An active GCP project with billing enabled and the Cloud Run and Secret Manager APIs activated.

### 1. Clone the Repository & Local Setup

Clone this specialized fork to your local terminal and install its Node.js dependencies:

```bash
# Clone the repository
git clone https://github.com/marcos-speca/azure-devops-mcp-ge.git

# Navigate into the project directory
cd azure-devops-mcp-ge

# Install dependencies (requires Node.js 20+)
npm install

# Build TypeScript code locally to verify compilation
npm run build
```

### 2. Configure Environment Variables

Create a local `.env` file (which is ignored by Git) based on the template:

```bash
cp .env.example .env
```

Edit your new `.env` file with your target tenant and organization values:

```env
TENANT_ID=<YOUR_ENTRA_TENANT_ID>
AZDO_ORG=<YOUR_AZURE_DEVOPS_ORGANIZATION>
CLIENT_ID=<YOUR_ENTRA_APP_CLIENT_ID>
OAUTH_AUDIENCE=<YOUR_ENTRA_APP_CLIENT_ID>
MCP_DOMAINS=core,work-items,repositories
PORT=8080
```

### 3. Microsoft Entra ID App Registration

1. In the Microsoft Entra ID portal, create a new **Single Tenant** App Registration named `gemini-enterprise-ado-mcp`.
2. Under **Authentication**, add a **Web** platform with the exact Redirect URI:
   `https://vertexaisearch.cloud.google.com/oauth-redirect`
3. Under **Certificates & secrets**, generate a new client secret and store it securely in Google Cloud Secret Manager:
   ```bash
   echo -n "<YOUR_CLIENT_SECRET>" | gcloud secrets create ado-client-secret --data-file=- --project=<YOUR_GCP_PROJECT>
   ```
4. Under **Expose an API**, set the **Application ID URI** to `api://<YOUR_CLIENT_ID>` and add a scope named `access_as_user` (`Admins and users` consent).
5. Under **API permissions**, add delegated permission **Azure DevOps -> user_impersonation** and grant admin consent.

### 4. Deploy to Cloud Run

Execute the deployment command using the Google Cloud SDK, passing the escaped environment variable string and Secret Manager reference:

```bash
gcloud run deploy mcp-azure-devops \
  --source . \
  --project <YOUR_GCP_PROJECT> \
  --region us-central1 \
  --ingress all \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars="^:^TENANT_ID=<YOUR_ENTRA_TENANT_ID>:AZDO_ORG=<YOUR_AZDO_ORG>:CLIENT_ID=<YOUR_CLIENT_ID>:OAUTH_AUDIENCE=<YOUR_CLIENT_ID>:MCP_DOMAINS=core,work-items,repositories" \
  --set-secrets="CLIENT_SECRET=ado-client-secret:latest" \
  --quiet
```

---

## ⚙️ Gemini Enterprise Data Connector Configuration

In the Google Cloud Console, navigate to **Gemini Enterprise -> Data stores -> Create data store**, select **Custom MCP Server (Preview)**, and configure the connector:

### 1. Connection Parameters

| GE Field              | Value                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| **MCP Server URL**    | `https://<YOUR_CLOUD_RUN_URL>/mcp`                                               |
| **Authorization URL** | `https://login.microsoftonline.com/<YOUR_ENTRA_TENANT_ID>/oauth2/v2.0/authorize` |
| **Token URL**         | `https://login.microsoftonline.com/<YOUR_ENTRA_TENANT_ID>/oauth2/v2.0/token`     |
| **Client ID**         | `<YOUR_CLIENT_ID>`                                                               |
| **Client Secret**     | `<YOUR_CLIENT_SECRET>`                                                           |
| **Scopes**            | `api://<YOUR_CLIENT_ID>/access_as_user offline_access`                           |

### 2. MCP Server Description

Copy and paste this overview into the **Description** field:

```text
This MCP server integrates Gemini Enterprise with Azure DevOps for the organization. It enables reading, searching, and managing software development lifecycle resources across three core domains:
1. Work Items: Search, query, retrieve, create, and update backlog items including epics, features, user stories, tasks, and bugs.
2. Repositories & Code: Browse Git repositories, inspect branches, view commits, read file contents, and search code snippets.
3. Core Projects & Teams: List projects, retrieve team details, and explore organizational metadata.

Use this server whenever the user asks questions or requests actions related to Azure DevOps projects, source code repositories, pull requests, work item tracking, bug triaging, or development team backlogs.
```

### 3. MCP Agent Instructions

Copy and paste these rules into the **Instructions** field:

```text
You are an expert software engineering assistant integrated with Azure DevOps via the Model Context Protocol (MCP). Use the tools provided by this server to interact with Azure DevOps resources in the target organization. Strictly adhere to the following operational guidelines:

1. Mapping User Intent to Tools:
   - Work Item Backlog: Map queries about "bugs", "tasks", "user stories", "epics", or "backlog" to work item tools (e.g., search, get, create, or update work items).
   - Source Code & Git: Map queries about "code", "files", "commits", "branches", "pull requests", or "diffs" to repository and git tools.
   - Project Metadata: Map queries about "projects", "teams", or "organization structure" to core domain tools.

2. Handling Identifiers & Parameters:
   - Project Scope: If a query specifies a project name, pass it to the corresponding parameter. If unspecified, list projects first or ask the user to clarify the target project.
   - Entity Details: When presenting work items, commits, or pull requests, always include their numerical ID, Title, Status, and Assigned To fields.

3. Output Formatting:
   - Present lists (such as repositories, work items, or commit logs) in clear, structured Markdown tables.
   - Format resource identifiers as clickable Markdown links to the Azure DevOps web UI whenever possible (e.g., `[Task #123](https://dev.azure.com/<org>/_workitems/edit/123)`).

4. Safety & Write Confirmations:
   - For all write operations (creating work items, updating statuses, assigning tasks, or modifying resources), provide a clear summary of the intended changes and ask for explicit user confirmation before executing the tool call.
```

---

## 🛠️ Supported Domains & Tools

This customized GE server currently enables three primary tool domains by default (`core,work-items,repositories`):

- **Core Tools:** `core_list_projects`, `core_list_project_teams`, `core_get_identity_ids`
- **Work Items Tools:** `wit_my_work_items`, `wit_get_work_item`, `wit_create_work_item`, `wit_update_work_item`, `wit_list_backlogs`, `wit_list_backlog_work_items`, `wit_query_by_wiql`, and batch query tools.
- **Repositories Tools:** `repo_list_repositories`, `repo_list_branches`, `repo_get_commit`, `repo_get_commit_diff`, `repo_get_pull_request`, `repo_list_pull_requests`, `repo_get_file`, `repo_list_items`, `repo_search_code`.

---

## 📝 License

This project is licensed under the MIT License, adhering to the upstream `microsoft/azure-devops-mcp` terms.

---

## ⚠️ Disclaimer & Support

This repository is provided on an **"AS IS"** basis, without warranties or conditions of any kind, either express or implied. It is intended solely as an architectural reference and demonstration for integrating Azure DevOps with Google Cloud Gemini Enterprise.

**No Official Support:** This project is an independent adaptation and is **not** an officially supported product by Google LLC or Microsoft Corporation. Neither company provides formal Service Level Agreements (SLAs), maintenance, or product support for this codebase. Use at your own discretion and risk in production environments.
