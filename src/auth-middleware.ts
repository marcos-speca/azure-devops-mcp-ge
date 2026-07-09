// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Request, Response, NextFunction } from "express";
import jwksClient from "jwks-rsa";
import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import { logger } from "./logger.js";

const TENANT = process.env.TENANT_ID;
const AUDIENCE = process.env.OAUTH_AUDIENCE;

if (!TENANT) {
  logger.warn("Warning: TENANT_ID env var is not set. JWT validation may fail or misbehave.");
}
if (!AUDIENCE) {
  logger.warn("Warning: OAUTH_AUDIENCE env var is not set. JWT validation may fail or misbehave.");
}

const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const jwksUri = `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`;

const client = jwksClient({
  jwksUri,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

export interface AuthenticatedRequest extends Request {
  entra?: {
    token: string;
    claims: any;
  };
}

export function requireEntraAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // If bypass auth is enabled for local debugging
  if (process.env.BYPASS_AUTH === "true") {
    logger.warn("Bypassing Entra authentication due to BYPASS_AUTH=true");
    req.entra = { token: "mock-token", claims: { sub: "mock-user" } };
    return next();
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    logger.error("requireEntraAuth: Missing bearer token in Authorization header");
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  function getKey(header: JwtHeader, callback: SigningKeyCallback) {
    if (!header.kid) {
      callback(new Error("No kid present in JWT header"));
      return;
    }
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
      } else {
        callback(null, key?.getPublicKey());
      }
    });
  }

  jwt.verify(
    token,
    getKey,
    {
      audience: AUDIENCE,
      issuer: [ISSUER, `https://sts.windows.net/${TENANT}/`], // Allow both v1 and v2 issuers if needed, but primary is ISSUER
      algorithms: ["RS256"],
    },
    (err, decoded) => {
      if (err) {
        logger.error(`requireEntraAuth: JWT validation failed: ${String(err)}`);
        res.status(401).json({ error: "invalid token", detail: String(err) });
        return;
      }

      req.entra = { token, claims: decoded };
      logger.debug("requireEntraAuth: Token successfully verified");
      next();
    }
  );
}
