// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ConfidentialClientApplication } from "@azure/msal-node";
import { logger } from "./logger.js";

const clientId = process.env.CLIENT_ID || process.env.OAUTH_AUDIENCE;
const clientSecret = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID;

let cca: ConfidentialClientApplication | null = null;

if (clientId && clientSecret && tenantId) {
  logger.info("Initializing MSAL Confidential Client Application for OBO flow...", {
    clientId,
    tenantId,
    hasSecret: !!clientSecret,
  });
  cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  });
} else {
  logger.info("MSAL OBO environment variables not fully set (CLIENT_ID, CLIENT_SECRET, TENANT_ID). OBO flow will be disabled.");
}

export async function exchangeTokenOBO(userToken: string): Promise<string> {
  if (!cca) {
    throw new Error("OBO token exchange is not configured. Set CLIENT_ID, CLIENT_SECRET, and TENANT_ID.");
  }

  logger.debug("Attempting OBO token exchange for Azure DevOps scope...");
  try {
    const result = await cca.acquireTokenOnBehalfOf({
      oboAssertion: userToken,
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"], // Azure DevOps resource ID scope
    });

    if (!result?.accessToken) {
      throw new Error("MSAL returned an empty access token in OBO flow");
    }

    logger.debug("OBO token exchange succeeded.");
    return result.accessToken;
  } catch (error) {
    logger.error("OBO token exchange failed:", error);
    throw new Error(`Failed to exchange token on behalf of user: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isOboEnabled(): boolean {
  return cca !== null;
}
