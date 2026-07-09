// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  token: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();
