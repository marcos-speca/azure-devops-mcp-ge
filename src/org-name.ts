// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export let orgName = process.env.AZDO_ORG || "";

export function setOrgName(name: string) {
  orgName = name;
}
