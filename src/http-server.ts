// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBearerHandler, getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";
import { requireEntraAuth, AuthenticatedRequest } from "./auth-middleware.js";
import { requestContextStorage } from "./context.js";
import { exchangeTokenOBO, isOboEnabled } from "./obo.js";
import { logger } from "./logger.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";
import { setOrgName } from "./org-name.js";

const orgName = process.env.AZDO_ORG;
if (!orgName) {
  logger.error("AZDO_ORG environment variable is not set!");
  process.exit(1);
}
setOrgName(orgName);
const orgUrl = "https://dev.azure.com/" + orgName;

const domainsStr = process.env.MCP_DOMAINS || "core,work-items,repositories";
const domainsManager = new DomainsManager(domainsStr.split(","));
const enabledDomains = domainsManager.getEnabledDomains();

logger.info("Initializing HTTP MCP Server...", {
  organization: orgName,
  organizationUrl: orgUrl,
  domains: domainsStr,
  enabledDomains: Array.from(enabledDomains),
  version: packageVersion,
  oboEnabled: isOboEnabled(),
});

const userAgentComposer = new UserAgentComposer(packageVersion);

async function getDynamicToken(): Promise<string> {
  const context = requestContextStorage.getStore();
  if (!context?.token) {
    const pat = process.env.AZDO_PAT || process.env.PERSONAL_ACCESS_TOKEN;
    if (!pat) {
      throw new Error("No token in request context, and no fallback AZDO_PAT / PERSONAL_ACCESS_TOKEN set");
    }
    return pat;
  }

  if (isOboEnabled()) {
    try {
      return await exchangeTokenOBO(context.token);
    } catch (err) {
      logger.error("OBO token exchange failed, attempting fallback to PAT", err);
    }
  }

  const pat = process.env.AZDO_PAT || process.env.PERSONAL_ACCESS_TOKEN;
  if (!pat) {
    throw new Error("OBO flow failed or disabled, and no fallback AZDO_PAT is set");
  }
  return pat;
}

async function getAzureDevOpsConnection(): Promise<WebApi> {
  const token = await getDynamicToken();
  const isJwt = token.includes(".");

  let authHandler;
  if (isJwt) {
    authHandler = getBearerHandler(token);
  } else {
    let rawPat = token;
    try {
      const decoded = Buffer.from(token, "base64").toString("utf8");
      if (decoded.includes(":")) {
        rawPat = decoded.split(":").slice(1).join(":");
      }
    } catch {
      // Not base64
    }
    authHandler = getPersonalAccessTokenHandler(rawPat);
  }

  return new WebApi(orgUrl, authHandler, undefined, {
    productName: "AzureDevOps.MCP",
    productVersion: packageVersion,
    userAgent: userAgentComposer.userAgent,
  });
}

// In PAT mode, if using global fetch interceptor, replicate index.ts behavior:
const pat = process.env.AZDO_PAT || process.env.PERSONAL_ACCESS_TOKEN;
if (pat && !isOboEnabled()) {
  let basicValue = pat;
  try {
    const decoded = Buffer.from(pat, "base64").toString("utf8");
    if (!decoded.includes(":")) {
      basicValue = Buffer.from(`:${pat}`).toString("base64");
    }
  } catch {
    basicValue = Buffer.from(`:${pat}`).toString("base64");
  }

  const _originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      if (headers.get("Authorization")?.startsWith("Bearer ")) {
        headers.set("Authorization", `Basic ${basicValue}`);
        init = { ...init, headers };
      }
    }
    return _originalFetch(input, init);
  };
  logger.debug("PAT mode: global fetch interceptor installed to rewrite Bearer -> Basic auth headers");
}

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.post("/mcp", requireEntraAuth, async (req: AuthenticatedRequest, res) => {
  const token = req.entra?.token || "";

  const server = new McpServer({
    name: "Azure DevOps MCP Server",
    version: packageVersion,
    icons: [
      {
        src: "https://cdn.vsassets.io/content/icons/favicon.ico",
      },
    ],
  });

  server.server.oninitialized = () => {
    userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
  };

  configureAllTools(server, getDynamicToken, getAzureDevOpsConnection, () => userAgentComposer.userAgent, enabledDomains);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
  } catch (err) {
    logger.error("Failed to connect server to transport:", err);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }

  requestContextStorage.run({ token }, () => {
    transport.handleRequest(req, res, req.body).catch((err) => {
      logger.error("Error handling transport request:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
  });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error("Express uncaught error:", err);
  if (!res.headersSent) {
    res.status(500).send(err?.stack || String(err));
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP MCP Server listening on http://0.0.0.0:${port}/mcp`);
});
