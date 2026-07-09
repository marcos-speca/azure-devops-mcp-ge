// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

import { Domain } from "./shared/domains.js";
import { configureAdvSecTools } from "./tools/advanced-security.js";
import { configureMcpAppsTools } from "./tools/mcp-apps.js";
import { configurePipelineTools } from "./tools/pipelines.js";
import { configureCoreTools } from "./tools/core.js";
import { configureRepoTools } from "./tools/repositories.js";
import { configureSearchTools } from "./tools/search.js";
import { configureTestPlanTools } from "./tools/test-plans.js";
import { configureWikiTools } from "./tools/wiki.js";
import { configureWorkTools } from "./tools/work.js";
import { configureWorkItemTools } from "./tools/work-items.js";

function configureAllTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string, enabledDomains: Set<string>) {
  const originalTool = server.tool.bind(server);
  (server as any).tool = ((name: string, ...args: any[]) => {
    const isReadTool =
      /^(get_|list_|search_|my_|query_|wit_get_|wit_list_|wit_my_|wit_query_|core_list_|core_get_|repo_list_|repo_get_|repo_search_)/i.test(name) ||
      (/get|list|search|query/i.test(name) && !/create|update|delete|add|remove|run|trigger|queue|post|put|patch/i.test(name));
    if (isReadTool && args.length >= 2 && typeof args[args.length - 1] === "function") {
      const cb = args.pop();
      args.push({ readOnlyHint: true }, cb);
    }
    return (originalTool as any).apply(null, [name, ...args]);
  }) as any;

  const configureIfDomainEnabled = (domain: string, configureFn: () => void) => {
    if (enabledDomains.has(domain)) {
      configureFn();
    }
  };

  configureIfDomainEnabled(Domain.CORE, () => configureCoreTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.MCP_APPS, () => configureMcpAppsTools(server));
  configureIfDomainEnabled(Domain.WORK, () => configureWorkTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.PIPELINES, () => configurePipelineTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.REPOSITORIES, () => configureRepoTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.WORK_ITEMS, () => configureWorkItemTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.WIKI, () => configureWikiTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.TEST_PLANS, () => configureTestPlanTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.SEARCH, () => configureSearchTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.ADVANCED_SECURITY, () => configureAdvSecTools(server, tokenProvider, connectionProvider));
}

export { configureAllTools };
