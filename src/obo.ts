// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
